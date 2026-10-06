// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const userId = "11111111-1111-4111-8111-111111111111";
const m = vi.hoisted(() => ({ get: vi.fn(), send: vi.fn(), save: vi.fn(), remove: vi.fn(), receive: null as null | ((x: { payload: unknown }) => void), auth: null as null | ((event: string) => void) }));
vi.mock("@/lib/alarm/actions", () => ({ getAlarmContext: m.get, sendAlarm: m.send, saveAlarmAccess: m.save }));
vi.mock("@/lib/supabase/client", () => ({ createClient: () => ({
  auth: { onAuthStateChange: (fn: typeof m.auth) => { m.auth = fn; return { data: { subscription: { unsubscribe() {} } } }; } },
  realtime: { setAuth: async () => {} },
  channel: () => ({ on(_type: string, _event: unknown, fn: typeof m.receive) { m.receive = fn; return this; }, subscribe(fn: (s: string) => void) { fn("SUBSCRIBED"); return this; } }),
  removeChannel: m.remove,
}) }));
import { AlarmMenuButton, AlarmProvider } from "./alarm-provider";
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let host: HTMLDivElement, root: Root;
beforeEach(async () => {
  vi.useFakeTimers(); vi.setSystemTime(new Date("2026-10-07T01:00:00Z")); vi.clearAllMocks();
  m.get.mockResolvedValue({ userId, canSend: true, isAdmin: false, senderIds: [], accounts: [{ id: userId, name: "Penerima" }] });
  m.send.mockResolvedValue({ ok: true });
  host = document.createElement("div"); document.body.appendChild(host); root = createRoot(host);
  await act(async () => root.render(<AlarmProvider><AlarmMenuButton /><span>Konten lama</span></AlarmProvider>));
});
afterEach(() => { act(() => root.unmount()); host.remove(); vi.useRealTimers(); });
const button = (text: string) => [...host.querySelectorAll("button")].find((b) => b.textContent?.includes(text))!;
async function open() { await act(async () => { button("Alarm").click(); }); }
async function field(selector: string, value: string) {
  const el = host.querySelector<HTMLInputElement>(selector)!;
  const proto = el.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : el.tagName === "SELECT" ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
  await act(async () => { Object.getOwnPropertyDescriptor(proto, "value")!.set!.call(el, value); el.dispatchEvent(new Event(el.tagName === "SELECT" ? "change" : "input", { bubbles: true })); });
}
async function schedule() {
  await open(); await field("select", userId); await field('input[type="time"]', "08:01"); await field("textarea", "Pesan jadwal");
  await act(async () => { host.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); });
}
it("queues until due, dispatches once, and preserves existing page content", async () => {
  await schedule();
  expect(host.querySelector<HTMLInputElement>('input[type="date"]')!.value).toBe("2026-10-07");
  expect(host.textContent).toContain("Menunggu");
  await act(async () => { await vi.advanceTimersByTimeAsync(59000); });
  expect(m.send).not.toHaveBeenCalled();
  await act(async () => { await vi.advanceTimersByTimeAsync(6000); });
  expect(m.send).toHaveBeenCalledTimes(1);
  expect(host.textContent).toContain("Konten lama");
});
it("cancels a scheduled alarm", async () => {
  await schedule(); await act(async () => button("Batalkan").click());
  await act(async () => { await vi.advanceTimersByTimeAsync(61000); });
  expect(m.send).not.toHaveBeenCalled();
});
it("shows recipient modal safely and deduplicates repeated events", async () => {
  const payload = { id: crypto.randomUUID(), recipientId: userId, senderId: userId, senderName: "Pengirim", message: "<script>test</script>", dueAt: Date.now(), sentAt: Date.now() };
  await act(async () => { m.receive!({ payload }); m.receive!({ payload }); });
  expect(host.querySelector('[role="dialog"][aria-label="Alarm masuk"]')).not.toBeNull();
  expect(host.textContent).toContain("<script>test</script>"); expect(host.querySelector("script")).toBeNull();
  await act(async () => button("Mengerti").click());
  expect(host.querySelector('[aria-label="Alarm masuk"]')).toBeNull();
});
it("clears alarms on logout", async () => {
  await schedule(); await act(async () => m.auth!("SIGNED_OUT"));
  await act(async () => { await vi.advanceTimersByTimeAsync(61000); });
  expect(m.send).not.toHaveBeenCalled();
});
it("hides send form for accounts without access", async () => {
  m.get.mockResolvedValue({ userId, canSend: false, isAdmin: false, senderIds: [], accounts: [] });
  await open(); expect(host.querySelector("textarea")).toBeNull();
  expect(host.textContent).toContain("Anda tetap dapat menerima Alarm");
});
