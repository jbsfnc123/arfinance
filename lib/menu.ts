// Registry menu tunggal, di-port dari MENU_REGISTRY di
// Halaman Utama/Aplikasi Utama/AppShellScript.html.
// ID submenu lama dipertahankan karena menjadi kunci ACL (tabel menu_acl).
// Perubahan terhadap versi lama:
//  - Iframe ke GAS diganti route internal; `phase` = fase migrasi yang akan mengisinya.
//  - 'ext.batal' (form pembatalan) digabung ke 'inv.pengajuan'; 'ext.ltkp' pindah ke grup Faktur Pajak.
//  - 'set.pin' dihapus: PIN hanya diatur Super Admin lewat 'set.akun'.
//  - Akses menu diatur per role (tabel role_menus), bukan per akun.
//  - Grup "Rekonsiliasi" & "Laporan" baru untuk aplikasi yang dulu berdiri sendiri.

export type Needs = "ctrl" | "sa";

export type MenuItem = {
  id: string;
  label: string;
  href: string;
  phase?: number;      // fase migrasi; undefined = sudah tersedia
  needs?: Needs;
  external?: boolean;  // link keluar (aplikasi di luar cakupan migrasi)
};

export type MenuGroup = {
  id: string;
  label: string;
  icon: string;        // nama ikon Material Symbols
  children: MenuItem[];
};

export const MENU_REGISTRY: MenuGroup[] = [
  { id: "dashboard", label: "Dashboard", icon: "space_dashboard", children: [
    { id: "dash.coll",      label: "Collection",               href: "/dashboard/collection",   needs: "ctrl" },
    { id: "dash.tukar",     label: "Tukar Faktur",             href: "/dashboard/tukar-faktur" },
    { id: "rek.mutasi",     label: "Mutasi Bank vs Realisasi", href: "/mutasi-bank" },
    { id: "lap.presentasi", label: "Presentasi AR",            href: "/presentasi" },
  ]},
  { id: "collection", label: "Collection", icon: "groups", children: [
    { id: "coll.tagihan", label: "Daftar Tagihan", href: "/collection" },
    { id: "coll.case",    label: "Case",           href: "/collection/case", needs: "ctrl" },
  ]},
  { id: "tukar", label: "Tukar Faktur", icon: "swap_horiz", children: [
    { id: "tukar.jadwal", label: "Jadwal Kolektor",      href: "/tukar-faktur/jadwal" },
    { id: "tukar.detail", label: "Aplikasi Kolektor",    href: "/tukar-faktur/kurir" },
    { id: "tukar.upload", label: "Upload Jadwal",        href: "/tukar-faktur/upload", needs: "ctrl" },
    { id: "rek.mitra10",  label: "Mitra10 Tukar Faktur", href: "/mitra10" },
    { id: "tukar.rkm",    label: "RKM Tukar Faktur",     href: "/rkm" },
  ]},
  { id: "invoicing", label: "Faktur Pajak", icon: "request_quote", children: [
    { id: "inv.pengajuan", label: "Pengajuan Pembatalan & Revisi", href: "/faktur/pengajuan" },
    { id: "inv.batal",     label: "Daftar Pengajuan",              href: "/faktur/list" },
    { id: "inv.hold",      label: "Hold Faktur Pajak",             href: "/faktur/hold" },
    { id: "ext.ltkp",      label: "LTKP",                          href: "/faktur/ltkp" },
    { id: "rek.coretax",   label: "XML CoreTax",                   href: "/coretax" },
  ]},
  { id: "billing", label: "Billing", icon: "receipt_long", children: [
    // Keputusan user 2026-09-25: Billing tetap di GAS, dibuka lewat link langsung.
    { id: "bill.detail", label: "Tagihan Bulanan Detail", external: true,
      href: "https://script.google.com/a/macros/penguin.id/s/AKfycbySpc4mhfrsuVa4434OO9Ac0rPW7l5vMUZ8Nbe8TGYuzZDmndAZ-jpVc7D_cPOhvJ7_gQ/exec" },
    { id: "bill.ecom",   label: "E-Commerce",             href: "/billing/ecommerce" },
    { id: "bill.komisi", label: "Komisi dan Cashback",    href: "/billing/komisi" },
  ]},
  { id: "rekon", label: "Rekonsiliasi", icon: "rule", children: [
    { id: "rek.cekharga",    label: "Cek Selisih Harga PO/SO", href: "/cek-harga" },
    { id: "rek.marketplace", label: "Marketplace",             href: "/marketplace" },
  ]},
  { id: "set", label: "Pengaturan", icon: "settings", children: [
    { id: "set.update",   label: "Pusat Upload Data",      href: "/pengaturan/upload",         needs: "ctrl" },
    { id: "set.target",   label: "Upload Target Bulanan",  href: "/pengaturan/target",         needs: "ctrl" },
    { id: "set.watpl",    label: "Template WA",            href: "/pengaturan/wa-template",    needs: "ctrl" },
  ]},
];

// Beranda (papan sticky notes) diatur lewat centang ACL seperti submenu lain, tetapi tidak
// tampil sebagai grup dropdown sidebar (punya link sendiri di atas sidebar).
export const HOME_GROUP: MenuGroup = { id: "home", label: "Beranda", icon: "home", children: [
  { id: "home", label: "Beranda", href: "/" },
]};
export const HOME_ITEM = HOME_GROUP.children[0];


// Grup yang ditampilkan di Role & Akses Menu (urutan tampil).
export const ACL_GROUPS: MenuGroup[] = [HOME_GROUP];

// Menu AP Workspace — diisi fase berikutnya.
export const AP_MENU_REGISTRY: MenuGroup[] = [];

// Navigasi Finance Workspace (tangki.space, khusus Super Admin). Halaman admin pusat pindah ke sini.
export const FINANCE_NAV = [
  { href: "/", label: "Portal", icon: "apps" },
  { href: "/akun", label: "Akun & PIN", icon: "badge" },
  { href: "/acl", label: "Role & Akses", icon: "admin_panel_settings" },
  { href: "/database", label: "Database", icon: "database" },
] as const;

export function findMenuById(id: string) {
  for (const group of [HOME_GROUP, ...MENU_REGISTRY, ...AP_MENU_REGISTRY]) {
    const item = group.children.find((c) => c.id === id);
    if (item) return { group, item };
  }
  return null;
}

export function findMenuByHref(pathname: string) {
  for (const group of MENU_REGISTRY) {
    for (const item of group.children) {
      if (!item.external && item.href === pathname) return { group, item };
    }
  }
  return null;
}

// Divisi akun (Akun & PIN, diatur Super Admin): workspace mana yang boleh dibuka.
export type Division = "ar" | "ap" | "both";
export const DIVISION_LABEL: Record<Division, string> = { ar: "AR", ap: "AP", both: "AR + AP" };
export const isDivision = (v: unknown): v is Division => v === "ar" || v === "ap" || v === "both";

export type Access = { kind: string; allowed: Set<string>; division?: Division };

function meetsNeeds(item: MenuItem, kind: string) {
  if (!item.needs) return true;
  if (item.needs === "sa") return kind === "sa";
  return kind === "sa" || kind === "ctrl";
}

// Deny-by-default: Super Admin melihat semua; user lain hanya submenu yang dicentang
// untuk role-nya (role_menus) dan memenuhi syarat jenis role (needs).
export function canAccess(item: MenuItem, access: Access) {
  if (!meetsNeeds(item, access.kind)) return false;
  return access.kind === "sa" || access.allowed.has(item.id);
}

export function visibleMenu(access: Access, registry: MenuGroup[] = MENU_REGISTRY): MenuGroup[] {
  return registry
    .map((g) => ({ ...g, children: g.children.filter((c) => canAccess(c, access)) }))
    .filter((g) => g.children.length > 0);
}

// Tujuan awal untuk role tanpa akses Beranda: menu internal pertama yang diizinkan.
export function firstAllowedHref(access: Access): string | null {
  for (const g of visibleMenu(access)) {
    const item = g.children.find((c) => !c.external);
    if (item) return item.href;
  }
  return null;
}

// Boleh masuk workspace? Super Admin semua. Finance (tangki.space) = portal pemilih untuk akun AR + AP
// (halaman admin di dalamnya tetap khusus Super Admin). AR/AP mengikuti divisi akun.
export function canEnterWorkspace(ws: "finance" | "ar" | "ap", access: Access) {
  if (access.kind === "sa") return true;
  const d = access.division ?? "ar";
  if (ws === "finance") return d === "both";
  return d === "both" || d === ws;
}

// Tujuan setelah login: SA & AR + AP → tangki.space (pilih workspace), selain itu workspace divisinya.
export function homeWorkspace(access: Access): "finance" | "ar" | "ap" {
  if (access.kind === "sa") return "finance";
  const d = access.division ?? "ar";
  return d === "both" ? "finance" : d;
}
