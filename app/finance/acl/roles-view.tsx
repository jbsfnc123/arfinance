"use client";

import { useActionState, useState } from "react";
import { createRole, deleteRole, saveRoleMenus, updateRole } from "./actions";
import { btnGhost, btnPrimary, inputCls, KIND_LABEL, type ActionResult } from "../ui";

type Role = { id: string; name: string; kind: string };
type Group = { id: string; label: string; items: { id: string; label: string; needs: string | null }[] };

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

// Menu dengan syarat jenis role tetap tersembunyi walau dicentang (lihat canAccess di lib/menu.ts).
function blockedFor(kind: string, needs: string | null) {
  if (needs === "sa") return kind !== "sa";
  if (needs === "ctrl") return kind !== "sa" && kind !== "ctrl";
  return false;
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
        <p className="mt-3 text-sm text-fg-2">Role Super Admin melihat semua menu.</p>
      ) : (
        <form action={menuAction} className="mt-4">
          <input type="hidden" name="role_id" value={role.id} />
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {groups.map((g) => (
              <fieldset key={g.id}>
                <legend className="text-xs font-medium uppercase tracking-wide text-fg-2">{g.label}</legend>
                {g.items.map((item) => {
                  const blocked = blockedFor(role.kind, item.needs);
                  return (
                    <label
                      key={item.id}
                      className={`mt-1 flex items-center gap-2 text-sm ${blocked ? "text-fg-disabled" : ""}`}
                      title={blocked ? "Butuh role Controller/Super Admin" : undefined}
                    >
                      <input
                        type="checkbox"
                        name="menu"
                        value={item.id}
                        defaultChecked={selected.includes(item.id)}
                        disabled={blocked}
                      />
                      {item.label}
                    </label>
                  );
                })}
              </fieldset>
            ))}
          </div>
          <div className="mt-4 flex items-center gap-3">
            <button type="submit" disabled={menuPending} className={btnPrimary}>
              {menuPending ? "Menyimpan…" : "Simpan akses menu"}
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
