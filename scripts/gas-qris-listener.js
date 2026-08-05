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
 * FUNGSI UJI MANAJEMEN: Pilih 'testRun' di dropdown atas editor GAS lalu klik 'Jalankan'
 */
function testRun() {
  Logger.log("▶️ Memulai Tes Manual Listener QRIS...");
  checkBtnQrisEmails();
  Logger.log("⏹️ Tes Manual Selesai.");
}

/**
 * 1. FUNGSI UTAMA: MENGECEK EMAIL BTN QRIS MASUK (BANK & E-WALLET)
 * Dipanggil otomatis oleh Timer Trigger setiap 1 menit.
 */
function checkBtnQrisEmails() {
  try {
    Logger.log("🚀 Fungsi checkBtnQrisEmails DIMULAI");

    const sheet = getOrCreateSheet();
    Logger.log("📄 Sheet log transaksi siap.");
    
    // Query fleksibel: tangkap seluruh email BTN QRIS (Bank & E-Wallet: GoPay, OVO, DANA, ShopeePay, LinkAja, BCA, dll)
    const query = 'from:btn.co.id OR from:recon.merchant@btn.co.id OR subject:QRIS OR subject:Pembayaran';
    Logger.log("🔎 Mencari email dengan query: " + query);
    
    const threads = GmailApp.search(query, 0, 20);
    Logger.log("📧 Ditemukan " + threads.length + " thread email BTN.");
    
    let newTxCount = 0;
    
    for (let i = 0; i < threads.length; i++) {
      const messages = threads[i].getMessages();
      // Urutkan dari pesan paling baru ke paling lama dalam thread
      for (let j = messages.length - 1; j >= 0; j--) {
        const msg = messages[j];
        const fullBody = (msg.getBody() || '') + "\n" + (msg.getPlainBody() || '');
        const msgDate = msg.getDate();
        const fallbackDateStr = Utilities.formatDate(msgDate, Session.getScriptTimeZone(), "dd/MM/yyyy HH:mm:ss");
        
        const parsedData = parseBtnEmailBody(fullBody, msg.getId(), fallbackDateStr);
        
        if (parsedData && parsedData.rrn && parsedData.total !== 'Rp 0') {
          if (!isRrnExists(sheet, parsedData.rrn)) {
            sheet.appendRow([
              parsedData.rrn,
              parsedData.tanggal,
              parsedData.customer,
              parsedData.total,
              new Date().toISOString()
            ]);
            newTxCount++;
            Logger.log("✅ Transaksi Baru (Bank/E-Wallet) Berhasil Disimpan: RRN " + parsedData.rrn + " - " + parsedData.total + " (" + parsedData.issuer + ")");
          }
        }
      }
    }
    
    Logger.log("🏁 Selesai. Total transaksi baru ditambahkan: " + newTxCount);
  } catch (e) {
    console.error("❌ ERROR di checkBtnQrisEmails: " + e.toString());
    Logger.log("❌ ERROR di checkBtnQrisEmails: " + e.toString());
  }
}

/**
 * 2. PARSER PARSING EMAIL BODY (SUPPORT MULTI BANK & E-WALLET: GOPAY, OVO, DANA, SHOPEEPAY, SEABANK, BCA, DLL)
 */
function parseBtnEmailBody(bodyText, msgId, fallbackDateStr) {
  try {
    if (!bodyText) return null;
    
    // Normalisasi teks email
    const cleanText = bodyText
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/gi, ' ')
      .replace(/[*#_~]/g, ' ')
      .replace(/[\s\u00a0\u200b\r\n]+/g, ' ')
      .trim();
    
    // 1. Match RRN / Nomor Referensi Transaksi (Mendukung Angka & Huruf Alphanumeric: e.g. 1r0sthi13918, 00F8000CRSLK, 1r1etj740090)
    let rrn = null;
    const rrnMatch = cleanText.match(/Retrieval\s*Reference\s*Number[^\w]*([a-zA-Z0-9]{6,24})/i) 
                  || cleanText.match(/(?:RRN|Ref|Referensi|Reference|ID\s*Transaksi|No\.\s*Ref)[^\w]*([a-zA-Z0-9]{6,24})/i)
                  || cleanText.match(/Customer\s*PAN[^\d]*(\d{10,20})/i)
                  || cleanText.match(/\b([a-zA-Z0-9]{12})\b/);
                  
    if (rrnMatch) {
      rrn = rrnMatch[1].trim();
    } else {
      // Fallback jika email e-wallet tidak menyantumkan label RRN standar, gunakan ID unik email
      rrn = 'EML_' + (msgId || Date.now());
    }
    
    // 2. Match Total / Nominal (Mendukung "Total Bayar", "Nominal Transaksi", "Total Transaksi", "Nominal", "Jumlah", "Amount", "Rp")
    let total = 'Rp 0';
    const totalMatch = cleanText.match(/(?:Total\s*Bayar|Nominal\s*Transaksi|Total\s*Transaksi|Nominal|Jumlah|Amount)[^\d]*(Rp\.?\s*[\d\.,]+)/i)
                    || cleanText.match(/(Rp\.?\s*[\d\.,]+)/i);
                    
    if (totalMatch) {
      total = totalMatch[1].trim();
      total = total.replace(/^rp\.?/i, 'Rp ').replace(/\s+/g, ' ');
      if (!total.startsWith('Rp')) {
        total = 'Rp ' + total;
      }
    }
    
    // 3. Match Tanggal/Jam (format: dd/mm/yyyy hh:mm:ss dari email BTN QRIS)
    let tanggal = fallbackDateStr || '';
    const dateMatch = cleanText.match(/Tanggal\/Jam[^\d]*(\d{2}[\/\-\.]\d{2}[\/\-\.]\d{4}\s+\d{2}:\d{2}(?::\d{2})?)/i)
                   || cleanText.match(/(\d{2}[\/\-\.]\d{2}[\/\-\.]\d{4}\s+\d{2}:\d{2}(?::\d{2})?)/);
    if (dateMatch) {
      tanggal = dateMatch[1].trim();
    }
    
    // 4. Extract Issuer (Bank / E-Wallet)
    let issuer = 'QRIS';
    const issuerMatch = cleanText.match(/Nama\s*Issuer[^\w]*([A-Z0-9\s]+?)(?:Nama|Customer|Merchant|Status|Lokasi|Retrieval|Total|$)/i);
    if (issuerMatch && issuerMatch[1].trim()) {
      issuer = issuerMatch[1].trim();
    }

    return {
      rrn: rrn,
      total: total,
      customer: 'Hamba Allah',
      issuer: issuer,
      tanggal: tanggal
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
  console.log("🌐 Web API Request (doGet) diterima dari TV Display.");
  Logger.log("🌐 Web API Request (doGet) diterima dari TV Display.");
  
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