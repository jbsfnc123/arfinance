"use client";

import { useState } from "react";
import { Tabs } from "@/components/tabs";
import { MutasiDashboard } from "./mutasi-dashboard";
import { MutasiUpload } from "./mutasi-upload";
import { MutasiData } from "./mutasi-data";

const TABS = [
  { key: "dash", label: "Dashboard", icon: "monitoring" },
  { key: "upload", label: "Upload Data", icon: "upload_file" },
  { key: "data", label: "Data Mutasi", icon: "table" },
] as const;
type Tab = (typeof TABS)[number]["key"];

// Port workbook "Report Mutasi.xlsm" (Mutasi Bank VS Realisasi).
export function MutasiView() {
  const [tab, setTab] = useState<Tab>("dash");
  const [version, setVersion] = useState(0);
  return (
    <div className="mx-auto max-w-7xl">
      <h1 className="text-2xl font-medium">Mutasi Bank vs Realisasi</h1>
      <Tabs tabs={TABS} value={tab} onChange={setTab} />
      <div className="mt-4">
        {tab === "dash" && <MutasiDashboard version={version} />}
        {tab === "upload" && <MutasiUpload version={version} onDone={() => setVersion((v) => v + 1)} />}
        {tab === "data" && <MutasiData version={version} />}
      </div>
    </div>
  );
}
