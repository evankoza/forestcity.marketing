/* Rasterise the jay into an SVG of flat cells, for print.

   The hero dithers the bird in the browser, at CSS-pixel resolution, onto a
   canvas. A canvas is the wrong thing to hand a printer: it has one fixed
   resolution and the press wants 300dpi or better. So the same dither runs
   here, once, and comes out as <path>s — a grid of hard squares is exactly
   what vector geometry is good at, and it prints at whatever the RIP can
   draw.

   The numbers below are bird.js's numbers and they have to stay that way:
   palette, tone curve and diffusion are what make the card's bird and the
   site's bird the same animal. Only the cell COUNT is different, because
   cell size is a function of how wide the bird is drawn, and that is a card
   here rather than a viewport.

   The legs and the body are composited BEFORE dithering — the site keeps
   them apart so the body can bob over static feet, which a printed card has
   no use for. One silhouette also means no seam at the hip.

   Usage: node bird2svg.js <out.svg> [cols]
*/

'use strict';

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const ROOT = path.join(__dirname, '..', '..');
const OUT  = process.argv[2] || path.join(__dirname, '..', 'assets', 'jay-card.svg');
const COLS = parseInt(process.argv[3] || '52', 10);   // cells across the sprite canvas

/* ---- PNG in (8-bit RGBA, non-interlaced — which is what the sprites are) */

function readPNG(file) {
  const buf = fs.readFileSync(file);
  if (buf.readUInt32BE(0) !== 0x89504E47) throw new Error(file + ': not a PNG');
  const w = buf.readUInt32BE(16), h = buf.readUInt32BE(20);
  if (buf[24] !== 8 || buf[25] !== 6 || buf[28] !== 0)
    throw new Error(file + ': want 8-bit RGBA, non-interlaced');

  const idat = [];
  let p = 8;
  while (p < buf.length) {
    const len = buf.readUInt32BE(p);
    const type = buf.toString('latin1', p + 4, p + 8);
    if (type === 'IDAT') idat.push(buf.subarray(p + 8, p + 8 + len));
    if (type === 'IEND') break;
    p += len + 12;
  }
  const raw = zlib.inflateSync(Buffer.concat(idat));

  // unfilter: 4 bytes per pixel, one filter byte per scanline
  const bpp = 4, stride = w * bpp;
  const out = Buffer.alloc(h * stride);
  for (let y = 0; y < h; y++) {
    const ft = raw[y * (stride + 1)];
    const src = y * (stride + 1) + 1;
    const dst = y * stride, up = dst - stride;
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? out[dst + x - bpp] : 0;
      const b = y > 0 ? out[up + x] : 0;
      const c = (x >= bpp && y > 0) ? out[up + x - bpp] : 0;
      let v = raw[src + x];
      if (ft === 1) v += a;
      else if (ft === 2) v += b;
      else if (ft === 3) v += (a + b) >> 1;
      else if (ft === 4) {
        const pp = a + b - c;
        const pa = Math.abs(pp - a), pb = Math.abs(pp - b), pc = Math.abs(pp - c);
        v += (pa <= pb && pa <= pc) ? a : (pb <= pc ? b : c);
      }
      out[dst + x] = v & 0xFF;
    }
  }
  return { w, h, px: out };
}

/* ---- bird.js's constants, unchanged ---------------------------------- */

const SRC_BLACK = 0.10, SRC_WHITE = 0.88, GAMMA = 1.0;
const DIFFUSION = 0.75;
const INK_CEIL_MIX = 0;

const PAPER = [255, 255, 255];
const PAL = [
  PAPER,
  [242, 246, 250],   // #F2F6FA  chest, cheek, wing bar
  [169, 201, 233],   // #A9C9E9  the light blue
  [ 74, 127, 190],   // #4A7FBE  crest, back, wing, tail
  [ 22,  32,  43],   // #16202B  bridle, eye, barring
];
const HEX = PAL.map((p) => '#' + p.map((v) => v.toString(16).padStart(2, '0')).join(''));
const PAL_LUM = PAL.map((p) => (p[0] * 0.299 + p[1] * 0.587 + p[2] * 0.114) / 255);
const LUM_MIN = Math.min(...PAL_LUM);
const INK_TOP = Math.max(...PAL_LUM.slice(1));
const INK_CEIL = INK_TOP + INK_CEIL_MIX * (1 - INK_TOP);

const tone = (Y) => {
  let t = (Y - SRC_BLACK) / (SRC_WHITE - SRC_BLACK);
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  return LUM_MIN + Math.pow(t, GAMMA) * (INK_CEIL - LUM_MIN);
};

/* ---- composite the two sprites, then sample -------------------------- */

const IMG = (f) => readPNG(path.join(ROOT, 'assets', 'img', f));
const legs = IMG('jay legs.png');
const body = IMG('jay leggless left.png');   // the frame the hero opens on
if (legs.w !== body.w || legs.h !== body.h)
  throw new Error('sprites are not on the same canvas');

const W = legs.w, H = legs.h, N = W * H;
const alpha = new Float32Array(N), plum = new Float32Array(N);
const legsAlpha = new Float32Array(N);
for (let i = 0; i < N; i++) {
  // source-over, straight alpha: body over legs
  const la = legs.px[i * 4 + 3] / 255, ba = body.px[i * 4 + 3] / 255;
  legsAlpha[i] = la;
  const a = ba + la * (1 - ba);
  alpha[i] = a;
  if (a <= 0) continue;
  const mix = (k) => (body.px[i * 4 + k] * ba + legs.px[i * 4 + k] * la * (1 - ba)) / a;
  const lum = (mix(0) * 0.299 + mix(1) * 0.587 + mix(2) * 0.114) / 255;
  // PREMULTIPLIED, as in bird.js: the pixels around the bird are transparent
  // black, so any average that counts their colour drags the edge dark.
  plum[i] = lum * a;
}

/* ---- the grid, then Floyd-Steinberg over it -------------------------- */

const step = W / COLS;                     // source px per cell
const ROWS = Math.round(H / step);
const HW = step / 2;                       // half a cell, in source pixels

// bird.js's cellStats(), with the sprite's own grid instead of the page's:
// how much of a cell the bird covers, averaged over the cell's whole
// footprint, and the alpha-weighted colour of the part that is covered.
// Point-sampling the middle of the cell instead is what used to make the
// feet and the tail come out as a different scatter of cells every time.
const cellStats = (sx, sy, cov, col) => {
  let x0 = Math.round(sx - HW), x1 = Math.round(sx + HW) - 1;
  let y0 = Math.round(sy - HW), y1 = Math.round(sy + HW) - 1;
  if (x1 < x0) x1 = x0;
  if (y1 < y0) y1 = y0;
  let sa = 0, sp = 0, n = 0;
  for (let y = y0; y <= y1; y++) {
    if (y < 0 || y >= H) { n += x1 - x0 + 1; continue; }
    for (let x = x0; x <= x1; x++) {
      n++;
      if (x < 0 || x >= W) continue;
      const i = y * W + x;
      sa += cov[i]; sp += col ? col[i] : 0;
    }
  }
  return { a: n ? sa / n : 0, y: sa > 0.002 ? sp / sa : 1 };
};

// COVER, ALLOW_HOLES: bird.js's, and for its reasons — a cell is either in
// the bird or out of it, and the ones that are in are painted in the bird's
// own colour rather than in a blend with the paper. Blending was what put a
// white rim around the site's bird, and on a card it would print as a
// genuine white line rather than as a hole the photograph shows through.
const COVER = 0.35;
const ALLOW_HOLES = INK_CEIL_MIX > 0;

const buf = new Float32Array(COLS * ROWS);
const mask = new Uint8Array(COLS * ROWS);
for (let r = 0; r < ROWS; r++) {
  for (let c = 0; c < COLS; c++) {
    const s = cellStats((c + 0.5) * step, (r + 0.5) * step, alpha, plum);
    if (s.a < COVER) continue;
    mask[r * COLS + c] = 1;
    buf[r * COLS + c] = tone(s.y);
  }
}

const idx = new Uint8Array(COLS * ROWS);
const q0 = ALLOW_HOLES ? 0 : 1;
// error goes only to cells that are also the bird; what would have landed
// outside the silhouette is dropped rather than piled back onto the rim
const push = (j, w, err) => {
  if (j < 0 || j >= COLS * ROWS || !mask[j]) return;
  buf[j] += err * w;
};
for (let r = 0; r < ROWS; r++) {
  const l2r = (r & 1) === 0;                       // serpentine
  for (let k = 0; k < COLS; k++) {
    const c = l2r ? k : COLS - 1 - k;
    const i = r * COLS + c;
    if (!mask[i]) continue;
    const v = buf[i];
    let best = q0, bd = Infinity;
    for (let q = q0; q < PAL.length; q++) {
      const d = Math.abs(v - PAL_LUM[q]);
      if (d < bd) { bd = d; best = q; }
    }
    idx[i] = best;
    const err = (v - PAL_LUM[best]) * DIFFUSION;
    const fwd = l2r ? 1 : -1, cn = c + fwd;
    if (cn >= 0 && cn < COLS) push(i + fwd, 0.4375, err);
    if (r + 1 < ROWS) {
      const b = i + COLS;
      if (c - fwd >= 0 && c - fwd < COLS) push(b - fwd, 0.1875, err);
      push(b, 0.3125, err);
      if (cn >= 0 && cn < COLS) push(b + fwd, 0.0625, err);
    }
  }
}

/* ---- out: one path per ink, horizontal runs merged ------------------- */

// A hairline can show between two abutting rects of the same colour, so the
// runs carry a hair of overlap. At card size a cell is ~0.026in, so 0.02 of
// one is a fifth of a printer dot — it cannot smear an edge, and it does
// close the seam.
const OVER = 0.02;
const runs = HEX.map(() => []);
for (let r = 0; r < ROWS; r++) {
  let c = 0;
  while (c < COLS) {
    const lvl = idx[r * COLS + c];
    let end = c;
    while (end + 1 < COLS && idx[r * COLS + end + 1] === lvl) end++;
    if (lvl !== 0) {
      const w = end - c + 1 + OVER;
      runs[lvl].push('M' + c + ' ' + r + 'h' + w + 'v' + (1 + OVER) + 'h-' + w + 'z');
    }
    c = end + 1;
  }
}

// trim to the inked bbox, so the SVG's own box IS the bird
let x0 = COLS, y0 = ROWS, x1 = -1, y1 = -1;
for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
  if (idx[r * COLS + c] === 0) continue;
  if (c < x0) x0 = c;
  if (c > x1) x1 = c;
  if (r < y0) y0 = r;
  if (r > y1) y1 = r;
}
const vw = x1 - x0 + 1, vh = y1 - y0 + 1;

// WHERE THE FEET ARE, as a fraction of the trimmed box.
//
// The card cannot stand the bird on its own bottom edge: the tail hangs
// lower than the toes on this frame, so hanging the sprite off the bbox
// puts the feet a tenth of an inch in the air over the branch. bird.js has
// the same problem and solves it by anchoring on the LEGS sprite, which is
// the only layer with a foot in it — so that is what is measured here, on
// the same grid the dither ran on, and written into the SVG for the
// stylesheet to hang the bird from.
// Measured the way the dither measures, over the cell's whole footprint and
// against the same threshold — a toe found by point-sampling can sit a cell
// away from the toe that was actually painted.
const legsCover = (sx, sy) => cellStats(sx, sy, legsAlpha).a >= COVER;
let footRow = -1, footSum = 0, footN = 0;
for (let r = ROWS - 1; r >= 0 && footRow < 0; r--)
  for (let c = 0; c < COLS; c++)
    if (legsCover((c + 0.5) * step, (r + 0.5) * step)) { footRow = r; break; }
for (let c = 0; c < COLS; c++)
  if (legsCover((c + 0.5) * step, (footRow + 0.5) * step)) { footSum += c; footN++; }
const footX = (footN ? footSum / footN + 0.5 : COLS / 2) - x0;
const footY = footRow + 1 - y0;                 // the underside of the toe cell

const body_ = runs.map((d, i) => d.length
  ? '<path fill="' + HEX[i] + '" d="' + d.join('') + '"/>' : '').filter(Boolean).join('\n');

const fx = (footX / vw).toFixed(4), fy = (footY / vh).toFixed(4);

const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="' + x0 + ' ' + y0 + ' ' +
  vw + ' ' + vh + '" shape-rendering="crispEdges" role="img" ' +
  'aria-label="A blue jay, dithered into flat pixels" ' +
  'data-foot-x="' + fx + '" data-foot-y="' + fy + '">\n' + body_ + '\n</svg>\n';

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, svg);
console.log('wrote ' + OUT + ' — ' + COLS + 'x' + ROWS + ' cells, bird ' + vw + 'x' + vh +
            ' cells, ' + (svg.length / 1024).toFixed(1) + 'KB');
console.log('  the lowest toe sits at ' + (fx * 100).toFixed(1) + '% across and ' +
            (fy * 100).toFixed(1) + '% down the artwork — card.css hangs the bird on it');
