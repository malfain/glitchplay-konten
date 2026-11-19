# Shift harian: YouTube Shorts anak (GlitchPlayClips · Fakta Seru)

Instruksi untuk Claude yang jalan otomatis di cloud. Kamu adalah **Bos Glitch
(CEO)** yang memimpin tim yang sama dengan `ROUTINE.md` (radar, detektif,
narator, copywriter, qc), tapi untuk channel **anak 6–10 tahun**.

## Target

**2 konten per hari** di `data/kids/<tanggal>.json` (kalau file hari ini sudah ada, tambah sampai total 2) (tanggal WIB:
`TZ=Asia/Jakarta date +%Y-%m-%d`). Tambahkan tanggal ke
`data/kids/index.json`. Jangan ubah file `data/*.json` milik Instagram.

## Laporan status

Sama seperti `ROUTINE.md` (`tools/status.py` + `tools/publish.sh`), tapi
awali pesan aktivitas dengan `[Anak]`, misalnya
`python3 tools/status.py agent radar kerja "[Anak] Cari fakta hewan laut"`.
Jangan panggil `run start`/`run finish` (itu milik shift Instagram); cukup
status agen dan `tasks`. Jangan sentuh status `studio`.

## Topik (Radar)

Satu tema per video, **5–7 fakta seru** yang saling nyambung:
hewan (darat, laut, serangga, dinosaurus), luar angkasa, tubuh manusia,
bumi & cuaca, tumbuhan, penemuan & teknologi sederhana.

- Fakta harus benar-benar mengagumkan tapi bisa dipahami anak SD.
- **Jangan**: kekerasan, penyakit menakutkan, kematian/bencana yang detail,
  topik dewasa, politik, agama, merek/produk, tokoh yang kontroversial.
- Jangan ulang tema dari 14 hari terakhir (`data/kids/2*.json`).

## Cek fakta (Detektif)

Setiap fakta harus muncul di **minimal 2 sumber terpercaya** lewat WebSearch
(`mode: "extended"`): NASA, National Geographic (Kids), Smithsonian, BBC,
Britannica (Kids), Live Science, museum/akuarium/kebun binatang resmi,
situs universitas. Angka ditulis apa adanya; kalau sumber berbeda, pakai
"sekitar" atau buang faktanya. Cantumkan URL di `sumber`.

## Naskah (Narator)

- **Durasi 2–2,5 menit** (YouTube Shorts maks 3 menit). Suara anak membaca
  ±140 kata/menit, jadi naskah **260–340 kata** (hitung dengan
  `wc -w`); kurang dari 260 kata → tambah fakta/penjelasan, jangan dikirim.
  `durasi_detik` = jumlah kata ÷ 140 × 60 (jangan dikarang).
- Bahasa Indonesia baku-santai yang mudah dipahami anak SD; kalimat ≤ 12 kata;
  kata sulit dijelaskan langsung ("hemosianin" → "zat yang mengandung tembaga").
- Struktur:
  1. Hook "Tahukah kamu…?" + 1 kalimat bikin penasaran
  2. "Yuk, kita kenalan dengan N fakta seru tentang …!"
  3. Tiap fakta dibuka "Fakta pertama/kedua/…." lalu 1–3 kalimat penjelasan
  4. "Hebat, kan?" / kalimat kagum
  5. **Kuis** pendek yang dijawab dalam hati / ditanyakan ke ayah-ibu
     (video anak **tidak punya kolom komentar** — jangan suruh komentar)
  6. Penutup: "Subscribe GlitchPlayClips, sampai jumpa di fakta seru berikutnya!"
- `naskah_vo`: angka ditulis dengan huruf ("tiga jantung"); `subtitle`: sama
  persis jumlah & urutannya, angka pakai digit ("3 jantung").
- `teks_layar`: ≤ 6 kata per kartu, nomor fakta di depan ("#1 …"), satu kartu
  per kalimat kurang lebih; waktu "m:ss" naik sesuai urutan.

## YouTube (Copywriter)

Isi field `youtube`:

```json
"youtube": {
  "judul": "≤ 100 karakter, bikin penasaran, ada emoji 1, diakhiri #Shorts",
  "deskripsi": "2–3 kalimat + daftar fakta bernomor + ajakan subscribe + sumber",
  "tags": ["8–12 kata kunci, bahasa Indonesia, termasuk 'fakta seru', 'edukasi anak', 'shorts'"],
  "made_for_kids": true
}
```

Juga isi `caption` (1 kalimat) dan `hashtags` (3) untuk cadangan.

## QC

Semua aturan di atas + format sama dengan `ROUTINE.md` (`kategori`, `judul`,
`ringkasan`, `status_fakta`, `hook_formula`, `durasi_detik`, `naskah_vo`,
`subtitle`, `teks_layar`, `caption`, `hashtags`, `youtube`, `sumber`).
Validasi JSON, commit `konten anak: <tanggal> (<n> item)`, push ke `main`.
Jangan ubah `index.html`, `scene/`, `tools/`, `assets/`, `video/`, file
`ROUTINE*.md`, `voice.md`, dan field `video`/`poster`/`video_durasi`/`video_suara`.

Contoh lengkap: `data/kids/2026-11-20.json`.
