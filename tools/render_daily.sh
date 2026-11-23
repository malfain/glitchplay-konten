#!/bin/bash
# Mac job (launchd, hourly 07:10-23:10 WIB): pull the cloud team's scripts, render missing videos, publish.
set -uo pipefail
export PATH="${GP_NODE_BIN:+$GP_NODE_BIN:}/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin"
cd "$(dirname "$0")/.."
echo "== $(date '+%F %T')"
git pull -q --rebase origin main || { echo "git pull gagal"; exit 1; }
st=$(python3 -c "import json;print(json.load(open('data/status.json')).get('run',{}).get('status',''))" 2>/dev/null)
if [ "$st" = "berjalan" ]; then echo "tim cloud masih kerja, coba lagi jam berikutnya"; exit 0; fi
# Remotion (default style) needs its node_modules; Python needs edge-tts + certifi (Ardi fallback, HTTPS for Gemini)
if [ ! -d tools/remotion/node_modules ]; then (cd tools/remotion && npm install --silent) || { echo "npm install gagal"; exit 1; }; fi
.venv/bin/python -c "import edge_tts, certifi, faster_whisper, yt_dlp" 2>/dev/null || .venv/bin/pip install -q -U edge-tts certifi pillow faster-whisper yt-dlp
today=$(TZ=Asia/Jakarta date +%F)
yday=$(TZ=Asia/Jakarta date -v-1d +%F)
# Studio (Instagram) and Asisten Studio (YouTube kids) render at the same time
(
  for d in "$yday" "$today"; do
    [ -f "data/$d.json" ] || continue
    GP_PUBLISH=1 .venv/bin/python tools/render_video.py --date "$d" --prune 14
  done
) &
(
  for d in "$yday" "$today"; do
    [ -f "data/kids/$d.json" ] || continue
    GP_PUBLISH=1 .venv/bin/python tools/render_video.py --channel kids --date "$d" --prune 14
  done
) &
wait
tools/publish.sh "video: render $today"
