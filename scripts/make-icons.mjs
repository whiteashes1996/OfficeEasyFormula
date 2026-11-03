import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";

const outDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "taskpane", "public", "assets");

function crc32(buffer) {
  let crc = ~0;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return ~crc >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const name = Buffer.from(type);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([name, data])));
  return Buffer.concat([length, name, data, crc]);
}

function icon(size) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  const margin = Math.max(1, Math.round(size * 0.08));
  for (let y = 0; y < size; y += 1) {
    const row = y * (size * 4 + 1);
    raw[row] = 0;
    for (let x = 0; x < size; x += 1) {
      const offset = row + 1 + x * 4;
      const inside = x >= margin && y >= margin && x < size - margin && y < size - margin;
      const bar = Math.abs(y - size / 2) <= Math.max(1, size * 0.035) && x > size * 0.22 && x < size * 0.78;
      const top = y > size * 0.24 && y < size * 0.4 && x > size * 0.36 && x < size * 0.64;
      const bottom = y > size * 0.6 && y < size * 0.76 && x > size * 0.3 && x < size * 0.7;
      let red = 31;
      let green = 78;
      let blue = 121;
      let alpha = 255;
      if (!inside) alpha = 0;
      else if (bar || top || bottom) red = green = blue = 255;
      raw[offset] = red;
      raw[offset + 1] = green;
      raw[offset + 2] = blue;
      raw[offset + 3] = alpha;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

fs.mkdirSync(outDir, { recursive: true });
for (const size of [16, 32, 64, 80]) fs.writeFileSync(path.join(outDir, `icon-${size}.png`), icon(size));
console.log(outDir);
