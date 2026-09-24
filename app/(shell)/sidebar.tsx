"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { MenuGroup } from "@/lib/menu";

export function Sidebar({ menu }: { menu: MenuGroup[] }) {
  const pathname = usePathname();

  return (
    <nav className="hidden w-[var(--sidebar-w)] shrink-0 overflow-y-auto border-r border-line py-3 md:block">
      <Link
        href="/"
        className={`mx-3 mb-2 flex items-center gap-3 rounded-full px-4 py-2 text-sm ${
          pathname === "/" ? "bg-pill text-pill-fg" : "text-fg hover:bg-surface-2"
        }`}
      >
        <span className="material-symbols-outlined">home</span>
        Beranda
      </Link>

      {menu.map((group) => (
        <div key={group.id} className="mt-3">
          <div className="flex items-center gap-2 px-7 pb-1 text-xs font-medium uppercase tracking-wide text-fg-2">
            <span className="material-symbols-outlined !text-base">{group.icon}</span>
            {group.label}
          </div>
          {group.children.map((item) => {
            const active = pathname === item.href;
            const cls = `mx-3 flex items-center justify-between rounded-full py-1.5 pl-11 pr-4 text-sm ${
              active ? "bg-pill text-pill-fg" : "text-fg hover:bg-surface-2"
            }`;
            return item.external ? (
              <a key={item.id} href={item.href} target="_blank" rel="noreferrer" className={cls}>
                {item.label}
                <span className="material-symbols-outlined !text-base text-fg-2">open_in_new</span>
              </a>
            ) : (
              <Link key={item.id} href={item.href} className={cls}>
                {item.label}
                {item.phase !== undefined && (
                  <span className="text-[10px] text-fg-disabled">F{item.phase}</span>
                )}
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}
