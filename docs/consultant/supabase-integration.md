# QnA AR Workspace (dulu: Asst. Bang Mando) — integration checkpoint

## Help desk and account permission update

Bang Mando focuses on application usage and troubleshooting, with polite casual Jakarta Indonesian. Tutorial knowledge is maintained in Drive document `19ld-QJ6ZJPPyz6bF8YfUjpVQteioTD8gn2ga7k1925A`, in the user-specified knowledge folder. The supplied manual-paste GAS package loads that document first; applying this repository change does not deploy GAS source.

`profiles.chatbot_enabled` defaults to false. Super Admin manages it in Finance > Akun & PIN (create/edit account); existing Super Admin roles retain automatic access. AR/AP layouts derive chat visibility from the authenticated server profile in the existing session query, with no additional polling. Existing profile RLS allows Super Admin updates only. Users refresh/re-enter the app after a permission change. This governs the embedded app launcher; it does not change the external GAS deployment's public accessibility or grant data retrieval.

## Implemented

Authenticated AR shell embeds the user-provided Apps Script deployment in a collapsible, lazy-loaded frame. User changes remount the frame. Remote frame receives no app session, access token, database key or financial data. External resource loads only on opening. The account display name is passed in `account` for greeting lookup and the profile ID in `accountId` for a hashed browser-memory namespace; neither grants authentication or authorization. There is no separate-tab link. Existing overlay stack manages Escape priority.

The manual-paste GAS package reads only the name/salutation columns of the user-specified Karyawan sheet (gid 0) for an exact normalized unique match, with a five-minute greeting cache. Missing/ambiguous matches use a generic greeting. Reply source lists are hidden; the prompt allows occasional contextual humor after help. GAS must be updated separately for these behaviors to take effect.

## Browser memory and support tone

The separately deployed GAS package supports session conversation context and optional browser persistence: up to twelve messages, 500 characters each, and an explicit short/detail/steps style preference. Persistence defaults off and expires after thirty days since last save. Clear removes saved context/preferences; malformed/expired storage is dropped; blocked iframe storage falls back to session context. Same display names are separated by profile UUID namespace. This is local storage separation, not authenticated cross-device history or model training. No new database table/query or financial retrieval is added.

Memory is bounded and treated as untrusted context by GAS. The help desk prompt responds empathetically to signs of frustration without diagnosis/profiling, redirects unclear/off-topic questions, and permits occasional respectful Bible paraphrases or light humor when appropriate. These behaviors require updating the manual-paste GAS files and the existing deployment.

## Separate AI settings page

Finance navigation and portal link to `/ai-settings`, routed to `app/finance/ai-settings`. The server checks `role.kind === "sa"` before rendering any external frame. The iframe uses the same GAS deployment with `?page=ai-settings`. GAS renders a separate Settings template and retains its existing verified Google admin/password checks; the URL parameter grants no privilege. The normal Index template contains no settings controls or admin editor JavaScript.

The GAS chat notice has been removed, while guide-mode truthfulness remains in the system prompt. The chat avatar uses the credited CC BY 3.0 Lee Jong Suk photograph from Wikimedia (K-POPIT 케이팝잇); the image is cropped visually to a circle, with BM fallback on failure. These external-template changes require pasting Code.gs, Index.html and the new Settings.html, then updating the existing GAS deployment. Vercel publishing alone does not update GAS source.

## External source access needed

Script ID: `1bM1QCyczdQjJAUe3i4MxzsNMP1c4onMXxrpAKyuuur8zpQUGEBZJ5Ern`.
Knowledge folder: `1A4o-RA3FyZ7xsrardV3u3jHso2RWB0pK`.
The provided public deployment exposes frontend `google.script.run.processChat(message)`. Its server-side implementation is not available through the Drive connector. Drive metadata lookup of the Script ID returned 404; that does not establish ownership or editor permissions because Script IDs are not necessarily Drive file IDs.

Folder inventory currently contains a staff spreadsheet and a product knowledge document. Folder visibility must not be treated as approval to make its contents public to every app role.

## Data-connected design to implement after inspecting existing processChat

1. Keep static usage/tutorial knowledge separate from live financial results. Upload a reviewed application guide in the format the existing getDriveData loader actually supports.
2. Add a same-origin authenticated application endpoint. Verify current user/active profile/workspace/menu before any retrieval. Use the user's Supabase client and RLS; never send a service-role key or login token to Apps Script, the iframe or Drive.
3. Define bounded read-only tools for explicit user questions: invoice/SJ lookup, current Aging summaries, Mitra10/RKM status, collector daily reports, Collection open/closed period summaries. Restrict by menu and collection assignment on the server. No unrestricted SQL or arbitrary RPC chosen by a model.
4. Apps Script proposes a tool call; the application server validates the tool name, typed parameters, range and result size, then retrieves allowed results. Authenticate server-to-server calls with a dedicated integration secret stored only in server environment/Script Properties; user permissions are enforced by the application server, never by claims supplied in a chat message.
5. Supply only necessary result columns, source module, active snapshot/report date, filter and aggregate counts. Closed Collection uses its frozen snapshot. Do not copy the entire database to a shared Drive folder.
6. Answers distinguish missing data, denied access, current Aging and closed-period values. Treat knowledge and retrieved data as untrusted content, never as instructions to change permissions or run SQL.
7. Inspect and fix the existing frontend rendering: public HTML currently inserts messages with innerHTML. Use textContent/DOM nodes or a vetted sanitizer before displaying database-derived or model text. Validate embed message origins if introducing postMessage; the Google wrapper has a nested googleusercontent frame, so parent/source validation must be verified in-browser rather than assumed.
8. Test allowed/denied users, cross-collection requests, logout/account changes, malicious prompts, source freshness, empty queries, timeouts and response rendering before enabling live data in production.

## Completion state

The embed is independent and can run with the existing chatbot. Supabase retrieval and knowledge ingestion are NOT connected by this checkpoint. Updating and redeploying the existing Apps Script requires editor access through Apps Script API or the approved browser workflow, plus inspecting the original source before modification.

## Fase 52 — QnA AR Workspace (2026-10-08)

- **Nama** "Asst. Bang Mando" → **QnA AR Workspace** (launcher, panel, Pengaturan AI, Akun & PIN, GAS).
- **UI GAS** meniru WhatsApp iOS: header kaca + status online/mengetik…, wallpaper doodle, gelembung berekor dengan jam &
  centang biru, chip balasan cepat, bilah input bulat, panel **emoji** (4 kategori), menu ⋯ (Bersihkan chat, Lupakan saya).
  Pesan dirender lewat DOM (`textContent`), hanya `**tebal**`/`_miring_` yang dibuat sebagai elemen aman.
- **Lampiran halaman (📎)**: aplikasi mendaftarkan ringkasan yang SUDAH tampil di layar lewat `useChatContext`
  (`lib/chat-context.ts`): semua `LocalTable` (judul, filter, kolom, ≤50 baris tampil, total), Daftar Tagihan, Dashboard
  Collection, Mutasi Bank (alokasi), Dashboard Monitor SJ. Frame GAS meminta `qna:context:request` ke `window.top`
  hanya saat user menekan 📎 atau bertanya "analisis/data ini…"; `ConsultantChat` membalas hanya bila origin
  `*-script.googleusercontent.com`/`script.google.com` DAN `event.source` berada di dalam iframe chat. Maks 3 sumber,
  50 baris, 11.000 karakter. GAS menerima balasan hanya dari origin AR Workspace (tangki.space, preview vercel, localhost).
- **Memori akun (Drive)**: subfolder `QnA - Memori Akun` di folder knowledge, satu JSON per akun (nama = hash accountId):
  20 tanya-jawab terakhir + profil gaya bicara (sapaan, bahasa, panjang, humor, emoji, topik, catatan) yang diringkas model
  tiap 6 pesan; tanpa profil sensitif. "Lupakan saya" (menu ⋯ atau ketik) membuang file.
- **File keahlian Drive** (dibuat otomatis sekali, dapat diedit): `QnA - 01 Persona`, `QnA - 02 Pantun`,
  `QnA - 03 Panduan Menu`, `QnA - 04 Analisis Halaman`; ID tersimpan di Script Property `QNA_SKILL_IDS`.
- **Penerapan GAS**: kode sudah `clasp push` (HEAD). Deployment publik (V2.1, @12) harus diperbarui pemilik script:
  Apps Script editor → Deploy → Manage deployments → ✏️ deployment V2.1 → Version: New version → Deploy (URL tetap).
  Saat pertama dijalankan Google dapat meminta otorisasi ulang (membuat folder/dokumen di Drive).

## Fase 53 — perapian chat (2026-10-08)

- Tidak ada lagi info teknis/kuning di chat: error AI (kuota, agent mati, model) selalu tampil
  "Saya sedang sibuk saat ini, silakan kembali lagi nanti 🙏"; detail dicatat di log Apps Script dan Script Property
  `QNA_LAST_ERROR` (terlihat di Pengaturan AI → Status memori). Prompt melarang bot membicarakan model/AI/kuota.
- Tanpa chip saran awal, banner, atau tombol 📎. Bot hanya menerima **nama halaman** aktif (`{menu, path}`) setiap
  mengirim pesan; tidak ada data layar yang dikirim (`useChatContext` dihapus).
- Persona jenaka & humoris sesuai mood (dokumen `QnA - 01 Persona` v2, `QnA - 04 Konteks Halaman`).
- Memori Drive: kode lama hanya membaca Drive sehingga izin yang diberikan kemungkinan read-only; penulisan gagal tanpa
  jejak. Kini `appsscript.json` mendeklarasikan scope drive/documents, error dicatat, memori disimpan meski AI sibuk.
  Pemilik script WAJIB menjalankan `qnaDiagnose` sekali dari editor (memberi izin & membuat folder memori + 4 dokumen),
  lalu Deploy → Manage deployments → New version.
