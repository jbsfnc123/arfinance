"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { FINANCE_NAV } from "@/lib/menu";
import { Icon } from "@/components/icons";

// Navigasi Finance Workspace. Di host tangki.space path terlihat tanpa prefix /finance (rewrite proxy).
export function FinanceNav() {
  const raw = usePathname();
  const pathname = raw.replace(/^\/finance(?=\/|$)/, "") || "/";
  return (
    <nav className="flex gap-1 overflow-x-auto border-b border-separator px-4 py-1.5">
      {FINANCE_NAV.map((n) => {
        const active = n.href === "/" ? pathname === "/" : pathname.startsWith(n.href);
        return (
          <Link key={n.href} href={n.href}
            aria-current={active ? "page" : undefined}
            className={`flex h-[var(--control-h)] shrink-0 items-center gap-1.5 rounded-[8px] px-3 text-[13px] transition-colors ${active ? "bg-selection font-medium text-accent" : "text-fg-2 hover:bg-fg/6 hover:text-fg"}`}>
            <Icon name={n.icon} size={16} />
            {n.label}
          </Link>
        );
      })}
    </nav>
  );
}
