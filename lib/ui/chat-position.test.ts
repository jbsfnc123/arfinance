import { describe, expect, it } from "vitest";
import { chatPanelBox, clampB, parseChatPos, snapChatPos } from "./chat-position";

describe("posisi tombol chat", () => {
  it("menempel ke tepi terdekat dan dibatasi di layar", () => {
    expect(snapChatPos(20, 700, 390, 844)).toEqual({ side: "left", b: 100 });
    expect(snapChatPos(300, 400, 390, 844)).toEqual({ side: "right", b: 400 });
    expect(snapChatPos(300, 900, 390, 844).b).toBe(8);   // di bawah layar
    expect(snapChatPos(300, -50, 390, 844).b).toBe(clampB(9999, 844)); // menutupi top bar
    expect(clampB(9999, 844)).toBe(844 - 56 - 44);
  });
  it("panel di atas tombol bila tombol di bawah, di bawah tombol bila di atas", () => {
    expect(chatPanelBox({ side: "right", b: 8 }, 844)).toEqual({ bottom: 60, height: 640 });
    const low = chatPanelBox({ side: "right", b: 300 }, 844);
    expect(low.bottom).toBe(352); expect(low.height).toBe(844 - 300 - 44 - 16);
    const high = chatPanelBox({ side: "left", b: 700 }, 844);
    expect(high.top).toBe(152); expect(high.height).toBe(640);
    expect(chatPanelBox({ side: "left", b: 700 }, 700).height).toBe(700 - (700 - clampB(700, 700) + 8) - 8);
  });
  it("membaca nilai tersimpan dengan aman", () => {
    expect(parseChatPos('{"side":"left","b":120}')).toEqual({ side: "left", b: 120 });
    expect(parseChatPos('{"side":"up","b":1}')).toBeNull();
    expect(parseChatPos("bukan json")).toBeNull();
    expect(parseChatPos(null)).toBeNull();
  });
});
