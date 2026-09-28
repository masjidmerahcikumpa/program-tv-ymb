# 📺 Program TV YMB — Android TV Custom WebView App

Aplikasi Android TV WebView khusus untuk memuat dan menjalankan web **Program TV Masjid Merah Baiturrahman (YMB)** secara otomatis, fullscreen, dan ramah TV Box.

---

## 🌟 Fitur Utama Aplikasi

- 📺 **Full HD & Landscape Optimization**: Didesain khusus untuk Android TV / Smart TV / TV Box (65" atau ukuran lainnya).
- 🖥️ **Sticky Fullscreen & Keep Screen On**: Layar TV tidak pernah mati (*sleep*) dan tanpa address bar browser.
- 🔄 **Hybrid Online + Offline Fallback**:
  - Memuat URL `https://masjidmerahcikumpa.github.io/program-tv-ymb/`
  - Jika internet terputus, aplikasi otomatis menampilkan layar offline bermotif Maroon-Gold dengan hitung mundur dan deteksi *re-connect* otomatis.
- 🚀 **Auto-Launch saat TV Menyala**: Menggunakan `BootReceiver` (`BOOT_COMPLETED`) sehingga aplikasi langsung terbuka saat Android TV di-boot.
- 🎮 **Navigasi Remote Control & D-Pad**: Tombol *Back*, *Select*, dan *Arrow* remote TV berfungsi dengan lancar.
- 🔒 **Kiosk Friendly**: Mencegah keluar secara tidak sengaja dari aplikasi.

---

## 📂 Struktur Proyek Android

```text
android-app/
├── app/
│   ├── src/main/
│   │   ├── java/com/ymb/tv/
│   │   │   ├── MainActivity.java     # Logic WebView, Fullscreen & Offline Fallback
│   │   │   └── BootReceiver.java     # Auto-Start saat Android TV Booting
│   │   ├── assets/
│   │   │   └── offline.html          # Halaman fallback saat internet terputus
│   │   └── AndroidManifest.xml       # Leanback TV Launcher & Permissions
│   └── build.gradle
├── build.gradle
├── settings.gradle
└── README.md
```

---

## 🛠️ Cara Build APK

### Cara 1: Menggunakan GitHub Actions (Paling Mudah — Tanpa Install Android Studio)
1. Push proyek ini ke repository GitHub:
   ```bash
   git add .
   git commit -m "Add Android TV WebView Custom Project"
   git push origin main
   ```
2. Buka tab **Actions** di repository GitHub Anda.
3. Alur kerja **Build Android APK** akan otomatis berjalan dan menghasilkan file **`app-debug.apk`** yang bisa di-download langsung dari **Artifacts**!

---

### Cara 2: Menggunakan Android Studio (Lokal)
1. Buka **Android Studio**.
2. Pilih **Open an existing Android Studio project** dan pilih folder `android-app/`.
3. Tunggu hingga proses **Gradle Sync** selesai.
4. Klik **Build** -> **Build Bundle(s) / APK(s)** -> **Build APK(s)**.
5. File APK akan tersimpan di: `android-app/app/build/outputs/apk/debug/app-debug.apk`.

---

## 📥 Cara Install APK ke Android TV / TV Box

### Metode 1: Menggunakan Flashdisk USB (Rekomendasi)
1. Salin file `app-debug.apk` ke **Flashdisk USB**.
2. Colokkan Flashdisk ke port USB pada Android TV / TV Box.
3. Buka aplikasi **File Manager** / **File Commander** di TV.
4. Cari file `app-debug.apk` lalu pilih **Install**.
   *(Izinkan "Install Unknown Apps / Sumber Tidak Dikenal" jika diminta)*.

---

### Metode 2: Menggunakan ADB (Android Debug Bridge via Wi-Fi)
1. Aktifkan **Developer Options** dan **ADB Debugging** di Android TV.
2. Cari IP Address TV (contoh: `192.168.1.100`).
3. Hubungkan laptop ke TV lewat terminal:
   ```bash
   adb connect 192.168.1.100:5555
   adb install app-debug.apk
   ```

---

## 📌 Catatan Pemeliharaan

- Jika Anda meng-update konten website (HTML/CSS/JS) di repository GitHub Pages, **APK TIDAK PERLU DI-BUILD ULANG**. Aplikasi Android WebView akan otomatis memuat versi website terbaru saat dinyalakan.
