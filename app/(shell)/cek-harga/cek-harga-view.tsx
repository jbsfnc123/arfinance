"use client";

import { useState } from "react";
import { UploadSo } from "./upload-so";
import { UploadPo } from "./upload-po";
import { CasesView } from "./cases-view";
import { MasterView } from "./master-view";
import { useViewState } from "@/lib/ui/view-state";
import { Tabs } from "@/components/tabs";

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
  const [tab, setTab] = useViewState<Tab>("cekharga:tab", "po");
  // Naik setiap kali arsip berubah, supaya tombol "Pindahkan ke Arsip" & tab Arsip ikut segar.
  const [casesVersion, setCasesVersion] = useState(0);

  return (
    <div className="w-full">
      <h1 className="text-2xl font-medium">Cek Selisih Harga PO vs SO</h1>
      <Tabs tabs={TABS} value={tab} onChange={setTab} />
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
