#!/usr/bin/env bash
# Build the business card: artwork first, then the PDF a printer can take.
#
#   bash card/src/make-card.sh
#
# Run it from the repo root. Needs node (stdlib only) and Chrome — Chrome
# because card.html IS the artwork, and the only renderer that agrees with
# itself about a 3.75 x 2.25in page is the one the card was designed in.
#
# It serves the repo over http rather than opening card.html off disk: the
# card pulls the photograph, the fonts and the two generated SVGs out of
# ../assets, and file:// treats every one of those as a separate origin.
#
# Output: card/london-marketing-solutions-card.pdf — two pages, front then back, each
# 3.75 x 2.25in, which is a 3.5 x 2in card with an eighth of an inch of
# bleed all round.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
PORT="${PORT:-4399}"
OUT="$ROOT/card/london-marketing-solutions-card.pdf"

CHROME="${CHROME:-}"
if [ -z "$CHROME" ]; then
  for c in \
    "/c/Program Files/Google/Chrome/Application/chrome.exe" \
    "/c/Program Files (x86)/Google/Chrome/Application/chrome.exe" \
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
    "$(command -v google-chrome || true)" \
    "$(command -v chromium || true)"; do
    [ -x "$c" ] && CHROME="$c" && break
  done
fi
[ -n "$CHROME" ] || { echo "no Chrome found — set CHROME=/path/to/chrome" >&2; exit 1; }

echo "→ dithering the jay"
node "$ROOT/card/src/bird2svg.js" "$ROOT/card/assets/jay-card.svg" 52

echo "→ encoding the QR"
node "$ROOT/card/src/qr.js" "https://forestcity.marketing" "$ROOT/card/assets/qr.svg" Q

echo "→ checking it reads back"
node "$ROOT/card/src/qr-roundtrip.js" "$ROOT/card/assets/qr.svg"

echo "→ serving the repo on :$PORT"
python -m http.server "$PORT" --directory "$ROOT" >/dev/null 2>&1 &
SERVER=$!
trap 'kill $SERVER 2>/dev/null || true' EXIT
# the server needs to be up before Chrome asks for the page, and there is
# nothing to poll that is cheaper than simply waiting a moment
sleep 1

echo "→ printing"
"$CHROME" --headless=new --disable-gpu --no-pdf-header-footer \
  --print-to-pdf="$OUT" "http://localhost:$PORT/card/card.html" 2>&1 | tail -1

echo "✓ $OUT — $(du -h "$OUT" | cut -f1)"
