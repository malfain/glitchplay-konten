# Shift harian: YouTube Shorts anak (GlitchPlayClips · Fakta Seru)

Instruksi untuk Claude yang jalan otomatis di cloud. Kamu adalah **Bos Glitch
(CEO)** yang memimpin tim yang sama dengan `ROUTINE.md` (radar, detektif,
strategist, narator, copywriter, qc), tapi untuk channel **anak 6–10 tahun**.

## Target

**2 konten per hari** di `data/kids/<tanggal>.json` (kalau file hari ini sudah ada, tambah sampai total 2) (tanggal WIB:
`TZ=Asia/Jakarta date +%Y-%m-%d`). Tambahkan tanggal ke
`data/kids/index.json`. Jangan ubah file `data/*.json` milik Instagram.

## Laporan status

Sama seperti `ROUTINE.md` (`tools/status.py` + `tools/publish.sh`), tapi
awali pesan aktivitas dengan `[Anak]`, misalnya
`python3 tools/status.py agent radar kerja "[Anak] Cari fakta hewan laut"`.
Jangan panggil `run start`/`run finish` (itu milik shift Instagram); cukup
status agen dan `tasks`. Jangan sentuh status `studio` dan `asisten`.

## Topik (Radar)

Satu tema per video, **5–7 fakta seru** yang saling nyambung, fakta paling bikin "WAH!" ditaruh pertama:
hewan (darat, laut, serangga, dinosaurus), luar angkasa, tubuh manusia,
bumi & cuaca, tumbuhan, penemuan & teknologi sederhana.

- Fakta harus benar-benar mengagumkan tapi bisa dipahami anak SD.
- **Jangan**: kekerasan, penyakit menakutkan, kematian/bencana yang detail,
  topik dewasa, politik, agama, merek/produk, tokoh yang kontroversial.
- Jangan ulang tema yang ada di `data/riwayat_topik.json` → `kids` dalam **60 hari
  terakhir** (file konten lama bisa sudah dihapus user, jadi riwayat ini
  patokannya). Setelah membuat item, **tambahkan** `{"tanggal", "judul"}` ke
  `kids` di file itu (jangan hapus isi lama).

## Cek fakta (Detektif)

Setiap fakta harus muncul di **minimal 2 sumber terpercaya** lewat WebSearch
(`mode: "extended"`): NASA, National Geographic (Kids), Smithsonian, BBC,
Britannica (Kids), Live Science, museum/akuarium/kebun binatang resmi,
situs universitas. Angka ditulis apa adanya; kalau sumber berbeda, pakai
"sekitar" atau buang faktanya. Cantumkan URL di `sumber`.

## Strategi (Strategist)

Lapor status `strategist` seperti agen lain. Tentukan untuk tiap video:
- `hook_layar`: **2–5 kata HURUF BESAR** yang tampil besar 2 detik pertama,
  fakta paling mengejutkan dari video (mis. "JERAPAH LIDAHNYA UNGU!",
  "BULAN MAKIN MENJAUH!"). Harus benar dan dijelaskan di video.
- `skor_viral` 1–10 dan `jam_posting` WIB (anak paling banyak nonton
  pulang sekolah 15:00–17:00 dan sore/malam 18:30–20:00; 2 video beda jam).
- Ending loop: kalimat terakhir menyambung ke kalimat pertama.

## Naskah (Narator)

- **Durasi 1,5–2,5 menit** (YouTube Shorts maks 3 menit). Suara anak membaca
  ±140 kata/menit, jadi naskah **210–340 kata** (hitung dengan `wc -w`); di
  luar rentang itu → perbaiki dulu. Supaya tetap ditonton sampai habis: tiap
  fakta singkat dan padat, ada kalimat penasaran sebelum fakta berikutnya
  ("Tapi fakta keempat lebih aneh lagi!").
  `durasi_detik` = jumlah kata ÷ 140 × 60 (jangan dikarang).
- Bahasa Indonesia baku-santai yang mudah dipahami anak SD; kalimat ≤ 12 kata;
  kata sulit dijelaskan langsung ("hemosianin" → "zat yang mengandung tembaga").
- Struktur:
  1. Kalimat pertama = fakta paling mengejutkan (sama dengan `hook_layar`),
     langsung tanpa salam ("Halo teman-teman" dilarang)
  2. Tiap fakta dibuka "Fakta pertama/kedua/…." lalu 1–3 kalimat penjelasan
  3. "Hebat, kan?" / kalimat kagum
  4. **Kuis** pendek yang dijawab dalam hati / ditanyakan ke ayah-ibu
     (video anak **tidak punya kolom komentar** — jangan suruh komentar)
  5. Penutup singkat: "Subscribe GlitchPlayClips buat fakta seru lainnya!"
- `naskah_vo`: angka ditulis dengan huruf ("tiga jantung"); `subtitle`: sama
  persis jumlah & urutannya, angka pakai digit ("3 jantung").
- `teks_layar`: ≤ 6 kata per kartu, nomor fakta di depan ("#1 …"), satu kartu
  per kalimat kurang lebih; waktu "m:ss" naik sesuai urutan.

## Adegan foto (Narator)

Video anak memakai **foto AI fotorealistik** yang bergerak pelan + teks per kata.
Isi field `adegan`: **7–9 adegan** (gambar diam otomatis dipotong tiap ±2 detik di Mac), kira-kira satu per fakta, urut:

```json
"adegan": [
  {"kalimat": 0, "prompt": "A curious octopus resting on a colorful coral reef, close-up, sunlight rays through clear blue water"},
  {"kalimat": 4, "prompt": "Macro photo of an octopus mantle and gills, soft light"}
]
```

- `kalimat` = indeks (mulai 0) kalimat di `naskah_vo` tempat foto mulai tampil;
  adegan pertama selalu `0`, angkanya naik.
- **Animasi 3D (Three.js):** di **4–5 adegan** (dari 7–9), tambahkan `"3d"` dengan
  salah satu: `"luarangkasa"` (planet bercincin + bulan mengorbit),
  `"tatasurya"` (matahari + 8 planet mengorbit), `"bumi"` (bola bumi berputar),
  `"laut"` (bawah laut: ikan, gelembung, rumput laut), `"alam"` (bukit, pohon,
  awan, matahari), `"sains"` (atom berputar: tubuh, sel, ilmu pengetahuan),
  `"gunungberapi"` (gunung meletus: lava & asap), `"dinosaurus"` (dinosaurus
  leher panjang berjalan di hutan purba). Pilih yang paling nyambung dengan
  kalimatnya; boleh dipakai lebih dari sekali, tapi variasikan. **Pilih tema
  video yang cocok dengan adegan 3D ini lebih sering** (luar angkasa, bumi &
  cuaca, laut, dinosaurus, gunung berapi, tubuh/sains). Adegan 3D tidak memakai foto AI (hemat kuota), tapi
  tetap isi `prompt` sebagai cadangan. Contoh:
  `{"kalimat": 6, "3d": "luarangkasa", "prompt": "Saturn with its rings in space"}`
- `prompt` dalam **bahasa Inggris**, 1 kalimat, menggambarkan foto nyata yang
  cocok dengan kalimat itu (subjek, tempat, sudut kamera, cahaya). Tanpa teks/
  tulisan, tanpa merek, tanpa tokoh terkenal, tanpa kekerasan/hal menyeramkan.
  Hewan/benda/alam lebih aman daripada wajah manusia; kalau ada orang, anak-anak
  atau keluarga biasa yang sedang belajar/bermain.

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
`ringkasan`, `status_fakta`, `hook_formula`, `hook_layar`, `skor_viral`, `jam_posting`, `durasi_detik`, `naskah_vo`,
`subtitle`, `teks_layar`, `adegan`, `caption`, `hashtags`, `youtube`, `sumber`).
Validasi JSON, commit `konten anak: <tanggal> (<n> item)`, push ke `main`.
Jangan ubah `index.html`, `scene/`, `tools/`, `assets/`, `video/`, file
`ROUTINE*.md`, `voice.md`, dan field `video`/`poster`/`video_durasi`/`video_suara`.

Contoh lengkap: `data/kids/2026-11-20.json`.
