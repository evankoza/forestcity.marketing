/* Rasterise the brand mark straight out of index.html.

   The mark is 26x27 flat cells in two inks, already written as <rect>s in
   the nav's inline SVG. Rather than re-typing 55 rectangles into a second
   file that can drift, this reads them back out of the page and paints
   them into a 26x27 RGBA PNG. ffmpeg then scales that up with nearest
   neighbour, so the og:image carries the same mark, cell for cell.

   Usage: node mark2png.js <index.html> <out.png>
*/

const fs = require('fs');
const zlib = require('zlib');

const [, , SRC, OUT] = process.argv;
const html = fs.readFileSync(SRC, 'utf8');

const W = 26, H = 27;

// The nav copy is the first brand__mark in the file; take that one svg.
const svgStart = html.indexOf('<svg class="brand__mark"');
const svgEnd = html.indexOf('</svg>', svgStart);
const svg = html.slice(svgStart, svgEnd);

// Two <g>s, each one ink. fill="var(--jay-mid)" is the light block.
const INK = {
  '--jay-mid': [0xC2, 0xD9, 0xF0],
  '--jay': [0x5A, 0x8F, 0xC7],
};

const px = Buffer.alloc(W * H * 4, 0); // transparent

const groups = svg.split('<g fill="var(');
let painted = 0;
for (const g of groups.slice(1)) {
  const token = '--' + g.slice(2, g.indexOf(')'));
  const rgb = INK[token];
  if (!rgb) throw new Error('unknown ink: ' + token);

  const re = /<rect x="(\d+)" y="(\d+)" width="(\d+)" height="(\d+)"\/>/g;
  let m;
  while ((m = re.exec(g))) {
    const [x, y, w, h] = m.slice(1, 5).map(Number);
    for (let yy = y; yy < y + h; yy++) {
      for (let xx = x; xx < x + w; xx++) {
        const i = (yy * W + xx) * 4;
        px[i] = rgb[0]; px[i + 1] = rgb[1]; px[i + 2] = rgb[2]; px[i + 3] = 255;
        painted++;
      }
    }
  }
}

/* ---- minimal PNG writer -------------------------------------- */
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
ihdr[8] = 8;    // bit depth
ihdr[9] = 6;    // truecolour + alpha
// 10,11,12 = deflate / adaptive / no interlace, all 0

// one filter byte (0 = none) per scanline
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

console.log(`wrote ${OUT} — ${W}x${H}, ${painted} cells painted`);
