"use client";

import { useActionState, useState } from "react";
import { createAccount, resetPin, saveAccountMenus, updateAccount } from "./actions";
import { btnGhost, btnPrimary, inputCls, type ActionResult } from "../ui";
import { DIVISION_LABEL, menusDiffer, type AclGroup, type Division } from "@/lib/menu";
import { MenuChecklist } from "../menu-checklist";

type Role = { id: string; name: string; kind: string };
type Account = {
  id: string;
  display_name: string;
  collection_name: string | null;
  active: boolean;
  role_id: string;
  division: string;
  has_pin: boolean;
  pin_optional: boolean;
};

function Feedback({ state }: { state: ActionResult }) {
  if (!state) return null;
  return (
    <p className={`text-sm ${state.ok ? "text-success" : "text-danger"}`} role="status">
      {state.message}
    </p>
  );
}

function PinInput(props: { name?: string; required?: boolean }) {
  return (
    <input
      name={props.name ?? "pin"}
      inputMode="numeric"
      pattern="\d{6}"
      maxLength={6}
      minLength={6}
      required={props.required ?? true}
      placeholder="6 digit"
      autoComplete="off"
      className={`${inputCls} font-mono tracking-widest`}
    />
  );
}

// Login cukup nama. Siapa pun yang mengetik nama ini bisa masuk → hanya untuk akun berisiko rendah.
function NoPinCheck({ defaultChecked, onChange }: { defaultChecked?: boolean; onChange?: (v: boolean) => void }) {
  return (
    <label className="flex items-start gap-2 text-sm sm:col-span-6" title="Tidak berlaku untuk role Super Admin">
      <input type="checkbox" name="pin_optional" defaultChecked={defaultChecked} onChange={(e) => onChange?.(e.target.checked)} className="mt-1" />
      <span>
        Login tanpa PIN (cukup nama)
        <span className="block text-xs text-warning">Siapa pun yang mengetik nama ini bisa masuk sebagai akun ini. Tidak berlaku untuk Super Admin.</span>
      </span>
    </label>
  );
}

function RoleSelect({ roles, defaultValue, onChange }: { roles: Role[]; defaultValue?: string; onChange?: (id: string) => void }) {
  return (
    <select name="role_id" required defaultValue={defaultValue ?? ""} onChange={(e) => onChange?.(e.target.value)} className={inputCls}>
      <option value="" disabled>
        Pilih role…
      </option>
      {roles.map((r) => (
        <option key={r.id} value={r.id}>
          {r.name}
        </option>
      ))}
    </select>
  );
}

// Divisi = workspace yang boleh dibuka (AR → ar.tangki.space, AP → ap.tangki.space, AR + AP → pilih di tangki.space).
function DivisionSelect({ defaultValue }: { defaultValue?: string }) {
  return (
    <select name="division" required defaultValue={defaultValue ?? "ar"} className={inputCls} title="Divisi / workspace">
      {(Object.keys(DIVISION_LABEL) as Division[]).map((d) => (
        <option key={d} value={d}>Divisi {DIVISION_LABEL[d]}</option>
      ))}
    </select>
  );
}

function CreateForm({ roles }: { roles: Role[] }) {
  const [state, action, pending] = useActionState(createAccount, null);
  const [noPin, setNoPin] = useState(false);
  return (
    <form
      action={action}
      key={state?.ok ? state.at : "create"}
      className="mt-6 grid gap-3 rounded-xl border border-line bg-surface p-4 sm:grid-cols-6"
    >
      <h2 className="font-medium sm:col-span-6">Tambah akun</h2>
      <input name="display_name" required placeholder="Nama" className={inputCls} />
      <RoleSelect roles={roles} />
      <DivisionSelect />
      <input name="collection_name" placeholder="Collection Name (khusus Collection)" className={inputCls} />
      <PinInput required={!noPin} />
      <button type="submit" disabled={pending} className={btnPrimary}>
        {pending ? "Menyimpan…" : "Tambah"}
      </button>
      <NoPinCheck onChange={setNoPin} />
      <div className="sm:col-span-6">
        <Feedback state={state} />
      </div>
    </form>
  );
}

type Menus = { groups: AclGroup[]; accountMenus: Record<string, string[]>; roleMenus: Record<string, string[]> };

function AccountRow({ account, roles, isMe, menus }: { account: Account; roles: Role[]; isMe: boolean; menus: Menus }) {
  const [mode, setMode] = useState<"view" | "edit" | "pin" | "menu">("view");
  const [editState, editAction, editPending] = useActionState(updateAccount, null);
  const [pinState, pinAction, pinPending] = useActionState(resetPin, null);
  const [menuState, menuAction, menuPending] = useActionState(saveAccountMenus, null);
  const [pickedRole, setPickedRole] = useState(account.role_id);
  const role = roles.find((r) => r.id === account.role_id);
  const picked = roles.find((r) => r.id === pickedRole);
  const isSa = role?.kind === "sa";
  const mine = menus.accountMenus[account.id] ?? [];
  const def = menus.roleMenus[account.role_id] ?? [];
  const custom = !isSa && menusDiffer(mine, def);

  return (
    <li className="px-4 py-3">
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1">
          <div className="font-medium">
            {account.display_name}
            {isMe && <span className="ml-2 text-xs text-fg-2">(Anda)</span>}
          </div>
          <div className="text-xs text-fg-2">
            {role?.name ?? "—"}
            {" · "}{role?.kind === "sa" ? "Semua workspace" : `Divisi ${DIVISION_LABEL[account.division as Division] ?? "AR"}`}
            {account.collection_name && ` · ${account.collection_name}`}
            {!account.has_pin && !account.pin_optional && " · belum ada PIN"}
            {" · "}{isSa ? "semua menu" : `${mine.length} menu`}
          </div>
        </div>
        {custom && (
          <span className="rounded-full bg-accent/15 px-2 py-0.5 text-xs text-accent" title="Akses menu berbeda dari default role">Menu disesuaikan</span>
        )}
        {account.pin_optional && (
          <span className="rounded-full bg-warning/15 px-2 py-0.5 text-xs text-warning" title="Login cukup nama">Tanpa PIN</span>
        )}
        <span
          className={`rounded-full px-2 py-0.5 text-xs ${
            account.active ? "bg-success/15 text-success" : "bg-danger/15 text-danger"
          }`}
        >
          {account.active ? "Aktif" : "Nonaktif"}
        </span>
        <button type="button" className={btnGhost} onClick={() => setMode(mode === "edit" ? "view" : "edit")}>
          Ubah
        </button>
        <button type="button" className={btnGhost} onClick={() => setMode(mode === "pin" ? "view" : "pin")}>
          Reset PIN
        </button>
        {!isSa && (
          <button type="button" className={btnGhost} onClick={() => setMode(mode === "menu" ? "view" : "menu")} aria-expanded={mode === "menu"}>
            Akses menu
          </button>
        )}
      </div>

      {mode === "edit" && (
        <form action={editAction} className="mt-3 grid gap-3 sm:grid-cols-6">
          <input type="hidden" name="id" value={account.id} />
          <input name="display_name" required defaultValue={account.display_name} className={inputCls} />
          <RoleSelect roles={roles} defaultValue={account.role_id} onChange={setPickedRole} />
          <DivisionSelect defaultValue={account.division} />
          <input
            name="collection_name"
            defaultValue={account.collection_name ?? ""}
            placeholder="Collection Name"
            className={inputCls}
          />
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="active" defaultChecked={account.active} /> Aktif
          </label>
          <button type="submit" disabled={editPending} className={btnPrimary}>
            Simpan
          </button>
          {role?.kind !== "sa" && <NoPinCheck defaultChecked={account.pin_optional} />}
          {pickedRole !== account.role_id && picked?.kind !== "sa" && (
            <label className="flex items-start gap-2 text-sm sm:col-span-6">
              <input type="checkbox" name="reset_menus" defaultChecked className="mt-1" />
              <span>
                Ganti akses menu dengan default role baru ({picked?.name})
                <span className="block text-xs text-fg-2">Tidak dicentang = akses menu akun tetap seperti sekarang.</span>
              </span>
            </label>
          )}
          <div className="sm:col-span-6">
            <Feedback state={editState} />
          </div>
        </form>
      )}

      {mode === "menu" && !isSa && (
        <form action={menuAction} key={menuState?.ok ? menuState.at : "menu"} className="mt-3 space-y-3 rounded-xl border border-line p-3">
          <input type="hidden" name="id" value={account.id} />
          <p className="text-xs text-fg-2">
            Centang menu yang boleh dibuka akun ini. Tanda <span className="text-success">+</span> / <span className="text-warning">−</span> = berbeda
            dari default role {role?.name}.
          </p>
          <MenuChecklist groups={menus.groups} kind={role?.kind ?? ""} selected={mine} defaults={def} />
          <div className="flex flex-wrap items-center gap-3">
            <button type="submit" disabled={menuPending} className={btnPrimary}>
              {menuPending ? "Menyimpan…" : "Simpan akses menu"}
            </button>
            <button type="submit" name="use_default" value="1" disabled={menuPending || !custom} className={btnGhost}
              onClick={(e) => { if (!confirm(`Samakan akses menu ${account.display_name} dengan default role ${role?.name}?`)) e.preventDefault(); }}>
              Samakan dengan default role
            </button>
            <Feedback state={menuState} />
          </div>
        </form>
      )}

      {mode === "pin" && (
        <form action={pinAction} key={pinState?.ok ? pinState.at : "pin"} className="mt-3 flex flex-wrap items-center gap-3">
          <input type="hidden" name="id" value={account.id} />
          <div className="w-40">
            <PinInput />
          </div>
          <button type="submit" disabled={pinPending} className={btnPrimary}>
            Simpan PIN
          </button>
          <Feedback state={pinState} />
        </form>
      )}
    </li>
  );
}

export function AccountsView({ me, roles, accounts, ...menus }: { me: string; roles: Role[]; accounts: Account[] } & Menus) {
  return (
    <>
      <CreateForm roles={roles} />
      <ul className="mt-6 divide-y divide-line rounded-xl border border-line bg-surface">
        {accounts.length === 0 && <li className="px-4 py-6 text-sm text-fg-2">Belum ada akun.</li>}
        {accounts.map((a) => (
          <AccountRow key={a.id} account={a} roles={roles} isMe={a.id === me} menus={menus} />
        ))}
      </ul>
    </>
  );
}
