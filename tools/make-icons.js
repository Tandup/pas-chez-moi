// Génère les icônes PNG sans dépendance : node tools/make-icons.js
const fs = require('fs'), path = require('path'), zlib = require('zlib');

const hex = h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];

// Formes en coordonnées 0..1, dessinées dans l'ordre
const shapes = [
  { t: 'rect', x: 0, y: 0, w: 1, h: 1, c: '#7cc35a' },
  { t: 'rect', x: 0.16, y: 0.42, w: 0.68, h: 0.46, c: '#a8714a' },
  { t: 'tri', p: [[0.08, 0.46], [0.5, 0.12], [0.92, 0.46]], c: '#c0504d' },
  { t: 'rect', x: 0.42, y: 0.66, w: 0.16, h: 0.22, c: '#7a4a2c' },
  { t: 'rect', x: 0.22, y: 0.52, w: 0.14, h: 0.12, c: '#a9dcf5' },
  { t: 'rect', x: 0.64, y: 0.52, w: 0.14, h: 0.12, c: '#a9dcf5' },
  { t: 'circle', x: 0.5, y: 0.5, r: 0.13, c: '#f2c79a' },
  { t: 'halfcircle', x: 0.5, y: 0.48, r: 0.14, c: '#2f78c4' },
  { t: 'circle', x: 0.455, y: 0.53, r: 0.016, c: '#2c2c2a' },
  { t: 'circle', x: 0.545, y: 0.53, r: 0.016, c: '#2c2c2a' },
  { t: 'rect', x: 0.36, y: 0.63, w: 0.28, h: 0.08, c: '#e8613c' },
];

function inside(s, u, v) {
  switch (s.t) {
    case 'rect': return u >= s.x && u <= s.x + s.w && v >= s.y && v <= s.y + s.h;
    case 'circle': return (u - s.x) ** 2 + (v - s.y) ** 2 <= s.r ** 2;
    case 'halfcircle': return v <= s.y && (u - s.x) ** 2 + (v - s.y) ** 2 <= s.r ** 2;
    case 'tri': {
      const [a, b, c] = s.p;
      const sign = (p1, p2) => (u - p2[0]) * (p1[1] - p2[1]) - (p1[0] - p2[0]) * (v - p2[1]);
      const d1 = sign(a, b), d2 = sign(b, c), d3 = sign(c, a);
      return !((d1 < 0 || d2 < 0 || d3 < 0) && (d1 > 0 || d2 > 0 || d3 > 0));
    }
  }
}

function render(size) {
  const SS = 3, px = Buffer.alloc(size * (size * 3 + 1));
  for (let y = 0; y < size; y++) {
    px[y * (size * 3 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      const acc = [0, 0, 0];
      for (let sy = 0; sy < SS; sy++) for (let sx = 0; sx < SS; sx++) {
        const u = (x + (sx + 0.5) / SS) / size, v = (y + (sy + 0.5) / SS) / size;
        let col = [0, 0, 0];
        for (const s of shapes) if (inside(s, u, v)) col = hex(s.c);
        acc[0] += col[0]; acc[1] += col[1]; acc[2] += col[2];
      }
      const o = y * (size * 3 + 1) + 1 + x * 3;
      for (let i = 0; i < 3; i++) px[o + i] = Math.round(acc[i] / (SS * SS));
    }
  }
  return px;
}

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0;
});
const crc32 = buf => { let c = 0xffffffff; for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function png(size) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(render(size))), chunk('IEND', Buffer.alloc(0)),
  ]);
}

const out = path.join(__dirname, '..', 'icons');
fs.mkdirSync(out, { recursive: true });
for (const [name, size] of [['icon-192.png', 192], ['icon-512.png', 512], ['apple-touch-icon.png', 180]]) {
  fs.writeFileSync(path.join(out, name), png(size));
  console.log('wrote', name);
}
