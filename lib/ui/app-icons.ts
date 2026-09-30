// Pemetaan presentasi: id grup/submenu/workspace (dari lib/menu.ts & lib/workspace.ts, tidak diubah) → warna ikon
// aplikasi + glyph. Hanya untuk tampilan (Dock, Launcher, Spotlight, TopBar, login/portal).

export type AppIconSpec = { from: string; to: string; glyph: string };

/** Warna modul (gradien atas → bawah) & glyph grup. */
const GROUPS: Record<string, AppIconSpec> = {
  home: { from: "#C9B79C", to: "#9C8667", glyph: "sticky_note_2" },
  dashboard: { from: "#4DA3FF", to: "#1A63E0", glyph: "monitoring" },
  collection: { from: "#46D07A", to: "#199A4B", glyph: "payments" },
  tukar: { from: "#FFAE45", to: "#E5700F", glyph: "file_swap" },
  invoicing: { from: "#B484F5", to: "#7A45D6", glyph: "request_quote" },
  billing: { from: "#3FD3D0", to: "#0E9A9C", glyph: "receipt_long" },
  rekon: { from: "#FFD155", to: "#D99A07", glyph: "receipt_check" },
  tools: { from: "#7FA3C8", to: "#4A6C92", glyph: "construction" },
  set: { from: "#9A9DA6", to: "#5C5F67", glyph: "settings" },
  launcher: { from: "#A7ABB4", to: "#6D717A", glyph: "apps" },
};

/** Glyph khusus per submenu (warna tetap warna grupnya). */
const ITEM_GLYPH: Record<string, string> = {
  home: "sticky_note_2",
  "dash.coll": "monitoring", "dash.tukar": "swap_horiz", "rek.mutasi": "account_balance", "lap.presentasi": "slideshow",
  "coll.tagihan": "receipt_long", "coll.case": "assignment_late", "coll.payhist": "history",
  "tukar.jadwal": "event", "tukar.detail": "smartphone", "tukar.ekspedisi": "local_shipping", "tukar.upload": "upload_file",
  "rek.mitra10": "storefront", "tukar.rkm": "storefront", "tukar.monitor_sj": "fact_check",
  "inv.pengajuan": "edit_note", "inv.batal": "summarize", "inv.hold": "pause_circle", "ext.ltkp": "picture_as_pdf", "rek.coretax": "code",
  "bill.detail": "receipt_long", "bill.ecom": "shopping_cart", "bill.komisi": "payments",
  "rek.cekharga": "compare_arrows", "rek.marketplace": "storefront",
  "tool.pdf": "picture_as_pdf",
  "set.update": "cloud_upload", "set.target": "target", "set.watpl": "chat",
};

/** Workspace (host) → ikon aplikasi. */
const WORKSPACE: Record<string, AppIconSpec> = {
  finance: { from: "#5E8BFF", to: "#2F52D9", glyph: "account_balance" },
  ar: { from: "#4DA3FF", to: "#1A63E0", glyph: "request_quote" },
  ap: { from: "#46D07A", to: "#199A4B", glyph: "payments" },
  kolektor: { from: "#FFAE45", to: "#E5700F", glyph: "local_shipping" },
};

export const groupIcon = (groupId: string): AppIconSpec => GROUPS[groupId] ?? GROUPS.set;
export const itemIcon = (groupId: string, itemId: string): AppIconSpec => ({ ...groupIcon(groupId), glyph: ITEM_GLYPH[itemId] ?? groupIcon(groupId).glyph });
export const workspaceIcon = (ws: string): AppIconSpec => WORKSPACE[ws] ?? WORKSPACE.ar;
/** Warna tint grup (satu nilai) untuk aksen kecil (plate, chip). */
export const groupTint = (groupId: string) => groupIcon(groupId).to;

/** Semua glyph yang dipakai pemetaan ini (untuk tes kelengkapan registry). */
export const APP_ICON_GLYPHS = [...new Set([...Object.values(GROUPS), ...Object.values(WORKSPACE)].map((s) => s.glyph).concat(Object.values(ITEM_GLYPH)))];
