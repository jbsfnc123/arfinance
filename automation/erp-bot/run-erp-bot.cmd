@echo off
rem Dijalankan Windows Task Scheduler (lihat docs/erp-bot.md). Exit code 0 = sukses, 1 = gagal (cek logs\).
cd /d "%~dp0"
call npx --no-install tsx src\index.ts %*
exit /b %ERRORLEVEL%
