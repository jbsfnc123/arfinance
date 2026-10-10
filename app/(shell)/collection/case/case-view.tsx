"use client";

import { Tabs } from "@/components/tabs";
import { NoteLog } from "./note-log";
import { useViewState } from "@/lib/ui/view-state";

const TABS = [
  { key: "Case", label: "Collection", icon: "assignment_late" },
  { key: "Administratif", label: "Administratif", icon: "fact_check" },
] as const;
type Tab = (typeof TABS)[number]["key"];

export function CaseView() {
  const [tab, setTab] = useViewState<Tab>("case:tab", "Case");
  return (
    <div className="w-full">
      <h1 className="text-[22px] font-semibold tracking-tight">Case</h1>
      <Tabs tabs={TABS} value={tab} onChange={setTab} />
      <div className="mt-4"><NoteLog key={tab} kategori={tab} /></div>
    </div>
  );
}
