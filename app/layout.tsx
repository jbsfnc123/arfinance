import type { Metadata } from "next";
import { Roboto } from "next/font/google";
import "./globals.css";
import { currentWorkspace } from "@/lib/workspace-server";
import { WORKSPACES } from "@/lib/workspace";

const roboto = Roboto({
  variable: "--font-roboto",
  subsets: ["latin"],
  weight: ["400", "500", "700"],
});

// Judul tab mengikuti workspace (host): Finance / AR / AP Workspace.
export async function generateMetadata(): Promise<Metadata> {
  const ws = await currentWorkspace();
  return { title: `${WORKSPACES[ws].label} — Penguin`, description: WORKSPACES[ws].desc };
}

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="id" className={`${roboto.variable} h-full antialiased`}>
      <head>
        {/* display=block disengaja: font ikon tidak boleh tampil sebagai teks nama ikon saat memuat. */}
        {/* eslint-disable-next-line @next/next/no-page-custom-font, @next/next/google-font-display */}
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200&display=block"
        />
      </head>
      <body className="min-h-full">{children}</body>
    </html>
  );
}
