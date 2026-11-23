#!/usr/bin/env bash
# Commit everything under data/ and video/ and push to main, retrying on a race.
# Usage: tools/publish.sh "pesan commit"
set -euo pipefail
cd "$(dirname "$0")/.."
# Studio and Asisten Studio may publish at the same moment: one git writer at a time
lock=.git/gp-publish.lock
for i in $(seq 1 120); do mkdir "$lock" 2>/dev/null && break; sleep 1; done
trap 'rmdir "$lock" 2>/dev/null' EXIT
for f in data/*.json; do python3 -m json.tool "$f" >/dev/null; done
git add data video 2>/dev/null || git add data
git diff --cached --quiet && { echo "tidak ada perubahan"; exit 0; }
git commit -q -m "$1"
for i in 1 2 3; do
  git push -q origin HEAD:main && { echo "pushed: $1"; exit 0; }
  git pull -q --rebase origin main
done
echo "push gagal" >&2
exit 1
