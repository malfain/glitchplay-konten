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
TTS = os.environ.get("GP_TTS", "gemini")               # gemini = Google AI Studio TTS, edge = Microsoft Ardi, say = macOS
GEMINI_MODEL = os.environ.get("GP_GEMINI_MODEL", "gemini-3.8-flash-tts")
GEMINI_VOICE = os.environ.get("GP_GEMINI_VOICE", "Fenrir")
GEMINI_STYLE = os.environ.get("GP_GEMINI_STYLE", "Bahasa Indonesia santai anak muda Jakarta, ceria, lucu dan semangat, "
                              "gaya voiceover iklan lifestyle, tempo sedang agak cepat, jeda singkat antarkalimat, suara jernih dan terang")
# per-channel look, voice and wording; --channel picks one
CHANNELS = {
    "glitch": {
        "data": "data", "video": "video", "theme": "glitch", "handle": "@glitchplayclips",
        "voice": "Fenrir", "models": ["gemini-3.8-flash-tts", "gemini-3.8-flash-lite-tts"],
        "style": None,  # GEMINI_STYLE
        "pill": "berita game", "cta_head": "follow", "cta_tag": "biar nggak ketinggalan",
        "stickers": {"hook": "update!", "number": "gokil!", "cta": "follow!"},
        "agent": "studio",
        "render": "photo",  # AI photos + word captions when the item has 'adegan'; otherwise the animated GlitchReel
    },
    "kids": {
        "data": "data/kids", "video": "video/kids", "theme": "kids", "handle": "GlitchPlayClips",
        "voice": "Leda", "models": ["gemini-3.8-flash-lite-tts", "gemini-3.8-flash-tts"],
        "style": "Kakak pencerita yang ramah untuk anak SD umur 6 sampai 10 tahun, bahasa Indonesia yang jelas dan sederhana, "
                 "ceria, hangat, penuh rasa kagum, tempo sedang, artikulasi jelas, jeda singkat antarkalimat",
        "pill": "fakta seru", "cta_head": "subscribe", "cta_tag": "biar tambah pintar",
        "stickers": {"hook": "wow!", "number": "keren!", "cta": "subscribe!"},
        "agent": "asisten",
        "render": "photo",  # AI photos + word-by-word captions (falls back to animated style without 'adegan')
    },
    # YouTube "Glitchplay": sirah of the Prophet ﷺ as illustrated stories; the Prophet's face is always covered by light
    "sirah": {
        "data": "data/sirah", "video": "video/sirah", "theme": "sirah", "handle": "Glitchplay",
        "voice": "Charon", "models": ["gemini-3.8-flash-lite-tts", "gemini-3.8-flash-tts"],
        "style": "Pencerita sejarah Islam yang tenang, hangat dan khidmat, bahasa Indonesia yang jelas, tempo sedang, "
                 "penuh hormat, jeda singkat antarkalimat",
        "pill": "kisah nabi", "cta_head": "subscribe", "cta_tag": "untuk kisah berikutnya",
        "stickers": {"hook": "kisah", "number": "masyaallah", "cta": "subscribe"},
        "agent": "asisten",
        "render": "photo",
        "img_style": ("beautiful 2D animated film still, hand-painted storybook illustration, warm golden desert light, "
                      "soft painterly textures, historical 7th century Arabia, peaceful and respectful mood, "
                      "no text, no letters, no logos"),
        "label": "Ilustrasi dibuat dengan AI",
    },
}
CH = dict(CHANNELS["glitch"])
GEMINI_KEY_FILE = Path(os.environ.get("GP_GEMINI_KEY_FILE", str(Path.home() / ".glitchplay/gemini_key")))
EDGE_VOICE = os.environ.get("GP_EDGE_VOICE", "id-ID-ArdiNeural")
EDGE_RATE = os.environ.get("GP_EDGE_RATE", "+10%")   # cepat & semangat
KEEP_PAUSE = float(os.environ.get("GP_KEEP_PAUSE", "0.28"))  # longest pause kept between phrases (s)
EDGE_PITCH = os.environ.get("GP_EDGE_PITCH", "+4Hz")  # sedikit lebih ceria
VOICE = os.environ.get("GP_VOICE", "Damayanti")         # macOS fallback voice
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
    """Neural Indonesian voice (Ardi) via edge-tts; falls back to macOS `say` (Damayanti) when offline."""
    if TTS == "edge":
        mp3 = Path(str(out_aiff) + ".mp3")
        edge = Path(sys.executable).with_name("edge-tts")
        r = subprocess.run([str(edge), "--voice", EDGE_VOICE, f"--rate={EDGE_RATE}", f"--pitch={EDGE_PITCH}", "--text", text, "--write-media", str(mp3)],
                           capture_output=True, text=True)
        if r.returncode == 0 and mp3.exists() and mp3.stat().st_size > 1000:
            run([FFMPEG, "-y", "-hide_banner", "-loglevel", "error", "-i", str(mp3), "-ar", "44100", str(out_aiff)])
            mp3.unlink()
            return
        print(f"edge-tts gagal, pakai {VOICE}: {(r.stderr or '')[-200:]}", file=sys.stderr)
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


# ------------------------------------------------------------------ "anim" style (HTML motion graphic, captured by Chrome)
ACRONYM = re.compile(r"^[A-Z0-9][A-Z0-9.+&-]{0,4}$")
NUM = re.compile(r"(?:(?<=Rp)|(?<![A-Za-z]))(\d+(?:[.,]\d+)*)(?![A-Za-z\d])")
ALWAYS_CAPS = {"USD", "IDR", "PC", "WIB", "FPS", "MLBB", "PUBG", "GTA", "DLC", "MPL", "MDL", "FFWS", "PMGC", "PMPL", "ICE", "BSD",
               "HP", "AI", "RRQ", "EVOS", "ONIC", "BTR", "NAVI", "VCT", "IGN", "PS", "VR", "RPG", "FPS", "MOBA", "TV"}
BULAN = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"]


def soft_case(text, ref=""):
    """'ANAK PC, SABAR DULU' -> 'anak PC, sabar dulu'. A word stays upper-case only if it is written upper-case in the
    natural-spelling subtitles too (MLBB, PC, WIB) or carries a digit (PS5, CS2)."""
    caps = {w.strip("?!.,:·()") for w in ref.split() if w.strip("?!.,:·()").isupper()} | ALWAYS_CAPS
    out = []
    for w in clean(text).split():
        core = w.strip("?!.,:·()")
        keep = core in caps or (any(c.isdigit() for c in core) and any(c.isalpha() for c in core))
        out.append(w if keep else w.lower())
    return " ".join(out)


def parse_number(text):
    m = NUM.search(text)
    if not m:
        return None
    raw = m.group(1)
    if "," in raw:
        whole, frac = raw.replace(".", "").split(",", 1)
        value, dec = float(f"{whole}.{frac}"), len(frac)
    elif raw.count(".") == 1 and len(raw.split(".")[1]) != 3:
        value, dec = float(raw), len(raw.split(".")[1])
    else:
        value, dec = float(raw.replace(".", "")), 0
    before, after = text[: m.start()].strip(" ·:-"), text[m.end():].strip(" ·:-")
    return value, dec, before, after


def chips_from(sub):
    parts_ = re.split(r"\b(?:ada|yaitu|antara lain|seperti)\b|:", sub, maxsplit=1, flags=re.I)
    if len(parts_) < 2:
        return None  # only real lists ("ada A, B, dan C") become chips
    body = parts_[-1]
    parts = [p.strip(" .") for p in re.split(r",|\bdan\b|\bsama\b", body) if p.strip(" .")]
    return parts if 3 <= len(parts) <= 7 and all(len(p) <= 22 for p in parts) else None


STOP = set("di ke dan yang ini itu ada sama buat untuk dari dengan juga udah sudah biar nggak tapi cuma jadi kamu kalian aja the of".split())


def tokens(t):
    return {w for w in re.findall(r"[a-z0-9]+", clean(t).lower().replace("rp", " ")) if w not in STOP and len(w) > 1}


def match_cards(cards, subs, total, durs):
    """Pair each spoken sentence with the on-screen card that shares the most words; fall back to planned timing."""
    out, acc, used_last = [], 0.0, None
    for i, sub in enumerate(subs):
        st = tokens(sub)
        best, score = None, 0
        for c in cards:
            sc_ = len(st & tokens(c.get("teks", "")))
            if sc_ > score:
                best, score = c.get("teks"), sc_
        if not best:
            best = pick_card(cards, acc / total)
        out.append(best)
        acc += durs[i]
    return out


def build_scene(item, date, sents, subs, durs, speaks):
    cards = item.get("teks_layar", [])
    total = sum(durs)
    ref = " ".join(subs) + " " + item.get("judul", "")
    sc = lambda t: soft_case(t, ref)
    nat = [clean(subs[i] if i < len(subs) and subs[i] else sp) for i, sp in enumerate(sents)]
    matched = match_cards(cards, nat, total, durs)
    beats, acc = [], 0.0
    y, m, d = date.split("-")
    tanggal = f"{int(d)} {BULAN[int(m) - 1]} {y}"
    for i, sp in enumerate(sents):
        sub = clean(subs[i] if i < len(subs) and subs[i] else sp)
        card = clean(matched[i] or item.get("judul", ""))
        b = {"start": round(acc, 3), "end": round(acc + durs[i], 3), "speak": round(speaks[i], 3), "kicker": sub, "_card": card}
        prev_card = beats[-1]["_card"] if beats else None
        num = parse_number(card)
        if num:
            digits = re.sub(r"\D", "", NUM.search(card).group(1))
            year_like = (num[1] == 0 and 1900 <= num[0] <= 2100) or (num[1] == 0 and num[0] < 10)
            if year_like or digits not in re.sub(r"[^\d ]", "", sub).replace(" ", " ").split() and digits not in re.sub(r"\D", "", sub):
                num = None  # only count up numbers the voice actually says, never years
        if card == prev_card and len(sub.split()) <= 7:
            card = sub.rstrip(".")  # same on-screen card again: let the spoken line be the headline
            num = None
        chips = chips_from(sub)
        if i == 0:
            b.update(type="hook", pill=f"{CH['pill']} · {tanggal}", head=sc(card), sticker=CH["stickers"]["hook"])
        elif i == len(sents) - 1:
            b.update(type="cta", tag=CH["cta_tag"], head=CH["cta_head"], sticker=CH["stickers"]["cta"])
        elif chips:
            b.update(type="chips", head=sc(card), chips=chips)
        elif num:
            value, dec, before, after = num
            prefix = ""
            if before.lower().endswith("rp"):
                before, prefix = before[:-2].strip(), "Rp"
            lead = before or " ".join(w for w in sub.split()[:2] if not any(c.isdigit() for c in w)).rstrip(",.?!")
            b.update(type="number", head=sc(lead), tag="fakta", value=value, decimals=dec, prefix=prefix,
                     suffix=sc(after)[:14], sticker=CH["stickers"]["number"] if value >= 100 else None)
        else:
            b.update(type="text", head=sc(card))
        beats.append(b)
        acc += durs[i]
    for b in beats:
        b.pop("_card", None)
    src = ", ".join(s.get("nama", "") for s in item.get("sumber", [])[:2])
    avatar = next((ROOT / "assets" / n for n in ("profile.png", "profile.jpg") if (ROOT / "assets" / n).exists()), None)
    return {"theme": CH["theme"], "kategori": item.get("kategori", "Berita Game"), "handle": CH["handle"], "sumber": src,
            "avatar": avatar.as_uri() if avatar else None, "beats": beats, "total": round(total + 0.3, 3)}


def render_item_anim(item, idx, date, outdir, tmp):
    sents = [s.strip() for s in item.get("naskah_vo", []) if s.strip()]
    if not sents:
        raise RuntimeError("naskah_vo kosong")
    tmp.mkdir(parents=True, exist_ok=True)
    speaks, durs = [], []
    for i, s in enumerate(sents):
        a = tmp / f"s{i}.aiff"
        tts(s, a)
        speaks.append(duration(a))
        durs.append(speaks[-1] + GAP + 0.15)  # a little air so each scene can land
    scene = build_scene(item, date, sents, item.get("subtitle") or [], durs, speaks)
    (tmp / "scene.json").write_text(json.dumps(scene, ensure_ascii=False), encoding="utf-8")

    ain, af = [], []
    for i in range(len(sents)):
        ain += ["-i", str(tmp / f"s{i}.aiff")]
        af.append(f"[{i}:a]aresample=44100,apad=pad_dur={durs[i] - speaks[i]:.3f}[a{i}]")
    af.append("".join(f"[a{i}]" for i in range(len(sents))) + f"concat=n={len(sents)}:v=0:a=1[aout]")
    audio = tmp / "voice.m4a"
    run([FFMPEG, "-y", "-hide_banner", "-loglevel", "error", *ain, "-filter_complex", ";".join(af), "-map", "[aout]", "-c:a", "aac", "-b:a", "128k", str(audio)])

    silent = tmp / "silent.mp4"
    node = shutil.which("node") or "/usr/local/bin/node"
    r = subprocess.run([node, str(ROOT / "tools/anim/render.mjs"), str(tmp / "scene.json"), str(silent), str(FPS)],
                       capture_output=True, text=True, env={**os.environ, "FFMPEG": FFMPEG})
    if r.returncode != 0:
        raise RuntimeError("render anim gagal: " + (r.stderr or r.stdout)[-800:])

    name = f"{idx + 1:02d}-{slug(item.get('judul', ''))}"
    outdir.mkdir(parents=True, exist_ok=True)
    mp4 = outdir / f"{name}.mp4"
    run([FFMPEG, "-y", "-hide_banner", "-loglevel", "error", "-i", str(silent), "-i", str(audio), "-map", "0:v", "-map", "1:a",
         "-c:v", "copy", "-c:a", "copy", "-shortest", "-movflags", "+faststart", str(mp4)])
    poster = outdir / f"{name}.jpg"
    run([FFMPEG, "-y", "-hide_banner", "-loglevel", "error", "-ss", "1.2", "-i", str(mp4), "-frames:v", "1", "-vf", "scale=540:-1", str(poster)])
    return mp4, poster, round(sum(durs), 1)


# ------------------------------------------------------------------ "remotion" style (default): tools/remotion GlitchReel composition
REMOTION = ROOT / "tools/remotion"


def tts_script(sents, out_mp3):
    """Read the whole script in ONE pass (natural flow between sentences) and return per-sentence (start, speak_end)
    from Ardi's word timings. Returns None if edge-tts is unavailable, so the caller falls back to per-sentence TTS."""
    if TTS not in ("edge", "gemini"):
        return None
    try:
        import asyncio
        import edge_tts
    except ImportError:
        return None
    joined = " ".join(sents)
    words, audio = [], bytearray()

    async def go():
        c = edge_tts.Communicate(joined, EDGE_VOICE, rate=EDGE_RATE, pitch=EDGE_PITCH, boundary="WordBoundary")
        async for ch in c.stream():
            if ch["type"] == "audio":
                audio.extend(ch["data"])
            elif ch["type"] == "WordBoundary":
                words.append((ch["offset"] / 1e7, ch["duration"] / 1e7, ch["text"]))

    try:
        asyncio.run(go())
    except Exception as e:  # offline, rate-limited, ...
        print(f"edge-tts gagal ({e}); pakai TTS per kalimat", file=sys.stderr)
        return None
    if not words or len(audio) < 1000:
        return None
    Path(out_mp3).write_bytes(bytes(audio))
    # map every word to its character position in the joined script, then find each sentence's first/last word
    starts_c, acc = [], 0
    for s_ in sents:
        starts_c.append(acc)
        acc += len(s_) + 1
    pos, wpos = 0, []
    for _, _, t in words:
        i = joined.find(t, pos)
        wpos.append(i if i >= 0 else pos)
        pos = (i + len(t)) if i >= 0 else pos
    spans = []
    for k, c0 in enumerate(starts_c):
        c1 = starts_c[k + 1] if k + 1 < len(starts_c) else len(joined) + 1
        idx = [j for j, p in enumerate(wpos) if c0 <= p < c1]
        if not idx:
            return None
        spans.append((words[idx[0]][0], words[idx[-1]][0] + words[idx[-1]][1]))
    return spans


LAST_VOICE = {"engine": None}
EXHAUSTED = set()  # models that kept answering 429 in this run: skip them for the remaining videos


def gemini_tts(text, out_wav):
    """Whole script in one call to Google AI Studio TTS, retrying on 429 and trying the lite model (separate quota).
    Returns True on success and records which model spoke in LAST_VOICE."""
    if not GEMINI_KEY_FILE.exists():
        return False
    import base64
    import ssl
    import time
    import urllib.error
    import urllib.request
    try:
        import certifi
        ctx = ssl.create_default_context(cafile=certifi.where())
    except ImportError:  # python.org builds on macOS ship without a CA bundle
        ctx = ssl.create_default_context()
    key = GEMINI_KEY_FILE.read_text().strip()
    voice = os.environ.get("GP_GEMINI_VOICE") or CH["voice"]
    style = CH["style"] or GEMINI_STYLE
    for model in [m for m in dict.fromkeys(CH["models"]) if m not in EXHAUSTED]:
        body = {
            "model": model,
            "input": [{"type": "user_input", "content": [{"type": "text", "text": text,
                                                          "annotations": [{"type": "speech_metadata", "style": style}]}]}],
            "response_format": {"type": "audio"},
            "generation_config": {"speech_config": [{"voice": voice}]},
        }
        for attempt in range(3):
            req = urllib.request.Request("https://generativelanguage.googleapis.com/v1beta/interactions", data=json.dumps(body).encode(),
                                         headers={"Content-Type": "application/json", "x-goog-api-key": key})
            try:
                with urllib.request.urlopen(req, timeout=180, context=ctx) as r:
                    d = json.load(r)
                data = next(c["data"] for st in d.get("steps", []) for c in st.get("content", []) if c.get("type") == "audio")
                Path(out_wav).write_bytes(base64.b64decode(data))
                LAST_VOICE["engine"] = f"{model}/{voice}"
                return True
            except urllib.error.HTTPError as e:
                if e.code == 429 and attempt == 2:
                    EXHAUSTED.add(model)
                if e.code == 429 and attempt < 2:
                    wait = 40 * (attempt + 1)
                    print(f"gemini {model}: 429, tunggu {wait} dtk lalu coba lagi", file=sys.stderr)
                    time.sleep(wait)
                    continue
                print(f"gemini {model} gagal: HTTP {e.code}", file=sys.stderr)
                break
            except Exception as e:  # network, bad response
                print(f"gemini {model} gagal: {str(e)[:160]}", file=sys.stderr)
                break
    print("semua model Gemini gagal; pakai Ardi", file=sys.stderr)
    return False


def align_by_pauses(audio, sents):
    """No word timings from Gemini: put each sentence boundary on the pause closest to where the character count says it
    should be. Returns [(start, speak_end)] per sentence."""
    r = subprocess.run([FFMPEG, "-hide_banner", "-i", str(audio), "-af", "silencedetect=noise=-38dB:d=0.12", "-f", "null", "-"],
                       capture_output=True, text=True)
    s0 = [float(x) for x in re.findall(r"silence_start: ([\d.]+)", r.stderr)]
    s1 = [float(x) for x in re.findall(r"silence_end: ([\d.]+)", r.stderr)]
    total = duration(audio)
    pauses = list(zip(s0, s1))
    lead = s1[0] if pauses and s0[0] < 0.05 else 0.0
    tail = s0[-1] if pauses and s1[-1] > total - 0.05 else total
    lens = [max(1, len(s)) for s in sents]
    bounds, acc, used = [], 0, -1
    for L in lens[:-1]:
        acc += L
        want = lead + (tail - lead) * acc / sum(lens)
        cands = [(abs((a + b) / 2 - want), j) for j, (a, b) in enumerate(pauses) if j > used and lead < (a + b) / 2 < tail]
        cands = [c for c in cands if c[0] < 1.6]
        if cands:
            _, j = min(cands)
            used = j
            bounds.append(pauses[j])
        else:
            bounds.append((want, want))
    starts = [lead] + [b for _, b in bounds]
    ends = [a for a, _ in bounds] + [tail]
    return list(zip(starts, ends))


_WHISPER = {}


def align_by_whisper(audio, sents):
    """Exact sentence timings for TTS without word marks (Gemini): transcribe the final audio with faster-whisper,
    match the recognised words to the script (difflib) and read each sentence's first/last word time.
    Returns [(start, end)] per sentence, or None when whisper is unavailable or the match is too weak."""
    try:
        from faster_whisper import WhisperModel
    except ImportError:
        return None
    import difflib
    if "m" not in _WHISPER:
        _WHISPER["m"] = WhisperModel("small", device="cpu", compute_type="int8")
    import numpy as np
    # decode with our ffmpeg (faster-whisper's bundled PyAV path breaks with some av versions)
    pcm = subprocess.run([FFMPEG, "-hide_banner", "-loglevel", "error", "-i", str(audio), "-f", "f32le", "-ac", "1", "-ar", "16000", "-"],
                         capture_output=True, check=True).stdout
    segs, _ = _WHISPER["m"].transcribe(np.frombuffer(pcm, np.float32), language="id", word_timestamps=True, vad_filter=False, beam_size=1)
    heard = [(w.word, w.start, w.end) for seg in segs for w in (seg.words or [])]
    norm = lambda t: re.sub(r"[^0-9a-z]", "", t.lower())
    hw = [norm(w) for w, _, _ in heard]
    script, owner = [], []
    for i, snt in enumerate(sents):
        for tok in snt.split():
            if norm(tok):
                script.append(norm(tok))
                owner.append(i)
    if not hw or not script:
        return None
    sm = difflib.SequenceMatcher(None, script, hw, autojunk=False)
    t_of = {}
    for a_, b_, n in sm.get_matching_blocks():
        for k in range(n):
            t_of[a_ + k] = (heard[b_ + k][1], heard[b_ + k][2])
    if len(t_of) < 0.5 * len(script):
        return None
    # fill unmatched script tokens by interpolating between their matched neighbours
    known = sorted(t_of)
    for k in range(len(script)):
        if k in t_of:
            continue
        prev = max((j for j in known if j < k), default=None)
        nxt = min((j for j in known if j > k), default=None)
        if prev is not None and nxt is not None:
            a0, b0 = t_of[prev][1], t_of[nxt][0]
            f = (k - prev) / (nxt - prev)
            t = a0 + (b0 - a0) * f
            t_of[k] = (t, t)
        elif prev is not None:
            t_of[k] = (t_of[prev][1], t_of[prev][1])
        elif nxt is not None:
            t_of[k] = (t_of[nxt][0], t_of[nxt][0])
    spans = []
    for i in range(len(sents)):
        ks = [k for k, o in enumerate(owner) if o == i]
        if not ks:
            spans.append(spans[-1] if spans else (0.0, 0.5))
            continue
        spans.append((t_of[ks[0]][0], t_of[ks[-1]][1]))
    return spans


def tighten(src, dst, keep=KEEP_PAUSE):
    """Cut every pause longer than `keep` seconds down to `keep` (snappy reel delivery).
    Returns a function mapping an original timestamp to the tightened one, so scene timings stay in sync."""
    r = subprocess.run([FFMPEG, "-hide_banner", "-i", str(src), "-af", "silencedetect=noise=-38dB:d=0.2", "-f", "null", "-"],
                       capture_output=True, text=True)
    starts = [float(x) for x in re.findall(r"silence_start: ([\d.]+)", r.stderr)]
    ends = [float(x) for x in re.findall(r"silence_end: ([\d.]+)", r.stderr)]
    total = duration(src)
    cuts = []  # (cut_from, cut_to) in original time; keep half the allowed pause on each side
    for a, b in zip(starts, ends):
        if b - a > keep:
            cuts.append((a + keep / 2, b - keep / 2))
    if not cuts:
        shutil.copy(src, dst)
        return lambda t: t
    keepsegs, prev = [], 0.0
    for a, b in cuts:
        keepsegs.append((prev, a))
        prev = b
    keepsegs.append((prev, total))
    parts = "".join(f"[0:a]atrim={a:.3f}:{b:.3f},asetpts=PTS-STARTPTS[p{i}];" for i, (a, b) in enumerate(keepsegs))
    parts += "".join(f"[p{i}]" for i in range(len(keepsegs))) + f"concat=n={len(keepsegs)}:v=0:a=1[out]"
    run([FFMPEG, "-y", "-hide_banner", "-loglevel", "error", "-i", str(src), "-filter_complex", parts, "-map", "[out]", "-b:a", "192k", str(dst)])

    def remap(t):
        removed = 0.0
        for a, b in cuts:
            if t >= b:
                removed += b - a
            elif t > a:
                removed += t - a
        return t - removed
    return remap


# bright "commercial/lifestyle" voice chain: cut boom & boxiness, lift presence and air, even it out, -14 LUFS like IG/TikTok
VOICE_FX = os.environ.get("GP_VOICE_FX", ",".join([
    "highpass=f=95",
    "equalizer=f=280:t=q:w=1.1:g=-3",
    "equalizer=f=3800:t=q:w=1.3:g=4.5",
    "treble=g=4:f=9000",
    "acompressor=threshold=-21dB:ratio=3.2:attack=4:release=70:makeup=2",
    "loudnorm=I=-14:TP=-1.5:LRA=7",
]))


def polish(src, dst):
    fx = VOICE_FX if TTS != "gemini" or os.environ.get("GP_VOICE_FX") else "highpass=f=70,acompressor=threshold=-20dB:ratio=2:attack=5:release=80,loudnorm=I=-14:TP=-1.5:LRA=7"
    run([FFMPEG, "-y", "-hide_banner", "-loglevel", "error", "-i", str(src), "-af", fx, "-ar", "48000", "-b:a", "192k", str(dst)])


def render_item_remotion(item, idx, date, outdir, tmp):
    sents = [s.strip() for s in item.get("naskah_vo", []) if s.strip()]
    if not sents:
        raise RuntimeError("naskah_vo kosong")
    tmp.mkdir(parents=True, exist_ok=True)
    pub = REMOTION / "public" / "_render"
    pub.mkdir(parents=True, exist_ok=True)
    key = f"{CH['theme']}-{date}-{idx + 1:02d}"
    spans = None
    if TTS == "gemini" and gemini_tts(" ".join(sents), tmp / "gemini.wav"):
        run([FFMPEG, "-y", "-hide_banner", "-loglevel", "error", "-i", str(tmp / "gemini.wav"), "-b:a", "192k", str(tmp / "script.mp3")])
        spans = align_by_pauses(tmp / "script.mp3", sents)
    if spans is None:
        spans = tts_script(sents, tmp / "script.mp3")
        LAST_VOICE["engine"] = f"edge/{EDGE_VOICE}" if spans else f"say/{VOICE}"
    if spans:
        remap = tighten(tmp / "script.mp3", tmp / "tight.mp3")
        polish(tmp / "tight.mp3", tmp / "script.mp3")
        spans = [(remap(a), remap(b)) for a, b in spans]
        if LAST_VOICE.get("engine", "") and LAST_VOICE["engine"].startswith("gemini"):
            spans = align_by_whisper(tmp / "script.mp3", sents) or spans  # Gemini has no word marks
        total_audio = duration(tmp / "script.mp3")
        starts = [0.0] + [max(0.0, a - 0.08) for a, _ in spans[1:]]
        ends = starts[1:] + [total_audio + 0.5]
        durs = [e - s_ for s_, e in zip(starts, ends)]
        speaks = [b - s_ for (_, b), s_ in zip(spans, starts)]
        scene = build_scene(item, date, sents, item.get("subtitle") or [], durs, speaks)
        audio = pub / f"{key}.mp3"
        shutil.copy(tmp / "script.mp3", audio)
        return finish_remotion(item, idx, outdir, tmp, scene, audio, key, sum(durs))

    speaks, durs = [], []
    for i, s in enumerate(sents):
        a = tmp / f"s{i}.aiff"
        tts(s, a)
        speaks.append(duration(a))
        durs.append(speaks[-1] + GAP + 0.15)
    scene = build_scene(item, date, sents, item.get("subtitle") or [], durs, speaks)

    # voiceover: every sentence padded to its beat length, so audio and scenes share one clock
    ain, af = [], []
    for i in range(len(sents)):
        ain += ["-i", str(tmp / f"s{i}.aiff")]
        af.append(f"[{i}:a]aresample=44100,apad=pad_dur={durs[i] - speaks[i]:.3f}[a{i}]")
    af.append("".join(f"[a{i}]" for i in range(len(sents))) + f"concat=n={len(sents)}:v=0:a=1[aout]")
    audio = pub / f"{key}.m4a"
    run([FFMPEG, "-y", "-hide_banner", "-loglevel", "error", *ain, "-filter_complex", ";".join(af), "-map", "[aout]", "-c:a", "aac", "-b:a", "160k", str(audio)])
    return finish_remotion(item, idx, outdir, tmp, scene, audio, key, sum(durs))


def finish_remotion(item, idx, outdir, tmp, scene, audio, key, total):
    shutil.copy(ROOT / "assets/profile.jpg", REMOTION / "public/profile.jpg")
    scene.update(avatar="profile.jpg", audio=f"_render/{audio.name}", total=round(total + 0.2, 3))
    props = tmp / "props.json"
    props.write_text(json.dumps(scene, ensure_ascii=False), encoding="utf-8")

    name = f"{idx + 1:02d}-{slug(item.get('judul', ''))}"
    outdir.mkdir(parents=True, exist_ok=True)
    mp4 = outdir / f"{name}.mp4"
    npx = shutil.which("npx") or "npx"
    try:
        r = subprocess.run([npx, "remotion", "render", "GlitchReel", str(mp4), f"--props={props}", "--license-key=free-license",
                            "--codec=h264", "--crf=20", "--log=error"], cwd=REMOTION, capture_output=True, text=True, stdin=subprocess.DEVNULL)
        if r.returncode != 0:
            raise RuntimeError("remotion render gagal: " + (r.stderr or r.stdout)[-800:])
    finally:
        audio.unlink(missing_ok=True)
    poster = outdir / f"{name}.jpg"
    run([FFMPEG, "-y", "-hide_banner", "-loglevel", "error", "-ss", "1.2", "-i", str(mp4), "-frames:v", "1", "-vf", "scale=540:-1", str(poster)])
    return mp4, poster, round(total, 1)


# ------------------------------------------------------------------ "photo" style: AI photos + word captions (PhotoReel)
CF_DIR = Path.home() / ".glitchplay"
IMG_CACHE = CF_DIR / "imgcache"
IMG_STYLE = ("photorealistic cinematic photograph, natural light, vivid but realistic colors, sharp focus, high detail, "
             "family friendly, vertical composition, no text, no letters, no watermark, no logo")


def cf_image(prompt, out_jpg):
    """FLUX.1 schnell on Cloudflare Workers AI (free daily allocation). Cached by prompt so re-renders cost nothing."""
    import base64
    import hashlib
    import ssl
    import urllib.request
    IMG_CACHE.mkdir(parents=True, exist_ok=True)
    full = f"{prompt.strip().rstrip('.')}. {CH.get('img_style') or IMG_STYLE}"
    cached = IMG_CACHE / (hashlib.sha1(full.encode()).hexdigest()[:16] + ".jpg")
    if not cached.exists():
        acct = (CF_DIR / "cf_account").read_text().strip()
        tok = (CF_DIR / "cf_token").read_text().strip()
        try:
            import certifi
            ctx = ssl.create_default_context(cafile=certifi.where())
        except ImportError:
            ctx = ssl.create_default_context()
        req = urllib.request.Request(
            f"https://api.cloudflare.com/client/v4/accounts/{acct}/ai/run/@cf/black-forest-labs/flux-1-schnell",
            data=json.dumps({"prompt": full[:2000], "steps": 4}).encode(),  # schnell is built for 4 steps; 8 doubles the neuron cost
            headers={"Authorization": f"Bearer {tok}", "Content-Type": "application/json"})
        import time
        import urllib.error
        for attempt in range(5):
            try:
                with urllib.request.urlopen(req, timeout=180, context=ctx) as r:
                    d = json.load(r)
                break
            except urllib.error.HTTPError as e:
                body = e.read().decode(errors="ignore")
                if "daily free allocation" in body:  # resets 00:00 UTC (07:00 WIB); retrying now is pointless
                    raise RuntimeError("kuota gambar gratis Cloudflare hari ini habis (reset 07:00 WIB)")
                if e.code == 429 and attempt < 4:  # per-minute rate limit: back off and retry
                    time.sleep(20 * (attempt + 1))
                    continue
                raise
        img = (d.get("result") or {}).get("image")
        if not img:
            raise RuntimeError(f"cloudflare: tidak ada gambar ({str(d)[:200]})")
        raw = tmp_raw = cached.with_suffix(".raw")
        tmp_raw.write_bytes(base64.b64decode(img))
        # normalise to a 1080x1920 cover crop so every photo fills the frame the same way
        run([FFMPEG, "-y", "-hide_banner", "-loglevel", "error", "-i", str(raw),
             "-vf", "scale=1080:1920:force_original_aspect_ratio=increase:flags=lanczos,crop=1080:1920", "-q:v", "3", str(cached)])
        tmp_raw.unlink()
    shutil.copy(cached, out_jpg)


def _get_json(url, headers=None):
    import ssl
    import urllib.request
    try:
        import certifi
        ctx = ssl.create_default_context(cafile=certifi.where())
    except ImportError:
        ctx = ssl.create_default_context()
    req = urllib.request.Request(url, headers={"User-Agent": "GlitchPlayHQ/1.0", **(headers or {})})
    with urllib.request.urlopen(req, timeout=60, context=ctx) as r:
        return json.load(r) if "json" in (r.headers.get("Content-Type") or "json") else r.read()


def _download(url, path):
    import ssl
    import urllib.request
    try:
        import certifi
        ctx = ssl.create_default_context(cafile=certifi.where())
    except ImportError:
        ctx = ssl.create_default_context()
    req = urllib.request.Request(url, headers={"User-Agent": "GlitchPlayHQ/1.0"})
    with urllib.request.urlopen(req, timeout=120, context=ctx) as r:
        Path(path).write_bytes(r.read())


def _norm_title(t):
    return re.sub(r"[^a-z0-9]", "", t.lower().replace("&", "and"))


def _title_words(t):
    return re.findall(r"[a-z0-9]+", t.lower().replace("&", "and"))


def _same_game(name, title):
    """Exact title, or the title as whole leading words ('Monster Hunter Wilds: Deluxe' ok, 'GTA VI' != 'GTA Vice City')."""
    if _norm_title(name) == _norm_title(title):
        return True
    n, t = _title_words(name), _title_words(title)
    bad = {"soundtrack", "dlc", "pack", "decoration", "costume", "skin", "bundle", "demo", "artbook"}
    return len(n) >= len(t) and n[:len(t)] == t and not bad & set(n[len(t):])


FOOTAGE = Path(os.environ.get("GP_FOOTAGE", str(Path.home() / "GlitchPlay-Footage")))
VIDEO_EXT = (".mp4", ".mov", ".m4v", ".mkv", ".webm")


def footage_dir(title):
    """User-supplied gameplay clips: ~/GlitchPlay-Footage/<game>/ (folder name or a line in alias.txt matches the title)."""
    if not FOOTAGE.is_dir():
        return None
    want = _norm_title(title)
    for d in FOOTAGE.iterdir():
        if not d.is_dir():
            continue
        names = [d.name] + ((d / "alias.txt").read_text(encoding="utf-8").splitlines() if (d / "alias.txt").exists() else [])
        if any(_norm_title(x) == want or (_norm_title(x) and _same_game(title, x)) for x in names if x.strip()):
            if any(f.suffix.lower() in VIDEO_EXT for f in d.iterdir()):
                return d
    return None


def footage_clip(title, n, out_mp4, dur=10):
    """Muted vertical cut from the user's own gameplay clips for this game. Returns the credit text (kredit.txt) or ''."""
    d = footage_dir(title)
    if not d:
        raise RuntimeError(f"tidak ada klip di {FOOTAGE}/{title}")
    clips = sorted(f for f in d.iterdir() if f.suffix.lower() in VIDEO_EXT)
    clip = clips[n % len(clips)]
    r = subprocess.run([FFMPEG, "-hide_banner", "-i", str(clip)], capture_output=True, text=True)
    m = re.search(r"Duration: (\d+):(\d+):([\d.]+)", r.stderr)
    length = int(m.group(1)) * 3600 + int(m.group(2)) * 60 + float(m.group(3)) if m else dur
    span = max(0.0, length - dur)
    start = (span * ((n * 0.37) % 1)) if span > 0 else 0.0  # spread picks across the clip
    vf = ("split[a][b];[a]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,boxblur=24:2,eq=brightness=-0.12[bg];"
          "[b]scale=1080:1920:force_original_aspect_ratio=decrease:flags=lanczos[fg];[bg][fg]overlay=(W-w)/2:(H-h)/2,fps=30")
    run([FFMPEG, "-y", "-hide_banner", "-loglevel", "error", "-ss", f"{start:.2f}", "-i", str(clip), "-t", str(dur), "-an", "-vf", vf,
         "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-pix_fmt", "yuv420p", "-movflags", "+faststart", str(out_mp4)])
    kf = d / "kredit.txt"
    return kf.read_text(encoding="utf-8").strip() if kf.exists() else ""


def channel_entries(title):
    """Lines of ~/GlitchPlay-Footage/channels.txt for this game: 'Game | channel URL | credit name'.
    Only channels the user listed (gamers who allow clipping) are ever used."""
    f = FOOTAGE / "channels.txt"
    if not f.exists():
        return []
    out = []
    for line in f.read_text(encoding="utf-8").splitlines():
        if not line.strip() or line.lstrip().startswith("#") or line.count("|") < 1:
            continue
        parts = [x.strip() for x in line.split("|")]
        game, url = parts[0], parts[1]
        credit = parts[2] if len(parts) > 2 and parts[2] else url.rstrip("/").split("/")[-1]
        games = [g.strip() for g in game.split(",")]
        if url.startswith("http") and any(_norm_title(g) == _norm_title(title) or _same_game(title, g) or _same_game(g, title) for g in games):
            out.append((url, credit, len(games) == 1))
    return out


def channel_clip(title, n, out_mp4, dur=10):
    """Automatic B-roll from a listed gamer's recent uploads: pick a recent video about the game, download only a short
    section with yt-dlp, return it muted and vertical. Returns the credit name."""
    import hashlib
    ytdlp = str(Path(sys.executable).with_name("yt-dlp"))
    entries = channel_entries(title)
    if not entries:
        v, credit = cc_search(title, n, ytdlp)
        return _cut_clip(v, n, out_mp4, dur, ytdlp) and credit
    url, credit, only_game = entries[n % len(entries)]
    lst = None
    for src in ([url.rstrip("/") + "/videos", url] if "/@" in url or "/channel/" in url or "/c/" in url else [url]):
        lst = subprocess.run([ytdlp, "--flat-playlist", "-I", "1:20", "-J", src], capture_output=True, text=True, timeout=120)
        if lst.returncode == 0:
            break
    if lst.returncode != 0:
        raise RuntimeError("yt-dlp gagal membaca channel: " + lst.stderr[-200:])
    vids = [e for e in (json.loads(lst.stdout).get("entries") or []) if e.get("id") and (e.get("duration") or 0) >= 120]
    words = [w for w in _title_words(title) if len(w) > 2]
    about = [e for e in vids if any(w in (e.get("title") or "").lower() for w in words)]
    if not about and only_game:  # a channel listed for just this game: any recent upload is about it
        about = vids
    if not about:
        raise RuntimeError("tidak ada video yang cocok di channel")
    v = about[(n // len(entries)) % len(about)]
    return _cut_clip(v, n, out_mp4, dur, ytdlp) and credit


_CC_CACHE = {}


def cc_search(title, n, ytdlp):
    """No channel listed: search YouTube for gameplay published under Creative Commons (reuse allowed with credit) and
    double-check each video's license. Credit = the uploader's channel name."""
    from urllib.parse import quote
    if title not in _CC_CACHE:
        found = []
        url = f"https://www.youtube.com/results?search_query={quote(title + ' gameplay')}&sp=EgIwAQ%253D%253D"
        lst = subprocess.run([ytdlp, "--flat-playlist", "-I", "1:15", "-J", url], capture_output=True, text=True, timeout=120)
        words = [w for w in _title_words(title) if len(w) > 2]
        cands = [e for e in (json.loads(lst.stdout).get("entries") or []) if lst.returncode == 0] if lst.stdout else []
        for e in cands:
            if not e.get("id") or not (90 <= (e.get("duration") or 0) <= 3 * 3600):
                continue
            if words and not any(w in (e.get("title") or "").lower() for w in words):
                continue
            meta = subprocess.run([ytdlp, "-J", "--skip-download", "--no-warnings", f"https://www.youtube.com/watch?v={e['id']}"],
                                  capture_output=True, text=True, timeout=90)
            if meta.returncode != 0:
                continue
            info = json.loads(meta.stdout)
            if "creative commons" not in (info.get("license") or "").lower():
                continue
            found.append(({"id": e["id"], "duration": info.get("duration")}, info.get("channel") or info.get("uploader") or "YouTube"))
            if len(found) >= 3:
                break
        _CC_CACHE[title] = found
    found = _CC_CACHE[title]
    if not found:
        raise RuntimeError(f"tidak ada klip Creative Commons untuk {title}")
    return found[n % len(found)]


def _cut_clip(v, n, out_mp4, dur, ytdlp):
    import hashlib
    length = v.get("duration") or 600
    start = int(min(max(60, length * 0.25) + 37 * n, max(0, length - dur - 5)))
    IMG_CACHE.mkdir(parents=True, exist_ok=True)
    cached = IMG_CACHE / ("c" + hashlib.sha1(f"{v['id']}|{start}|{dur}".encode()).hexdigest()[:15] + ".mp4")
    if not cached.exists():
        raw = IMG_CACHE / f"_dl_{v['id']}_{start}.mp4"
        r = subprocess.run([ytdlp, "-q", "--no-warnings", "-f", "bv*[height<=720][ext=mp4]/bv*[height<=720]/b[height<=720]",
                            "--download-sections", f"*{start}-{start + dur + 1}", "--ffmpeg-location", str(Path(FFMPEG).parent),
                            "-o", str(raw), f"https://www.youtube.com/watch?v={v['id']}"], capture_output=True, text=True, timeout=300)
        got = next(iter(IMG_CACHE.glob(f"_dl_{v['id']}_{start}*")), None)
        if r.returncode != 0 or not got:
            raise RuntimeError("yt-dlp gagal mengunduh potongan: " + r.stderr[-200:])
        vf = ("split[a][b];[a]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,boxblur=24:2,eq=brightness=-0.12[bg];"
              "[b]scale=1080:1920:force_original_aspect_ratio=decrease:flags=lanczos[fg];[bg][fg]overlay=(W-w)/2:(H-h)/2,fps=30")
        run([FFMPEG, "-y", "-hide_banner", "-loglevel", "error", "-i", str(got), "-t", str(dur), "-an", "-vf", vf,
             "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-pix_fmt", "yuv420p", "-movflags", "+faststart", str(cached)])
        got.unlink(missing_ok=True)
    shutil.copy(cached, out_mp4)
    return True


def steam_app(title):
    """Steam store data for a game (exact / whole-word title match) or None."""
    from urllib.parse import quote
    want = _norm_title(title)
    items = _get_json(f"https://store.steampowered.com/api/storesearch/?term={quote(title)}&l=english&cc=ID").get("items", [])
    best = next((i for i in items if _norm_title(i["name"]) == want), None) or next((i for i in items if _same_game(i["name"], title)), None)
    if not best:
        return None
    return _get_json(f"https://store.steampowered.com/api/appdetails?appids={best['id']}&l=english")[str(best["id"])].get("data")


def game_trailer(title, n, out_mp4, dur=12):
    """A muted, vertical 1080x1920 cut of an official Steam trailer (HLS). n picks a different trailer/moment each time.
    Muted on purpose: trailer music is what triggers copyright claims; our narration carries the sound."""
    import hashlib
    IMG_CACHE.mkdir(parents=True, exist_ok=True)
    cached = IMG_CACHE / ("t2" + hashlib.sha1(f"{title}|{n}|{dur}".encode()).hexdigest()[:14] + ".mp4")
    if not cached.exists():
        d = steam_app(title) or {}
        movies = [m for m in d.get("movies", []) if m.get("hls_h264")]
        if not movies:
            raise RuntimeError(f"trailer '{title}' tidak ditemukan")
        # gameplay trailers first (fewer title cards), then the rest
        movies.sort(key=lambda m: 0 if "gameplay" in (m.get("name") or "").lower() else 1)
        mv = movies[n % len(movies)]
        start = 18 + 16 * (n // len(movies))  # past publisher logos / opening title cards
        # whole 16:9 frame centred over a blurred, zoomed copy of itself, so on-screen text in the trailer is never cut
        vf = ("split[a][b];[a]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,boxblur=24:2,eq=brightness=-0.12[bg];"
              "[b]scale=1080:-2:flags=lanczos[fg];[bg][fg]overlay=(W-w)/2:(H-h)/2,fps=30")
        run([FFMPEG, "-y", "-hide_banner", "-loglevel", "error", "-ss", str(start), "-i", mv["hls_h264"], "-t", str(dur), "-an",
             "-vf", vf,
             "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-pix_fmt", "yuv420p", "-movflags", "+faststart", str(cached)])
    shutil.copy(cached, out_mp4)


_STEAM_CACHE = {}


def steam_app_cached(title):
    if title not in _STEAM_CACHE:
        try:
            _STEAM_CACHE[title] = steam_app(title)
        except Exception:
            _STEAM_CACHE[title] = None
    return _STEAM_CACHE[title]


def game_screens(title):
    """Official screenshot URLs for a game: Steam store first (no key), then RAWG (free key in ~/.glitchplay/rawg_key)."""
    from urllib.parse import quote
    want = _norm_title(title)
    try:
        items = _get_json(f"https://store.steampowered.com/api/storesearch/?term={quote(title)}&l=english&cc=ID").get("items", [])
        best = next((i for i in items if _norm_title(i["name"]) == want), None) or \
            next((i for i in items if _same_game(i["name"], title)), None)
        if best:
            d = _get_json(f"https://store.steampowered.com/api/appdetails?appids={best['id']}&l=english")[str(best["id"])].get("data", {})
            shots = [x["path_full"] for x in d.get("screenshots", [])]
            if shots:
                return shots, "Steam"
    except Exception as e:  # network hiccup: try the next source
        print(f"steam: {e}", file=sys.stderr)
    keyf = CF_DIR / "rawg_key"
    if keyf.exists():
        key = keyf.read_text().strip()
        try:
            res = _get_json(f"https://api.rawg.io/api/games?search={quote(title)}&page_size=5&key={key}").get("results", [])
            g = next((r for r in res if _norm_title(r["name"]) == want), None) or next((r for r in res if _same_game(r["name"], title)), None)
            if g:
                ss = _get_json(f"https://api.rawg.io/api/games/{g['id']}/screenshots?key={key}").get("results", [])
                shots = [x["image"] for x in ss] or ([g["background_image"]] if g.get("background_image") else [])
                if shots:
                    return shots, "RAWG"
        except Exception as e:
            print(f"rawg: {e}", file=sys.stderr)
    return [], None


def game_image(title, n, out_jpg):
    """n-th official screenshot of `title`, cropped to a 1080x1920 cover. Raises if the game has no screenshots."""
    import hashlib
    IMG_CACHE.mkdir(parents=True, exist_ok=True)
    cached = IMG_CACHE / ("g" + hashlib.sha1(f"{title}|{n}".encode()).hexdigest()[:15] + ".jpg")
    if not cached.exists():
        shots, src = game_screens(title)
        if not shots:
            raise RuntimeError(f"screenshot '{title}' tidak ditemukan")
        raw = cached.with_suffix(".raw")
        _download(shots[n % len(shots)], raw)
        run([FFMPEG, "-y", "-hide_banner", "-loglevel", "error", "-i", str(raw),
             "-vf", "scale=1080:1920:force_original_aspect_ratio=increase:flags=lanczos,crop=1080:1920", "-q:v", "3", str(cached)])
        raw.unlink()
    shutil.copy(cached, out_jpg)


def word_timings(subs, spans):
    """Spread each sentence's words over its spoken span (weighted by length) and group them into 2-3 word chunks."""
    words, chunk = [], 0
    for sub, (a, b) in zip(subs, spans):
        toks = [w for w in clean(sub).split() if w]
        if not toks:
            continue
        weights = [len(w.strip(".,!?")) + 2 for w in toks]
        total = sum(weights)
        t, n_in_chunk = a, 0
        for w, wt in zip(toks, weights):
            d = (b - a) * wt / total
            words.append({"text": w, "start": round(t, 3), "end": round(t + d, 3), "chunk": chunk})
            t += d
            n_in_chunk += 1
            if n_in_chunk >= 3 or (n_in_chunk >= 2 and len(w) > 6) or w[-1] in ".,!?":
                chunk += 1
                n_in_chunk = 0
        if n_in_chunk:
            chunk += 1
    return words


def hook_text(item):
    """Big opening card: the writer's `hook_layar`, else the first on-screen card (emoji stripped), max 6 words."""
    t = (item.get("hook_layar") or "").strip()
    if not t:
        cards = item.get("teks_layar") or []
        t = (cards[0].get("teks") if cards and isinstance(cards[0], dict) else "") or ""
    t = re.sub(r"[^\w\s?!%,.:+'-]", "", t, flags=re.UNICODE).strip()
    return " ".join(t.split()[:6]) or None


def render_item_photo(item, idx, date, outdir, tmp):
    sents = [s.strip() for s in item.get("naskah_vo", []) if s.strip()]
    scenes_in = item.get("adegan") or []
    if not sents:
        raise RuntimeError("naskah_vo kosong")
    if not scenes_in:
        raise RuntimeError("item belum punya 'adegan' (prompt gambar)")
    tmp.mkdir(parents=True, exist_ok=True)
    pub = REMOTION / "public" / "_render"
    pub.mkdir(parents=True, exist_ok=True)
    key = f"photo-{CH['theme']}-{date}-{idx + 1:02d}"

    # photos first: if the free image quota is gone we fail before spending a voice (TTS) request
    imgs, games_used, game_count, credits = [], [], {}, []
    for n, sc in enumerate(scenes_in):
        img = pub / f"{key}-{n + 1:02d}.jpg"
        game = (sc.get("game") or "").strip()
        if game and footage_dir(game):
            vid = pub / f"{key}-{n + 1:02d}.mp4"
            try:  # the user's own / permitted gameplay clips beat everything else
                c = footage_clip(game, game_count.get(game, 0), vid)
                game_count[game] = game_count.get(game, 0) + 1
                if c and c not in credits:
                    credits.append(c)
                if game not in games_used:
                    games_used.append(game)
                imgs.append(vid)
                continue
            except Exception as e:
                print(f"[klip] {game}: {e}", file=sys.stderr)
        if game and (sc.get("trailer") or not steam_app_cached(game)):
            vid = pub / f"{key}-{n + 1:02d}.mp4"
            try:  # automatic gameplay: a gamer listed in channels.txt, else a Creative Commons video found by search
                c = channel_clip(game, game_count.get(game, 0), vid)
                game_count[game] = game_count.get(game, 0) + 1
                if c and c not in credits:
                    credits.append(c)
                if game not in games_used:
                    games_used.append(game)
                imgs.append(vid)
                continue
            except Exception as e:
                print(f"[channel] {game}: {e}", file=sys.stderr)
        if game and sc.get("trailer"):
            vid = pub / f"{key}-{n + 1:02d}.mp4"
            try:  # muted cut of the official Steam trailer
                game_trailer(game, game_count.get(game, 0), vid)
                game_count[game] = game_count.get(game, 0) + 1
                if game not in games_used:
                    games_used.append(game)
                imgs.append(vid)
                continue
            except Exception as e:
                print(f"[trailer] {game}: {e}; pakai screenshot/foto", file=sys.stderr)
        if game:
            try:  # official screenshot of the game in the news (different shot each time the game repeats)
                game_image(game, game_count.get(game, 0), img)
                game_count[game] = game_count.get(game, 0) + 1
                if game not in games_used:
                    games_used.append(game)
                imgs.append(img)
                continue
            except Exception as e:
                print(f"[gambar] {game}: {e}; pakai foto AI", file=sys.stderr)
        if not sc.get("prompt"):
            raise RuntimeError(f"adegan {n + 1} tidak punya game yang ketemu maupun prompt")
        prompt = sc["prompt"]
        if sc.get("nabi"):  # the Prophet ﷺ: never a visible face (Remotion also lays a light over it)
            prompt += (". The Prophet figure is seen from behind or from far away, standing in the center of the frame, "
                       "his face completely hidden by a bright radiant white-golden light, no facial features visible")
        cf_image(prompt, img)
        imgs.append(img)

    spans = None
    if TTS == "gemini" and gemini_tts(" ".join(sents), tmp / "gemini.wav"):
        run([FFMPEG, "-y", "-hide_banner", "-loglevel", "error", "-i", str(tmp / "gemini.wav"), "-b:a", "192k", str(tmp / "script.mp3")])
        spans = align_by_pauses(tmp / "script.mp3", sents)
    if spans is None:
        spans = tts_script(sents, tmp / "script.mp3")
        LAST_VOICE["engine"] = f"edge/{EDGE_VOICE}" if spans else None
    if not spans:
        raise RuntimeError("TTS gagal")
    remap = tighten(tmp / "script.mp3", tmp / "tight.mp3")
    polish(tmp / "tight.mp3", tmp / "script.mp3")
    spans = [(remap(a), remap(b)) for a, b in spans]
    exact = align_by_whisper(tmp / "script.mp3", sents)  # word-accurate timings on the final audio
    if exact:
        spans = exact
    total = duration(tmp / "script.mp3") + 0.6
    audio = pub / f"{key}.mp3"
    shutil.copy(tmp / "script.mp3", audio)

    subs = item.get("subtitle") or sents
    words = word_timings(subs, spans)

    # one photo per scene; a scene starts at the first sentence it covers
    starts = [0.0] + [spans[k][0] - 0.1 for k in range(1, len(spans))]
    scenes = []
    for n, sc in enumerate(scenes_in):
        k = max(0, min(len(spans) - 1, int(sc.get("kalimat", 0))))
        nxt = int(scenes_in[n + 1].get("kalimat", len(spans))) if n + 1 < len(scenes_in) else None
        s0 = 0.0 if n == 0 else starts[k]
        s1 = starts[nxt] if nxt is not None and nxt < len(starts) else total
        img = imgs[n]
        s1 = max(s1, s0 + 1)
        # fast pace: a still longer than ~3 s is re-framed every ~2.2 s (new Ken Burns move, hard cut) without spending
        # another picture; clips keep playing
        parts = 1 if img.suffix == ".mp4" else max(1, round((s1 - s0) / 2.2))
        for p in range(parts):
            a0, a1 = s0 + (s1 - s0) * p / parts, s0 + (s1 - s0) * (p + 1) / parts
            scenes.append({"src": f"_render/{img.name}", "start": round(a0, 3), "end": round(a1, 3),
                           "video": img.suffix == ".mp4", "cut": p > 0, "light": bool(sc.get("nabi"))})

    shutil.copy(ROOT / "assets/profile.jpg", REMOTION / "public/profile.jpg")
    label = (("Gambar: " + ", ".join(games_used)) if games_used else CH.get("label") or "Gambar dibuat dengan AI")
    if credits:
        label = "Klip: " + ", ".join(credits) + " · " + label
    props = {"theme": CH["theme"], "handle": CH["handle"], "audio": f"_render/{audio.name}", "avatar": "profile.jpg", "total": round(total, 3),
             "label": label, "hook": hook_text(item), "episode": item.get("episode"),
             "scenes": scenes, "words": words}
    props = {k: v for k, v in props.items() if v is not None}  # optional fields (hook, episode) must be absent, not null
    pfile = tmp / "props.json"
    pfile.write_text(json.dumps(props, ensure_ascii=False), encoding="utf-8")

    name = f"{idx + 1:02d}-{slug(item.get('judul', ''))}"
    outdir.mkdir(parents=True, exist_ok=True)
    mp4 = outdir / f"{name}.mp4"
    npx = shutil.which("npx") or "npx"
    try:
        raw_mp4 = tmp / "photo_raw.mp4"
        r = subprocess.run([npx, "remotion", "render", "PhotoReel", str(raw_mp4), f"--props={pfile}", "--license-key=free-license",
                            "--codec=h264", "--crf=18", "--log=error"], cwd=REMOTION, capture_output=True, text=True, stdin=subprocess.DEVNULL)
        if r.returncode != 0:
            raise RuntimeError("remotion render gagal: " + (r.stderr or r.stdout)[-800:])
        # moving photos are bitrate-hungry: re-encode once with a slower preset so a 2-min Short stays ~15-20 MB
        run([FFMPEG, "-y", "-hide_banner", "-loglevel", "error", "-i", str(raw_mp4), "-c:v", "libx264", "-preset", "slow", "-crf", "26",
             "-pix_fmt", "yuv420p", "-c:a", "copy", "-movflags", "+faststart", str(mp4)])
    finally:
        audio.unlink(missing_ok=True)
        for f in list(pub.glob(f"{key}-*.jpg")) + list(pub.glob(f"{key}-*.mp4")):
            f.unlink()
    poster = outdir / f"{name}.jpg"
    run([FFMPEG, "-y", "-hide_banner", "-loglevel", "error", "-ss", "1.5", "-i", str(mp4), "-frames:v", "1", "-vf", "scale=540:-1", str(poster)])
    return mp4, poster, round(total, 1)


# ------------------------------------------------------------------ status board
def status(*args):
    subprocess.run([sys.executable, str(ROOT / "tools/status.py"), *args], check=False)


# ------------------------------------------------------------------ video storage (GitHub Releases)
# Videos are too big for the Pages site (1 GB limit), so with GP_RELEASE=1 every MP4 goes to a GitHub Release
# "video-<date>" (never marked latest: the APK download uses releases/latest) and the item stores its download URL.
REPO = os.environ.get("GITHUB_REPOSITORY", "malfain/glitchplay-konten")


def _gh(*args, check=True):
    r = subprocess.run([shutil.which("gh") or "gh", *args], capture_output=True, text=True, cwd=ROOT)
    if check and r.returncode != 0:
        raise RuntimeError("gh " + " ".join(args[:2]) + ": " + (r.stderr or r.stdout)[-300:])
    return r


def release_upload(mp4, date):
    tag = f"video-{date}"
    if _gh("release", "view", tag, check=False).returncode != 0:
        r = _gh("release", "create", tag, "--title", f"Video {date}", "--notes", "Video GlitchPlay HQ (otomatis).",
                "--latest=false", check=False)
        if r.returncode != 0 and _gh("release", "view", tag, check=False).returncode != 0:  # the other channel may have made it
            raise RuntimeError("gh release create: " + r.stderr[-300:])
    asset = mp4.with_name(f"{CH['theme']}-{mp4.name}")
    mp4.rename(asset)
    try:
        _gh("release", "upload", tag, str(asset), "--clobber")
    finally:
        asset.unlink(missing_ok=True)
    return f"https://github.com/{REPO}/releases/download/{tag}/{asset.name}"


def release_prune(days):
    """Delete this channel's release videos older than `days` and clear them from the day files."""
    cutoff = (datetime.now(WIB) - timedelta(days=days)).strftime("%Y-%m-%d")
    removed = 0
    for f in sorted((ROOT / CH["data"]).glob("2*.json")):
        if f.stem >= cutoff:
            continue
        data = json.loads(f.read_text(encoding="utf-8"))
        changed = False
        for it in data.get("items", []):
            v = it.get("video") or ""
            if v.startswith("https://") and "/releases/download/" in v:
                tag, name = v.split("/releases/download/")[1].split("/", 1)
                _gh("release", "delete-asset", tag, name, "--yes", check=False)
                if not json.loads(_gh("release", "view", tag, "--json", "assets", check=False).stdout or '{"assets":[1]}').get("assets"):
                    _gh("release", "delete", tag, "--yes", "--cleanup-tag", check=False)
                for k in ("video", "poster", "video_durasi"):
                    it.pop(k, None)
                changed = True
                removed += 1
        if changed:
            f.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return removed


def video_ready(it):
    v = it.get("video")
    return bool(v) and (v.startswith("https://") or (ROOT / v).exists())


def prune(days):
    cutoff = (datetime.now(WIB) - timedelta(days=days)).strftime("%Y-%m-%d")
    vdir = ROOT / CH["video"]
    removed = 0
    if vdir.exists():
        for d in sorted(vdir.iterdir()):
            if d.is_dir() and re.match(r"\d{4}-\d{2}-\d{2}$", d.name) and d.name < cutoff:
                shutil.rmtree(d)
                removed += 1
                f = ROOT / CH["data"] / f"{d.name}.json"
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
    ap.add_argument("--channel", default="glitch", choices=list(CHANNELS), help="glitch = IG GlitchPlay, kids = YouTube anak, sirah = YouTube Glitchplay kisah Nabi")
    ap.add_argument("--style", default=None, choices=["remotion", "photo", "anim", "glitch"],
                    help="remotion = komposisi GlitchReel di tools/remotion (default); anim/glitch = renderer lama")
    a = ap.parse_args()
    CH.clear()
    CH.update(CHANNELS[a.channel])
    a.style = a.style or CH.get("render") or os.environ.get("GP_STYLE", "remotion")

    if a.prune and os.environ.get("GP_RELEASE"):
        n = release_prune(a.prune)
        if n:
            print(f"prune: {n} video lama di Releases dihapus")
    if a.prune:
        n = prune(a.prune)
        if n:
            print(f"prune: {n} folder video lama dihapus")

    f = ROOT / CH["data"] / f"{a.date}.json"
    if not f.exists():
        print(f"tidak ada data {a.date}")
        return 0
    data = json.loads(f.read_text(encoding="utf-8"))
    items = data.get("items", [])
    todo = [i for i, it in enumerate(items)
            if (a.only is None or i == a.only - 1)
            and (a.force or not video_ready(it))]
    if not todo:
        print("semua video sudah ada")
        if not a.no_status:  # clear a stale "error" left by an earlier failed attempt that has since been fixed
            try:
                st = json.loads((ROOT / "data/status.json").read_text(encoding="utf-8"))
                if st.get("agents", {}).get(CH["agent"], {}).get("status") == "error":
                    status("agent", CH["agent"], "selesai", "Semua video sudah jadi, siap di Hasil")
            except (OSError, ValueError):
                pass
        return 0

    outdir = ROOT / CH["video"] / a.date
    tmp_root = ROOT / f".render-tmp-{a.channel}"
    done = 0
    if not a.no_status:
        status("agent", CH["agent"], "kerja", f"Render {len(todo)} video untuk {a.date}")
        if os.environ.get("GP_PUBLISH"):  # let the Kantor board show Studio at work
            subprocess.run([str(ROOT / "tools/publish.sh"), f"status: studio render {a.date}"], check=False)
    for n, i in enumerate(todo, 1):
        it = items[i]
        if n > 1 and a.style == "remotion" and TTS == "gemini":
            import time
            time.sleep(20)  # stay under the free tier's per-minute limit
        if not a.no_status:
            status("agent", CH["agent"], "kerja", f"Render video {n}/{len(todo)}: {it.get('judul', '')[:34]}")
        try:
            fn = {"remotion": render_item_remotion, "photo": render_item_photo, "anim": render_item_anim, "glitch": render_item}[a.style]
            if a.style == "photo" and not it.get("adegan"):
                fn = render_item_remotion  # older kids items without photo prompts keep the animated style
            try:
                mp4, poster, dur = fn(it, i, a.date, outdir, tmp_root / f"{a.date}-{i}")
            except RuntimeError as e:
                if fn is not render_item_photo or "kuota gambar" not in str(e):
                    raise
                # free image quota used up: never leave the day without a video, fall back to the animated style
                print(f"[{i + 1}] {e} → pakai gaya animasi", file=sys.stderr)
                mp4, poster, dur = render_item_remotion(it, i, a.date, outdir, tmp_root / f"{a.date}-{i}-anim")
        except Exception as e:  # keep going with the other items
            print(f"[{i + 1}] gagal: {e}", file=sys.stderr)
            if not a.no_status:
                status("agent", CH["agent"], "error", f"Video {i + 1} gagal: {str(e)[:40]}")
            continue
        size_kb = mp4.stat().st_size // 1024
        try:
            it["video"] = release_upload(mp4, a.date) if os.environ.get("GP_RELEASE") else str(mp4.relative_to(ROOT))
        except Exception as e:
            print(f"[{i + 1}] upload gagal: {e}", file=sys.stderr)
            if not a.no_status:
                status("agent", CH["agent"], "error", f"Upload video {i + 1} gagal")
            continue
        it["poster"] = str(poster.relative_to(ROOT))
        it["video_durasi"] = dur
        if LAST_VOICE["engine"]:
            it["video_suara"] = LAST_VOICE["engine"]
        f.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        done += 1
        print(f"[{i + 1}] {mp4.name}  {dur}s  {size_kb} KB")
    shutil.rmtree(tmp_root, ignore_errors=True)
    if not a.no_status:
        status("agent", CH["agent"], "selesai" if done == len(todo) else "error", f"{done}/{len(todo)} video jadi, siap di Hasil")
    return 0 if done == len(todo) else 1


if __name__ == "__main__":
    sys.exit(main())
