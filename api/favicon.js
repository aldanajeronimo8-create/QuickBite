import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

function paeth(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
}

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const typeBuffer = Buffer.from(type, 'ascii');
  const output = Buffer.alloc(12 + data.length);
  output.writeUInt32BE(data.length, 0);
  typeBuffer.copy(output, 4);
  data.copy(output, 8);
  output.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 8 + data.length);
  return output;
}

function decodePng(buffer) {
  if (!buffer.subarray(0, 8).equals(PNG_SIGNATURE)) throw new Error('Invalid PNG');

  let offset = 8;
  let width;
  let height;
  let bitDepth;
  let colorType;
  let interlace;
  const idat = [];

  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString('ascii', offset + 4, offset + 8);
    const data = buffer.subarray(offset + 8, offset + 8 + length);
    offset += 12 + length;

    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
      interlace = data[12];
    } else if (type === 'IDAT') {
      idat.push(data);
    } else if (type === 'IEND') {
      break;
    }
  }

  if (!width || !height || bitDepth !== 8 || interlace !== 0 || ![2, 6].includes(colorType)) {
    throw new Error('Unsupported PNG format');
  }

  const bytesPerPixel = colorType === 6 ? 4 : 3;
  const rowBytes = width * bytesPerPixel;
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const pixels = Buffer.alloc(width * height * 4);
  let rawOffset = 0;
  let previous = Buffer.alloc(rowBytes);

  for (let y = 0; y < height; y += 1) {
    const filter = raw[rawOffset++];
    const row = Buffer.alloc(rowBytes);

    for (let x = 0; x < rowBytes; x += 1) {
      const value = raw[rawOffset++];
      const left = x >= bytesPerPixel ? row[x - bytesPerPixel] : 0;
      const up = previous[x] || 0;
      const upLeft = x >= bytesPerPixel ? previous[x - bytesPerPixel] || 0 : 0;
      if (filter === 0) row[x] = value;
      else if (filter === 1) row[x] = (value + left) & 255;
      else if (filter === 2) row[x] = (value + up) & 255;
      else if (filter === 3) row[x] = (value + Math.floor((left + up) / 2)) & 255;
      else if (filter === 4) row[x] = (value + paeth(left, up, upLeft)) & 255;
      else throw new Error('Unsupported PNG filter');
    }

    for (let x = 0; x < width; x += 1) {
      const source = x * bytesPerPixel;
      const target = (y * width + x) * 4;
      pixels[target] = row[source];
      pixels[target + 1] = row[source + 1];
      pixels[target + 2] = row[source + 2];
      pixels[target + 3] = colorType === 6 ? row[source + 3] : 255;
    }

    previous = row;
  }

  return { width, height, pixels };
}

function encodePng(width, height, pixels) {
  const rowBytes = width * 4;
  const raw = Buffer.alloc((rowBytes + 1) * height);

  for (let y = 0; y < height; y += 1) {
    raw[y * (rowBytes + 1)] = 0;
    pixels.copy(raw, y * (rowBytes + 1) + 1, y * rowBytes, (y + 1) * rowBytes);
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  return Buffer.concat([
    PNG_SIGNATURE,
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function roundCorners(buffer) {
  const { width, height, pixels } = decodePng(buffer);
  const radius = Math.round(Math.min(width, height) * 0.19);
  const radiusSquared = radius * radius;

  const corners = [
    [radius, radius],
    [width - radius - 1, radius],
    [radius, height - radius - 1],
    [width - radius - 1, height - radius - 1],
  ];

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let outside = false;
      if (x < radius && y < radius) outside = (x - corners[0][0]) ** 2 + (y - corners[0][1]) ** 2 > radiusSquared;
      else if (x >= width - radius && y < radius) outside = (x - corners[1][0]) ** 2 + (y - corners[1][1]) ** 2 > radiusSquared;
      else if (x < radius && y >= height - radius) outside = (x - corners[2][0]) ** 2 + (y - corners[2][1]) ** 2 > radiusSquared;
      else if (x >= width - radius && y >= height - radius) outside = (x - corners[3][0]) ** 2 + (y - corners[3][1]) ** 2 > radiusSquared;

      if (outside) pixels[(y * width + x) * 4 + 3] = 0;
    }
  }

  return encodePng(width, height, pixels);
}

export default function handler(_request, response) {
  try {
    const sourcePath = path.join(process.cwd(), 'public', 'favicon-source.png');
    const source = fs.readFileSync(sourcePath);
    const favicon = roundCorners(source);

    response.setHeader('Content-Type', 'image/png');
    response.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    response.status(200).send(favicon);
  } catch (error) {
    console.error('favicon generation failed', error);
    const fallback = fs.readFileSync(path.join(process.cwd(), 'public', 'favicon-source.png'));
    response.setHeader('Content-Type', 'image/png');
    response.setHeader('Cache-Control', 'public, max-age=3600');
    response.status(200).send(fallback);
  }
}
