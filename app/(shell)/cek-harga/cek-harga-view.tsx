"use client";

import { useState } from "react";
import { UploadSo } from "./upload-so";
import { UploadPo } from "./upload-po";
import { CasesView } from "./cases-view";
import { MasterView } from "./master-view";

const TABS = [
  { key: "so", label: "Upload SO", icon: "upload_file" },
  { key: "po", label: "Upload PO & Rekonsiliasi", icon: "compare_arrows" },
  { key: "arsip", label: "Arsip", icon: "inventory_2" },
  { key: "done", label: "Task Complete", icon: "task_alt" },
  { key: "master", label: "Data MASTER", icon: "table" },
] as const;

type Tab = (typeof TABS)[number]["key"];

// Port Cek Selisih Harga (Data MO – Cek PO SO dan Case).
export function CekHargaView() {
  const [tab, setTab] = useState<Tab>("po");
  // Naik setiap kali arsip berubah, supaya tombol "Pindahkan ke Arsip" & tab Arsip ikut segar.
  const [casesVersion, setCasesVersion] = useState(0);

  return (
    <div className="mx-auto max-w-7xl">
      <h1 className="text-2xl font-medium">Cek Selisih Harga PO vs SO</h1>
      <div className="mt-4 flex flex-wrap gap-1 border-b border-line">
        {TABS.map((t) => (
          <button key={t.key} type="button" onClick={() => setTab(t.key)}
            className={`-mb-px flex items-center gap-1.5 border-b-2 px-4 py-2 text-sm ${tab === t.key ? "border-accent text-accent" : "border-transparent text-fg-2 hover:text-fg"}`}>
            <span className="material-symbols-outlined !text-lg">{t.icon}</span>{t.label}
          </button>
        ))}
      </div>
      <div className="mt-4">
        {tab === "so" && <UploadSo />}
        <div hidden={tab !== "po"}><UploadPo casesVersion={casesVersion} onArchived={() => setCasesVersion((v) => v + 1)} /></div>
        {tab === "arsip" && <CasesView status="archived" version={casesVersion} onChange={() => setCasesVersion((v) => v + 1)} />}
        {tab === "done" && <CasesView status="completed" version={casesVersion} onChange={() => setCasesVersion((v) => v + 1)} />}
        {tab === "master" && <MasterView />}
      </div>
    </div>
  );
}
