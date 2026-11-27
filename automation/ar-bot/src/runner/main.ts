// Runner AR Bot (CLI):
//   node runner.mjs                 permintaan JSON lewat stdin (dari server / jendela aplikasi)
//   node runner.mjs --chain <id>    rangkaian terjadwal (Task Scheduler), tanpa jendela
//   node runner.mjs --cloud         bot cloud (GitHub Actions repo ARBOT, Fase 93): run dari tabel bot_runs AR Workspace
// Inti run ada di run.ts.
import { parseArgs } from "node:util";
import type { RunRequest } from "~/shared/types";
import { loadConfig } from "~/core/store";
import { cloudMain } from "./cloud";
import { executeRun } from "./run";

const { values: args } = parseArgs({ options: { chain: { type: "string" }, cloud: { type: "boolean" } }, strict: false });

async function readStdin() {
  const chunks: Buffer[] = [];
  for await (const c of process.stdin) chunks.push(c as Buffer);
  return Buffer.concat(chunks).toString("utf8");
}

async function main(): Promise<boolean> {
  if (args.cloud) return cloudMain();
  let request: RunRequest;
  if (typeof args.chain === "string") {
    const chain = loadConfig().chains.find((c) => c.id === args.chain);
    if (!chain) throw new Error(`Rangkaian "${args.chain}" tidak ada di pengaturan.`);
    request = { jobs: chain.jobs, trigger: "schedule", chainId: chain.id, chainName: chain.name };
  } else {
    request = JSON.parse(await readStdin()) as RunRequest;
  }
  return (await executeRun(request)).status === "ok";
}

main().then((ok) => process.exit(ok ? 0 : 1)).catch((e) => {
  console.error(`AR Bot runner: ${(e as Error).message}`);
  process.exit(2);
});
