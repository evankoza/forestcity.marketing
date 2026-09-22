/* A QR code, as an SVG of flat cells.

   Written out rather than pulled from a package for the same reason veil.js
   writes its own PNG: this repo has no build step and no node_modules, and
   the thing on the back of a business card for the next five years should
   not depend on a dependency nobody in the shop can rebuild. It is also, by
   happy accident, exactly on brand — a QR code IS a pixel grid, so it comes
   out of the same drawing code as the jay.

   Byte mode only, versions 1–7, all four error-correction levels. That
   covers any URL short enough to belong on a card; if you need more than
   ~100 characters the URL is the problem, not the encoder.

   Usage: node qr.js <text> <out.svg> [ecl]        ecl = L | M | Q | H
*/

'use strict';

const fs = require('fs');
const path = require('path');

const TEXT = process.argv[2] || 'https://forestcity.marketing';
const OUT  = process.argv[3] || path.join(__dirname, '..', 'assets', 'qr.svg');
const ECL  = (process.argv[4] || 'Q').toUpperCase();

const DARK  = '#080B09';    // --bg: the page's near-black
const LIGHT = '#F3F6F2';    // --ink
const QUIET = 4;            // modules of margin — the spec's minimum

/* ---- GF(256) and Reed-Solomon ---------------------------------------- */

const EXP = new Uint8Array(512), LOG = new Uint8Array(256);
for (let i = 0, x = 1; i < 255; i++) {
  EXP[i] = x; LOG[x] = i;
  x <<= 1; if (x & 0x100) x ^= 0x11D;          // the QR field polynomial
}
for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];

const mul = (a, b) => (a && b) ? EXP[LOG[a] + LOG[b]] : 0;

function genPoly(n) {
  let g = [1];
  for (let i = 0; i < n; i++) {
    const out = new Array(g.length + 1).fill(0);
    for (let j = 0; j < g.length; j++) {
      out[j] ^= mul(g[j], EXP[i]);             // x^0 term of (x + a^i)
      out[j + 1] ^= g[j];                      // x^1 term
    }
    g = out;
  }
  return g.reverse();                          // highest degree first
}

function ecBytes(data, n) {
  const g = genPoly(n);
  const res = new Uint8Array(data.length + n);
  res.set(data);
  for (let i = 0; i < data.length; i++) {
    const f = res[i];
    if (!f) continue;
    for (let j = 0; j < g.length; j++) res[i + j] ^= mul(g[j], f);
  }
  return res.subarray(data.length);
}

/* ---- the block tables, versions 1–7 ----------------------------------
   [ EC codewords per block, blocks in group 1, data codewords each,
     blocks in group 2, data codewords each ] */

const BLOCKS = {
  L: [[ 7,1,19,0,0], [10,1,34,0,0], [15,1,55,0,0], [20,1,80,0,0],
      [26,1,108,0,0], [18,2,68,0,0], [20,2,78,0,0]],
  M: [[10,1,16,0,0], [16,1,28,0,0], [26,1,44,0,0], [18,2,32,0,0],
      [24,2,43,0,0], [16,4,27,0,0], [18,4,31,0,0]],
  Q: [[13,1,13,0,0], [22,1,22,0,0], [18,2,17,0,0], [26,2,24,0,0],
      [18,2,15,2,16], [24,4,19,0,0], [18,2,14,4,15]],
  H: [[17,1, 9,0,0], [28,1,16,0,0], [22,2,13,0,0], [16,4, 9,0,0],
      [22,2,11,2,12], [28,4,15,0,0], [26,4,13,1,14]],
};
const ALIGN = [[], [6,18], [6,22], [6,26], [6,30], [6,34], [6,22,38]];
const REMAINDER = [0, 7, 7, 7, 7, 7, 0];       // remainder bits, v1–v7
const ECL_BITS = { L: 1, M: 0, Q: 3, H: 2 };

if (!BLOCKS[ECL]) throw new Error('ecl must be L, M, Q or H');

/* ---- encode ----------------------------------------------------------- */

const bytes = Buffer.from(TEXT, 'utf8');

let version = 0, spec = null, dataCount = 0;
for (let v = 1; v <= 7; v++) {
  const s = BLOCKS[ECL][v - 1];
  const cap = s[1] * s[2] + s[3] * s[4];
  // mode indicator (4 bits) + character count (8 bits in byte mode, v1–v9)
  if (bytes.length + 2 <= cap) { version = v; spec = s; dataCount = cap; break; }
}
if (!version) throw new Error(TEXT.length + ' bytes will not fit in version 7 at ECC ' + ECL);

const bits = [];
const push = (val, n) => { for (let i = n - 1; i >= 0; i--) bits.push((val >> i) & 1); };

push(0b0100, 4);                 // byte mode
push(bytes.length, 8);
for (const b of bytes) push(b, 8);
for (let i = 0; i < 4 && bits.length < dataCount * 8; i++) bits.push(0);   // terminator
while (bits.length % 8) bits.push(0);
const data = [];
for (let i = 0; i < bits.length; i += 8) {
  let b = 0;
  for (let j = 0; j < 8; j++) b = (b << 1) | bits[i + j];
  data.push(b);
}
for (let i = 0; data.length < dataCount; i++) data.push(i % 2 ? 0x11 : 0xEC);

// split into blocks, then interleave data and EC the way the spec asks
const dataBlocks = [], ecBlocks = [];
let at = 0;
for (let g = 0; g < 2; g++) {
  const n = spec[1 + g * 2], len = spec[2 + g * 2];
  for (let i = 0; i < n; i++) {
    const blk = Uint8Array.from(data.slice(at, at + len));
    at += len;
    dataBlocks.push(blk);
    ecBlocks.push(ecBytes(blk, spec[0]));
  }
}
const stream = [];
for (let i = 0; i < Math.max(...dataBlocks.map((b) => b.length)); i++)
  for (const b of dataBlocks) if (i < b.length) stream.push(b[i]);
for (let i = 0; i < spec[0]; i++)
  for (const b of ecBlocks) stream.push(b[i]);

/* ---- the matrix ------------------------------------------------------- */

const SIZE = 17 + 4 * version;
const mod = Array.from({ length: SIZE }, () => new Int8Array(SIZE).fill(-1));  // -1 = free
const fixed = Array.from({ length: SIZE }, () => new Uint8Array(SIZE));

const set = (r, c, v) => { mod[r][c] = v; fixed[r][c] = 1; };

function finder(r0, c0) {
  for (let r = -1; r <= 7; r++) for (let c = -1; c <= 7; c++) {
    const rr = r0 + r, cc = c0 + c;
    if (rr < 0 || cc < 0 || rr >= SIZE || cc >= SIZE) continue;
    const inner = r >= 0 && r <= 6 && c >= 0 && c <= 6 &&
      (r === 0 || r === 6 || c === 0 || c === 6 ||
       (r >= 2 && r <= 4 && c >= 2 && c <= 4));
    set(rr, cc, inner ? 1 : 0);
  }
}
finder(0, 0); finder(0, SIZE - 7); finder(SIZE - 7, 0);

for (let i = 8; i < SIZE - 8; i++) {           // timing
  set(6, i, i % 2 === 0 ? 1 : 0);
  set(i, 6, i % 2 === 0 ? 1 : 0);
}

for (const r0 of ALIGN[version - 1]) for (const c0 of ALIGN[version - 1]) {
  if (fixed[r0][c0]) continue;                 // skips the three finder corners
  for (let r = -2; r <= 2; r++) for (let c = -2; c <= 2; c++)
    set(r0 + r, c0 + c, (Math.abs(r) === 2 || Math.abs(c) === 2 || (!r && !c)) ? 1 : 0);
}

set(SIZE - 8, 8, 1);                           // the dark module

// reserve the format areas so data placement steps over them
for (let i = 0; i < 9; i++) {
  if (!fixed[8][i]) set(8, i, 0);
  if (!fixed[i][8]) set(i, 8, 0);
}
for (let i = 0; i < 8; i++) {
  if (!fixed[8][SIZE - 1 - i]) set(8, SIZE - 1 - i, 0);
  if (!fixed[SIZE - 1 - i][8]) set(SIZE - 1 - i, 8, 0);
}

if (version >= 7) {
  let d = version << 12, rem = version;
  for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >> 11) * 0x1F25);
  d |= rem & 0xFFF;
  for (let i = 0; i < 18; i++) {
    const bit = (d >> i) & 1;
    set(Math.floor(i / 3), SIZE - 11 + (i % 3), bit);
    set(SIZE - 11 + (i % 3), Math.floor(i / 3), bit);
  }
}

// zigzag, bottom-right upward, two columns at a time, column 6 skipped
let bi = 0, up = true;
for (let right = SIZE - 1; right >= 1; right -= 2) {
  if (right === 6) right = 5;
  for (let step = 0; step < SIZE; step++) {
    const r = up ? SIZE - 1 - step : step;
    for (const c of [right, right - 1]) {
      if (fixed[r][c]) continue;
      const bit = bi < stream.length * 8
        ? (stream[bi >> 3] >> (7 - (bi & 7))) & 1 : 0;
      mod[r][c] = bit;
      bi++;
    }
  }
  up = !up;
}

/* ---- mask, chosen by the spec's four penalties ------------------------ */

const MASKS = [
  (r, c) => (r + c) % 2 === 0,
  (r, c) => r % 2 === 0,
  (r, c) => c % 3 === 0,
  (r, c) => (r + c) % 3 === 0,
  (r, c) => (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0,
  (r, c) => ((r * c) % 2) + ((r * c) % 3) === 0,
  (r, c) => ((((r * c) % 2) + ((r * c) % 3)) % 2) === 0,
  (r, c) => ((((r + c) % 2) + ((r * c) % 3)) % 2) === 0,
];

function penalty(m) {
  let p = 0;
  const line = (get) => {
    for (let a = 0; a < SIZE; a++) {
      let run = 1;
      const seq = [];
      for (let b = 0; b < SIZE; b++) {
        seq.push(get(a, b));
        if (b && get(a, b) === get(a, b - 1)) { run++; }
        else { if (run >= 5) p += 3 + (run - 5); run = 1; }
      }
      if (run >= 5) p += 3 + (run - 5);
      // 1:1:3:1:1 with four light modules on one side
      const s = seq.join('');
      for (const pat of ['10111010000', '00001011101']) {
        let i = -1;
        while ((i = s.indexOf(pat, i + 1)) !== -1) p += 40;
      }
    }
  };
  line((a, b) => m[a][b]);
  line((a, b) => m[b][a]);

  for (let r = 0; r < SIZE - 1; r++) for (let c = 0; c < SIZE - 1; c++) {
    const v = m[r][c];
    if (v === m[r][c + 1] && v === m[r + 1][c] && v === m[r + 1][c + 1]) p += 3;
  }

  let dark = 0;
  for (let r = 0; r < SIZE; r++) for (let c = 0; c < SIZE; c++) dark += m[r][c];
  p += Math.floor(Math.abs(dark * 100 / (SIZE * SIZE) - 50) / 5) * 10;
  return p;
}

function withMask(maskIdx) {
  const m = mod.map((row) => Int8Array.from(row));
  for (let r = 0; r < SIZE; r++) for (let c = 0; c < SIZE; c++)
    if (!fixed[r][c] && MASKS[maskIdx](r, c)) m[r][c] ^= 1;

  // format info: 5 data bits, 10 BCH bits, XORed with the spec's mask
  const fmtData = (ECL_BITS[ECL] << 3) | maskIdx;
  let rem = fmtData;
  for (let i = 0; i < 10; i++) rem = (rem << 1) ^ (((rem >> 9) & 1) * 0x537);
  const fmt = (((fmtData << 10) | (rem & 0x3FF)) ^ 0x5412);

  // Copy 1 runs DOWN column 8 and then left along row 8, around the
  // top-left finder; copy 2 runs left along row 8 from the top-right finder
  // and up column 8 from the bottom-left one. Getting those two axes the
  // wrong way round produces a QR that round-trips through its own reader
  // and is unreadable to every scanner on earth — the two copies are
  // mirror images of each other, so the mistake is invisible in the grid.
  for (let i = 0; i < 15; i++) {
    const bit = (fmt >> i) & 1;
    if (i < 6) m[i][8] = bit;
    else if (i === 6) m[7][8] = bit;
    else if (i === 7) m[8][8] = bit;
    else if (i === 8) m[8][7] = bit;
    else m[8][14 - i] = bit;

    if (i < 8) m[8][SIZE - 1 - i] = bit;
    else m[SIZE - 15 + i][8] = bit;
  }
  m[SIZE - 8][8] = 1;                          // the dark module, never masked
  return m;
}

let best = null, bestScore = Infinity, bestMask = 0;
for (let i = 0; i < 8; i++) {
  const m = withMask(i);
  const s = penalty(m);
  if (s < bestScore) { bestScore = s; best = m; bestMask = i; }
}

/* ---- out -------------------------------------------------------------- */

const N = SIZE + QUIET * 2;
const runs = [];
for (let r = 0; r < SIZE; r++) {
  let c = 0;
  while (c < SIZE) {
    if (!best[r][c]) { c++; continue; }
    let end = c;
    while (end + 1 < SIZE && best[r][end + 1]) end++;
    runs.push('M' + (c + QUIET) + ' ' + (r + QUIET) + 'h' + (end - c + 1) + 'v1h-' + (end - c + 1) + 'z');
    c = end + 1;
  }
}

const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + N + ' ' + N +
  '" shape-rendering="crispEdges" role="img" aria-label="QR code for ' + TEXT + '">\n' +
  '<rect width="' + N + '" height="' + N + '" fill="' + LIGHT + '"/>\n' +
  '<path fill="' + DARK + '" d="' + runs.join('') + '"/>\n</svg>\n';

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, svg);
console.log('wrote ' + OUT + ' — "' + TEXT + '", version ' + version + ' (' + SIZE +
            ' modules), ECC ' + ECL + ', mask ' + bestMask + ', penalty ' + bestScore);
