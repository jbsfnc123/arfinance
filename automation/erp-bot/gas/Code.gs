// ERP Drive Inbox — Web App penerima file dari Bot ERP (automation/erp-bot) untuk diarsipkan di Google Drive.
// Script Properties:
//   ERP_DRIVE_SECRET   rahasia bersama (sama dengan ERP_DRIVE_SECRET di .env bot)
//   ARCHIVE_FOLDER_ID  ID folder arsip di Drive (file disimpan di subfolder YYYY-MM)
// Deploy: Web app · Execute as: Me · Who has access: Anyone.

function doPost(e) {
  var props = PropertiesService.getScriptProperties();
  var body;
  try { body = JSON.parse(e.postData.contents); } catch (err) { return out_({ ok: false, error: 'bad_json' }); }
  var secret = props.getProperty('ERP_DRIVE_SECRET');
  if (!secret || body.secret !== secret) return out_({ ok: false, error: 'denied' });
  var name = String(body.fileName || '').replace(/[\\\/:*?"<>|]/g, '_').slice(0, 150);
  if (!name || !body.base64) return out_({ ok: false, error: 'empty' });
  var folderId = props.getProperty('ARCHIVE_FOLDER_ID');
  if (!folderId) return out_({ ok: false, error: 'ARCHIVE_FOLDER_ID belum diisi' });

  var month = /^\d{4}-\d{2}$/.test(body.month || '') ? body.month : Utilities.formatDate(new Date(), 'Asia/Jakarta', 'yyyy-MM');
  var root = DriveApp.getFolderById(folderId);
  var it = root.getFoldersByName(month);
  var folder = it.hasNext() ? it.next() : root.createFolder(month);
  var blob = Utilities.newBlob(Utilities.base64Decode(body.base64), body.mimeType || 'application/vnd.ms-excel', name);
  var file = folder.createFile(blob);
  return out_({ ok: true, fileId: file.getId(), url: file.getUrl(), folder: month });
}

// Cek cepat dari browser: buka URL /exec → {"ok":true,...}
function doGet() {
  return out_({ ok: true, service: 'ERP Drive Inbox' });
}

// Jalankan sekali dari editor (Run → setupCheck) untuk memberi izin Drive & memeriksa Script Properties.
function setupCheck() {
  var props = PropertiesService.getScriptProperties();
  var folder = DriveApp.getFolderById(props.getProperty('ARCHIVE_FOLDER_ID'));
  Logger.log('Folder arsip: ' + folder.getName() + ' · rahasia ' + (props.getProperty('ERP_DRIVE_SECRET') ? 'terisi' : 'BELUM diisi'));
}

function out_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
