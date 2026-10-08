# Pasang jadwal harian Bot ERP di Windows Task Scheduler (jalankan sekali di PowerShell user biasa).
#   powershell -ExecutionPolicy Bypass -File install-task.ps1 [-At 07:00]
# Berjalan saat user login; bila PC mati/tidur pada jam itu, dijalankan segera setelah PC aktif (StartWhenAvailable).
param([string]$At = "07:00")

$dir = Split-Path -Parent $MyInvocation.MyCommand.Path
$action = New-ScheduledTaskAction -Execute "$dir\run-erp-bot.cmd" -WorkingDirectory $dir
$trigger = New-ScheduledTaskTrigger -Daily -At $At
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -ExecutionTimeLimit (New-TimeSpan -Minutes 30) `
  -RestartCount 1 -RestartInterval (New-TimeSpan -Minutes 15) -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
Register-ScheduledTask -TaskName "AR Workspace - Bot ERP Aging" -Action $action -Trigger $trigger -Settings $settings `
  -Description "Unduh Aging Detail dari Jaspersoft, arsip ke Google Drive, update database AR Workspace" -Force | Out-Null
Write-Output "Terpasang: setiap hari pukul $At. Uji sekarang: Start-ScheduledTask -TaskName 'AR Workspace - Bot ERP Aging'"
