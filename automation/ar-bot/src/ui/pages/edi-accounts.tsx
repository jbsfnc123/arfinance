// Akun EDI Mitra 10: tambah / ubah / nonaktifkan / hapus, uji login. Password disimpan terenkripsi & tidak ditampilkan.
import { useState } from "react";
import { Icon } from "@/components/icons";
import { Modal } from "@/components/modal";
import { useToast } from "@/components/toast";
import { btnGhost, btnPrimary, emptyTd, inputCls, tableCls, td, th } from "@/components/ui";
import type { EdiAccount, PublicState } from "~/shared/types";
import { api } from "../api";
import { useApp } from "../store";
import { Card, Confirm, Field, PageHeader, Switch } from "../parts/common";
import { useSaveConfig } from "../parts/run";
import { TestButton } from "./settings";

type Draft = EdiAccount & { password: string; isNew: boolean };

export function EdiAccountsPage() {
  const { state, setState } = useApp();
  const save = useSaveConfig();
  const toast = useToast();
  const accounts = state!.config.edi.accounts;
  const [edit, setEdit] = useState<Draft | null>(null);
  const [del, setDel] = useState<EdiAccount | null>(null);
  const [res, setRes] = useState<Record<string, { ok: boolean; message: string } | "busy">>({});

  const store = async (d: Draft) => {
    const acc: EdiAccount = { id: d.id, label: d.label.trim() || d.username.trim(), username: d.username.trim(), active: d.active };
    await save((c) => ({ ...c, edi: { accounts: d.isNew ? [...c.edi.accounts, acc] : c.edi.accounts.map((a) => (a.id === acc.id ? acc : a)) } }));
    if (d.password) {
      try { setState(await api<PublicState>("/api/secrets", { [`edi:${acc.id}`]: d.password })); } catch (e) { toast((e as Error).message, "danger"); return; }
    }
    toast("Akun disimpan.", "success");
    setEdit(null);
  };
  const remove = async (a: EdiAccount) => {
    await save((c) => ({ ...c, edi: { accounts: c.edi.accounts.filter((x) => x.id !== a.id) }, jobs: Object.fromEntries(Object.entries(c.jobs).map(([k, p]) => [k, { ...p, accounts: p?.accounts?.filter((x) => x !== a.id) }])) }));
    setState(await api<PublicState>("/api/secrets", { [`edi:${a.id}`]: null }));
    toast("Akun dihapus.", "success");
  };
  const newId = () => `akun-${Date.now().toString(36)}`;

  return (
    <div className="grid gap-4">
      <PageHeader title="Akun EDI Mitra 10">
        <button type="button" className={btnPrimary} onClick={() => setEdit({ id: newId(), label: "", username: "", active: true, password: "", isNew: true })}><Icon name="add" />Akun</button>
      </PageHeader>
      <Card>
        <table className={tableCls}>
          <thead><tr><th className={th}>Nama</th><th className={th}>Username</th><th className={th}>Password</th><th className={th}>Aktif</th><th className={th}>Uji</th><th className={th} /></tr></thead>
          <tbody>
            {!accounts.length && <tr><td colSpan={6} className={emptyTd}>Belum ada akun.</td></tr>}
            {accounts.map((a) => (
              <tr key={a.id}>
                <td className={td}>{a.label}</td>
                <td className={td}>{a.username}</td>
                <td className={td}>{state!.secretsSet.includes(`edi:${a.id}`) ? <span className="text-success">tersimpan</span> : <span className="text-danger">kosong</span>}</td>
                <td className={td}><Switch checked={a.active} label="" onChange={(v) => save((c) => ({ ...c, edi: { accounts: c.edi.accounts.map((x) => (x.id === a.id ? { ...x, active: v } : x)) } }))} /></td>
                <td className={td}><TestButton target="edi" accountId={a.id} label="Login" res={res} setRes={setRes} /></td>
                <td className={`${td} text-right`}>
                  <button type="button" className={btnGhost} onClick={() => setEdit({ ...a, password: "", isNew: false })} aria-label={`Ubah ${a.label}`}><Icon name="edit" /></button>{" "}
                  <button type="button" className={btnGhost} onClick={() => setDel(a)} aria-label={`Hapus ${a.label}`}><Icon name="delete" /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <Modal open={!!edit} title={edit?.isNew ? "Akun baru" : "Ubah akun"} onClose={() => setEdit(null)}
        footer={<>
          <button type="button" className={btnGhost} onClick={() => setEdit(null)}>Batal</button>
          <button type="button" className={btnPrimary} disabled={!edit?.username.trim() || (edit.isNew && !edit.password)} onClick={() => edit && store(edit)}>Simpan</button>
        </>}>
        {edit && (
          <div className="grid gap-3">
            <Field label="Nama tampilan"><input className={inputCls} value={edit.label} onChange={(e) => setEdit({ ...edit, label: e.target.value })} /></Field>
            <Field label="Username"><input className={inputCls} value={edit.username} onChange={(e) => setEdit({ ...edit, username: e.target.value })} /></Field>
            <Field label={edit.isNew ? "Password" : "Password baru (kosongkan bila tidak diganti)"}>
              <input className={inputCls} type="password" autoComplete="new-password" value={edit.password} onChange={(e) => setEdit({ ...edit, password: e.target.value })} />
            </Field>
            <Switch checked={edit.active} onChange={(v) => setEdit({ ...edit, active: v })} label="Aktif" />
          </div>
        )}
      </Modal>
      <Confirm open={!!del} title="Hapus akun" confirmLabel="Hapus" danger onClose={() => setDel(null)} onConfirm={() => del && remove(del)}>
        Akun <b>{del?.label}</b> dan password tersimpannya dihapus.
      </Confirm>
    </div>
  );
}
