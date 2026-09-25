import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { Database } from "@/lib/database.types";
import { authCookieOptions, routeFor, WORKSPACE_HEADER, workspaceFromHost, workspaceUrl } from "@/lib/workspace";

const PUBLIC_PATHS = ["/login", "/auth"];

// Refresh sesi Supabase di setiap request, arahkan user yang belum login ke /login, dan
// arahkan host ke workspace-nya (tangki.space → app/finance, ap. → app/ap, ar. → apa adanya).
// Ini hanya pemeriksaan optimistis; otorisasi sebenarnya ada di RLS dan di layout tiap workspace.
export async function updateSession(request: NextRequest) {
  const host = request.headers.get("host");
  const ws = workspaceFromHost(host);
  const route = routeFor(ws, request.nextUrl.pathname);
  if (route.kind === "notfound") return new NextResponse("Not Found", { status: 404 });
  if (route.kind === "moved") return NextResponse.redirect(workspaceUrl(route.ws, host, route.path), 308);

  // Workspace diteruskan sebagai header request supaya server component (login, layout) tahu.
  const headers = new Headers(request.headers);
  headers.set(WORKSPACE_HEADER, ws);
  const pending: { name: string; value: string; options: Parameters<NextResponse["cookies"]["set"]>[2] }[] = [];

  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookieOptions: authCookieOptions(host),
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            request.cookies.set(name, value);
            pending.push({ name, value, options });
          });
          headers.set("cookie", request.cookies.toString());
        },
      },
    },
  );

  const { data } = await supabase.auth.getClaims();
  const isPublic = PUBLIC_PATHS.some((p) => request.nextUrl.pathname.startsWith(p));

  if (!data?.claims && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    return NextResponse.redirect(url);
  }

  let response: NextResponse;
  if (route.kind === "rewrite") {
    const url = request.nextUrl.clone();
    url.pathname = route.path;
    response = NextResponse.rewrite(url, { request: { headers } });
  } else {
    response = NextResponse.next({ request: { headers } });
  }
  pending.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
  return response;
}
