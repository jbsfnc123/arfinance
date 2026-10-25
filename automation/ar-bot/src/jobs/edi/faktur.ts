// Upload Faktur Pajak Coretax ke EDI Mitra 10 (Draft Invoice) — port bot_upload_faktur.js.
// Mode "draft": cari per No Invoice. Mode "not_found": cari per No PO lalu verifikasi No SJ & Open Amt, isi Vendor Invoice No.
// Satu PO dengan beberapa invoice/SJ (Fase 70): semua dokumen Draft hasil cari PO diuji; dokumen yang SJ-nya cocok yang diisi.
// Uji coba: hanya cari & verifikasi (tanpa Save / Upload / Send) — status di daftar tidak diubah.
import type { Page } from "puppeteer-core";
import type { JobParams } from "~/shared/types";
import { delay, type RunContext } from "~/runner/ctx";
import { docMatches, pickDraftDoc, type DraftDoc } from "~/faktur/po";
import { loadManifest, patchItem, splitFile } from "~/faktur/store";
import type { FakturItem } from "~/faktur/split";
import type { JobOut } from "../jasper/jobs";
import { ediLogin, ediLogout, ediPage, pickAccounts } from "./session";

const uploaded = (s?: string) => !!s && s.startsWith("Uploaded");

/** Faktur yang akan diproses sesuai mode (sama dengan bot lama). */
export function fakturQueue(items: FakturItem[], mode: JobParams["mode"]) {
  return items.filter((i) => i.checked !== false && !uploaded(i.status) &&
    (mode === "not_found" ? i.status === "Not Found in Draft" || !!i.no_po : true));
}

async function toList(page: Page) {
  await page.evaluate(() => {
    for (const b of document.querySelectorAll<HTMLElement>(".modal .close, .modalResultFPClose")) { try { b.click(); } catch { /* abaikan */ } }
    const panel = document.querySelector(".panelInvoice");
    const back = document.querySelector<HTMLElement>(".panelInvoice button.backBtn") ?? document.querySelector<HTMLElement>("button.backBtn");
    if (back && panel && !panel.classList.contains("hidden")) back.click();
    const tab = document.querySelector<HTMLElement>("#custom-tabs-one-invoices-tab");
    if (tab && !tab.classList.contains("active")) tab.click();
  });
  await delay(1200);
}

/** Login → menu Invoices → vendor → Draft Invoice › tab Invoice. */
async function openDraft(ctx: RunContext, page: Page) {
  await page.evaluate(() => {
    const sel = document.querySelector<HTMLSelectElement>("#partnerlist") ?? document.querySelector<HTMLSelectElement>("select.partnerCompany");
    if (sel && sel.options.length > 1) { sel.selectedIndex = 1; sel.dispatchEvent(new Event("change", { bubbles: true })); }
  });
  await page.waitForSelector("#preloader", { hidden: true, timeout: 15_000 }).catch(() => {});
  await delay(1500);
  await page.evaluate(() => {
    const link = [...document.querySelectorAll<HTMLElement>(".sidebar .nav-link, a.nav-link")].find((el) => el.innerText?.trim().toLowerCase().includes("invoices"));
    link?.click();
  });
  await delay(800);
  await page.waitForFunction(() => (document.querySelector<HTMLSelectElement>("#c2cInvoice")?.options.length ?? 0) > 1, { timeout: 15_000 }).catch(() => {});
  const vendor = await page.evaluate(() => {
    const s = document.querySelector<HTMLSelectElement>("#c2cInvoice");
    if (!s || s.options.length < 2) return null;
    if (s.selectedIndex === 0) s.selectedIndex = 1;
    s.dispatchEvent(new Event("change", { bubbles: true }));
    const w = window as unknown as { partnerChange?: () => void };
    if (typeof w.partnerChange === "function") w.partnerChange();
    localStorage.setItem("vendorCodeInvoice", s.value);
    return s.value;
  });
  ctx.info(`Vendor: ${vendor ?? "(bawaan)"}`);
  await delay(1000);
  await page.goto("https://edi.mitra10.com/einvoice-draft", { waitUntil: "domcontentloaded", timeout: 60_000 });
  await page.waitForSelector("#preloader", { hidden: true, timeout: 15_000 }).catch(() => {});
  await delay(1500);
  await page.waitForFunction(() => (document.querySelector<HTMLSelectElement>("#c2cInvoice")?.options.length ?? 0) > 1, { timeout: 15_000 }).catch(() => {});
  await page.evaluate((v: string | null) => {
    const s = document.querySelector<HTMLSelectElement>("#c2cInvoice");
    if (!s || s.options.length < 2) return;
    if (v) s.value = v; else if (s.selectedIndex === 0) s.selectedIndex = 1;
    s.dispatchEvent(new Event("change", { bubbles: true }));
    const w = window as unknown as { partnerChange?: () => void };
    if (typeof w.partnerChange === "function") w.partnerChange();
  }, vendor);
  await delay(1000);
  await page.waitForSelector("#custom-tabs-one-invoices-tab", { timeout: 15_000 });
  await page.click("#custom-tabs-one-invoices-tab");
  await delay(1500);
  await page.waitForSelector("#preloader", { hidden: true, timeout: 15_000 }).catch(() => {});
  await page.waitForSelector("#searchInv", { timeout: 15_000 });
  await page.waitForSelector("#tableInvoice", { timeout: 15_000 });
}

type DocRef = { id: string; docNo: string };
type ListRead = { notFound: true } | { notFound: false; docs: DocRef[]; total: number } | null;

/**
 * Cari di Draft; daftar SEMUA dokumen hasil cari (satu PO bisa punya beberapa dokumen: satu per invoice/SJ).
 * null bila tidak ada. Hasil lebih dari satu halaman → panjang halaman DataTable diperbesar dulu.
 */
async function listDraft(page: Page, term: string): Promise<DocRef[] | null> {
  await page.$eval("#searchInv", (el, v) => { const s = el as HTMLInputElement; s.value = v as string; s.dispatchEvent(new Event("input", { bubbles: true })); }, term);
  await delay(300);
  await page.evaluate(() => {
    const b = document.querySelector<HTMLElement>("button[onclick*='fetchDraftInv()']");
    const w = window as unknown as { fetchDraftInv?: () => void };
    if (b) b.click(); else if (typeof w.fetchDraftInv === "function") w.fetchDraftInv();
  });
  const settle = async () => {
    await delay(1500);
    await page.waitForSelector("#tableInvoice_processing", { hidden: true, timeout: 15_000 }).catch(() => {});
    await delay(800);
  };
  await settle();
  const read = (): Promise<ListRead> => page.evaluate(() => {
    const rows = [...document.querySelectorAll<HTMLElement>("#tableInvoice tbody tr")];
    if (!rows.length) return null;
    const t = rows[0].innerText || "";
    if (rows.length === 1 && (t.includes("No data available") || t.includes("No matching records"))) return { notFound: true as const };
    const docs = rows.map((r) => {
      const btn = r.querySelector<HTMLElement>("button[onclick*='getByInvId']") ?? r.querySelector<HTMLElement>("button.btn-link");
      const id = /getByInvId\(\s*'?(\d+)'?\s*\)/.exec(btn?.getAttribute("onclick") ?? "")?.[1] ?? r.querySelector<HTMLInputElement>("input.invId")?.value ?? "";
      return { id, docNo: btn?.innerText.trim() ?? "" };
    }).filter((d) => d.id);
    type Dt = { page: { info: () => { recordsDisplay: number } } };
    const jq = (window as unknown as { jQuery?: (s: string) => { DataTable?: () => Dt } }).jQuery;
    let total = docs.length;
    try { total = jq?.("#tableInvoice").DataTable?.().page.info().recordsDisplay ?? docs.length; } catch { /* tanpa DataTable */ }
    return docs.length ? { notFound: false as const, docs, total } : null;
  });
  let found: ListRead = null;
  for (const until = Date.now() + 12_000; Date.now() < until && !found;) {
    found = await read();
    if (!found) await delay(800);
  }
  if (!found || found.notFound) return null;
  if (found.total > found.docs.length) {
    await page.evaluate(() => {
      type Dt = { page: { len: (n: number) => { draw: (p?: boolean) => void } } };
      const jq = (window as unknown as { jQuery?: (s: string) => { DataTable?: () => Dt } }).jQuery;
      try { jq?.("#tableInvoice").DataTable?.().page.len(100).draw(false); } catch { /* biarkan halaman pertama */ }
    });
    await settle();
    const more = await read();
    if (more && !more.notFound) found = more;
  }
  return found.docs;
}

/** Buka detail satu dokumen Draft (getByInvId) & baca sub-invoice (Vendor Shipment No, Total Amount) + Vendor Invoice No. */
async function openDoc(page: Page, doc: DocRef): Promise<DraftDoc> {
  await page.evaluate((id: string) => {
    const inv = document.querySelector<HTMLInputElement>("#invId");
    if (inv) inv.value = "";
    const w = window as unknown as { getByInvId?: (id: number) => void };
    if (typeof w.getByInvId === "function") w.getByInvId(Number(id));
    else document.querySelector<HTMLElement>(`button[onclick*='getByInvId(${id})']`)?.click();
  }, doc.id);
  await page.waitForSelector(".panelInvoice:not(.hidden)", { timeout: 20_000 });
  await page.waitForFunction((id: string) => document.querySelector<HTMLInputElement>("#invId")?.value?.trim() === id, { timeout: 20_000 }, doc.id);
  await page.waitForSelector("#preloader", { hidden: true, timeout: 15_000 }).catch(() => {});
  await page.waitForFunction(() => document.querySelectorAll("#tbodySubInv tr").length > 0, { timeout: 15_000 }).catch(() => {});
  await delay(600);
  return page.evaluate((d: DocRef) => ({
    id: d.id,
    docNo: document.querySelector<HTMLInputElement>("#documentNoInv")?.value?.trim() || d.docNo,
    vendorInvoiceNo: document.querySelector<HTMLInputElement>("#vendorInvoiceNo")?.value ?? "",
    rows: [...document.querySelectorAll("#tbodySubInv tr")].map((tr) => {
      const td = [...tr.querySelectorAll<HTMLElement>("td")].map((x) => x.innerText.trim());
      return { noSj: td[1] ?? "", openAmt: td[5] ?? "" };
    }).filter((r) => r.noSj || r.openAmt),
  }), doc);
}

async function swalText(page: Page, click = true) {
  return page.evaluate((c: boolean) => {
    const t = document.querySelector<HTMLElement>(".swal2-title")?.innerText ?? "";
    const b = document.querySelector<HTMLElement>(".swal2-html-container, .swal2-content")?.innerText ?? "";
    if (c) document.querySelector<HTMLElement>(".swal2-confirm")?.click();
    return `${t} ${b}`.trim();
  }, click);
}

/** Klik Send lalu konfirmasi modal; mengembalikan status akhir. */
async function send(ctx: RunContext, page: Page) {
  try {
    await page.waitForSelector("button[onclick*='sendInv']", { timeout: 15_000 });
    await page.evaluate(() => {
      const b = document.querySelector<HTMLElement>("button[onclick*='sendInv']") ?? [...document.querySelectorAll<HTMLElement>("button")].find((x) => x.innerText?.trim() === "Send");
      const w = window as unknown as { sendInv?: () => void };
      if (b) b.click(); else if (typeof w.sendInv === "function") w.sendInv();
    });
    let msg: string | null = null;
    for (const until = Date.now() + 35_000; Date.now() < until && msg === null;) {
      msg = await page.evaluate(() => {
        const swal = document.querySelector<HTMLElement>(".swal2-container.swal2-shown, .swal2-popup, .swal2-modal");
        if (swal && swal.offsetParent !== null) return `${document.querySelector<HTMLElement>(".swal2-title")?.innerText ?? ""} ${document.querySelector<HTMLElement>(".swal2-html-container, .swal2-content")?.innerText ?? ""}`.trim();
        const m = document.querySelector<HTMLElement>(".modal.show");
        return m && m.offsetParent !== null ? m.innerText.trim() : null;
      });
      if (msg === null) await delay(800);
    }
    if (msg === null) return "Uploaded (Send Completed)";
    ctx.info(`Pesan Send: "${msg.slice(0, 160)}"`);
    await page.keyboard.press("Enter");
    await delay(800);
    await page.evaluate(() => {
      const c = document.querySelector<HTMLElement>(".swal2-confirm") ?? document.querySelector<HTMLElement>(".modal.show .btn-primary");
      if (c && c.offsetParent !== null) c.click();
    });
    await delay(1200);
    return "Uploaded & Sent";
  } catch (e) {
    ctx.warn(`Kendala saat Send: ${(e as Error).message.split("\n")[0]}`);
    return "Uploaded (Send Pending)";
  }
}

/** Proses satu faktur; mengembalikan status baru. */
async function processOne(ctx: RunContext, page: Page, item: FakturItem, notFoundMode: boolean): Promise<string> {
  const pdf = splitFile(item.filename);
  await toList(page);
  const byPo = notFoundMode || (item.status === "Not Found in Draft" && !!item.no_po);
  const term = (byPo ? item.no_po : item.invoice)?.trim() ?? "";
  if (byPo && !term) return "No PO Belum Diisi";
  ctx.info(`Cari ${byPo ? "No PO" : "No Invoice"} "${term}"…`);
  const list = await listDraft(page, term);
  if (list === null) return byPo ? "Not Found in Draft (PO)" : "Not Found in Draft";
  let tag = "";

  if (byPo) {
    // Satu PO bisa punya beberapa dokumen Draft (satu per invoice/SJ): buka satu per satu sampai No SJ & Open Amt cocok.
    if (list.length > 1) ctx.info(`PO ${term}: ${list.length} dokumen Draft — dicocokkan dengan No SJ ${item.no_sj || "-"}.`);
    const docs: DraftDoc[] = [];
    for (const d of list) {
      ctx.check();
      const doc = await openDoc(page, d);
      docs.push(doc);
      const used = doc.vendorInvoiceNo.trim() ? ` · Vendor Invoice No ${doc.vendorInvoiceNo.trim()}` : "";
      ctx.info(`  ${doc.docNo}: SJ ${doc.rows.map((r) => r.noSj).join(", ") || "-"}${used}`);
      if (docMatches(item, doc)) break;
    }
    const pick = pickDraftDoc(item, docs);
    if (!pick.doc) { ctx.warn(`Verifikasi: ${pick.status}`); await toList(page); return pick.status; }
    if (docs[docs.length - 1].id !== pick.doc.id) await openDoc(page, pick.doc);
    tag = pick.sj ? `${pick.doc.docNo} (${pick.sj})` : pick.doc.docNo;
    ctx.info(`Cocok: ${tag} → Vendor Invoice No ${item.invoice}`);
    if (ctx.opts.dryRun) { await toList(page); return `Cocok (uji coba): ${tag}`; }
    await page.waitForSelector("#vendorInvoiceNo", { timeout: 10_000 });
    await page.$eval("#vendorInvoiceNo", (el, v) => {
      const i = el as HTMLInputElement;
      i.value = v as string;
      for (const ev of ["input", "keyup", "change"]) i.dispatchEvent(new Event(ev, { bubbles: true }));
    }, item.invoice);
    await delay(500);
    await page.evaluate(() => {
      const b = document.querySelector<HTMLElement>("button[onclick*='saveInv()']") ?? [...document.querySelectorAll<HTMLElement>("button")].find((x) => x.innerText?.trim() === "Save");
      const w = window as unknown as { saveInv?: () => void };
      if (b) b.click(); else if (typeof w.saveInv === "function") w.saveInv();
    });
    await delay(1200);
    await page.waitForSelector(".swal2-container", { visible: true, timeout: 10_000 }).catch(() => {});
    const note = await swalText(page);
    if (note) ctx.info(`Simpan Vendor Invoice No: "${note.slice(0, 160)}"`);
    await delay(1000);
  } else {
    const doc = await openDoc(page, list[0]);
    ctx.info(`Ditemukan di Draft: ${doc.docNo}`);
    if (ctx.opts.dryRun) { await toList(page); return "Ditemukan (uji coba)"; }
  }

  ctx.info(`Unggah ${item.filename}…`);
  await page.waitForSelector("button.fakturUploadcoretax", { visible: true, timeout: 15_000 });
  await page.$eval("button.fakturUploadcoretax", (el) => (el as HTMLElement).click());
  await delay(1000);
  await page.waitForSelector("#uploadFakturcoretax", { visible: true, timeout: 15_000 });
  const input = await page.waitForSelector("#filecoretax", { timeout: 15_000 });
  if (!input) throw new Error("input file #filecoretax tidak ditemukan");
  await (input as unknown as { uploadFile: (p: string) => Promise<void> }).uploadFile(pdf);
  await delay(500);
  await page.evaluate(() => {
    const i = document.querySelector<HTMLInputElement>("#filecoretax");
    const f = i?.files?.[0];
    if (f && f.type !== "application/pdf") { try { Object.defineProperty(f, "type", { value: "application/pdf", configurable: true }); } catch { /* abaikan */ } }
    i?.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await delay(500);
  await page.evaluate(() => {
    const b = document.querySelector<HTMLElement>("#uploadFakturcoretax button[onclick*='doUploadFakturCoretax']") ?? document.querySelector<HTMLElement>("button[onclick*='doUploadFakturCoretax']");
    const w = window as unknown as { doUploadFakturCoretax?: () => void };
    if (b) b.click(); else if (typeof w.doUploadFakturCoretax === "function") w.doUploadFakturCoretax();
  });

  let res: { status: "review" | "error" | "swal"; notes?: string } | null = null;
  for (const until = Date.now() + 25_000; Date.now() < until && !res;) {
    res = await page.evaluate(() => {
      const review = document.querySelector<HTMLElement>("#modalReviewToSubmit");
      if (review && (review.classList.contains("show") || review.style.display === "block")) return { status: "review" as const };
      const err = document.querySelector<HTMLElement>(".table-errorupload");
      if (err && !err.classList.contains("hidden") && err.offsetParent !== null) {
        return { status: "error" as const, notes: [...err.querySelectorAll<HTMLElement>("tbody tr")].map((r) => r.innerText.trim()).join(" | ") };
      }
      const swal = document.querySelector<HTMLElement>(".swal2-container");
      if (swal && swal.offsetParent !== null) return { status: "swal" as const, notes: document.querySelector<HTMLElement>(".swal2-title, .swal2-content")?.innerText ?? "" };
      return null;
    });
    if (!res) await delay(1000);
  }
  let status: string;
  if (res?.status === "review") {
    await page.evaluate(() => {
      const form = document.querySelector<HTMLFormElement>("#formFakturReviewResult");
      const b = form?.querySelector<HTMLElement>("button[type='submit']");
      if (b) b.click(); else form?.dispatchEvent(new Event("submit", { bubbles: true }));
    });
    await delay(3000);
    await page.evaluate(() => {
      document.querySelector<HTMLElement>(".swal2-confirm")?.click();
      (document.querySelector<HTMLElement>(".modalResultFPClose") ?? document.querySelector<HTMLElement>("#modalReviewToSubmit .close"))?.click();
    });
    await delay(1200);
    ctx.info("Faktur terunggah & review disubmit.");
    status = await send(ctx, page);
  } else if (res?.status === "error") {
    status = `Failed: ${res.notes ?? ""}`.slice(0, 300);
  } else if (res?.status === "swal") {
    ctx.info(`Pesan unggah: "${(res.notes ?? "").slice(0, 160)}"`);
    await page.evaluate(() => document.querySelector<HTMLElement>(".swal2-confirm")?.click());
    await delay(1000);
    const canSend = await page.evaluate(() => { const b = document.querySelector<HTMLElement>("button[onclick*='sendInv']"); return !!(b && b.offsetParent !== null); });
    status = canSend ? await send(ctx, page) : "Uploaded";
  } else {
    status = "Timeout / Unverified";
  }
  await toList(page);
  return tag ? `${status} · ${tag}` : status;
}

export async function ediUploadFakturJob(ctx: RunContext, p: JobParams): Promise<JobOut> {
  const [acc] = pickAccounts(ctx, p.accounts?.slice(0, 1));
  const notFound = p.mode === "not_found";
  const queue = fakturQueue(loadManifest().items, p.mode);
  if (!queue.length) return { status: "skipped", summary: "Tidak ada faktur tercentang yang belum terunggah." };
  ctx.info(`Akun ${acc.label || acc.username} · mode ${notFound ? "Not Found in Draft (cari No PO)" : "Draft (cari No Invoice)"} · ${queue.length} faktur${ctx.opts.dryRun ? " · UJI COBA (tanpa unggah)" : ""}`);
  const page = await ediPage(ctx);
  await ediLogin(ctx, page, acc);
  await openDraft(ctx, page);
  let ok = 0;
  const failed: string[] = [];
  for (const [i, item] of queue.entries()) {
    ctx.check();
    ctx.info(`[${i + 1}/${queue.length}] Invoice ${item.invoice} · Faktur ${item.faktur}`);
    let status: string;
    try {
      status = await processOne(ctx, page, item, notFound);
    } catch (e) {
      ctx.check();
      status = `Error: ${(e as Error).message.split("\n")[0]}`.slice(0, 300);
      await toList(page).catch(() => {});
    }
    const good = uploaded(status) || status.includes("(uji coba)");
    if (good) ok++; else failed.push(item.invoice);
    ctx.log(good ? "ok" : "warn", `${item.invoice}: ${status}`);
    if (!ctx.opts.dryRun) patchItem(item.invoice, { status });
  }
  await ediLogout(page);
  const summary = `${ok}/${queue.length} ${ctx.opts.dryRun ? "ditemukan" : "terunggah"}`;
  // Ada faktur yang tidak berhasil → job gagal (status per faktur sudah tersimpan di daftar Upload Faktur).
  if (failed.length) throw new Error(`${summary} · ${failed.length} faktur perlu dicek (lihat kolom Status)`);
  return { summary, rows: queue.length };
}
