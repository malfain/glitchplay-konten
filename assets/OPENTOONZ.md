# Animasi dari OpenToonz untuk video GlitchPlay

Gambar & animasikan sekali di OpenToonz, ekspor jadi urutan PNG, taruh di folder
di bawah. Robot render otomatis memakainya di **setiap** video berikutnya.

| Folder | Isi | Dipakai di |
|---|---|---|
| `assets/maskot/glitch/` | maskot Instagram | reel IG, pojok kanan bawah, bergerak terus |
| `assets/maskot/kids/` | maskot YouTube fakta anak | Shorts anak, pojok kanan bawah |
| `assets/logo/glitchplayclips/` | logo GlitchPlayClips beranimasi | IG + YouTube anak: berputar di pojok kiri atas + muncul besar 2 detik di akhir |
| `assets/logo/glitchplay/` | logo Glitchplay beranimasi | YouTube kisah Nabi: pojok kiri atas + 2 detik di akhir |

Kisah Nabi **tidak** memakai maskot. Folder kosong = fitur itu tidak tampil.

## Cara ekspor di OpenToonz

1. **Ukuran kamera**: Xsheet → Scene Settings / Camera Settings → persegi,
   **512 × 512** piksel (maskot) atau **720 × 720** (logo).
2. **Latar transparan**: jangan pakai level warna latar; biarkan kosong.
3. **Panjang animasi**:
   - maskot: gerakan berulang (loop) **12–48 frame**, frame terakhir nyambung ke frame pertama;
   - logo: **24–48 frame** (1–2 detik); frame terakhir = posisi logo diam.
4. **Render → Output Settings**:
   - File Format: **png**, klik *Options* → centang **Alpha Channel** (supaya transparan);
   - Save in: folder mana saja di Mac, Name: misalnya `maskot`;
   - Frame rate: biarkan 24.
5. **Render → Render** → muncul `maskot.0001.png`, `maskot.0002.png`, …
6. Salin **semua file PNG** itu ke folder yang sesuai di atas
   (`~/Documents/glitchplay-konten/assets/...`).
7. (Opsional) kalau frame rate bukan 24, buat file `fps.txt` berisi angkanya, mis. `12`.
8. Bilang ke Claude "maskot sudah ada" → dicek, di-push, dan video berikutnya langsung memakainya.

Tips: total ukuran per folder sebaiknya < 15 MB (≈ 48 frame 512 px).
