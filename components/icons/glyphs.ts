// Registry glyph SVG lokal (24×24, garis 1.75, ujung membulat) — pengganti font Material Symbols (Fase 41).
// Kunci = nama ikon Material yang sudah dipakai di kode & data (lib/menu.ts, lib/workspace.ts, array TABS), sehingga
// pemanggil tidak perlu diubah. Sebagian besar path diadaptasi dari Lucide (https://lucide.dev),
// lisensi ISC © Lucide Contributors: "Permission to use, copy, modify, and/or distribute this software for any
// purpose with or without fee is hereby granted, provided that the above copyright notice and this permission notice
// appear in all copies." Glyph lain digambar untuk aplikasi ini.

const FILE = `<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/>`;
const CLOUD = `<path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z"/>`;
const TRAY = `<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>`;
const CIRCLE = `<circle cx="12" cy="12" r="10"/>`;
const ROTATE_CW = `<path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/>`;
const SWAP = `<path d="M8 3 4 7l4 4"/><path d="M4 7h16"/><path d="m16 21 4-4-4-4"/><path d="M20 17H4"/>`;
const CLIPBOARD = `<rect width="8" height="4" x="8" y="2" rx="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/>`;
const TRASH = `<path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/>`;
const IMAGE = `<rect width="18" height="18" x="3" y="3" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/>`;
const TABLE = `<rect width="18" height="18" x="3" y="3" rx="2"/><path d="M3 9h18"/><path d="M3 15h18"/>`;

export const GLYPHS: Record<string, string> = {
  // ── navigasi & kontrol ─────────────────────────────────────────────
  search: `<circle cx="11" cy="11" r="7.5"/><path d="m20.5 20.5-4.2-4.2"/>`,
  close: `<path d="M18 6 6 18"/><path d="m6 6 12 12"/>`,
  add: `<path d="M5 12h14"/><path d="M12 5v14"/>`,
  check: `<path d="M20 6 9 17l-5-5"/>`,
  chevron_right: `<path d="m9 18 6-6-6-6"/>`,
  chevron_left: `<path d="m15 18-6-6 6-6"/>`,
  expand_more: `<path d="m6 9 6 6 6-6"/>`,
  expand_less: `<path d="m18 15-6-6-6 6"/>`,
  open_in_new: `<path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>`,
  apps: `<circle cx="5" cy="5" r="1.4" fill="currentColor"/><circle cx="12" cy="5" r="1.4" fill="currentColor"/><circle cx="19" cy="5" r="1.4" fill="currentColor"/><circle cx="5" cy="12" r="1.4" fill="currentColor"/><circle cx="12" cy="12" r="1.4" fill="currentColor"/><circle cx="19" cy="12" r="1.4" fill="currentColor"/><circle cx="5" cy="19" r="1.4" fill="currentColor"/><circle cx="12" cy="19" r="1.4" fill="currentColor"/><circle cx="19" cy="19" r="1.4" fill="currentColor"/>`,
  refresh: ROTATE_CW,
  rotate_right: ROTATE_CW,
  sync: `<path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/>`,
  undo: `<path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>`,
  history: `<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M12 7v5l4 2"/>`,
  tune: `<path d="M21 4h-7"/><path d="M10 4H3"/><path d="M21 12h-9"/><path d="M8 12H3"/><path d="M21 20h-5"/><path d="M12 20H3"/><path d="M14 2v4"/><path d="M8 10v4"/><path d="M16 18v4"/>`,
  toggle_on: `<rect x="3" y="4" width="18" height="7" rx="3.5"/><circle cx="15.5" cy="7.5" r="1.7" fill="currentColor"/><rect x="3" y="13" width="18" height="7" rx="3.5"/><circle cx="8.5" cy="16.5" r="1.7" fill="currentColor"/>`,
  logout: `<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5"/><path d="M21 12H9"/>`,
  lock: `<rect width="18" height="11" x="3" y="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>`,
  help: `${CIRCLE}<path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><path d="M12 17h.01"/>`,
  backspace: `<path d="M10 5a2 2 0 0 0-1.344.519l-6.328 5.74a1 1 0 0 0 0 1.481l6.328 5.741A2 2 0 0 0 10 19h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2z"/><path d="m12 9 6 6"/><path d="m18 9-6 6"/>`,
  progress_activity: `<path d="M21 12a9 9 0 1 1-6.219-8.56"/>`,
  visibility: `<path d="M2.06 12.35a1 1 0 0 1 0-.7 10.75 10.75 0 0 1 19.88 0 1 1 0 0 1 0 .7 10.75 10.75 0 0 1-19.88 0"/><circle cx="12" cy="12" r="3"/>`,
  visibility_off: `<path d="M10.73 5.08a10.74 10.74 0 0 1 11.2 6.57 1 1 0 0 1 0 .7 10.75 10.75 0 0 1-1.44 2.49"/><path d="M14.08 14.16a3 3 0 0 1-4.24-4.24"/><path d="M17.48 17.5a10.75 10.75 0 0 1-15.42-5.15 1 1 0 0 1 0-.7 10.75 10.75 0 0 1 4.45-5.14"/><path d="m2 2 20 20"/>`,
  wrap_text: `<path d="M3 6h18"/><path d="M3 12h15a3 3 0 1 1 0 6h-4"/><path d="m16 16-2 2 2 2"/><path d="M3 18h7"/>`,
  view_column: `<rect width="18" height="18" x="3" y="3" rx="2"/><path d="M9 3v18"/><path d="M15 3v18"/>`,
  filter_alt_off: `<path d="M13 3H2l8 9.46V19l4 2v-8.54l.9-1.05"/><path d="m22 3-5 5"/><path d="m17 3 5 5"/>`,
  fullscreen: `<path d="M8 3H5a2 2 0 0 0-2 2v3"/><path d="M21 8V5a2 2 0 0 0-2-2h-3"/><path d="M3 16v3a2 2 0 0 0 2 2h3"/><path d="M16 21h3a2 2 0 0 0 2-2v-3"/>`,
  fullscreen_exit: `<path d="M8 3v3a2 2 0 0 1-2 2H3"/><path d="M21 8h-3a2 2 0 0 1-2-2V3"/><path d="M3 16h3a2 2 0 0 1 2 2v3"/><path d="M16 21v-3a2 2 0 0 1 2-2h3"/>`,
  dark_mode: `<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/>`,
  light_mode: `<circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/>`,
  contrast: `${CIRCLE}<path d="M12 2a10 10 0 0 1 0 20z" fill="currentColor"/>`,
  density_medium: `<path d="M4 6h16"/><path d="M4 12h16"/><path d="M4 18h16"/>`,
  density_small: `<path d="M4 5h16"/><path d="M4 9.67h16"/><path d="M4 14.33h16"/><path d="M4 19h16"/>`,
  transparency: `<rect x="3" y="3" width="18" height="18" rx="4"/><path d="M3 12h18"/><path d="M12 3v18"/><rect x="3" y="3" width="9" height="9" rx="0" fill="currentColor" fill-opacity=".35" stroke="none"/><rect x="12" y="12" width="9" height="9" fill="currentColor" fill-opacity=".35" stroke="none"/>`,

  // ── aksi data ──────────────────────────────────────────────────────
  download: `${TRAY}<path d="m7 10 5 5 5-5"/><path d="M12 15V3"/>`,
  upload: `${TRAY}<path d="m17 8-5-5-5 5"/><path d="M12 3v12"/>`,
  upload_file: `${FILE}<path d="M12 18v-6"/><path d="m9 15 3-3 3 3"/>`,
  cloud_upload: `${CLOUD}<path d="M12 17v-5"/><path d="m9.5 14.5 2.5-2.5 2.5 2.5"/>`,
  cloud_done: `${CLOUD}<path d="m9.5 14 2 2 3.5-3.5"/>`,
  cloud_sync: `${CLOUD}<path d="M10 14.5a2.5 2.5 0 0 1 4.27-1.77L15 13.5"/><path d="M15 11.5v2h-2"/>`,
  save: `<path d="M15.2 3a2 2 0 0 1 1.4.6l3.8 3.8a2 2 0 0 1 .6 1.4V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z"/><path d="M17 21v-7a1 1 0 0 0-1-1H8a1 1 0 0 0-1 1v7"/><path d="M7 3v4a1 1 0 0 0 1 1h7"/>`,
  delete: `${TRASH}<path d="M10 11v6"/><path d="M14 11v6"/>`,
  auto_delete: `<path d="M3 6h18"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><path d="M19 6l-.5 4.5"/><path d="M5 6l1 14c0 1 1 2 2 2h3"/><circle cx="17" cy="17" r="4.5"/><path d="M17 15v2l1.2 1"/>`,
  delete_sweep: `<path d="M11 12H3"/><path d="M16 6H3"/><path d="M16 18H3"/><path d="m19 10-4 4"/><path d="m15 10 4 4"/>`,
  edit: `<path d="M21.17 6.81a1 1 0 0 0-3.99-3.99L3.84 16.17a2 2 0 0 0-.5.83l-1.32 4.35a.5.5 0 0 0 .62.62l4.35-1.32a2 2 0 0 0 .83-.5z"/><path d="m15 5 4 4"/>`,
  edit_note: `<path d="M13.4 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7.4"/><path d="M2 6h4"/><path d="M2 10h4"/><path d="M2 14h4"/><path d="M2 18h4"/><path d="M21.38 5.63a1 1 0 1 0-3-3l-5.02 5.01a2 2 0 0 0-.5.85l-.84 2.87a.5.5 0 0 0 .62.62l2.87-.84a2 2 0 0 0 .85-.5z"/>`,
  send: `<path d="M14.54 21.69a.5.5 0 0 0 .94-.03l6.5-19a.5.5 0 0 0-.64-.63l-19 6.5a.5.5 0 0 0-.02.93l7.93 3.18a2 2 0 0 1 1.11 1.11z"/><path d="m21.85 2.15-10.94 10.94"/>`,
  playlist_add: `<path d="M11 12H3"/><path d="M16 6H3"/><path d="M16 18H3"/><path d="M18 9v6"/><path d="M21 12h-6"/>`,
  block: `${CIRCLE}<path d="m4.9 4.9 14.2 14.2"/>`,
  cancel: `${CIRCLE}<path d="m15 9-6 6"/><path d="m9 9 6 6"/>`,
  check_circle: `${CIRCLE}<path d="m9 12 2 2 4-4"/>`,
  task_alt: `<path d="M21.8 10A10 10 0 1 1 17 3.34"/><path d="m9 11 3 3L22 4"/>`,
  compare_arrows: SWAP,
  swap_horiz: SWAP,
  code: `<path d="m16 18 6-6-6-6"/><path d="m8 6-6 6 6 6"/>`,
  table_view: `${TABLE}<path d="M9 3v18"/>`,
  table: `${TABLE}<path d="M12 3v18"/>`,
  merge: `<path d="m8 6 4-4 4 4"/><path d="M12 2v10.3a4 4 0 0 1-1.17 2.87L4 22"/><path d="m20 22-5-5"/>`,
  compress: `<path d="m15 15 6 6"/><path d="M15 19.8V15h4.8"/><path d="M9 19.8V15H4.2"/><path d="m9 15-6 6"/><path d="M15 4.2V9h4.8"/><path d="m15 9 6-6"/><path d="M9 4.2V9H4.2"/><path d="M9 9 3 3"/>`,
  low_priority: `<path d="M3 5h9"/><path d="M3 12h9"/><path d="M3 19h9"/><path d="m16 8 3-3 3 3"/><path d="M19 5v14"/>`,

  // ── objek ──────────────────────────────────────────────────────────
  home: `<path d="M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8"/><path d="M3 10a2 2 0 0 1 .71-1.53l7-6a2 2 0 0 1 2.58 0l7 6A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>`,
  space_dashboard: `<rect width="7" height="9" x="3" y="3" rx="1.5"/><rect width="7" height="5" x="14" y="3" rx="1.5"/><rect width="7" height="9" x="14" y="12" rx="1.5"/><rect width="7" height="5" x="3" y="16" rx="1.5"/>`,
  monitoring: `<path d="M3 3v16a2 2 0 0 0 2 2h16"/><path d="m19 9-5 5-4-4-3 3"/>`,
  groups: `<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>`,
  person: `<path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>`,
  contacts: `<path d="M16 2v2"/><path d="M8 2v2"/><path d="M7 22v-2a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v2"/><circle cx="12" cy="11" r="3"/><rect x="3" y="4" width="18" height="18" rx="2"/>`,
  badge: `<path d="M16 10h2"/><path d="M16 14h2"/><path d="M6.17 15a3 3 0 0 1 5.66 0"/><circle cx="9" cy="11" r="2"/><rect x="2" y="5" width="20" height="14" rx="2"/>`,
  admin_panel_settings: `<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/><path d="m9 12 2 2 4-4"/>`,
  database: `<ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5v14a9 3 0 0 0 18 0V5"/><path d="M3 12a9 3 0 0 0 18 0"/>`,
  account_balance: `<path d="M3 22h18"/><path d="M6 18v-7"/><path d="M10 18v-7"/><path d="M14 18v-7"/><path d="M18 18v-7"/><path d="M12 2 20 7H4z"/>`,
  payments: `<rect width="20" height="12" x="2" y="6" rx="2"/><circle cx="12" cy="12" r="2"/><path d="M6 12h.01"/><path d="M18 12h.01"/>`,
  request_quote: `${FILE}<path d="M14.5 11.5h-3a1.25 1.25 0 0 0 0 2.5h1a1.25 1.25 0 0 1 0 2.5h-3"/><path d="M12 10.5v1"/><path d="M12 16.5v1"/>`,
  receipt_long: `<path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1Z"/><path d="M8 7h8"/><path d="M8 11h8"/><path d="M8 15h5"/>`,
  rule: `<path d="m3 17 2 2 4-4"/><path d="m3 7 2 2 4-4"/><path d="M13 6h8"/><path d="M13 12h8"/><path d="M13 18h8"/>`,
  construction: `<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>`,
  settings: `<path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/>`,
  sticky_note_2: `<path d="M16 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V8Z"/><path d="M15 3v4a2 2 0 0 0 2 2h4"/>`,
  push_pin: `<path d="M12 17v5"/><path d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z"/>`,
  photo: IMAGE,
  photo_library: `<path d="M18 22H4a2 2 0 0 1-2-2V6"/><path d="m22 13-1.3-1.3a2.41 2.41 0 0 0-3.4 0L11 18"/><circle cx="12" cy="8" r="2"/><rect width="16" height="16" x="6" y="2" rx="2"/>`,
  add_photo_alternate: `<path d="M16 5h6"/><path d="M19 2v6"/><path d="M21 11.5V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7.5"/><path d="m21 15-3.09-3.09a2 2 0 0 0-2.83 0L6 21"/><circle cx="9" cy="9" r="2"/>`,
  hide_image: `<path d="m2 2 20 20"/><path d="M10.41 10.41a2 2 0 1 1-2.83-2.83"/><path d="M13.5 13.5 6 21"/><path d="m18 12 3 3"/><path d="M3.59 3.59A2 2 0 0 0 3 5v14a2 2 0 0 0 2 2h14c.55 0 1.05-.22 1.41-.59"/><path d="M21 15V5a2 2 0 0 0-2-2H9"/>`,
  local_shipping: `<path d="M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2"/><path d="M15 18H9"/><path d="M19 18h2a1 1 0 0 0 1-1v-3.65a1 1 0 0 0-.22-.62l-3.48-4.35A1 1 0 0 0 17.52 8H14"/><circle cx="17" cy="18" r="2"/><circle cx="7" cy="18" r="2"/>`,
  storefront: `<path d="m2 7 4.41-4.41A2 2 0 0 1 7.83 2h8.34a2 2 0 0 1 1.42.59L22 7"/><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><path d="M15 22v-4a2 2 0 0 0-2-2h-2a2 2 0 0 0-2 2v4"/><path d="M2 7h20"/><path d="M22 7v3a2 2 0 0 1-2 2 2.7 2.7 0 0 1-1.59-.63.7.7 0 0 0-.82 0A2.7 2.7 0 0 1 16 12a2.7 2.7 0 0 1-1.59-.63.7.7 0 0 0-.82 0A2.7 2.7 0 0 1 12 12a2.7 2.7 0 0 1-1.59-.63.7.7 0 0 0-.82 0A2.7 2.7 0 0 1 8 12a2.7 2.7 0 0 1-1.59-.63.7.7 0 0 0-.82 0A2.7 2.7 0 0 1 4 12a2 2 0 0 1-2-2V7"/>`,
  inventory: `<path d="M11 21.73a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73z"/><path d="M12 22V12"/><path d="m3.3 7 7.7 4.73a2 2 0 0 0 2 0L20.7 7"/><path d="m7.5 4.27 9 5.15"/>`,
  event: `<path d="M8 2v4"/><path d="M16 2v4"/><rect width="18" height="18" x="3" y="4" rx="2"/><path d="M3 10h18"/>`,
  assignment_late: `${FILE}<path d="M12 11v4"/><path d="M12 18h.01"/>`,
  fact_check: `${CLIPBOARD}<path d="m9 14 2 2 4-4"/>`,
  summarize: `${CLIPBOARD}<path d="M12 11h4"/><path d="M12 16h4"/><path d="M8 11h.01"/><path d="M8 16h.01"/>`,
  picture_as_pdf: `${FILE}<path d="M16 13H8"/><path d="M16 17H8"/><path d="M10 9H8"/>`,
  folder_open: `<path d="m6 14 1.5-2.9A2 2 0 0 1 9.24 10H20a2 2 0 0 1 1.94 2.5l-1.54 6a2 2 0 0 1-1.95 1.5H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3.9a2 2 0 0 1 1.69.9l.81 1.2a2 2 0 0 0 1.67.9H18a2 2 0 0 1 2 2v2"/>`,
  folder_zip: `<circle cx="15" cy="19" r="2"/><path d="M20.9 19.8A2 2 0 0 0 22 18V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h5.1"/><path d="M15 11v-1"/><path d="M15 17v-2"/>`,
  inventory_2: `<rect width="20" height="5" x="2" y="3" rx="1"/><path d="M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8"/><path d="M10 12h4"/>`,
  description: `${FILE}<path d="M16 13H8"/><path d="M16 17H8"/>`,
  error: `${CIRCLE}<path d="M12 8v4"/><path d="M12 16h.01"/>`,
  pending: `${CIRCLE}<path d="M12 6v6l4 2"/>`,

  palette: `<circle cx="13.5" cy="6.5" r=".5" fill="currentColor"/><circle cx="17.5" cy="10.5" r=".5" fill="currentColor"/><circle cx="8.5" cy="7.5" r=".5" fill="currentColor"/><circle cx="6.5" cy="12.5" r=".5" fill="currentColor"/><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.93 0 1.65-.75 1.65-1.69 0-.44-.18-.84-.44-1.13-.29-.29-.44-.65-.44-1.13a1.64 1.64 0 0 1 1.67-1.67h2c3.05 0 5.55-2.5 5.55-5.55C21.97 6.01 17.46 2 12 2z"/>`,

  // ── glyph tambahan untuk ikon aplikasi (submenu) ──────────────────
  slideshow: `<path d="M2 3h20"/><path d="M21 3v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V3"/><path d="m7 21 5-5 5 5"/><path d="m8 11 3-3 2 2 3-3"/>`,
  smartphone: `<rect width="14" height="20" x="5" y="2" rx="2"/><path d="M12 18h.01"/>`,
  pause_circle: `${CIRCLE}<path d="M10 15V9"/><path d="M14 15V9"/>`,
  shopping_cart: `<circle cx="8" cy="21" r="1"/><circle cx="19" cy="21" r="1"/><path d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12"/>`,
  target: `${CIRCLE}<circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>`,
  chat: `<path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"/>`,
  file_swap: `${FILE}<path d="M8 12.5h7"/><path d="m13 10.5 2 2-2 2"/><path d="M16 17H9"/><path d="m11 15-2 2 2 2"/>`,
  receipt_check: `<path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1Z"/><path d="m8.5 12 2.5 2.5 4.5-4.5"/>`,
  dot: `<circle cx="12" cy="12" r="3" fill="currentColor"/>`,
};

/** Glyph dengan varian terisi (mis. pin tersemat). */
export const FILLED = new Set(["push_pin"]);
