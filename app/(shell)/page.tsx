import { redirect } from "next/navigation";
import { menuGuard } from "@/lib/guard";
import { firstAllowedHref } from "@/lib/menu";
import { createClient } from "@/lib/supabase/server";
import { StickyBoard } from "./sticky-board";

// Beranda: papan sticky notes bersama. Role tanpa centang "Beranda" langsung dibuka ke
// menu pertama yang diizinkan.
export default async function HomePage() {
  const { session, allowed } = await menuGuard("home");
  if (!allowed) {
    const href = firstAllowedHref(session.access);
    if (href) redirect(href);
    return (
      <div className="mx-auto mt-8 max-w-xl rounded-xl border border-line bg-surface p-6 text-sm text-fg-2">
        Role Anda belum diberi akses menu. Minta Super Admin mengatur di Pengaturan → Role &amp; Akses Menu.
      </div>
    );
  }

  const supabase = await createClient();
  const { data } = await supabase.from("sticky_notes").select("*").order("created_at").order("id").limit(10);
  return <StickyBoard initial={data ?? []} />;
}
