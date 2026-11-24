# Reka Ruang — Peningkatan Volume Pekerjaan dan Bagi Hasil

Status: branch fitur-bagi-hasil-volume-pekerjaan. Belum digabung ke main, belum deploy, dan belum mengubah database produksi.

PENTING: config.js mengarah ke Supabase project mbkpajhzukrbiipgeibf. Proyek tersebut tidak ada dalam koneksi Supabase yang tersedia saat pengembangan, sehingga **jangan jalankan migrasi pada proyek Supabase lain**.

## Fitur volume pekerjaan
- Proyek -> detail -> Volume Pekerjaan: tambah, edit, hapus rincian.
- Kitchen Set Atas/Bawah standar: panjang(cm) / 100 × jumlah = meter lari.
- Kitchen Set Atas/Bawah nonstandar: panjang(cm)/100 × tinggi(cm)/100 × jumlah = m².
- Backdrop TV, Lemari, Walk-in Closet, Meja Rias, Wall Panel, Dipan, Pekerjaan Custom: panjang × tinggi × jumlah = m².
- Lebar/kedalaman dicatat dalam cm namun tidak mempengaruhi hasil volume.
- Total m² dan m lari dihitung terpisah.

## Fitur bagi hasil
- Proyek -> detail -> Bagi Hasil.
- Proyek harus berstatus Selesai, sudah menerima pelunasan, seluruh biaya dicatat.
- Klik Tutup Keuangan & Tetapkan Laba. Laba = pemasukan aktual - biaya operasional aktual.
- Penutupan mengunci pencatatan transaksi operasional proyek agar laba final tidak berubah.
- Catat penerima, tanggal, persentase/nominal, dan catatan pembagian.
- Total pembagian tidak boleh melebihi laba yang tersedia, termasuk saat dua akun menyimpan bersamaan.
- Riwayat pembagian ditampilkan dalam detail proyek dan laporan Keuangan.
- Bagi hasil merupakan distribusi laba, bukan biaya operasional (menghindari pengurangan laba dua kali).

## Cara pemasangan
1. Backup database Supabase Reka Ruang yang benar dan review struktur public.projects, public.transactions serta kebijakan akses tim.
2. Jalankan file migration_volume_bagi_hasil.sql di SQL Editor Supabase project mbkpajhzukrbiipgeibf, sekali saja setelah diverifikasi.
3. Pastikan tabel project_work_items, profit_distributions dan kolom keuangan di projects sudah muncul.
4. Test pada data dummy/staging dengan akun pengguna.
5. Setelah semua tes lolos, merge PR dan deploy Vercel. Jangan deploy aplikasi sebelum migrasi dijalankan karena versi baru memuat dua tabel baru saat login.

## Checklist tes
- [ ] Sistem lama: login, proyek, dokumen, keuangan, BAST, file masih berjalan.
- [ ] Kitchen standar panjang 285 cm, jumlah 1 => 2,85 m lari tanpa tinggi.
- [ ] Kitchen nonstandar panjang 285 cm, tinggi 80 cm => 2,28 m².
- [ ] Backdrop panjang 364 cm, tinggi 300 cm => 10,92 m².
- [ ] Lebar diubah tanpa mengubah volume.
- [ ] Rincian tersimpan setelah reload dan bisa diedit/dihapus.
- [ ] Proyek belum Selesai dan proyek belum lunas tidak bisa tutup keuangan.
- [ ] Pemasukan dan biaya pas penutupan tersimpan sebagai snapshot.
- [ ] Setelah ditutup, insert/update/delete transaksi operasional ditolak oleh database.
- [ ] Dua pengguna yang membagikan laba serentak tidak melebihi saldo laba.
- [ ] Bagi hasil Rp5 juta dari laba Rp10 juta ditampilkan 50%.
- [ ] Pengeluaran proyek tidak termasuk bagi hasil dua kali.
- [ ] Riwayat pembagian tetap terlihat setelah reload.
- [ ] Halaman dan modal bekerja di tampilan HP.

Catatan: Distribusi laba belum mendukung tombol koreksi/void; pembagian yang sudah tersimpan sengaja bersifat permanen untuk audit. Proyek yang ditutup juga tidak memiliki tombol buka ulang. RLS tabel lama harus diaudit di database yang benar.
