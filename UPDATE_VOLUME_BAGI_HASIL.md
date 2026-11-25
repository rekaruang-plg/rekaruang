# Update Reka Ruang tanpa migrasi Supabase

Tidak ada tabel baru, kolom baru, SQL, atau perubahan konfigurasi Supabase. Aplikasi menggunakan skema lama. Jangan jalankan migrasi volume/bagi hasil dari versi draft sebelumnya.

## Penyimpanan
- Data rincian pekerjaan, penutupan keuangan, dan bagi hasil disimpan pada bagian terstruktur dari kolom projects.notes. Catatan manual asli tetap terpisah dalam tampilan dan dipertahankan saat edit. Scope pekerjaan lama tidak diubah.
- Data tetap tersimpan pada Supabase, bukan localStorage. Akun lain yang menggunakan versi aplikasi yang sama dan memiliki akses proyek dapat membacanya.
- Bagi hasil muncul sebagai kategori virtual pada daftar keuangan dan mengurangi saldo kas setelah distribusi, tetapi bukan biaya operasional dan tidak dimasukkan ke tabel transactions. Nilai transaksi lama tidak diubah.
- Penutupan keuangan memeriksa status Selesai, pelunasan, dan angka transaksi aktual. Pembagian hanya sampai laba tersedia. Data snapshot yang tidak cocok dengan transaksi aktual memblokir pembagian baru.
- Aplikasi membaca ulang proyek dan memakai compare-and-swap pada nilai notes sebelum menulis, untuk mengurangi risiko menimpa perubahan dari perangkat lain.

## Batasan yang harus diketahui
- Aturan penguncian/validasi dilakukan di aplikasi, bukan trigger database. Versi lama, akses SQL, dan klien lain dapat melewati aturan, termasuk menghapus bagian terstruktur saat mengedit notes. Semua tim harus memakai aplikasi terbaru dan tidak mengedit catatan mentah langsung.
- Perbandingan notes melalui API dapat terbatas oleh panjang URL bila data proyek sangat besar. Solusi ini cocok sebagai kompatibilitas sementara, bukan pengganti tabel relasional jangka panjang.
- Tidak ada tombol buka kembali keuangan atau koreksi distribusi yang telah tercatat.
- Penyimpanan bergantung pada kolom notes bertipe teks yang dapat menyimpan payload dan kebijakan update projects yang sudah dipakai aplikasi lama. Belum dapat diverifikasi di Supabase produksi.
- Tidak ada transaksi atomik lintas tabel. Perubahan transaksi bersamaan dengan penutupan masih dapat terjadi; penyimpangan snapshot akan terdeteksi saat pengecekan berikutnya.

## Alur kerja
1. Proyek > Volume Pekerjaan: pilih jenis, isi dimensi dan jumlah. Kitchen set standar = panjang/100 × jumlah (m lari); nonstandar/pekerjaan lain = panjang/100 × tinggi/100 × jumlah (m²). Lebar hanya informasi. Jenis pekerjaan custom dapat diisi bebas.
2. Setelah proyek Selesai dan lunas, pastikan seluruh biaya sudah tercatat. Proyek > Bagi Hasil > Tutup Keuangan.
3. Catat penerima, tanggal, nominal atau persentase. Lihat riwayat dan rekap pada Keuangan.
4. Nilai kontrak dan status dikunci setelah penutupan pada versi ini.

## Sebelum produksi
- Gunakan preview Vercel dengan akun tim. Pastikan kolom notes dapat disimpan tanpa batasan yang tidak diketahui.
- Uji pada proyek dummy: simpan/edit/hapus item, edit catatan manual, reload dan login dari perangkat lain.
- Uji angka 285cm = 2,85 m; 285 × 80cm = 2,28 m²; 364 × 300cm = 10,92 m². Lebar tidak mengubah volume.
- Pastikan proyek belum selesai/belum lunas tidak bisa ditutup. Cek laba dari pemasukan aktual dikurangi biaya aktual. Uji distribusi melebihi saldo dan penyimpanan dari dua perangkat.
- Pastikan transaksi, BAST, dokumen, desain dan catatan proyek lama tetap tampil.
- Setelah preview lulus, merge ke main. Tidak ada migrasi SQL yang diperlukan. Jangan mengakses atau mengubah proyek Supabase yang lain.
