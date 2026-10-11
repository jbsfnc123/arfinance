# AR Archive (Google Apps Script)

Web App penyimpan arsip data AR Workspace di Google Drive (Fase 66). Lihat `docs/arsip-data.md`.

- `Code.gs` (di-commit), `Secret.gs` berisi `var ARCHIVE_SECRET = "…";` (TIDAK di-commit; sama dengan env `ARCHIVE_GAS_SECRET` di Vercel).
- Pemilik: **dearmando.manalu@gmail.com** (proyek dibagikan ke akun clasp untuk `clasp push`; izin Drive & deploy WAJIB oleh pemilik).
- Pasang: `clasp push` → di editor Run `setup` sekali (izin Drive) → Deploy › New deployment › Web app (Execute as Me, Anyone).
- URL `/exec` → env `ARCHIVE_GAS_URL` di Vercel.
