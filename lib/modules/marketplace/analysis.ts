import { platformOf, type Report, type Row } from "./parse";

// Analisis marketplace — port buildRecon, buildAudit, buildErpRecon, erpSubsidi, feeBreakdown
// dari MarketPlace/index.html. Semua fungsi murni: menerima laporan (R) sebagai argumen.

const N = (v: unknown) => Number(v) || 0;
const S = (v: unknown) => (v == null ? "" : String(v));
export const sumBy = (rows: Row[], key: string) => rows.reduce((a, r) => a + N(r[key]), 0);
export const fmt = (n: number) => "Rp " + Math.round(n || 0).toLocaleString("id-ID");

export const groupSum = (R: Report, r: Row, g: string) => {
  const G = platformOf(R).groups[g];
  return G ? G.keys.reduce((a, k) => a + N(r[k]), 0) : 0;
};

export const statusRefund = (r: Row) =>
  !N(r.refund) ? "Tanpa refund" : -N(r.refund) >= N(r.harga) - 0.5 ? "Refund penuh" : "Refund sebagian";

// Nilai dari sheet ringkasan bila ada, selain itu dihitung dari pesanan.
export const sumOf = (R: Report, key: keyof ReturnType<typeof platformOf>["sum"], fallback: () => number) => {
  const v = R.summary[platformOf(R).sum[key]];
  return v === undefined ? fallback() : v;
};

// ── Rekonsiliasi laporan vs mutasi saldo (Shopee) ──────────────────
export const hasBalance = (R: Report) => R.Balance.length > 0;
const balanceMasuk = (R: Report) => R.Balance.filter((b) => /penghasilan dari pesanan/i.test(S(b.tipe)));
export const balancePenyesuaian = (R: Report) => R.Balance.filter((b) => /penyesuaian/i.test(S(b.tipe)));

export type ReconRow = {
  no: string; tanggal: string; laporan: number; saldo: number; selisih: number; waktu: string;
  status: "Cocok" | "Nominal beda" | "Belum masuk saldo" | "Tanpa pesanan" | "Penyesuaian di luar laporan";
  keterangan: string;
};

export function buildRecon(R: Report): ReconRow[] {
  const masuk: Record<string, { nilai: number; n: number; waktu: string }> = {};
  for (const b of balanceMasuk(R)) {
    const m = (masuk[S(b.no)] ??= { nilai: 0, n: 0, waktu: S(b.waktu) });
    m.nilai += N(b.nilai);
    m.n++;
    if (S(b.waktu) > m.waktu) m.waktu = S(b.waktu);
  }
  const rows: ReconRow[] = [];
  for (const o of R.Orders) {
    const no = S(o.no);
    const m = masuk[no];
    const p = N(o.penghasilan);
    if (!m) {
      rows.push({
        no, tanggal: S(o.tglCair), laporan: p, saldo: 0, selisih: -p, waktu: "", status: "Belum masuk saldo",
        keterangan: p === 0 ? "Wajar: pesanan berpenghasilan 0 (refund penuh)" : "Perlu dicek",
      });
      continue;
    }
    const selisih = m.nilai - p;
    rows.push({
      no, tanggal: S(o.tglCair), laporan: p, saldo: m.nilai, selisih, waktu: m.waktu,
      status: Math.abs(selisih) < 0.5 ? "Cocok" : "Nominal beda", keterangan: m.n > 1 ? `${m.n} transaksi masuk` : "",
    });
    delete masuk[no];
  }
  for (const no of Object.keys(masuk)) {
    rows.push({
      no, tanggal: masuk[no].waktu.slice(0, 10), laporan: 0, saldo: masuk[no].nilai, selisih: masuk[no].nilai,
      waktu: masuk[no].waktu, status: "Tanpa pesanan", keterangan: "Dana masuk tetapi pesanan tidak ada di laporan periode ini",
    });
  }
  return rows;
}

// Penyesuaian di mutasi saldo yang tidak tercatat di sheet Adjustment.
export function buildReconAdj(R: Report): ReconRow[] {
  return balancePenyesuaian(R)
    .filter((b) => !R.Adjustment.some((a) => S(a.no) === S(b.no) && Math.abs(N(a.nilai) - N(b.nilai)) < 0.5))
    .map((b) => ({
      no: S(b.no) || "(tanpa nomor pesanan)", tanggal: S(b.tanggal), laporan: 0, saldo: N(b.nilai), selisih: N(b.nilai),
      waktu: S(b.waktu), status: "Penyesuaian di luar laporan" as const, keterangan: S(b.deskripsi) || "Tidak ada di sheet Adjustment",
    }));
}

export const reconProblems = (R: Report) =>
  buildRecon(R)
    .filter((r) => r.status === "Nominal beda" || r.status === "Tanpa pesanan" || (r.status === "Belum masuk saldo" && r.laporan !== 0))
    .concat(buildReconAdj(R));

// ── Analisis selisih refund ────────────────────────────────────────
export type AuditRow = {
  no: string; tanggal: string; diterima: number | null; ditarik: number; selisih: number; sumber: string;
  status: string; keterangan?: string; waktuTarik?: string; kas?: string;
};

export type OrderLookup = Record<string, { penghasilan: number; reportId: string }>;

export function buildAudit(R: Report, limit: number, lookup: OrderLookup): AuditRow[] {
  const byNo = new Map(R.Orders.map((o) => [S(o.no), o]));
  const rows: AuditRow[] = [];
  const push = (r: Omit<AuditRow, "status"> & { status?: string }) => {
    const status = r.status ?? (r.diterima === null ? "Perlu cek manual" : r.selisih > limit ? "Kelebihan potong" : "Sesuai");
    rows.push({ ...r, status });
  };

  if (R.meta.platform === "tiktok") {
    for (const o of R.Orders) {
      const ditarik = -N(o.refund);
      if (ditarik <= 0 && N(o.penghasilan) >= 0) continue;
      const diterima = N(o.harga);
      const r: Omit<AuditRow, "status"> & { status?: string } = {
        no: S(o.no), tanggal: S(o.tglCair) || S(o.tglPesan), diterima, ditarik, selisih: ditarik - diterima, sumber: "Periode ini",
      };
      // refund penuh tetapi dana akhir tetap negatif = biaya tidak ikut dikembalikan
      if (r.selisih <= limit && N(o.penghasilan) < 0) {
        r.status = "Biaya tidak dikembalikan";
        r.selisih = -N(o.penghasilan);
      }
      push(r);
    }
  } else {
    const kas = hasBalance(R) ? balanceAdjustmentInfo(R) : null;
    const terpakai = new Set<string>();
    for (const a of R.Adjustment) {
      if (N(a.nilai) >= 0) continue;
      const no = S(a.no);
      const o = byNo.get(no), look = lookup[no];
      const diterima = o ? N(o.penghasilan) : look ? look.penghasilan : null;
      const sumber = o ? "Periode ini" : look ? "Periode lain: " + look.reportId : "Tidak ada di data";
      const row: Omit<AuditRow, "status"> = {
        no, tanggal: S(a.tanggal), diterima, ditarik: -N(a.nilai), selisih: diterima === null ? 0 : -N(a.nilai) - diterima,
        sumber, keterangan: S(a.deskripsi),
      };
      if (kas) {
        const hit = (kas[no] || []).find((b) => Math.abs(N(b.nilai) - N(a.nilai)) < 0.5);
        if (hit) {
          row.waktuTarik = S(hit.waktu);
          row.kas = "Terkonfirmasi keluar dari saldo";
          terpakai.add(S(hit.waktu) + "|" + N(hit.nilai));
        } else row.kas = "Belum terlihat di mutasi saldo";
      }
      push(row);
    }
    // penyesuaian yang hanya ada di mutasi saldo
    if (kas) {
      for (const b of balancePenyesuaian(R)) {
        if (N(b.nilai) >= 0 || terpakai.has(S(b.waktu) + "|" + N(b.nilai))) continue;
        if (R.Adjustment.some((a) => S(a.no) === S(b.no) && Math.abs(N(a.nilai) - N(b.nilai)) < 0.5)) continue;
        const o = byNo.get(S(b.no));
        push({
          no: S(b.no) || "(tanpa nomor pesanan)", tanggal: S(b.tanggal), diterima: o ? N(o.penghasilan) : null,
          ditarik: -N(b.nilai), selisih: o ? -N(b.nilai) - N(o.penghasilan) : 0, sumber: "Mutasi saldo",
          status: "Hanya di mutasi saldo", waktuTarik: S(b.waktu), kas: "Terkonfirmasi keluar dari saldo", keterangan: S(b.deskripsi),
        });
      }
    }
    for (const o of R.Orders) {
      if (N(o.penghasilan) >= 0 && -N(o.refund) <= N(o.harga)) continue;
      push({
        no: S(o.no), tanggal: S(o.tglCair), diterima: N(o.harga), ditarik: -N(o.refund),
        selisih: -N(o.refund) - N(o.harga) + (N(o.penghasilan) < 0 ? -N(o.penghasilan) : 0),
        sumber: "Periode ini", keterangan: "Refund pada baris pesanan",
      });
    }
  }
  return rows.sort((a, b) => b.selisih - a.selisih);
}

export function balanceAdjustmentInfo(R: Report) {
  const map: Record<string, Row[]> = {};
  for (const b of balancePenyesuaian(R)) (map[S(b.no) || "(tanpa nomor)"] ??= []).push(b);
  return map;
}

// Nomor pesanan penyesuaian negatif yang pesanan asalnya tidak ada di periode ini.
export const missingAdjustmentOrders = (R: Report) => {
  if (R.meta.platform === "tiktok") return [];
  const have = new Set(R.Orders.map((o) => S(o.no)));
  return [...new Set(R.Adjustment.filter((a) => N(a.nilai) < 0 && a.no && !have.has(S(a.no))).map((a) => S(a.no)))];
};

// ── Rekonsiliasi ERP ───────────────────────────────────────────────
export const subsidiOrder = (R: Report, o: Row) => {
  const k = platformOf(R).subsidiKey;
  return k ? N(o[k]) : 0;
};

export function feeBreakdown(R: Report, o: Row) {
  const P = platformOf(R);
  const out: { label: string; nilai: number }[] = [];
  for (const g in P.groups) {
    for (const k of P.groups[g].keys) if (N(o[k])) out.push({ label: `${P.groups[g].label} › ${P.cols[k] || k}`, nilai: -N(o[k]) });
  }
  if (N(o.refund)) out.push({ label: "Pengembalian dana ke pembeli", nilai: -N(o.refund) });
  return out;
}

export type ErpRow = {
  no: string; invoiceNo: string; invoice: number; payment: number; selisihErp: number;
  invoiceDate?: string; paymentDate?: string; bpName?: string;
  danaMarketplace: number; biaya: number; subsidi: number; takTerjelaskan: number; status: string; keterangan: string;
};

export const ERP_STATUS_CLASS: Record<string, "bad" | "warn" | "ok"> = {
  "Selisih tidak terjelaskan": "bad", "Dibayar padahal tidak ada dana": "bad",
  "Pembayaran belum tercatat": "warn", "Tanpa pesanan di laporan": "warn", "Tanpa invoice ERP": "warn", Cocok: "ok",
};

// Invoice Amount ≈ harga produk; Payment Amount ≈ dana diterima − subsidi yang ditagih terpisah.
export function buildErpRecon(R: Report, limit: number): ErpRow[] {
  const byNo = new Map(R.Orders.map((o) => [S(o.no), o]));
  const rows: ErpRow[] = [];
  const dipakai = new Set<string>();

  for (const e of R.Erp.filter((x) => x.no)) {
    const no = S(e.no);
    const o = byNo.get(no);
    const base = {
      no, invoiceNo: S(e.invoiceNo), invoice: N(e.invoiceAmount), payment: N(e.paymentAmount),
      selisihErp: N(e.invoiceAmount) - N(e.paymentAmount), invoiceDate: S(e.invoiceDate), paymentDate: S(e.paymentDate), bpName: S(e.bpName),
    };
    if (!o) {
      rows.push({ ...base, danaMarketplace: 0, biaya: 0, subsidi: 0, takTerjelaskan: 0, status: "Tanpa pesanan di laporan", keterangan: "PO tidak ada di laporan periode ini" });
      continue;
    }
    dipakai.add(no);
    const subsidi = subsidiOrder(R, o);
    const dana = N(o.penghasilan) - subsidi;
    const biaya = N(o.harga) - N(o.penghasilan);
    const takTerjelaskan = base.selisihErp - biaya - subsidi;
    let status = "Cocok", keterangan = "";
    if (!base.payment && dana > 0) { status = "Pembayaran belum tercatat"; keterangan = `Marketplace sudah membayar ${fmt(dana)}`; }
    else if (base.payment > 0 && dana <= 0) { status = "Dibayar padahal tidak ada dana"; keterangan = "Dana marketplace 0/negatif (refund penuh)"; }
    else if (Math.abs(takTerjelaskan) > limit) { status = "Selisih tidak terjelaskan"; keterangan = `Selisih ERP ${fmt(base.selisihErp)} vs biaya ${fmt(biaya + subsidi)}`; }
    rows.push({ ...base, danaMarketplace: dana, biaya, subsidi, takTerjelaskan, status, keterangan });
  }

  for (const o of R.Orders) {
    const no = S(o.no);
    if (dipakai.has(no) || N(o.penghasilan) === 0) continue;
    rows.push({
      no, invoiceNo: "", invoice: 0, payment: 0, selisihErp: 0, danaMarketplace: N(o.penghasilan),
      biaya: N(o.harga) - N(o.penghasilan), subsidi: subsidiOrder(R, o), takTerjelaskan: 0, status: "Tanpa invoice ERP",
      keterangan: `Dana diterima ${fmt(N(o.penghasilan))} tetapi tidak ada invoice`,
    });
  }
  return rows.sort((a, b) => Math.abs(b.takTerjelaskan) - Math.abs(a.takTerjelaskan));
}

// Invoice subsidi (PO "-") dibanding total subsidi di laporan.
export function erpSubsidi(R: Report) {
  const baris = R.Erp.filter((e) => !e.no);
  const erpTotal = sumBy(baris, "invoiceAmount");
  const key = platformOf(R).subsidiKey;
  const laporan = key ? R.Orders.reduce((a, o) => a + N(o[key]), 0) : 0;
  return { baris, erpTotal, erpBayar: sumBy(baris, "paymentAmount"), laporan, selisih: laporan - erpTotal };
}
