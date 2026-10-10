import { expect, it } from "vitest";
import { findBrowser } from "./browser";
it.runIf(process.platform === "win32")("Edge/Chrome terdeteksi", () => { const b = findBrowser(); expect(b?.path).toMatch(/msedge\.exe|chrome\.exe$/); });
