#!/usr/bin/env bash
# Build assets/img/og.jpg — the 1200x630 link preview.
#
#   bash assets/img/src/make-og.sh
#
# Run it from the repo root. Needs node (stdlib only) and ffmpeg built with
# libfreetype, which is what draws the wordmark.
#
# Why it is a script and not a file somebody exported from Figma: three of
# the four layers are already in the repo and would go stale the moment the
# site changed. The brand mark is READ OUT OF index.html, so a change to the
# mark is a change to the og:image; the veil is the same grade as .hero__veil
# and lives next to the numbers it copies; the photograph is the hero's own.
# Only the type is typed twice, and it is two words.
#
# Departure Mono is not in this repo as an .otf (the site self-hosts woff and
# woff2 only), so the script fetches the .otf into a temp dir. It is the same
# font under the same SIL OFL — see assets/fonts/OFL.txt.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
SRC="$ROOT/assets/img/src"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

OTF_URL="https://raw.githubusercontent.com/rektdeckard/departure-mono/main/public/assets/DepartureMono-Regular.otf"

echo "→ fetching Departure Mono"
curl -fsSL "$OTF_URL" -o "$TMP/DepartureMono.otf"

echo "→ rasterising the brand mark out of index.html"
node "$SRC/mark2png.js" "$ROOT/index.html" "$TMP/mark.png"

echo "→ building the veil"
node "$SRC/veil.js" "$TMP/veil.png"

echo "→ composing"
cp "$ROOT/assets/img/branch-1672.jpg" "$TMP/branch.jpg"
cd "$TMP"

# The crop: the photo is 1672x941 (16:9) and og is 1.905:1, so it scales to
# 1200 wide and loses 45px off the top rather than off the bottom — the
# branch and the bird both live in the lower two thirds.
#
# The mark goes at 11x, landing its tail on the right-hand end of the branch
# so it reads as perched rather than pasted. flags=neighbor is not optional:
# any other scaler turns a 26-cell mark into mush.
ffmpeg -y -hide_banner -v error \
  -i branch.jpg -i veil.png -i mark.png \
  -filter_complex "\
[0:v]scale=1200:-1,crop=1200:630:0:45,format=rgba[bg];\
[bg][1:v]overlay=0:0[v1];\
[2:v]scale=286:297:flags=neighbor[jay];\
[v1][jay]overlay=848:250[v2];\
[v2]drawtext=fontfile=DepartureMono.otf:text='FOREST CITY':fontsize=80:fontcolor=0xF3F6F2:x=64:y=322,\
drawtext=fontfile=DepartureMono.otf:text='MARKETING':fontsize=80:fontcolor=0x5CBF8D:x=64:y=410,\
drawbox=x=66:y=518:w=54:h=3:color=0x5CBF8D@1:t=fill,\
drawtext=fontfile=DepartureMono.otf:text='WEBSITES / SIGNS / ADS / SEO':fontsize=25:fontcolor=0xBFCAC1:x=66:y=544,\
drawtext=fontfile=DepartureMono.otf:text='LONDON, ONTARIO':fontsize=25:fontcolor=0x8E9A90:x=66:y=578[out]" \
  -map "[out]" -frames:v 1 og.png

# JPEG, not PNG. The same frame is 715KB as a PNG and 105KB at -q:v 3, and
# it is a photograph — there is nothing for PNG to do here but be large.
# Facebook and LinkedIn refetch this on a schedule; keep it small.
ffmpeg -y -hide_banner -v error -i og.png -q:v 3 "$ROOT/assets/img/og.jpg"

echo "✓ assets/img/og.jpg — $(du -h "$ROOT/assets/img/og.jpg" | cut -f1)"
