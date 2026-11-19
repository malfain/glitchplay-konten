# Rutinitas harian: konten @glitchplayclips1

Instruksi untuk Claude yang jalan otomatis setiap pagi. Ikuti persis.

## Tugas

Buat **minimal 5 konten reel** berita game untuk hari ini (tanggal WIB, format
`YYYY-MM-DD`) dan simpan ke `data/<tanggal>.json`.

1. Baca `voice.md` di repo ini. Semua tulisan harus mengikuti gaya itu:
   Bahasa Indonesia santai, istilah game tetap bahasa Inggris, voiceover TTS.
2. Cari berita game **24–48 jam terakhir** dengan web search. Prioritas:
   - berita game & esports Indonesia (MLBB, Free Fire, PUBG Mobile, Valorant,
     game lokal, event di Indonesia, streamer Indonesia)
   - rilis game besar, update/patch/season baru, harga di Indonesia
   - jangan ulang topik yang sudah dipakai di 3 file `data/*.json` terakhir,
     kecuali ada perkembangan baru
3. **Verifikasi setiap fakta** dari minimal satu sumber yang bisa dibuka
   (situs berita / pengumuman resmi). Jangan mengarang angka, tanggal, harga,
   kutipan, atau nama. Kalau hanya rumor/leak, set `status_fakta: "rumor"` dan
   naskah wajib bilang "masih rumor" / "belum resmi".
4. Jangan buat konten tentang: judi online/slot, top up ilegal, jual-beli akun,
   drama yang menyerang pribadi streamer, SARA, politik.
5. Kalau `data/<tanggal>.json` sudah ada, **tambahkan** item sampai minimal 5
   (jangan hapus item yang sudah ada, jangan duplikat topik).
6. Tambahkan tanggal ke `data/index.json` (`days`, tanpa duplikat).
7. Validasi JSON (`python3 -m json.tool`), lalu commit
   `konten: <tanggal> (<n> item)` dan push ke `main`.

## Aturan naskah reel

- Bentuk: HOOK (≤ 8 kata, ≤ 3 detik) → kenapa penting → isi (satu info per
  kalimat) → ajakan tunggal di akhir. Kalimat terakhir mengulang satu kata
  dari hook (loop).
- Panjang 20–40 detik ≈ 60–110 kata (TTS 170 kata/menit). Tiap kalimat ≤ 12 kata.
- `naskah_vo`: untuk dibacakan TTS. Angka ditulis seperti diucapkan
  ("satu koma dua juta", "PS lima"), tanpa emoji, tanpa simbol, tanpa "wkwk".
- `teks_layar`: ≤ 6 kata per kartu, angka asli boleh, emoji boleh (maks 1).
  Kartu pertama di 0:00. Ganti kartu tiap 2–4 detik.
- Hook pakai rumus yang berbeda-beda antar konten, misalnya: The Callout,
  The Reveal, The Deadline, Nobody Tells You, Head To Head, The Statistic,
  Numbered With A Favourite, If This Then Watch, Contrarian Flip.
- `caption`: baris pertama (sebelum "… more") harus bikin penasaran; isi
  2–4 kalimat; satu pertanyaan/ajakan komentar. `hashtags`: tepat 3.
- Hindari kata AI-ish: "mari kita selami", "tidak dapat dipungkiri",
  "dunia game yang dinamis", "game-changer", tanda pisah panjang (—).

## Format `data/<tanggal>.json`

```json
{
  "date": "2026-11-19",
  "items": [
    {
      "kategori": "Rilis Game | Update | Esports | Streamer | Game Lokal | Promo/Diskon",
      "judul": "judul singkat",
      "ringkasan": "1-2 kalimat fakta inti",
      "status_fakta": "resmi | rumor",
      "hook_formula": "nama rumus hook",
      "durasi_detik": 30,
      "naskah_vo": ["kalimat 1", "kalimat 2"],
      "teks_layar": [{"t": "0:00", "teks": "TEKS KARTU", "visual": "saran visual/clip"}],
      "caption": "caption lengkap",
      "hashtags": ["#a", "#b", "#c"],
      "sumber": [{"nama": "Nama situs", "url": "https://..."}]
    }
  ]
}
```

Contoh lengkap: `data/2026-11-19.json`.
