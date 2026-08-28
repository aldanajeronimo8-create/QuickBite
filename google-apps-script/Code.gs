function doPost(e) {
  return ContentService
    .createTextOutput(JSON.stringify({ ok: true, probe: 'quickbite' }))
    .setMimeType(ContentService.MimeType.JSON);
}
