import { beforeEach, describe, expect, it, vi } from "vitest";
const id = "11111111-1111-4111-8111-111111111111";
const recipientId = "22222222-2222-4222-8222-222222222222";
const mocks = vi.hoisted(() => ({
  session: vi.fn(), requireAdmin: vi.fn(), setting: vi.fn(), recipient: vi.fn(),
  send: vi.fn(), upsert: vi.fn(), channel: vi.fn(), remove: vi.fn(),
}));
vi.mock("@/lib/session", () => ({ getSession: mocks.session, requireSuperAdmin: mocks.requireAdmin }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ from: () => ({ select: () => ({ eq: () => ({ maybeSingle: mocks.setting }) }), upsert: mocks.upsert }) }) }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ from: () => ({ select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: mocks.recipient }) }) }) }), channel: mocks.channel, removeChannel: mocks.remove }) }));
import { saveAlarmAccess, sendAlarm } from "./actions";
const input = () => ({ id, recipientId, dueAt: Date.now() - 1000, message: "Pesan uji" });
beforeEach(() => {
  vi.clearAllMocks();
  mocks.session.mockResolvedValue({ profile: { id, display_name: "Pengirim asli" }, role: { kind: "user" } });
  mocks.setting.mockResolvedValue({ data: { value: [id] }, error: null });
  mocks.recipient.mockResolvedValue({ data: { id: recipientId }, error: null });
  mocks.channel.mockReturnValue({ httpSend: mocks.send });
  mocks.send.mockResolvedValue({ success: true });
  mocks.remove.mockResolvedValue(undefined);
});
describe("Alarm server authorization", () => {
  it("denies users whose permission was revoked before dispatch", async () => {
    mocks.setting.mockResolvedValue({ data: { value: [] } });
    expect((await sendAlarm(input())).ok).toBe(false);
    expect(mocks.channel).not.toHaveBeenCalled();
  });
  it("derives sender from verified session and uses private HTTP broadcast", async () => {
    expect((await sendAlarm({ ...input(), senderName: "Forged" })).ok).toBe(true);
    expect(mocks.channel).toHaveBeenCalledWith(`alarm:${recipientId}`, { config: { private: true } });
    expect(mocks.send).toHaveBeenCalledWith("alarm", expect.objectContaining({ senderId: id, senderName: "Pengirim asli" }), { timeout: 10000 });
    expect(mocks.upsert).not.toHaveBeenCalled();
    expect(mocks.remove).toHaveBeenCalled();
  });
  it("allows Super Admin without a saved grant", async () => {
    mocks.setting.mockResolvedValue({ data: null });
    mocks.session.mockResolvedValue({ profile: { id, display_name: "Admin" }, role: { kind: "sa" } });
    expect((await sendAlarm(input())).ok).toBe(true);
  });
  it("rejects early dispatch and inactive recipients", async () => {
    expect((await sendAlarm({ ...input(), dueAt: Date.now() + 60000 })).ok).toBe(false);
    mocks.recipient.mockResolvedValue({ data: null });
    expect((await sendAlarm(input())).ok).toBe(false);
    expect(mocks.send).not.toHaveBeenCalled();
  });
  it("rejects oversized payloads", async () => {
    expect((await sendAlarm({ ...input(), message: "a".repeat(2001) })).ok).toBe(false);
    expect(mocks.session).not.toHaveBeenCalled();
  });
  it("reports network failure without persisting the message", async () => {
    mocks.send.mockRejectedValue(new Error("network"));
    expect((await sendAlarm(input())).ok).toBe(false);
    expect(mocks.upsert).not.toHaveBeenCalled();
    expect(mocks.remove).toHaveBeenCalled();
  });
  it("requires Super Admin to save permissions", async () => {
    mocks.requireAdmin.mockRejectedValue(new Error("Denied"));
    await expect(saveAlarmAccess([id])).rejects.toThrow("Denied");
    expect(mocks.upsert).not.toHaveBeenCalled();
  });
});
