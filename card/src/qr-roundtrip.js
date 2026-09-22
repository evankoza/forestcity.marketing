/* Read a QR SVG written by qr.js back out again: unmask it, walk the
   zigzag in reverse, de-interleave the blocks and print the payload.

   This is a self-check on the geometry, not a decoder — it trusts the error
   correction rather than using it. If this prints the URL, the encoder put
   the bits where the encoder expects them; a real scanner still has to
   agree, which is what card/qr-verify.html is for.

   Usage: node qr-roundtrip.js <qr.svg> <ecl>
*/

'use strict';

const fs = require('fs');

const svg = fs.readFileSync(process.argv[2], 'utf8');
const ECL = (process.argv[3] || 'Q').toUpperCase();

const N = parseInt(svg.match(/viewBox="0 0 (\d+)/)[1], 10);
const QUIET = 4;
const SIZE = N - QUIET * 2;
const version = (SIZE - 17) / 4;

const m = Array.from({ length: N }, () => new Uint8Array(N));
const d = svg.match(/<path fill="#080B09" d="([^"]+)"/)[1];
for (const seg of d.split('z')) {
  const hit = seg.match(/M(\d+) (\d+)h(\d+)/);
  if (!hit) continue;
  const x = +hit[1], y = +hit[2], w = +hit[3];
  for (let i = 0; i < w; i++) m[y][x + i] = 1;
}
const at = (r, c) => m[r + QUIET][c + QUIET];

/* rebuild the function-module map exactly as qr.js lays it out */
const fixed = Array.from({ length: SIZE }, () => new Uint8Array(SIZE));
const mark = (r, c) => { if (r >= 0 && c >= 0 && r < SIZE && c < SIZE) fixed[r][c] = 1; };
const ALIGN = [[], [6,18], [6,22], [6,26], [6,30], [6,34], [6,22,38]][version - 1];

for (const [r0, c0] of [[0,0],[0,SIZE-7],[SIZE-7,0]])
  for (let r = -1; r <= 7; r++) for (let c = -1; c <= 7; c++) mark(r0 + r, c0 + c);
for (let i = 0; i < SIZE; i++) { mark(6, i); mark(i, 6); }
for (const r0 of ALIGN) for (const c0 of ALIGN) {
  if (fixed[r0][c0]) continue;
  for (let r = -2; r <= 2; r++) for (let c = -2; c <= 2; c++) mark(r0 + r, c0 + c);
}
for (let i = 0; i < 9; i++) { mark(8, i); mark(i, 8); }
for (let i = 0; i < 8; i++) { mark(8, SIZE - 1 - i); mark(SIZE - 1 - i, 8); }

/* the mask, read out of the format info rather than assumed */
let fmt = 0;
for (let i = 0; i < 15; i++) {
  let bit;
  if (i < 6) bit = at(i, 8);
  else if (i === 6) bit = at(7, 8);
  else if (i === 7) bit = at(8, 8);
  else if (i === 8) bit = at(8, 7);
  else bit = at(8, 14 - i);
  fmt |= bit << i;
}
fmt ^= 0x5412;
const eclBits = (fmt >> 13) & 3, mask = (fmt >> 10) & 7;
const ECL_NAME = { 1: 'L', 0: 'M', 3: 'Q', 2: 'H' }[eclBits];

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

const bits = [];
let up = true;
for (let right = SIZE - 1; right >= 1; right -= 2) {
  if (right === 6) right = 5;
  for (let step = 0; step < SIZE; step++) {
    const r = up ? SIZE - 1 - step : step;
    for (const c of [right, right - 1]) {
      if (fixed[r][c]) continue;
      bits.push(at(r, c) ^ (MASKS[mask](r, c) ? 1 : 0));
    }
  }
  up = !up;
}

const stream = [];
for (let i = 0; i + 8 <= bits.length; i += 8) {
  let b = 0;
  for (let j = 0; j < 8; j++) b = (b << 1) | bits[i + j];
  stream.push(b);
}

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
const spec = BLOCKS[ECL_NAME || ECL][version - 1];
const lens = [];
for (let g = 0; g < 2; g++)
  for (let i = 0; i < spec[1 + g * 2]; i++) lens.push(spec[2 + g * 2]);

const blocks = lens.map(() => []);
let k = 0;
for (let i = 0; i < Math.max(...lens); i++)
  for (let b = 0; b < blocks.length; b++)
    if (i < lens[b]) blocks[b].push(stream[k++]);

const data = [].concat(...blocks);
const mode = data[0] >> 4;
const len = ((data[0] & 0x0F) << 4) | (data[1] >> 4);
const out = [];
for (let i = 0; i < len; i++)
  out.push((((data[1 + i] & 0x0F) << 4) | (data[2 + i] >> 4)) & 0xFF);

console.log('version ' + version + ', ECC ' + ECL_NAME + ', mask ' + mask +
            ', mode ' + mode + ', length ' + len);
console.log('payload: ' + Buffer.from(out).toString('utf8'));
