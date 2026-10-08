import { expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { getSession } from "@/lib/session";
import { CONSULTANT_SETTINGS_URL } from "@/lib/consultant-config";
import AiSettingsPage from "./page";
vi.mock("@/lib/session", () => ({ getSession: vi.fn() }));
const session = (kind: string) => ({ role: { kind } }) as Awaited<ReturnType<typeof getSession>>;
it("embeds the separate settings URL for Super Admin", async () => {
  vi.mocked(getSession).mockResolvedValue(session("sa"));
  const html = renderToStaticMarkup(await AiSettingsPage());
  expect(html).toContain(CONSULTANT_SETTINGS_URL);
  expect(html).toContain('title="Pengaturan AI Bang Mando"');
});
it("denies non-admin accounts without loading an external frame", async () => {
  vi.mocked(getSession).mockResolvedValue(session("controller"));
  const html = renderToStaticMarkup(await AiSettingsPage());
  expect(html).toContain("Menu ini hanya untuk Super Admin.");
  expect(html).not.toContain("<iframe");
  expect(html).not.toContain(CONSULTANT_SETTINGS_URL);
});
