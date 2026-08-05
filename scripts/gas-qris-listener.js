/**
 * ==============================================================================
 * GOOGLE APPS SCRIPT (GAS) - BTN MERCHANT QRIS EMAIL LISTENER FOR TV MASJID YMB
 * ==============================================================================
 * 
 * PETUNJUK PEMASANGAN DI AKUN GMAIL MASJID:
 * ------------------------------------------------------------------------------
 * 1. Buka https://script.google.com/ di browser (Login dengan akun Gmail Masjid).
 * 2. Klik "+ Project Baru".
 * 3. Hapus semua kode default, lalu salin dan tempelkan SELURUH kode di bawah ini.
 * 4. Buat Google Sheet baru di Google Drive (atau biarkan skrip membuat Sheet otomatis).
 * 5. Klik "Deploy" (Terapkan) -> "Deployment Baru".
 * 6. Pilih Jenis: "Web App" (Aplikasi Web).
 *    - Deskripsi: API Listener BTN QRIS Masjid
 *    - Juru Akses (Execute as): Saya (Me / Akun Gmail Anda)
 *    - Siapa yang memiliki akses (Who has access): Siapa saja (Anyone) -> *Penting agar TV Display bisa akses tanpa login!*
 * 7. Klik "Deploy", izinkan akses Oauth Gmail & Sheets jika diminta.
 * 8. Salin "URL Web App" yang dihasilkan (contoh: https://script.google.com/macros/s/AKfycb.../exec).
 * 9. Tempelkan URL tersebut ke modal Pengaturan ⚙️ di aplikasi TV Masjid (di bidang URL Web App Google Apps Script).
 * 10. Di script editor, buat Pemicu (Trigger / ikon Jam di kiri):
 *     - Klik "Tambah Pemicu" (Add Trigger)
 *     - Pilih fungsi: `checkBtnQrisEmails`
 *     - Sumber acara: Berdasarkan waktu (Time-driven)
 *     - Jenis pemicu: Timer menit (Minutes timer) -> Setiap 1 menit
 *     - Simpan. Selesai!
 * ==============================================================================
 */

// Nama Spreadsheet penampung log transaksi di Google Drive
const SPREADSHEET_NAME = "Log Transactions BTN QRIS YMB";

/**
 * 1. FUNGSI UTAMA: MENGECEK EMAIL BTN QRIS MASUK
 * Dipanggil otomatis oleh Timer Trigger setiap 1 menit.
 */
function checkBtnQrisEmails() {
  const sheet = getOrCreateSheet();
  
  // Cari email belum dibaca dari BTN Merchant QRIS
  const query = 'from:recon.merchant@btn.co.id subject:"[Merchant BTN QRIS] Payment Merchant Success" is:unread';
  const threads = GmailApp.search(query);
  
  for (let i = 0; i < threads.length; i++) {
    const messages = threads[i].getMessages();
    for (let j = 0; j < messages.length; j++) {
      const msg = messages[j];
      if (msg.isUnread()) {
        const body = msg.getPlainBody();
        const parsedData = parseBtnEmailBody(body);
        
        if (parsedData && parsedData.rrn) {
          // Cek apakah RRN sudah ada di Sheet agar tidak terduplikasi
          if (!isRrnExists(sheet, parsedData.rrn)) {
            sheet.appendRow([
              parsedData.rrn,
              parsedData.tanggal,
              parsedData.customer,
              parsedData.total,
              new Date().toISOString()
            ]);
            Logger.log("✅ Transaksi Baru Disimpan: " + parsedData.customer + " - " + parsedData.total + " (RRN: " + parsedData.rrn + ")");
          }
        }
        
        // Tandai email sebagai sudah dibaca
        msg.markRead();
      }
    }
  }
}

/**
 * 2. PARSER PARSING EMAIL BODY (REGEXP)
 */
function parseBtnEmailBody(bodyText) {
  try {
    const rrnMatch = bodyText.match(/Retrieval Reference Number\s*:\s*(.+)/i);
    const totalMatch = bodyText.match(/Total\s*:\s*(.+)/i);
    const customerMatch = bodyText.match(/Nama Customer\s*:\s*(.+)/i);
    const dateMatch = bodyText.match(/Tanggal\/Jam\s*:\s*(.+)/i);
    
    return {
      rrn: rrnMatch ? rrnMatch[1].trim() : null,
      total: totalMatch ? totalMatch[1].trim() : 'Rp 0',
      customer: 'Hamba Allah',
      tanggal: dateMatch ? dateMatch[1].trim() : new Date().toLocaleString('id-ID')
    };
  } catch (e) {
    Logger.log("Error parsing email: " + e.toString());
    return null;
  }
}

/**
 * 3. WEB API ENDPOINT (doGet)
 * Dipanggil oleh aplikasi TV Masjid (js/app.js) untuk mengambil transaksi QRIS terbaru.
 */
function doGet(e) {
  const sheet = getOrCreateSheet();
  const data = sheet.getDataRange().getValues();
  
  let latestTx = null;
  let history = [];
  
  // Baris pertama (index 0) adalah Header: [RRN, Tanggal, Customer, Total, Timestamp]
  if (data.length > 1) {
    // Ambil baris paling akhir
    const lastRow = data[data.length - 1];
    latestTx = {
      rrn: lastRow[0],
      tanggal: lastRow[1],
      customer: lastRow[2],
      total: lastRow[3],
      processedAt: lastRow[4]
    };
    
    // Ambil 10 transaksi terakhir untuk history
    const startIdx = Math.max(1, data.length - 10);
    for (let i = data.length - 1; i >= startIdx; i--) {
      history.push({
        rrn: data[i][0],
        tanggal: data[i][1],
        customer: data[i][2],
        total: data[i][3]
      });
    }
  }
  
  const responsePayload = {
    status: "success",
    updatedAt: new Date().toISOString(),
    latest: latestTx,
    history: history
  };
  
  return ContentService
    .createTextOutput(JSON.stringify(responsePayload))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * HELPER: Dapatkan atau buat Sheet log
 */
function getOrCreateSheet() {
  const files = DriveApp.getFilesByName(SPREADSHEET_NAME);
  let ss;
  if (files.hasNext()) {
    ss = SpreadsheetApp.open(files.next());
  } else {
    ss = SpreadsheetApp.create(SPREADSHEET_NAME);
    const sheet = ss.getActiveSheet();
    sheet.appendRow(["RRN", "Tanggal/Jam", "Nama Customer", "Total", "Processed Timestamp"]);
  }
  return ss.getActiveSheet();
}

/**
 * HELPER: Cek RRN duplikat
 */
function isRrnExists(sheet, rrn) {
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]).trim() === String(rrn).trim()) {
      return true;
    }
  }
  return false;
}
