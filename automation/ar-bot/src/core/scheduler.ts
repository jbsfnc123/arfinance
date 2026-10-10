// Jadwal rangkaian lewat Task Scheduler Windows (akun pengguna saat ini, tanpa hak admin). Tugas menjalankan
// run-hidden.vbs → bin\node.exe app\runner.mjs --chain <id> tanpa jendela; aplikasi tidak perlu terbuka.
import { spawnSync } from "node:child_process";
import path from "node:path";
import { WEEKDAYS, validTime } from "~/shared/catalog";
import type { Chain } from "~/shared/types";
import { APP_DIR } from "./paths";

const FOLDER = "\\ARBot\\"; // folder tugas di Task Scheduler
export const taskName = (chain: Chain) => `AR Bot - ${chain.id}`;
const q = (s: string) => `'${s.replace(/'/g, "''")}'`;

function ps(script: string) {
  const r = spawnSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", `$ErrorActionPreference='Stop';${script}`], {
    encoding: "utf8", windowsHide: true, timeout: 60_000,
  });
  if (r.status !== 0) throw new Error((r.stderr || r.error?.message || "PowerShell gagal").toString().trim().split("\n")[0]);
  return r.stdout.trim();
}

/** Daftarkan / perbarui tugas; jadwal mati atau tanpa hari = hapus tugas. */
export function applySchedule(chain: Chain) {
  const s = chain.schedule;
  if (!s.enabled || !s.days.length) { removeSchedule(chain); return; }
  if (!validTime(s.time)) throw new Error(`Jam tidak valid: ${s.time}`);
  const root = path.dirname(APP_DIR);
  const vbs = path.join(root, "run-hidden.vbs");
  const days = WEEKDAYS.filter((w) => s.days.includes(w.d)).map((w) => w.ps).join(",");
  ps([
    `$a=New-ScheduledTaskAction -Execute 'wscript.exe' -Argument ${q(`"${vbs}" "${chain.id}"`)} -WorkingDirectory ${q(root)}`,
    `$t=New-ScheduledTaskTrigger -Weekly -DaysOfWeek ${days} -At ${q(s.time)}`,
    "$s=New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Hours 3)",
    `Register-ScheduledTask -TaskName ${q(taskName(chain))} -TaskPath ${q(FOLDER)} -Action $a -Trigger $t -Settings $s -Description ${q(`AR Bot: rangkaian ${chain.name}`)} -Force | Out-Null`,
  ].join(";"));
}

export function removeSchedule(chain: Chain) {
  ps(`$t=Get-ScheduledTask -TaskPath ${q(FOLDER)} -TaskName ${q(taskName(chain))} -ErrorAction SilentlyContinue; if($t){Unregister-ScheduledTask -TaskPath ${q(FOLDER)} -TaskName ${q(taskName(chain))} -Confirm:$false}`);
}

export type TaskInfo = { name: string; state: string; next: string | null; last: string | null; lastResult: number | null };

/** Tugas AR Bot yang terdaftar di Windows (untuk mencocokkan dengan pengaturan di aplikasi). */
export function listSchedules(): TaskInfo[] {
  const out = ps(`$r=@(Get-ScheduledTask -TaskPath ${q(FOLDER)} -ErrorAction SilentlyContinue | ForEach-Object { $i=$_ | Get-ScheduledTaskInfo; ` +
    `[pscustomobject]@{name=$_.TaskName;state=[string]$_.State;next=if($i.NextRunTime){$i.NextRunTime.ToString('o')}else{$null};` +
    `last=if($i.LastRunTime -and $i.LastRunTime.Year -gt 2000){$i.LastRunTime.ToString('o')}else{$null};lastResult=$i.LastTaskResult} }); ConvertTo-Json -InputObject $r -Compress`);
  if (!out) return [];
  const v = JSON.parse(out) as TaskInfo | TaskInfo[];
  return Array.isArray(v) ? v : [v];
}

export function runScheduleNow(chain: Chain) {
  ps(`Start-ScheduledTask -TaskPath ${q(FOLDER)} -TaskName ${q(taskName(chain))}`);
}
