# Pasang jadwal Bot ERP di Windows Task Scheduler (jalankan di PowerShell user biasa; menimpa jadwal lama).
#   powershell -ExecutionPolicy Bypass -File install-task.ps1                       # Senin-Jumat 07:00
#   powershell -ExecutionPolicy Bypass -File install-task.ps1 -At 09:30             # jam lain
#   powershell -ExecutionPolicy Bypass -File install-task.ps1 -Days Monday,Wednesday # hari tertentu
#   powershell -ExecutionPolicy Bypass -File install-task.ps1 -Daily                 # setiap hari
# Berjalan saat user login; bila PC mati/tidur pada jam itu, dijalankan segera setelah PC aktif (StartWhenAvailable).
param(
  [string]$At = "07:00",
  [string[]]$Days = @("Monday", "Tuesday", "Wednesday", "Thursday", "Friday"),
  [switch]$Daily
)

$dir = Split-Path -Parent $MyInvocation.MyCommand.Path
$action = New-ScheduledTaskAction -Execute "$dir\run-erp-bot.cmd" -WorkingDirectory $dir
$trigger = if ($Daily) { New-ScheduledTaskTrigger -Daily -At $At } else { New-ScheduledTaskTrigger -Weekly -DaysOfWeek $Days -At $At }
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -ExecutionTimeLimit (New-TimeSpan -Minutes 30) `
  -RestartCount 1 -RestartInterval (New-TimeSpan -Minutes 15) -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
Register-ScheduledTask -TaskName "AR Workspace - Bot ERP Aging" -Action $action -Trigger $trigger -Settings $settings `
  -Description "Unduh Aging Detail dari Jaspersoft, arsip ke Google Drive, update database AR Workspace" -Force | Out-Null
$when = if ($Daily) { "setiap hari" } else { ($Days -join ", ") }
Write-Output "Terpasang: $when pukul $At. Uji sekarang: Start-ScheduledTask -TaskName 'AR Workspace - Bot ERP Aging'"
