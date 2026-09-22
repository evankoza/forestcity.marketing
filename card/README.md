# The business card

3.5 × 2in, double sided, North American standard. Front is the hero at a
fifth of the size; back is the footer's pixel field with the details on it.

```
card/
  card.html                            the artwork — this file IS the card
  london-marketing-solutions-card.pdf  what you send a printer (built; regenerate at will)
  assets/
    jay-card.svg                       the dithered jay, built by src/bird2svg.js
    qr.svg                             the QR code, built by src/qr.js
    mark.svg                           the 26-cell brand mark, lifted out of index.html
  src/
    make-card.sh                       build everything, end to end
    bird2svg.js                        hero dither -> flat-cell SVG
    qr.js                              URL -> QR -> flat-cell SVG
    qr-roundtrip.js                    reads a built QR back, as a check on the encoder
```

## Building it

```bash
bash card/src/make-card.sh
```

Needs node (stdlib only — there are no dependencies and no `npm install`),
python for the local server, and Chrome. It regenerates both SVGs, checks
the QR decodes, serves the repo and prints `card/london-marketing-solutions-card.pdf`.

**It also needs the network**, because three of the four faces come from
Google Fonts. If they do not arrive before Chrome prints, the card is set
in a fallback and the headline rewraps to three lines and past the safe
box. Two things stop that: the font URL asks for `display=block`, so
nothing paints until the real face is there, and the build passes
`--virtual-time-budget=20000`, which holds Chrome's clock until the page
has stopped waiting. **Look at the PDF before sending it** — a headline on
three lines means the fonts did not land, and the fix is to run it again.
Self-hosting the three faces next to Departure Mono would end the problem
for good.

To look at it rather than print it, serve the repo and open
`http://localhost:PORT/card/card.html`. On screen it is a proof sheet: both
faces at actual size, with the trim line drawn in red dashes over the art.
Opening the file straight off disk will not work — the card pulls the
photograph and the fonts out of `../assets`, and `file://` treats each of
those as a different origin.

## What the printer needs to know

- **Two pages**, front then back, each **3.75 × 2.25in**. That is the
  3.5 × 2in card plus **0.125in of bleed** on all four sides.
- **Nothing important is within 0.125in of the trim line.** Checked, not
  assumed: the artwork's type all sits inside a 3.25 × 1.75in safe box.
- **RGB, not CMYK.** Most online printers convert. If yours wants CMYK
  supplied, say so — the greens (`#5CBF8D`) and the jay's blues are the
  values that matter and they want proofing, because a bright screen green
  is the classic thing to lose in conversion.
- **The type is vector, as Type 3 fonts** — Chrome's doing. It prints
  correctly; if a preflight tool reports "fonts not embedded", that is what
  it is looking at, and the answer is to outline the text on export.
- The photograph is embedded as the original JPEG and lands at **201dpi**
  at the size it is used. Well under the 300 a press asks for, and a
  deliberate trade made twice over — see the comment on `--photo-w` in
  card.html. It is defocused bark in near-darkness behind a veil, with no
  fine detail to lose; the jay in front of it is vector and prints at
  whatever the press can hold. A wider original of this photograph is the
  one thing that would improve the front.
- Uncoated or matte stock. The card is nearly black and a gloss finish on a
  dark card shows every fingerprint in the room.

## Changing it

Everything is in inches, in one `<style>` block, with the tokens copied
from the site at the top. The two numbers worth knowing:

- `--toe-x` / `--toe-y` — one point that the photograph and the bird are
  both placed against. The branch is slid until the spot `bird.js` perches
  on is there; the jay is hung so its lowest toe lands on it. Move them and
  the two move together, still touching.
- `--photo-w` — the zoom on the branch. Raising it enlarges the limb and
  costs dpi; there is no bigger original in the repo than 1672px.

The jay and the QR are **built**, not drawn. Re-run their scripts rather
than editing the SVGs:

```bash
node card/src/bird2svg.js card/assets/jay-card.svg 52
node card/src/qr.js "https://forestcity.marketing" card/assets/qr.svg Q
```

`bird2svg.js` runs the hero's own dither — same palette, same tone curve,
same diffusion, same coverage threshold — once, at print resolution, and
prints where the bird's lowest toe ended up. Those numbers are copied from
`bird.js` rather than imported from it, so a change to the dither is two
files: change both, re-run this, and re-print. If you change the cell count, put the two numbers it
prints into `--foot-x` / `--foot-y` in card.html, or the bird will stand
beside the branch instead of on it.

`qr.js` is a QR encoder in 200 lines, byte mode, versions 1–7. It is here
rather than in a package because this card will outlive any dependency the
shop can no longer rebuild. `qr-roundtrip.js` reads a built code back
through the same geometry; that catches a broken payload but NOT a code
that is readable only to itself, so the real check is a phone, and the one
in `assets/qr.svg` has also been decoded by an independent scanner
(jsQR) straight off a 300dpi render of the finished card.

## The name on the back

The wordmark says **London Marketing Solutions**; the line along the bottom
says **London Marketing Solutions Ltd.**, by request.

That `Ltd.` is the one thing on this card worth a second look before it goes
to press. The site deliberately does not carry it — see the SWAP ON
INCORPORATION note in `index.html` — because the incorporation is filed and
not yet granted, and naming a corporation that does not exist is the only
thing on this project that could actually bite. **Do not print until the
certificate is in hand.** If it has not issued by the time you order, drop
the `Ltd.` from the `.legal` line; nothing else on the card depends on it.
When it does issue, make the matching swaps in `index.html` and
`privacy.html` so the three agree.
