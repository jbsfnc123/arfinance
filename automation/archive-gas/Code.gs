// AR Archive — Web App penyimpan arsip data AR Workspace di Google Drive (Fase 66).
// Dipanggil HANYA oleh server AR Workspace (route handler Next.js) dengan rahasia bersama ARCHIVE_SECRET (file Secret.gs,
// tidak di-commit). Semua file berada di bawah folder "AR Workspace Arsip" (dibuat otomatis, ID di Script Properties).
//
// POST JSON { secret, action, ... }:
//   put   { path: ["erp_payments"], name: "2026-06.json.gz", base64 }   → { ok, fileId, size, sha256 } (dibaca ulang dari Drive)
//   get   { fileId }                                                     → { ok, base64, size, name }
//   trash { fileId }                                                     → { ok }
//   list  { path }                                                       → { ok, files: [{ id, name, size, updated }] , folders: [...] }
//   prune { path, keep, files } hapus (ke Sampah) subfolder (atau berkas bila files) lama, sisakan `keep` terbaru (urut nama)
// Deploy: Web app · Execute as: Me · Who has access: Anyone (aman: semua aksi butuh rahasia).

var ROOT_NAME = 'AR Workspace Arsip';

function doPost(e) {
  var body;
  try { body = JSON.parse(e.postData.contents); } catch (err) { return out_({ ok: false, error: 'bad_json' }); }
  if (!ARCHIVE_SECRET || body.secret !== ARCHIVE_SECRET) return out_({ ok: false, error: 'denied' });
  try {
    switch (body.action) {
      case 'put': return out_(put_(body));
      case 'get': return out_(get_(body));
      case 'trash': fileInRoot_(body.fileId).setTrashed(true); return out_({ ok: true });
      case 'list': return out_(list_(body));
      case 'prune': return out_(prune_(body));
      case 'ping': return out_({ ok: true, root: root_().getUrl() });
      default: return out_({ ok: false, error: 'unknown_action' });
    }
  } catch (err) {
    return out_({ ok: false, error: String(err && err.message || err) });
  }
}

function doGet() {
  return out_({ ok: true, service: 'AR Archive' });
}

/** Simpan file lalu BACA ULANG dari Drive untuk ukuran & sha256 (verifikasi isi tersimpan utuh). */
function put_(b) {
  var name = String(b.name || '').replace(/[\\\/:*?"<>|]/g, '_').slice(0, 150);
  if (!name || !b.base64) return { ok: false, error: 'empty' };
  var folder = ensurePath_(b.path || []);
  var blob = Utilities.newBlob(Utilities.base64Decode(b.base64), b.mimeType || 'application/gzip', name);
  var file = folder.createFile(blob);
  var bytes = DriveApp.getFileById(file.getId()).getBlob().getBytes();
  return { ok: true, fileId: file.getId(), size: bytes.length, sha256: sha256_(bytes) };
}

function get_(b) {
  var file = fileInRoot_(b.fileId);
  var bytes = file.getBlob().getBytes();
  return { ok: true, base64: Utilities.base64Encode(bytes), size: bytes.length, name: file.getName() };
}

function list_(b) {
  var folder = ensurePath_(b.path || []);
  var files = [], folders = [];
  var it = folder.getFiles();
  while (it.hasNext()) { var f = it.next(); files.push({ id: f.getId(), name: f.getName(), size: f.getSize(), updated: f.getLastUpdated().toISOString() }); }
  var fi = folder.getFolders();
  while (fi.hasNext()) { var d = fi.next(); folders.push({ id: d.getId(), name: d.getName() }); }
  return { ok: true, files: files, folders: folders };
}

function prune_(b) {
  var keep = Math.max(1, Number(b.keep) || 12);
  var folder = ensurePath_(b.path || []);
  var subs = [];
  var it = b.files ? folder.getFiles() : folder.getFolders(); // files: true → pangkas berkas (cadangan mingguan)
  while (it.hasNext()) subs.push(it.next());
  subs.sort(function (a, c) { return a.getName() < c.getName() ? 1 : -1; });
  var trashed = [];
  for (var i = keep; i < subs.length; i++) { subs[i].setTrashed(true); trashed.push(subs[i].getName()); }
  return { ok: true, trashed: trashed };
}

function root_() {
  var props = PropertiesService.getScriptProperties();
  var id = props.getProperty('ARCHIVE_ROOT_ID');
  if (id) { try { var f = DriveApp.getFolderById(id); if (!f.isTrashed()) return f; } catch (e) { /* dibuat ulang */ } }
  var folder = DriveApp.createFolder(ROOT_NAME);
  props.setProperty('ARCHIVE_ROOT_ID', folder.getId());
  return folder;
}

function ensurePath_(parts) {
  var folder = root_();
  for (var i = 0; i < parts.length; i++) {
    var name = String(parts[i]).replace(/[\\\/:*?"<>|]/g, '_').slice(0, 80);
    if (!name) continue;
    var it = folder.getFoldersByName(name);
    folder = it.hasNext() ? it.next() : folder.createFolder(name);
  }
  return folder;
}

/** File harus berada di dalam folder arsip (cegah membaca file Drive lain lewat fileId). */
function fileInRoot_(fileId) {
  var file = DriveApp.getFileById(String(fileId || ''));
  var rootId = root_().getId();
  var queue = [];
  var parents = file.getParents();
  while (parents.hasNext()) queue.push(parents.next());
  for (var depth = 0; queue.length && depth < 20; depth++) {
    var next = [];
    for (var i = 0; i < queue.length; i++) {
      if (queue[i].getId() === rootId) return file;
      var p = queue[i].getParents();
      while (p.hasNext()) next.push(p.next());
    }
    queue = next;
  }
  throw new Error('file di luar folder arsip');
}

function sha256_(bytes) {
  var d = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, bytes);
  return d.map(function (b) { var v = (b < 0 ? b + 256 : b).toString(16); return v.length === 1 ? '0' + v : v; }).join('');
}

function out_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

/** Jalankan SEKALI dari editor (Run → setup) untuk memberi izin Drive & membuat folder arsip. */
function setup() {
  Logger.log('Folder arsip: ' + root_().getUrl() + ' · rahasia ' + (ARCHIVE_SECRET ? 'terisi' : 'BELUM diisi'));
}
