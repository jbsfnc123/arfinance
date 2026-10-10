// Invoice Checklist Penguin ERP: buat skrip centang massal untuk Console browser (tabel ZK, kolom "Document No").
import { useMemo, useState } from "react";
import { Icon } from "@/components/icons";
import { useToast } from "@/components/toast";
import { btnPrimary, inputCls } from "@/components/ui";
import { Card, PageHeader } from "../parts/common";

/** Skrip: centang baris yang cocok, lalu laporkan jumlah tercentang & nomor yang tidak ditemukan di tabel. */
export function checklistScript(invoices: string[]) {
  return `(function () {
  var want = ${JSON.stringify(invoices)};
  var seen = {}, count = 0;
  document.querySelectorAll('tr.z-listitem').forEach(function (row) {
    var cell = row.querySelector('td[instancename="Document No"]');
    var no = cell ? cell.textContent.trim() : '';
    if (!no || want.indexOf(no) < 0) return;
    seen[no] = true;
    var cb = row.querySelector('span.z-checkbox');
    if (cb && !cb.classList.contains('z-checkbox-on')) {
      var inp = cb.querySelector('input[type="checkbox"]');
      if (inp && !inp.checked) { inp.click(); count++; }
    }
  });
  var missing = want.filter(function (n) { return !seen[n]; });
  console.log('[AR Bot] Dicentang ' + count + ' invoice. Tidak ditemukan (' + missing.length + '):', missing);
  alert('Dicentang ' + count + ' invoice.' + (missing.length ? '\\nTidak ditemukan di tabel: ' + missing.length + ' (lihat Console).' : ''));
})();`;
}

export function ChecklistPage() {
  const [text, setText] = useState("");
  const toast = useToast();
  const list = useMemo(() => [...new Set(text.split(/\r?\n/).map((s) => s.trim()).filter(Boolean))], [text]);
  const copy = async () => {
    await navigator.clipboard.writeText(checklistScript(list));
    toast("Skrip disalin. Tempel di Console (F12) halaman Penguin ERP lalu Enter.", "success", 6000);
  };
  return (
    <div className="grid gap-4">
      <PageHeader title="Invoice Checklist">
        <button type="button" className={btnPrimary} disabled={!list.length} onClick={copy}><Icon name="file_swap" />Salin skrip</button>
      </PageHeader>
      <Card title={`Nomor invoice (${list.length})`}>
        <textarea className={`${inputCls} h-[55vh] font-mono`} value={text} onChange={(e) => setText(e.target.value)}
          placeholder={"SI/098869/VIII/XXVI/TRA\nSI/098870/VIII/XXVI/TRA"} aria-label="Daftar nomor invoice" />
      </Card>
    </div>
  );
}
