/* Re-ink the 26x27 brand mark from the photograph, and write it everywhere.

   The mark used to be hand-made: 55 rectangles that existed only in the page,
   with no way to rebuild them. This is that missing step. It does NOT invent a
   new silhouette — it reads the cells the mark already occupies out of
   index.html and only decides, per cell, which ink goes in it. So the bird
   keeps its shape exactly and the re-render is a recolour, which is the only
   safe thing to do to a logo.

   Reading the silhouette back as the UNION of the ink groups is what makes
   this idempotent: run it against a two-ink mark or a three-ink one and you
   get the same 222 cells either way.

   Luminance comes from jay-left.png, the same source the mark was cut from,
   box-sampled over the cell. Two thresholds split it three ways. It is still
   NOT dithered, for the reason the old comment gave: at 26 cells the error
   diffusion is wider than the bird's features and the whole mark collapses
   into speckle.

   Writes, all of them the same geometry:
     - index.html      nav + footer <svg class="brand__mark">, and the favicon
     - privacy.html    nav + footer
     - 404.html        nav + footer
     - card/assets/mark.svg

   The page marks use CSS tokens so the inks stay themeable; the favicon and
   the card SVG are standalone files with no CSS around them, so those get
   literal hex.

   Usage: node assets/img/src/mark2svg.js [t1] [t2]
          t1 — below this luminance a cell is the dark ink   (default 0.50)
          t2 — below this it is the mid ink, else the light  (default 0.62)
*/

'use strict';

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const ROOT = path.join(__dirname, '..', '..', '..');
const W = 26, H = 27;

const T1 = parseFloat(process.argv[2] || '0.50');
const T2 = parseFloat(process.argv[3] || '0.62');

/* The three inks. The tokens are what the pages use; the hex is what the
   favicon and the card SVG use, and the two have to agree — keep them in
   step with :root in assets/css/styles.css. */
const INKS = [
  { token: '--jay-mid',  hex: '#C2D9F0' },   // light block
  { token: '--jay',      hex: '#5A8FC7' },   // mid block
  { token: '--jay-dark', hex: '#000000' },   // bridle, eye, barring
];

/* ---- PNG in (8-bit RGBA, non-interlaced) ------------------------------ */

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

/* ---- the silhouette, read back out of the page ------------------------ */

const indexPath = path.join(ROOT, 'index.html');
let html = fs.readFileSync(indexPath, 'utf8');

const navStart = html.indexOf('<svg class="brand__mark"');
if (navStart < 0) throw new Error('index.html: no brand__mark svg');
const navSvg = html.slice(navStart, html.indexOf('</svg>', navStart));

const inked = new Uint8Array(W * H);          // 1 where the mark paints
for (const g of navSvg.split('<g fill=').slice(1)) {
  const re = /<rect x="(\d+)" y="(\d+)" width="(\d+)" height="(\d+)"\/>/g;
  let m;
  while ((m = re.exec(g))) {
    const [x, y, w, h] = m.slice(1, 5).map(Number);
    for (let yy = y; yy < y + h; yy++)
      for (let xx = x; xx < x + w; xx++) inked[yy * W + xx] = 1;
  }
}

let mx0 = W, my0 = H, mx1 = -1, my1 = -1;
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (inked[y * W + x]) {
  if (x < mx0) mx0 = x; if (x > mx1) mx1 = x;
  if (y < my0) my0 = y; if (y > my1) my1 = y;
}
const mw = mx1 - mx0 + 1, mh = my1 - my0 + 1;

/* ---- luminance per cell ----------------------------------------------- */

const img = readPNG(path.join(ROOT, 'assets', 'img', 'jay-left.png'));

let x0 = img.w, y0 = img.h, x1 = -1, y1 = -1;
for (let y = 0; y < img.h; y++) for (let x = 0; x < img.w; x++) {
  if (img.px[(y * img.w + x) * 4 + 3] > 8) {
    if (x < x0) x0 = x; if (x > x1) x1 = x;
    if (y < y0) y0 = y; if (y > y1) y1 = y;
  }
}
const bw = x1 - x0 + 1, bh = y1 - y0 + 1;

// The mark's own bounding box maps onto the photograph's, so the cells line up
// with the bird however much padding the mark carries inside its 26x27 box.
const level = new Int8Array(W * H).fill(-1);
for (let cy = my0; cy <= my1; cy++) {
  for (let cx = mx0; cx <= mx1; cx++) {
    if (!inked[cy * W + cx]) continue;
    const sx0 = x0 + Math.floor((cx - mx0) / mw * bw);
    const sx1 = Math.max(sx0 + 1, x0 + Math.floor((cx - mx0 + 1) / mw * bw));
    const sy0 = y0 + Math.floor((cy - my0) / mh * bh);
    const sy1 = Math.max(sy0 + 1, y0 + Math.floor((cy - my0 + 1) / mh * bh));
    let a = 0, r = 0, g = 0, b = 0;
    for (let y = sy0; y < sy1; y++) for (let x = sx0; x < sx1; x++) {
      const i = (y * img.w + x) * 4;
      const w = img.px[i + 3] / 255;
      a += w; r += img.px[i] * w; g += img.px[i + 1] * w; b += img.px[i + 2] * w;
    }
    // A cell with no opaque pixels under it is an edge cell the silhouette
    // rounded outward. It takes the mid ink: that is what the chosen render
    // was judged on, and it keeps the outline from going pale and ragged.
    const Y = a > 0 ? ((r / a) * 0.299 + (g / a) * 0.587 + (b / a) * 0.114) / 255 : 0.6;
    level[cy * W + cx] = Y < T1 ? 2 : Y < T2 ? 1 : 0;
  }
}

/* ---- emit ------------------------------------------------------------- */

// Horizontal runs only. The old mark was written this way and it keeps the
// diff legible: one <rect> per run of same-ink cells on a row.
function rects(want) {
  const out = [];
  for (let y = 0; y < H; y++) {
    let x = 0;
    while (x < W) {
      if (level[y * W + x] !== want) { x++; continue; }
      let n = 1;
      while (x + n < W && level[y * W + x + n] === want) n++;
      out.push(`<rect x="${x}" y="${y}" width="${n}" height="1"/>`);
      x += n;
    }
  }
  return out;
}

const RUNS = INKS.map((_, i) => rects(i));

// Wrapped to a sane width so the inline SVGs stay readable in the page source.
function groups(fill, indent, perLine) {
  return INKS.map((ink, i) => {
    const lines = [];
    for (let k = 0; k < RUNS[i].length; k += perLine)
      lines.push(indent + '  ' + RUNS[i].slice(k, k + perLine).join(''));
    return `${indent}<g fill="${fill(ink)}">\n${lines.join('\n')}\n${indent}</g>`;
  }).join('\n');
}

const tokenFill = (ink) => `var(${ink.token})`;
const hexFill = (ink) => ink.hex;

/* ---- splice into the pages -------------------------------------------- */

const OPEN = '<svg class="brand__mark" viewBox="0 0 26 27" aria-hidden="true" shape-rendering="crispEdges">';

function spliceMarks(file) {
  const p = path.join(ROOT, file);
  let s = fs.readFileSync(p, 'utf8');
  let n = 0, at = 0;
  for (;;) {
    const i = s.indexOf(OPEN, at);
    if (i < 0) break;
    const close = s.indexOf('</svg>', i);
    // the indent of the <svg> line is the indent its <g>s should sit at
    const lineStart = s.lastIndexOf('\n', i) + 1;
    const indent = s.slice(lineStart, i);
    const body = '\n' + groups(tokenFill, indent + '  ', 3) + '\n' + indent;
    s = s.slice(0, i + OPEN.length) + body + s.slice(close);
    at = i + OPEN.length + body.length;
    n++;
  }
  fs.writeFileSync(p, s);
  return n;
}

const counts = {};
for (const f of ['index.html', 'privacy.html', '404.html']) counts[f] = spliceMarks(f);

/* ---- the favicon ------------------------------------------------------ */

// A data URI has no CSS around it, so it carries literal hex. EVERY attribute
// in here is single-quoted, the rects included: the whole string has to sit
// inside href="..." in the page, and one double quote in a rect ends the
// attribute early and truncates the icon to its first ink.
const faviconSvg =
  `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 26 27'>` +
  INKS.map((ink, i) =>
    `<g fill='${ink.hex}'>${RUNS[i].join('').replace(/"/g, "'")}</g>`).join('') +
  `</svg>`;
const faviconHref = 'data:image/svg+xml,' + faviconSvg
  .replace(/</g, '%3C').replace(/>/g, '%3E').replace(/#/g, '%23');

html = fs.readFileSync(indexPath, 'utf8');
const favRe = /<link rel="icon" href="data:image\/svg\+xml,[^"]*">/;
if (!favRe.test(html)) throw new Error('index.html: favicon link not found');
html = html.replace(favRe, `<link rel="icon" href="${faviconHref}">`);
fs.writeFileSync(indexPath, html);

/* ---- the card's standalone copy --------------------------------------- */

const cardPath = path.join(ROOT, 'card', 'assets', 'mark.svg');
if (fs.existsSync(cardPath)) {
  const head = fs.readFileSync(cardPath, 'utf8').split('\n')[0];
  fs.writeFileSync(cardPath, head + '\n' + groups(hexFill, '', 3) + '\n</svg>\n');
}

const cells = INKS.map((_, i) => [...level].filter(v => v === i).length);
console.log(`thresholds ${T1} / ${T2}`);
INKS.forEach((ink, i) =>
  console.log(`  ${ink.token.padEnd(10)} ${ink.hex}  ${String(cells[i]).padStart(3)} cells, ${RUNS[i].length} rects`));
console.log(`  total ${cells.reduce((a, b) => a + b, 0)} cells (silhouette unchanged)`);
console.log('marks written: ' +
  Object.entries(counts).map(([f, n]) => `${f} x${n}`).join(', ') +
  ', favicon, card/assets/mark.svg');
