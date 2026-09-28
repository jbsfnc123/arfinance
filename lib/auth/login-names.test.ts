import { describe, expect, it } from "vitest";
import { loginAllowedHere, loginNamesFor } from "./login-names";

const accounts = [
  { display_name: "Mando", active: true, kind: "ctrl", pin_optional: false },
  { display_name: "Abdul", active: true, kind: "kurir", pin_optional: true },
  { display_name: "Budi", active: true, kind: "kurir", pin_optional: false },
  { display_name: "Super Admin", active: true, kind: "sa", pin_optional: true }, // tidak mungkin tanpa PIN
  { display_name: "Lama", active: false, kind: "coll" },
  { display_name: "Kurir Lama", active: false, kind: "kurir" },
  { display_name: "Ani", active: true, kind: "coll", pin_optional: true },
];

describe("daftar nama login per halaman", () => {
  it("login utama: semua akun aktif kecuali kolektor & Super Admin, A–Z, tanda tanpa PIN", () => {
    expect(loginNamesFor(accounts, "finance")).toEqual([{ name: "Ani", noPin: true }, { name: "Mando", noPin: false }]);
    expect(loginNamesFor(accounts, "ar").map((a) => a.name)).toEqual(["Ani", "Mando"]);
  });
  it("kolektor.tangki.space: hanya akun kolektor aktif", () => {
    expect(loginNamesFor(accounts, "kolektor")).toEqual([{ name: "Abdul", noPin: true }, { name: "Budi", noPin: false }]);
  });
  it("aturan masuk per halaman", () => {
    expect([loginAllowedHere("kurir", "kolektor"), loginAllowedHere("kurir", "finance"), loginAllowedHere("ctrl", "kolektor"), loginAllowedHere("sa", "ar")])
      .toEqual([true, false, false, true]);
  });
});
