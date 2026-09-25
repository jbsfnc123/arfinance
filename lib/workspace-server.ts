import "server-only";
import { headers } from "next/headers";
import { workspaceFromHost, workspaceUrl, type Workspace } from "./workspace";

// Host & workspace request saat ini (dari header Host, bukan dari input pengguna).
export async function currentHost() {
  return (await headers()).get("host");
}

export async function currentWorkspace(): Promise<Workspace> {
  return workspaceFromHost(await currentHost());
}

export async function urlOf(ws: Workspace, path = "/") {
  return workspaceUrl(ws, await currentHost(), path);
}
