"use client";

import { useState } from "react";
import { Popover } from "@/components/popover";
import { AccountMenuItems, AccountToolsProvider, Avatar } from "./account-tools";

// Tombol akun ringkas (Finance & Aplikasi Kolektor): foto profil → menu Ganti foto / Ganti PIN.
export function AccountMenu({ user, showName = true }: { user: { id: string; name: string; role: string; avatar: string | null }; showName?: boolean }) {
  const [open, setOpen] = useState(false);
  const item = "flex w-full items-center gap-2.5 rounded-[9px] px-2.5 py-1.5 text-left text-[13px] transition-colors pointer-coarse:min-h-11 hover:bg-accent-fill hover:text-on-accent disabled:opacity-60";
  return (
    <AccountToolsProvider userId={user.id} hasPhoto={!!user.avatar}>
      <span className="relative">
        <button type="button" data-popover-anchor aria-label="Akun" aria-expanded={open} onClick={() => setOpen(!open)}
          className="flex items-center gap-2 rounded-full p-0.5 pr-2 hover:bg-fg/8 pointer-coarse:min-h-11">
          <Avatar name={user.name} url={user.avatar} size={28} />
          {showName && <span className="hidden max-w-36 truncate text-left text-[13px] leading-tight sm:block">{user.name}<span className="block text-[11px] text-fg-2">{user.role}</span></span>}
        </button>
        <Popover open={open} onClose={() => setOpen(false)} label="Menu akun" className="right-0 top-full mt-1.5 w-60 p-1.5">
          <div className="flex items-center gap-3 px-2.5 py-2">
            <Avatar name={user.name} url={user.avatar} size={36} />
            <span className="min-w-0">
              <span className="block truncate text-[13px] font-semibold">{user.name}</span>
              <span className="block truncate text-[11px] text-fg-2">{user.role}</span>
            </span>
          </div>
          <div className="mx-2 my-1 border-t border-hairline" />
          <AccountMenuItems className={item} onPick={() => setOpen(false)} />
        </Popover>
      </span>
    </AccountToolsProvider>
  );
}
