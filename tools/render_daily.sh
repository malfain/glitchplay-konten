#!/bin/bash
# Mac job (launchd, hourly 07:10-23:10 WIB): pull the cloud team's scripts, render missing videos, publish.
set -uo pipefail
export PATH="/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin"
cd "$(dirname "$0")/.."
echo "== $(date '+%F %T')"
git pull -q --rebase origin main || { echo "git pull gagal"; exit 1; }
st=$(python3 -c "import json;print(json.load(open('data/status.json')).get('run',{}).get('status',''))" 2>/dev/null)
if [ "$st" = "berjalan" ]; then echo "tim cloud masih kerja, coba lagi jam berikutnya"; exit 0; fi
today=$(TZ=Asia/Jakarta date +%F)
yday=$(TZ=Asia/Jakarta date -v-1d +%F)
for d in "$yday" "$today"; do
  [ -f "data/$d.json" ] || continue
  GP_PUBLISH=1 .venv/bin/python tools/render_video.py --date "$d" --prune 14
done
tools/publish.sh "video: render $today"
