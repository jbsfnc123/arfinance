import { expect, it } from "vitest";
import { canUseConsultant } from "./consultant-access";
it("keeps Super Admin access and requires explicit permission for every other role", () => {
  expect(canUseConsultant("sa", false)).toBe(true);
  for (const role of ["ctrl", "coll", "staff", "unknown"]) {
    expect(canUseConsultant(role, undefined)).toBe(false);
    expect(canUseConsultant(role, false)).toBe(false);
    expect(canUseConsultant(role, true)).toBe(true);
  }
});
