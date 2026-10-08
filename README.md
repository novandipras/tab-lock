# Simple Tab Lock

Ekstensi Chrome lokal tanpa dependency JavaScript, server, analitik, atau permintaan jaringan.
Antarmuka ekstensi menggunakan bahasa Inggris. Versi saat ini: **1.2.14**.

## Pengelola kunci

- Klik ikon **Simple Tab Lock** di toolbar untuk membuka halaman HTML pengelola.
- Daftar otomatis mengikuti penambahan, penghapusan, dan perubahan informasi kunci; checklist yang masih berlaku tetap dipertahankan.
- Daftar menampilkan judul dan URL halaman, bukan PIN asli; PIN tetap berupa hash.
- Pilih halaman lewat checklist, lalu klik **Remove**.
- Notifikasi hasil di pengelola hilang setelah lima detik; status menunggu verifikasi tetap tampil sampai proses selesai.
- Daftar dimuat ulang setelah penghapusan. **Refresh list** juga tersedia untuk memuat ulang secara manual.
- Penghapusan melalui pengelola memerlukan helper native, termasuk untuk akun tanpa password.
- macOS: helper memanggil autentikasi bawaan (password / Touch ID).
- Windows 10/11: helper menampilkan dialog Windows untuk password akun yang sedang login, lalu memverifikasinya lewat Windows.
- Jika sistem mendeteksi akun tanpa password, pengelola meminta konfirmasi biasa.
- Pembatalan, error autentikasi, atau helper tidak tersedia tidak akan menghapus kunci.
- Installer helper tersedia untuk Windows dan macOS; Linux belum didukung.
- Windows memakai password akun, bukan PIN Windows Hello. Password tidak disimpan atau dikirim ke halaman HTML.
- Domain/Entra dan status akun yang tidak dapat dipastikan tetap memerlukan verifikasi; tidak memakai konfirmasi biasa.
- URL dari versi lama baru dapat diketahui saat halaman tersebut dibuka; data lama tetap dipertahankan dan ditampilkan dengan ID.
- Mulai versi 1.1.0, judul dan URL disimpan lokal agar daftar bisa ditampilkan. Jangan bagikan data profil Chrome Anda.
- Helper macOS: `native/auth.swift`, executable `native/tab-lock-auth`.
- Registrasi macOS: `~/Library/Application Support/Google/Chrome/NativeMessagingHosts/org.simpletablock.auth.json`.
- Installer menggunakan ID ekstensi dan lokasi folder pada perangkat masing-masing, tanpa akses administrator.

## Pasang

Unduh dan ekstrak repository ini, atau clone lewat Git:

```sh
git clone https://github.com/novandipras/tab-lock.git
cd tab-lock
```

1. Buka `chrome://extensions` di Chrome.
2. Aktifkan **Developer mode**.
3. Klik **Load unpacked**, pilih folder ini (`tab-lock`).
4. Halaman yang sudah terbuka bisa langsung dikunci; menu mengaktifkan skrip jika belum terpasang di tab tersebut.

Lock, unlock, dan **Remove lock** dengan PIN dapat digunakan tanpa helper.
Pasang helper berikut jika ingin menghapus lock lewat checklist di pengelola tanpa memasukkan PIN setiap halaman.

### Helper macOS

Salin ID **Simple Tab Lock** dari `chrome://extensions`, lalu jalankan dari folder ekstensi:

```sh
bash native/install-macos.sh ID_EKSTENSI
```

Installer memerlukan Xcode Command Line Tools (`xcode-select --install`) untuk mengompilasi sumber Swift.
Installer membuat konfigurasi origin dan registrasi native messaging per pengguna.

### Helper Windows 10/11

Salin ID ekstensi yang terlihat pada Chrome di Windows. Buka Windows PowerShell di folder ekstensi:

```powershell
.\native\install-windows.ps1 -ExtensionId ID_EKSTENSI
```

Installer menggunakan compiler .NET Framework bawaan Windows dan mendaftarkan helper pada registry akun saat ini (HKCU).
Jika compiler tidak tersedia, instal .NET Framework 4.8 dari Microsoft. Jangan menonaktifkan kebijakan keamanan organisasi.
Jika skrip diblokir kebijakan PowerShell, gunakan proses penandatanganan/persetujuan IT yang berlaku.
Setelah pemasangan, reload ekstensi dan halaman pengelola. Folder harus tetap berada di lokasi pemasangan.

Windows hanya mencoba mendeteksi password kosong pada akun lokal; hasil disimpan sampai waktu perubahan password berubah.
Deteksi dilewati jika terdapat percobaan login gagal, kebijakan satu kali gagal, atau informasi akun tidak tersedia.
Pada kondisi tersebut, password tetap diminta. Cache tidak dapat dipakai untuk melewati verifikasi saat penghapusan.

Untuk memeriksa helper di Windows (tanpa menghapus kunci):

```powershell
.\native\verify-windows.ps1
```

Selesaikan dialog password yang muncul untuk memverifikasi autentikasi pada mesin Windows tersebut.
Kompilasi/helper macOS dan alur ekstensi diuji di Mac; dialog serta API Windows harus diverifikasi pada Windows asli.

## Gunakan

- Klik kanan **di dalam halaman**, pilih **Lock this tab**.
- Pada Chrome 150 atau lebih baru, klik kanan **judul tab** lalu pilih **Lock tab**; tab tersebut aktif dan menampilkan dialog PIN.
- Masukkan PIN angka 4–12 digit dan ulangi untuk mengonfirmasi.
- Halaman tertutup blur gelap dengan ikon gembok. Masukkan PIN untuk membukanya.
- Saat dialog PIN tampil, input keyboard dicegah memicu shortcut halaman di belakangnya, termasuk shortcut video YouTube.
- Setelah reload ekstensi, muat ulang halaman yang sudah terbuka agar penanganan keyboard terbaru aktif sejak awal halaman.
- Klik kanan dan pilih menu yang sama untuk mengunci kembali.
- Untuk menghapus perlindungan, masukkan PIN pada layar terkunci lalu klik **Remove lock**.
- Remove lock menghapus PIN URL tersebut; membuka ulang atau reload tidak lagi mengunci halaman itu.
- PIN tetap tersimpan setelah tab ditutup atau Chrome dimulai ulang.
- Membuka kunci hanya berlaku untuk halaman yang sedang terbuka; reload atau membuka ulang URL akan menguncinya kembali.
- URL berbeda bisa punya PIN berbeda. URL yang sama berbagi PIN, termasuk tab duplikat.
- Bagian URL setelah `#` diabaikan; parameter query tetap dibedakan.
- Lima PIN salah berturut-turut menyebabkan jeda 30 detik.

## Batas

- Hanya halaman HTTP/HTTPS. Halaman Chrome, Chrome Web Store, dan penampil PDF bawaan tidak mendukung overlay ini.
- Menu pada judul tab memerlukan Chrome 150 atau lebih baru. Pada Chrome lama, gunakan menu klik kanan di dalam halaman web.
- Blur menyembunyikan tampilan, bukan mengenkripsi halaman. Konten, judul tab, audio, dan sesi login tetap ada.
- Developer tools, menonaktifkan, atau mencopot ekstensi dapat melewati perlindungan.
- PIN disimpan sebagai hash PBKDF2-SHA-256 dengan salt acak; PIN asli tidak disimpan.
- Data kunci, hash PIN, judul, dan URL disimpan di `chrome.storage.local` pada profil Chrome; tidak disinkronkan oleh ekstensi.
- PIN asli tidak bisa dipulihkan atau ditampilkan. Jika lupa, hapus lock melalui pengelola dengan verifikasi perangkat.
- Uninstall ekstensi biasanya menghapus data kuncinya. Jangan gunakan PIN ATM, perangkat, atau akun lain.
- Izin akses HTTP/HTTPS diperlukan untuk menampilkan overlay secara otomatis saat URL dibuka kembali.
- Riwayat navigasi aplikasi web dideteksi lewat `webNavigation`; kunci mengikuti URL, bukan keseluruhan domain.
- Perubahan URL atau render awal dapat memiliki jeda singkat sebelum overlay muncul. Jangan andalkan ini untuk data sensitif.
- Jangan pindahkan folder setelah dipasang. Setelah kode diperbarui, klik Reload pada ekstensi dan muat ulang halaman.
