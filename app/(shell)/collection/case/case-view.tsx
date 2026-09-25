"use client";

import { useState } from "react";
import { Tabs } from "@/components/tabs";
import { NoteLog } from "./note-log";

const TABS = [
  { key: "Case", label: "Collection", icon: "assignment_late" },
  { key: "Administratif", label: "Administratif", icon: "fact_check" },
] as const;
type Tab = (typeof TABS)[number]["key"];

export function CaseView() {
  const [tab, setTab] = useState<Tab>("Case");
  return (
    <div className="mx-auto max-w-6xl">
      <h1 className="text-2xl font-medium">Case</h1>
      <p className="mt-1 text-sm text-fg-2">Log catatan Case (collection) dan Administratif dari seluruh Collection.</p>
      <Tabs tabs={TABS} value={tab} onChange={setTab} />
      <div className="mt-4"><NoteLog key={tab} kategori={tab} /></div>
    </div>
  );
}
