# Pasang / perbarui AR Bot di PC ini (tanpa hak admin):
#   powershell -ExecutionPolicy Bypass -File scripts\deploy-local.ps1 [-Target <folder>]
# Menyalin dist\ARBot ke %LOCALAPPDATA%\ARBot (folder data tidak disentuh) dan membuat pintasan Desktop & Start Menu.
param([string]$Target = (Join-Path $env:LOCALAPPDATA 'ARBot'))
$ErrorActionPreference = 'Stop'

$src = (Resolve-Path (Join-Path $PSScriptRoot '..\dist\ARBot')).Path
if (-not (Test-Path (Join-Path $src 'app\server.mjs'))) { throw "Build belum ada. Jalankan: npm run build" }
$data = Join-Path $Target 'data'

# Bot sedang berjalan -> jangan timpa file yang sedang dipakai.
$runLock = Join-Path $data 'run.lock'
if (Test-Path $runLock) {
  $l = Get-Content $runLock -Raw | ConvertFrom-Json
  if (Get-Process -Id $l.pid -ErrorAction SilentlyContinue) { throw "Bot sedang berjalan (PID $($l.pid)). Tunggu selesai lalu ulangi." }
}
# Tutup server AR Bot milik folder ini (jendela aplikasi ikut tertutup).
$srv = Join-Path $data 'server.json'
if (Test-Path $srv) {
  $s = Get-Content $srv -Raw | ConvertFrom-Json
  $p = Get-Process -Id $s.pid -ErrorAction SilentlyContinue
  if ($p -and $p.Path -like "$Target*") { Stop-Process -Id $s.pid -Force; Start-Sleep -Milliseconds 500 }
}

New-Item -ItemType Directory -Force $Target | Out-Null
robocopy $src $Target /MIR /XD $data /NFL /NDL /NJH /NJS /NP | Out-Null
if ($LASTEXITCODE -ge 8) { throw "robocopy gagal (kode $LASTEXITCODE)" }

$ws = New-Object -ComObject WScript.Shell
foreach ($dir in @([Environment]::GetFolderPath('Desktop'), [Environment]::GetFolderPath('Programs'))) {
  $lnk = $ws.CreateShortcut((Join-Path $dir 'AR Bot.lnk'))
  $lnk.TargetPath = Join-Path $env:WINDIR 'System32\wscript.exe'
  $lnk.Arguments = '"' + (Join-Path $Target 'AR Bot.vbs') + '"'
  $lnk.WorkingDirectory = $Target
  $lnk.IconLocation = (Join-Path $Target 'ARBot.ico') + ',0'
  $lnk.Description = 'AR Bot - bot Jaspersoft dan EDI Mitra 10'
  $lnk.Save()
}
Write-Host "AR Bot terpasang di $Target (pintasan: Desktop & Start Menu)"
