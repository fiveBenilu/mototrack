const zlib = require('zlib');
const fs = require('fs');
const path = require('path');

function crc32(buf) {
  let c, crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = (crc ^ buf[i]) & 0xff;
    for (let j = 0; j < 8; j++) c = c & 1 ? (c >>> 1) ^ 0xedb88320 : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const typeBuf = Buffer.from(type, 'ascii');
  const lenBuf = Buffer.alloc(4);
  lenBuf.writeUInt32BE(data.length, 0);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([lenBuf, typeBuf, data, crcBuf]);
}

// Draws a rounded-square orange background with a simple white "M" chevron (motorcycle-ish lean angle wedge)
function makeIcon(size, maskable) {
  const raw = Buffer.alloc(size * (1 + size * 4));
  const bg = [255, 90, 54]; // accent orange
  const fg = [255, 255, 255];
  const pad = maskable ? Math.round(size * 0.18) : 0;

  for (let y = 0; y < size; y++) {
    const rowStart = y * (1 + size * 4);
    raw[rowStart] = 0; // filter type
    for (let x = 0; x < size; x++) {
      const idx = rowStart + 1 + x * 4;
      // simple chevron / lean-angle triangle shape in the center
      const cx = size / 2, cy = size / 2;
      const inContent = x >= pad && x < size - pad && y >= pad && y < size - pad;
      const dx = (x - cx) / (size / 2 - pad);
      const dy = (y - cy) / (size / 2 - pad);
      const isShape = inContent && Math.abs(dx) + Math.abs(dy * 0.6) < 0.55 && dy > -0.5;
      const [r, g, b] = isShape ? fg : bg;
      raw[idx] = r;
      raw[idx + 1] = g;
      raw[idx + 2] = b;
      raw[idx + 3] = 255;
    }
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const idat = zlib.deflateSync(raw, { level: 9 });
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  return Buffer.concat([
    signature,
    chunk('IHDR', ihdr),
    chunk('IDAT', idat),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const outDir = path.join(__dirname, '../public/icons');
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'icon-192.png'), makeIcon(192, false));
fs.writeFileSync(path.join(outDir, 'icon-512.png'), makeIcon(512, false));
fs.writeFileSync(path.join(outDir, 'icon-512-maskable.png'), makeIcon(512, true));
console.log('Icons generated');
