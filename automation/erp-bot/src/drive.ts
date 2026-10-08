// Arsip ke Google Drive lewat Web App Apps Script "ERP Drive Inbox" (gas/Code.gs). Tanpa kredensial Google di PC:
// cukup URL Web App + rahasia bersama.
import fs from "node:fs";
import path from "node:path";

export async function archiveToDrive(filePath: string, month: string, env: { url: string; secret: string }) {
  const body = JSON.stringify({
    secret: env.secret,
    fileName: path.basename(filePath),
    month,
    mimeType: filePath.toLowerCase().endsWith(".xlsx")
      ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" : "application/vnd.ms-excel",
    base64: fs.readFileSync(filePath).toString("base64"),
  });
  // Web App menjawab POST dengan 302 ke googleusercontent; fetch mengikutinya (GET) dan membaca hasil JSON.
  const res = await fetch(env.url, { method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" }, body, redirect: "follow" });
  const text = await res.text();
  let out: { ok?: boolean; error?: string; fileId?: string; url?: string; folder?: string };
  try { out = JSON.parse(text); } catch { throw new Error(`Drive: jawaban bukan JSON (HTTP ${res.status}). Periksa ERP_DRIVE_URL & akses Web App "Anyone".`); }
  if (!out.ok) throw new Error(`Drive menolak: ${out.error ?? "tidak diketahui"}`);
  return { fileId: out.fileId!, url: out.url!, folder: out.folder! };
}
