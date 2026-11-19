"use client";

import { useMemo } from "react";
import { LocalTable, type LCol } from "@/lib/local/table";
import type { SoRow } from "@/lib/modules/cekharga/cekharga";
import type { CekHargaLocal } from "./use-local";

const COLS: LCol<SoRow & { i: number }>[] = [
  { k: "document_no", l: "Document No" }, { k: "date_po", l: "Date PO" }, { k: "no_po_customer", l: "No PO Customer" },
  { k: "business_partner", l: "Business Partner", w: 260 }, { k: "price_list", l: "Price List" }, { k: "document_status", l: "Document Status" },
  { k: "grand_total", l: "Grand Total", n: true },
];

// Data MASTER (Fase 83): SO yang tersimpan di browser ini — cari, urut, Excel dari LocalTable.
export function MasterView({ local }: { local: CekHargaLocal }) {
  const so = local.so;
  const rows = useMemo(() => (so?.rows ?? []).map((r, i) => ({ ...r, i })), [so]);
  return (
    <LocalTable title="Data MASTER (SO lokal)" stateKey="cekharga-master" rows={rows} cols={COLS} rowKey={(r) => r.i}
      loading={!local.loaded} search={["document_no", "no_po_customer", "business_partner", "document_status", "price_list"]}
      emptyText="Belum ada SO di browser ini. Upload SO terlebih dahulu." />
  );
}
