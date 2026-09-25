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
    { id: "dash.coll",    label: "Collection",   href: "/dashboard/collection",   needs: "ctrl" },
    { id: "dash.mitra10", label: "Mitra 10",     href: "/dashboard/mitra10",      needs: "ctrl" },
    { id: "dash.tukar",   label: "Tukar Faktur", href: "/dashboard/tukar-faktur" },
  ]},
  { id: "collection", label: "Collection", icon: "groups", children: [
    { id: "coll.tagihan", label: "Daftar Tagihan", href: "/collection" },
  ]},
  { id: "case", label: "Case", icon: "assignment_late", children: [
    { id: "case.admin", label: "Administratif", href: "/case/administratif", needs: "ctrl" },
    { id: "case.coll",  label: "Collection",    href: "/case/collection",    needs: "ctrl" },
  ]},
  { id: "tukar", label: "Tukar Faktur", icon: "swap_horiz", children: [
    { id: "tukar.jadwal", label: "Jadwal Kolektor",   href: "/tukar-faktur/jadwal" },
    { id: "tukar.detail", label: "Aplikasi Kolektor", href: "/tukar-faktur/kurir" },
    { id: "tukar.upload", label: "Upload Jadwal",     href: "/tukar-faktur/upload", needs: "ctrl" },
  ]},
  { id: "invoicing", label: "Faktur Pajak", icon: "request_quote", children: [
    { id: "inv.pengajuan", label: "Pengajuan Pembatalan & Revisi", href: "/faktur/pengajuan" },
    { id: "inv.batal",     label: "Daftar Pengajuan",              href: "/faktur/list" },
    { id: "inv.hold",      label: "Hold Faktur Pajak",             href: "/faktur/hold" },
    { id: "ext.ltkp",      label: "LTKP",                          href: "/faktur/ltkp" },
  ]},
  { id: "billing", label: "Billing", icon: "receipt_long", children: [
    // Keputusan user 2026-09-25: Billing tetap di GAS, dibuka lewat link langsung (seperti menu Eksternal).
    { id: "bill.detail", label: "Tagihan Bulanan Detail", external: true,
      href: "https://script.google.com/a/macros/penguin.id/s/AKfycbySpc4mhfrsuVa4434OO9Ac0rPW7l5vMUZ8Nbe8TGYuzZDmndAZ-jpVc7D_cPOhvJ7_gQ/exec" },
    { id: "bill.ecom",   label: "E-Commerce",             href: "/billing/ecommerce" },
    { id: "bill.komisi", label: "Komisi dan Cashback",    href: "/billing/komisi" },
  ]},
  { id: "rekon", label: "Rekonsiliasi", icon: "rule", children: [
    { id: "rek.cekharga",    label: "Cek Selisih Harga PO/SO", href: "/cek-harga" },
    { id: "rek.coretax",     label: "XML CoreTax",             href: "/coretax" },
    { id: "rek.marketplace", label: "Marketplace",             href: "/marketplace" },
    { id: "rek.mutasi",      label: "Mutasi Bank vs Realisasi", href: "/mutasi-bank" },
    { id: "rek.mitra10",     label: "Mitra10 Tukar Faktur",    href: "/mitra10" },
  ]},
  { id: "laporan", label: "Laporan", icon: "slideshow", children: [
    { id: "lap.presentasi", label: "AR Management Deck", href: "/presentasi" },
  ]},
  { id: "eksternal", label: "Eksternal", icon: "open_in_new", children: [
    { id: "ext.modern", label: "Modern Market", external: true,
      href: "https://script.google.com/a/macros/penguin.id/s/AKfycby2hZ2lsfsPzV9FUup3YTSV3IYt1BrrKBEgUlg7B977ibdRj0k4zA2lt0kRnmahrNIr3g/exec" },
  ]},
  { id: "set", label: "Pengaturan", icon: "settings", children: [
    { id: "set.update",   label: "Update Tagihan (Excel)", href: "/pengaturan/update-tagihan", needs: "ctrl" },
    { id: "set.target",   label: "Upload Target Bulanan",  href: "/pengaturan/target",         needs: "ctrl" },
    { id: "set.akun",     label: "Akun & PIN",             href: "/pengaturan/akun",           needs: "sa" },
    { id: "set.acl",      label: "Role & Akses Menu",      href: "/pengaturan/acl",            needs: "sa" },
    { id: "set.watpl",    label: "Template WA",            href: "/pengaturan/wa-template",    needs: "ctrl" },
    { id: "set.database", label: "Database",               href: "/pengaturan/database",       needs: "sa" },
  ]},
];

export function findMenuById(id: string) {
  for (const group of MENU_REGISTRY) {
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

export type Access = { kind: string; allowed: Set<string> };

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

export function visibleMenu(access: Access): MenuGroup[] {
  return MENU_REGISTRY
    .map((g) => ({ ...g, children: g.children.filter((c) => canAccess(c, access)) }))
    .filter((g) => g.children.length > 0);
}
