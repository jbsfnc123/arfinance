"use client";

import { useActionState, useState } from "react";
import { createRole, deleteRole, saveRoleMenus, updateRole } from "./actions";
import { btnGhost, btnPrimary, inputCls, KIND_LABEL, type ActionResult } from "../ui";
import { MenuChecklist } from "../menu-checklist";
import type { AclGroup } from "@/lib/menu";

type Role = { id: string; name: string; kind: string };
type Group = AclGroup;

function Feedback({ state }: { state: ActionResult }) {
  if (!state) return null;
  return <p className={`text-sm ${state.ok ? "text-success" : "text-danger"}`}>{state.message}</p>;
}

function KindSelect({ defaultValue }: { defaultValue?: string }) {
  return (
    <select name="kind" required defaultValue={defaultValue ?? "ctrl"} className={inputCls}>
      {Object.entries(KIND_LABEL).map(([k, label]) => (
        <option key={k} value={k}>
          {label}
        </option>
      ))}
    </select>
  );
}

function RoleCard(props: {
  role: Role;
  isMine: boolean;
  groups: Group[];
  selected: string[];
  accounts: number;
}) {
  const { role, isMine, groups, selected, accounts } = props;
  const [editing, setEditing] = useState(false);
  const [menuState, menuAction, menuPending] = useActionState(saveRoleMenus, null);
  const [roleState, roleAction, rolePending] = useActionState(updateRole, null);
  const [delState, delAction, delPending] = useActionState(deleteRole, null);

  return (
    <section className="rounded-xl border border-line bg-surface p-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1">
          <h2 className="font-medium">
            {role.name}
            {isMine && <span className="ml-2 text-xs text-fg-2">(role Anda)</span>}
          </h2>
          <p className="text-xs text-fg-2">
            {KIND_LABEL[role.kind]} · {accounts} akun
          </p>
        </div>
        <button type="button" className={btnGhost} onClick={() => setEditing(!editing)}>
          Ubah role
        </button>
        {!isMine && (
          <form action={delAction}>
            <input type="hidden" name="id" value={role.id} />
            <button
              type="submit"
              disabled={delPending}
              className={`${btnGhost} text-danger`}
              onClick={(e) => {
                if (!confirm(`Hapus role "${role.name}"?`)) e.preventDefault();
              }}
            >
              Hapus
            </button>
          </form>
        )}
      </div>
      <Feedback state={delState} />

      {editing && (
        <form action={roleAction} className="mt-3 grid gap-3 sm:grid-cols-3">
          <input type="hidden" name="id" value={role.id} />
          <input name="name" required defaultValue={role.name} className={inputCls} />
          <KindSelect defaultValue={role.kind} />
          <button type="submit" disabled={rolePending} className={btnPrimary}>
            Simpan
          </button>
          <div className="sm:col-span-3">
            <Feedback state={roleState} />
          </div>
        </form>
      )}

      {role.kind === "sa" ? (
        <p className="mt-3 text-sm text-fg-2">Super Admin: semua menu.</p>
      ) : (
        <form action={menuAction} className="mt-4">
          <input type="hidden" name="role_id" value={role.id} />
          <MenuChecklist groups={groups} kind={role.kind} selected={selected} />
          <div className="mt-4 flex items-center gap-3">
            <button type="submit" disabled={menuPending} className={btnPrimary}>
              {menuPending ? "Menyimpan…" : "Simpan default menu"}
            </button>
            <Feedback state={menuState} />
          </div>
        </form>
      )}
    </section>
  );
}

export function RolesView(props: {
  myRoleId: string;
  roles: Role[];
  groups: Group[];
  menusByRole: Record<string, string[]>;
  accountCount: Record<string, number>;
}) {
  const [state, action, pending] = useActionState(createRole, null);

  return (
    <div className="mt-6 space-y-4">
      <form
        action={action}
        key={state?.ok ? state.at : "new-role"}
        className="grid gap-3 rounded-xl border border-line bg-surface p-4 sm:grid-cols-3"
      >
        <h2 className="font-medium sm:col-span-3">Tambah role</h2>
        <input name="name" required placeholder="Nama role, mis. Staff Billing" className={inputCls} />
        <KindSelect />
        <button type="submit" disabled={pending} className={btnPrimary}>
          Tambah
        </button>
        <div className="sm:col-span-3">
          <Feedback state={state} />
        </div>
      </form>

      {props.roles.map((role) => (
        <RoleCard
          key={role.id}
          role={role}
          isMine={role.id === props.myRoleId}
          groups={props.groups}
          selected={props.menusByRole[role.id] ?? []}
          accounts={props.accountCount[role.id] ?? 0}
        />
      ))}
    </div>
  );
}
