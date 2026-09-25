"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { FINANCE_NAV } from "@/lib/menu";

// Navigasi Finance Workspace. Di host tangki.space path terlihat tanpa prefix /finance (rewrite proxy).
export function FinanceNav() {
  const raw = usePathname();
  const pathname = raw.replace(/^\/finance(?=\/|$)/, "") || "/";
  return (
    <nav className="flex gap-1 overflow-x-auto border-b border-line px-4">
      {FINANCE_NAV.map((n) => {
        const active = n.href === "/" ? pathname === "/" : pathname.startsWith(n.href);
        return (
          <Link key={n.href} href={n.href}
            className={`flex shrink-0 items-center gap-2 border-b-2 px-3 py-2.5 text-sm ${active ? "border-accent text-accent" : "border-transparent text-fg-2 hover:text-fg"}`}>
            <span className="material-symbols-outlined !text-lg">{n.icon}</span>
            {n.label}
          </Link>
        );
      })}
    </nav>
  );
}
