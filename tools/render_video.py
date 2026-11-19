#!/usr/bin/env python3
"""Render each content item of a day into a 9:16 news reel (motion graphic + Indonesian TTS + subtitles).

Runs on the Mac: voice = macOS `say -v Damayanti`, video = ffmpeg, frames = Pillow.
Writes video/<date>/<nn>-<slug>.mp4 (+ .jpg poster) and sets item["video"], item["poster"], item["video_durasi"].
Items that already have a video file are skipped, so it is safe to run every hour.

  .venv/bin/python tools/render_video.py                 # today (WIB)
  .venv/bin/python tools/render_video.py --date 2026-11-20 --only 1
  .venv/bin/python tools/render_video.py --prune 14       # also drop videos older than 14 days
"""
import argparse
import json
import os
import re
import shutil
import subprocess
import sys
import textwrap
from datetime import datetime, timedelta, timezone
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = Path(__file__).resolve().parent.parent
WIB = timezone(timedelta(hours=7))
W, H = 1080, 1920
FPS = 30
GAP = 0.18          # silence after each sentence (s)
XF = 0.22           # crossfade between sentences (s)
VOICE = os.environ.get("GP_VOICE", "Damayanti")
RATE = os.environ.get("GP_RATE", "190")  # words per minute for `say`

# brand (from the GlitchPlayClips watermark)
BG = (9, 12, 18)
CYAN = (42, 212, 240)
PINK = (255, 58, 110)
LIME = (198, 240, 44)
WHITE = (250, 250, 250)
MUTED = (150, 160, 180)

FONTS = Path("/System/Library/Fonts/Supplemental")
F_HEAD = str(FONTS / "Arial Black.ttf")
F_BOLD = str(FONTS / "Arial Bold.ttf")

# Instagram safe zone: keep text inside x 70..850, y 230..1440
SAFE_L, SAFE_R, SAFE_T, SAFE_B = 70, 850, 230, 1440


def ffmpeg_bin():
    for p in (os.environ.get("FFMPEG"), shutil.which("ffmpeg"), str(Path.home() / "Documents/ai-clipper/bin/ffmpeg")):
        if p and Path(p).exists():
            return p
    sys.exit("ffmpeg tidak ditemukan (set FFMPEG=/path/ke/ffmpeg)")


FFMPEG = ffmpeg_bin()


def run(cmd):
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode != 0:
        raise RuntimeError(f"{cmd[0]} gagal: {r.stderr[-800:]}")
    return r


EMOJI = re.compile("[\U0001F000-\U0001FAFF\u2600-\u27BF\uFE0F\u200D\u2B00-\u2BFF]+")


def clean(s):
    """Arial has no emoji glyphs: drop them so they don't render as boxes."""
    return re.sub(r"\s{2,}", " ", EMOJI.sub("", s or "")).strip()


def slug(s, n=40):
    s = re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")
    return s[:n].rstrip("-") or "konten"


def font(path, size):
    return ImageFont.truetype(path, size)


def wrap_px(draw, text, fnt, max_w):
    words, lines, cur = text.split(), [], ""
    for w in words:
        t = (cur + " " + w).strip()
        if draw.textlength(t, font=fnt) <= max_w:
            cur = t
        else:
            if cur:
                lines.append(cur)
            cur = w
    if cur:
        lines.append(cur)
    return lines


# ------------------------------------------------------------------ frames
def background(seed):
    img = Image.new("RGB", (W, H), BG)
    d = ImageDraw.Draw(img)
    # soft vertical gradient
    for y in range(0, H, 4):
        k = y / H
        c = (int(BG[0] + 10 * k), int(BG[1] + 14 * k), int(BG[2] + 30 * k))
        d.rectangle([0, y, W, y + 4], fill=c)
    # diagonal brand stripes
    glow = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    g = ImageDraw.Draw(glow)
    off = (seed * 137) % 400
    for i, col in enumerate((CYAN, PINK, LIME)):
        x = -600 + off + i * 140
        g.polygon([(x, H), (x + 70, H), (x + 70 + 1300, 0), (x + 1300, 0)], fill=col + (38,))
    glow = glow.filter(ImageFilter.GaussianBlur(6))
    img.paste(glow, (0, 0), glow)
    # dotted grid
    for y in range(40, H, 48):
        for x in range(40, W, 48):
            d.point((x, y), fill=(40, 52, 80))
    return img


def glitch_text(img, xy, text, fnt, fill=WHITE):
    d = ImageDraw.Draw(img)
    x, y = xy
    d.text((x - 5, y), text, font=fnt, fill=CYAN)
    d.text((x + 5, y), text, font=fnt, fill=PINK)
    d.text((x, y), text, font=fnt, fill=fill)


def frame(item, card, sub, seg_i, seg_n, bg, logo):
    img = bg.copy()
    d = ImageDraw.Draw(img)

    # logo (top, inside safe zone)
    img.paste(logo, (SAFE_L - 10, SAFE_T + 10), logo)

    # chips
    y = SAFE_T + 170
    chips = [(item.get("kategori", "Berita Game").upper(), LIME, BG)]
    rumor = item.get("status_fakta") == "rumor"
    chips.append(("RUMOR" if rumor else "RESMI", PINK if rumor else CYAN, BG))
    x = SAFE_L
    fc = font(F_HEAD, 30)
    for label, bgc, fg in chips:
        w = d.textlength(label, font=fc) + 36
        d.rounded_rectangle([x, y, x + w, y + 54], radius=27, fill=bgc)
        d.text((x + 18, y + 9), label, font=fc, fill=fg)
        x += w + 14

    # headline card (teks layar)
    text = clean(card or item.get("judul", "")).upper()
    size = 112
    while size > 56:
        fh = font(F_HEAD, size)
        lines = wrap_px(d, text, fh, SAFE_R - SAFE_L)
        if len(lines) <= 4:
            break
        size -= 8
    lh = int(size * 1.12)
    block_h = lh * len(lines)
    top = 560 + max(0, (420 - block_h) // 2)
    for i, ln in enumerate(lines):
        glitch_text(img, (SAFE_L, top + i * lh), ln, fh)
    # underline accent
    d.rectangle([SAFE_L, top + block_h + 22, SAFE_L + 160, top + block_h + 34], fill=LIME)

    # subtitle (spoken sentence)
    fs = font(F_BOLD, 52)
    sl = wrap_px(d, clean(sub), fs, SAFE_R - SAFE_L - 60)[:3]
    sh = 70 * len(sl) + 40
    sy = 1400 - sh
    panel = Image.new("RGBA", (SAFE_R - SAFE_L, sh), (0, 0, 0, 0))
    ImageDraw.Draw(panel).rounded_rectangle([0, 0, SAFE_R - SAFE_L, sh], radius=28, fill=(10, 14, 24, 215))
    img.paste(panel, (SAFE_L, sy), panel)
    d.rectangle([SAFE_L, sy + 18, SAFE_L + 8, sy + sh - 18], fill=CYAN)
    for i, ln in enumerate(sl):
        d.text((SAFE_L + 34, sy + 20 + i * 70), ln, font=fs, fill=WHITE)

    # progress bar
    d.rounded_rectangle([SAFE_L, 1420, SAFE_R, 1430], radius=5, fill=(40, 50, 75))
    d.rounded_rectangle([SAFE_L, 1420, SAFE_L + int((SAFE_R - SAFE_L) * (seg_i + 1) / seg_n), 1430], radius=5, fill=LIME)
    return img


def brand_logo():
    """IG profile photo (assets/profile.jpg|png) as a ringed circle + handle; falls back to the wordmark watermark."""
    prof = next((ROOT / "assets" / n for n in ("profile.png", "profile.jpg", "profile.jpeg") if (ROOT / "assets" / n).exists()), None)
    if not prof:
        wm = Image.open(ROOT / "assets/watermark.png").convert("RGBA")
        return wm.resize((560, int(wm.height * 560 / wm.width)), Image.LANCZOS)
    S = 132
    av = Image.open(prof).convert("RGB")
    side = min(av.size)
    av = av.crop(((av.width - side) // 2, (av.height - side) // 2, (av.width + side) // 2, (av.height + side) // 2)).resize((S, S), Image.LANCZOS)
    mask = Image.new("L", (S, S), 0)
    ImageDraw.Draw(mask).ellipse([0, 0, S - 1, S - 1], fill=255)
    out = Image.new("RGBA", (S + 12 + 560, S + 12), (0, 0, 0, 0))
    d = ImageDraw.Draw(out)
    d.ellipse([0, 0, S + 11, S + 11], fill=CYAN + (255,))
    d.pieslice([0, 0, S + 11, S + 11], 90, 270, fill=PINK + (255,))
    out.paste(av, (6, 6), mask)
    d.text((S + 34, 18), "GlitchPlayClips", font=font(F_HEAD, 46), fill=WHITE)
    d.text((S + 36, 78), "@glitchplayclips", font=font(F_BOLD, 36), fill=LIME)
    return out


# ------------------------------------------------------------------ audio
def tts(text, out_aiff):
    run(["say", "-v", VOICE, "-r", RATE, "-o", str(out_aiff), text])


def duration(path):
    r = subprocess.run(["afinfo", str(path)], capture_output=True, text=True)
    m = re.search(r"estimated duration: ([\d.]+)", r.stdout)
    return float(m.group(1)) if m else 2.0


def pick_card(cards, frac):
    """teks_layar cards are planned for ~170 wpm; map by fraction of the planned total time."""
    if not cards:
        return None
    def secs(t):
        m, s = (t.split(":") + ["0"])[:2]
        return int(m) * 60 + float(s)
    times = [secs(c.get("t", "0:00")) for c in cards]
    total = max(times[-1] + 3, 1)
    best = cards[0]
    for c, t in zip(cards, times):
        if t / total <= frac + 1e-6:
            best = c
    return best.get("teks")


# ------------------------------------------------------------------ render one item
def render_item(item, idx, date, outdir, tmp):
    sents = [s.strip() for s in item.get("naskah_vo", []) if s.strip()]
    if not sents:
        raise RuntimeError("naskah_vo kosong")
    tmp.mkdir(parents=True, exist_ok=True)

    durs = []
    for i, s in enumerate(sents):
        a = tmp / f"s{i}.aiff"
        tts(s, a)
        durs.append(duration(a) + GAP)
    total = sum(durs)

    logo = brand_logo()
    bg = background(idx)

    starts, acc = [], 0.0
    for dd in durs:
        starts.append(acc)
        acc += dd
    subs = item.get("subtitle") or []
    frames = []
    for i, s in enumerate(sents):
        card = pick_card(item.get("teks_layar", []), starts[i] / total)
        p = tmp / f"f{i}.png"
        frame(item, card, subs[i] if i < len(subs) and subs[i] else s, i, len(sents), bg, logo).save(p)
        frames.append(p)

    # audio: each sentence + GAP silence, concatenated
    ain, af = [], []
    for i in range(len(sents)):
        ain += ["-i", str(tmp / f"s{i}.aiff")]
        af.append(f"[{i}:a]aresample=44100,apad=pad_dur={GAP}[a{i}]")
    af.append("".join(f"[a{i}]" for i in range(len(sents))) + f"concat=n={len(sents)}:v=0:a=1[aout]")
    audio = tmp / "voice.m4a"
    run([FFMPEG, "-y", "-hide_banner", "-loglevel", "error", *ain, "-filter_complex", ";".join(af), "-map", "[aout]", "-c:a", "aac", "-b:a", "128k", str(audio)])

    # video: still frames with crossfades, offsets keep each frame aligned with its sentence
    vin, vf = [], []
    for i, p in enumerate(frames):
        vin += ["-loop", "1", "-t", f"{durs[i] + XF:.3f}", "-framerate", str(FPS), "-i", str(p)]
    n = len(frames)
    if n == 1:
        vf.append("[0:v]format=yuv420p[vout]")
    else:
        prev, off = "[0:v]", 0.0
        for i in range(1, n):
            off += durs[i - 1]
            out = "[vout]" if i == n - 1 else f"[x{i}]"
            trans = "slideleft" if i % 3 == 0 else "fade"
            vf.append(f"{prev}[{i}:v]xfade=transition={trans}:duration={XF}:offset={off:.3f}{out}")
            prev = out
    name = f"{idx + 1:02d}-{slug(item.get('judul', ''))}"
    mp4 = outdir / f"{name}.mp4"
    outdir.mkdir(parents=True, exist_ok=True)
    run([FFMPEG, "-y", "-hide_banner", "-loglevel", "error", *vin, "-i", str(audio),
         "-filter_complex", ";".join(vf) + ";[vout]format=yuv420p,fade=t=in:st=0:d=0.25[v]",
         "-map", "[v]", "-map", f"{n}:a", "-r", str(FPS), "-c:v", "libx264", "-preset", "veryfast", "-crf", "24",
         "-c:a", "copy", "-shortest", "-movflags", "+faststart", str(mp4)])
    poster = outdir / f"{name}.jpg"
    Image.open(frames[0]).convert("RGB").resize((540, 960), Image.LANCZOS).save(poster, quality=82)
    return mp4, poster, round(total, 1)


# ------------------------------------------------------------------ status board
def status(*args):
    subprocess.run([sys.executable, str(ROOT / "tools/status.py"), *args], check=False)


def prune(days):
    cutoff = (datetime.now(WIB) - timedelta(days=days)).strftime("%Y-%m-%d")
    vdir = ROOT / "video"
    removed = 0
    if vdir.exists():
        for d in sorted(vdir.iterdir()):
            if d.is_dir() and d.name < cutoff:
                shutil.rmtree(d)
                removed += 1
                f = ROOT / "data" / f"{d.name}.json"
                if f.exists():
                    data = json.loads(f.read_text(encoding="utf-8"))
                    for it in data.get("items", []):
                        for k in ("video", "poster", "video_durasi"):
                            it.pop(k, None)
                    f.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return removed


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--date", default=datetime.now(WIB).strftime("%Y-%m-%d"))
    ap.add_argument("--only", type=int, help="render hanya item ke-N (1-based)")
    ap.add_argument("--force", action="store_true", help="render ulang walau video sudah ada")
    ap.add_argument("--prune", type=int, default=0, help="hapus video lebih tua dari N hari")
    ap.add_argument("--no-status", action="store_true")
    a = ap.parse_args()

    if a.prune:
        n = prune(a.prune)
        if n:
            print(f"prune: {n} folder video lama dihapus")

    f = ROOT / "data" / f"{a.date}.json"
    if not f.exists():
        print(f"tidak ada data {a.date}")
        return 0
    data = json.loads(f.read_text(encoding="utf-8"))
    items = data.get("items", [])
    todo = [i for i, it in enumerate(items)
            if (a.only is None or i == a.only - 1)
            and (a.force or not (it.get("video") and (ROOT / it["video"]).exists()))]
    if not todo:
        print("semua video sudah ada")
        return 0

    outdir = ROOT / "video" / a.date
    tmp_root = ROOT / ".render-tmp"
    done = 0
    if not a.no_status:
        status("agent", "studio", "kerja", f"Render {len(todo)} video untuk {a.date}")
        if os.environ.get("GP_PUBLISH"):  # let the Kantor board show Studio at work
            subprocess.run([str(ROOT / "tools/publish.sh"), f"status: studio render {a.date}"], check=False)
    for n, i in enumerate(todo, 1):
        it = items[i]
        if not a.no_status:
            status("agent", "studio", "kerja", f"Render video {n}/{len(todo)}: {it.get('judul', '')[:34]}")
        try:
            mp4, poster, dur = render_item(it, i, a.date, outdir, tmp_root / f"{a.date}-{i}")
        except Exception as e:  # keep going with the other items
            print(f"[{i + 1}] gagal: {e}", file=sys.stderr)
            if not a.no_status:
                status("agent", "studio", "error", f"Video {i + 1} gagal: {str(e)[:40]}")
            continue
        it["video"] = str(mp4.relative_to(ROOT))
        it["poster"] = str(poster.relative_to(ROOT))
        it["video_durasi"] = dur
        f.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        done += 1
        print(f"[{i + 1}] {mp4.name}  {dur}s  {mp4.stat().st_size // 1024} KB")
    shutil.rmtree(tmp_root, ignore_errors=True)
    if not a.no_status:
        status("agent", "studio", "selesai" if done == len(todo) else "error", f"{done}/{len(todo)} video jadi, siap di Hasil")
    return 0 if done == len(todo) else 1


if __name__ == "__main__":
    sys.exit(main())
