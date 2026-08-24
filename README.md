# Reka Ruang — Project Control (Supabase)

Web app internal untuk mencatat proyek Reka Ruang dari pengajuan sampai serah terima.

## Alur proyek

1. Pengajuan
2. Deal
3. Design AI
4. Design Fix
5. Pengerjaan
6. Pemasangan — BAST Pemasangan
7. Selesai — BAST Akhir + foto hasil akhir

Setiap tahap menyimpan **tanggal progress dan catatan**. Status **Selesai** hanya dapat dipilih jika:
- BAST Pemasangan berstatus Signed.
- BAST Serah Terima Akhir berstatus Signed.
- Minimal 1 foto hasil akhir sudah diupload.

## Fitur utama

- Dashboard nilai proyek, pemasukan, pengeluaran, sisa tagihan, dan pipeline.
- Nilai proyek dan data client.
- Pemasukan per proyek (DP / Progress / Pelunasan atau kategori bebas).
- Pengeluaran hanya dibagi menjadi **Bahan, Jasa, Design**.
- Upload **Design AI** dan **Design Fix** per proyek.
- Riwayat progress bertanggal untuk setiap tahap.
- BAST Pemasangan dan BAST Akhir dengan checklist + tanda tangan client + Reka Ruang, serta template cetak branded dan cap logo Reka Ruang.
- Upload foto hasil akhir proyek.
- Generator **Invoice, Kwitansi, Proposal Penawaran, dan SPK** dengan template branded Reka Ruang.
- Riwayat dokumen tersimpan di Supabase.
- Storage private; file dibuka menggunakan signed URL.
- Login tim memakai Supabase Authentication.

## Setup Supabase

### 1. Buat project Supabase
Buat project baru di Supabase.

### 2. Jalankan schema
Buka **SQL Editor** lalu copy seluruh isi `supabase.sql` dan jalankan sekali.

File SQL akan membuat:
- tabel project & progress,
- transaksi,
- file/design,
- dokumen,
- BAST,
- company settings,
- storage bucket `project-files`,
- RLS untuk user yang sudah login,
- generator nomor dokumen otomatis.

### 3. Buat user tim
Buka **Authentication > Users** lalu buat user untuk kamu/tim Reka Ruang.

Aplikasi sengaja tidak menyediakan registrasi publik. Hanya user yang sudah dibuat di Supabase yang dapat login.

### 4. Hubungkan aplikasi
Ada 2 cara.

**Cara paling mudah:** buka aplikasinya, masukkan Supabase Project URL dan Publishable/Anon Key di layar setup.

**Cara deployment permanen:** isi `config.js`:

```js
window.REKA_CONFIG = {
  supabaseUrl: 'https://PROJECT.supabase.co',
  supabaseAnonKey: 'PUBLISHABLE_OR_ANON_KEY'
};
```

> Aman untuk memakai publishable/anon key di browser selama RLS aktif. **Jangan pernah memasukkan service_role key** ke `config.js`.

## Deploy ke Vercel

1. Upload folder ini ke repository GitHub.
2. Import repository tersebut ke Vercel.
3. Framework Preset: **Other** / Static.
4. Tidak perlu build command.
5. Deploy.

Karena seluruh database dan file menggunakan Supabase, aplikasi dapat dibuka dari HP/laptop berbeda dengan akun login yang sama.

## Struktur file

- `index.html` — tampilan aplikasi.
- `styles.css` — UI responsive.
- `app.js` — logika proyek, finance, file, BAST, dokumen dan auth.
- `config.js` — konfigurasi Supabase.
- `supabase.sql` — schema database, RLS, storage dan function nomor dokumen.
- `migration_add_kwitansi_branding.sql` — migration kecil untuk database yang sudah dibuat dari versi sebelumnya.
- `assets/reka-ruang-logo.png` — logo resmi yang dipakai pada semua dokumen.

## Catatan file upload

Supabase standard upload dipakai untuk desain, PDF, foto final dan tanda tangan. Untuk file yang sangat besar (terutama > 6 MB), upload dapat lebih lambat; untuk penggunaan normal gambar render/PDF masih dapat digunakan.


## Update template dokumen branded

Versi ini menggunakan identitas visual Reka Ruang pada **Invoice, Kwitansi, Proposal, SPK, BAST Pemasangan, dan BAST Serah Terima**. Template cetak mengikuti gaya dokumen Reka Ruang: logo di kiri atas, judul dokumen di kanan, aksen bronze/charcoal, tabel rapi, footer, dan cap logo pada area pengesahan Reka Ruang.

### Jika database Supabase SUDAH pernah dibuat dengan versi lama

Jangan jalankan ulang seluruh schema. Buka **Supabase > SQL Editor**, lalu jalankan isi file:

`migration_add_kwitansi_branding.sql`

Migration ini hanya:
- menambahkan tipe dokumen **Kwitansi**,
- menambahkan prefix nomor otomatis `KWT/RR/...`,
- tidak menghapus proyek, transaksi, desain, BAST, maupun dokumen lama.

Setelah migration sukses, deploy ulang folder aplikasi ke Vercel.
