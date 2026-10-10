// Enkripsi rahasia dengan DPAPI Windows (lingkup CurrentUser): hanya akun Windows yang sama di PC ini yang bisa membuka.
// Lewat PowerShell bawaan (tanpa modul native); data dikirim lewat stdin, tidak lewat argumen baris perintah.
import { spawnSync } from "node:child_process";

const SCRIPT = (op: "Protect" | "Unprotect") =>
  "$ErrorActionPreference='Stop';Add-Type -AssemblyName System.Security;" +
  "$in=[Console]::In.ReadToEnd().Trim();$b=[Convert]::FromBase64String($in);" +
  `$o=[Security.Cryptography.ProtectedData]::${op}($b,[Text.Encoding]::UTF8.GetBytes('ARBot'),'CurrentUser');` +
  "[Console]::Out.Write([Convert]::ToBase64String($o))";

function run(op: "Protect" | "Unprotect", inputB64: string) {
  const r = spawnSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", SCRIPT(op)], {
    input: inputB64, encoding: "utf8", windowsHide: true, timeout: 30_000,
  });
  if (r.status !== 0) throw new Error(`DPAPI ${op} gagal: ${(r.stderr || r.error?.message || "").toString().split("\n")[0]}`);
  return r.stdout.trim();
}

export const protect = (plain: string) => run("Protect", Buffer.from(plain, "utf8").toString("base64"));
export const unprotect = (blob: string) => Buffer.from(run("Unprotect", blob), "base64").toString("utf8");
