/* The og:image's veil: a 1200x630 RGBA layer that goes over the branch
   photograph so the wordmark has something to sit on.

   Same idea as .hero__veil in styles.css - a vertical grade into the
   page's own near-black green - with one addition the hero does not
   need: a horizontal falloff on the left, because on the og:image the
   type sits in the lower LEFT over bark rather than over a flat band,
   and bark at 1200px wide is busy enough to eat 40px letterforms.

   Usage: node veil.js <out.png>
*/

const fs = require('fs');
const zlib = require('zlib');

const OUT = process.argv[2];
const W = 1200, H = 630;

// stops: [position 0..1, r, g, b, alpha 0..1]
const STOPS = [
  [0.00, 8, 20, 14, 0.30],
  [0.45, 9, 22, 15, 0.46],
  [0.78, 8, 16, 12, 0.82],
  [1.00, 8, 11, 9, 0.97],
];

function grade(t) {
  for (let i = 1; i < STOPS.length; i++) {
    if (t <= STOPS[i][0]) {
      const a = STOPS[i - 1], b = STOPS[i];
      const f = (t - a[0]) / (b[0] - a[0]);
      return [1, 2, 3, 4].map((k) => a[k] + (b[k] - a[k]) * f);
    }
  }
  return STOPS[STOPS.length - 1].slice(1);
}

const px = Buffer.alloc(W * H * 4);
for (let y = 0; y < H; y++) {
  const [r, g, b, aBase] = grade(y / (H - 1));
  for (let x = 0; x < W; x++) {
    /* left falloff: full extra weight to x=0, gone by x=620, eased so
       there is no visible edge where it runs out */
    const t = Math.min(1, x / 620);
    const ease = (1 - t) * (1 - t);
    const a = Math.min(1, aBase + 0.30 * ease);

    const i = (y * W + x) * 4;
    px[i] = Math.round(r);
    px[i + 1] = Math.round(g);
    px[i + 2] = Math.round(b);
    px[i + 3] = Math.round(a * 255);
  }
}

const CRC = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return (buf) => {
    let c = -1;
    for (const b of buf) c = t[(c ^ b) & 0xFF] ^ (c >>> 8);
    return (c ^ -1) >>> 0;
  };
})();

function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'latin1'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(CRC(body));
  return Buffer.concat([len, body, crc]);
}

const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4);
ihdr[8] = 8; ihdr[9] = 6;

const raw = Buffer.alloc(H * (1 + W * 4));
for (let y = 0; y < H; y++) {
  raw[y * (1 + W * 4)] = 0;
  px.copy(raw, y * (1 + W * 4) + 1, y * W * 4, (y + 1) * W * 4);
}

fs.writeFileSync(OUT, Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]),
  chunk('IHDR', ihdr),
  chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
  chunk('IEND', Buffer.alloc(0)),
]));

console.log(`wrote ${OUT} — ${W}x${H}`);
