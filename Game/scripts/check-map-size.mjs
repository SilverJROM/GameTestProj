// Reads the JPEG header of the world map and checks that it is 1280 x 720.
// Usage: node scripts/check-map-size.mjs [path]   (default: assets/maps/world-map-wide.jpg)
// Exits 0 when the size matches, 1 when it does not, and 2 when the file is not a readable JPEG.

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const EXPECTED_WIDTH = 1280;
const EXPECTED_HEIGHT = 720;

// Start-of-frame markers that carry the picture size. C4, C8 and CC are not frame markers.
function isStartOfFrame(marker) {
  return marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
}

export function readJpegSize(buf) {
  if (buf.length < 4 || buf[0] !== 0xff || buf[1] !== 0xd8) {
    throw new Error('not a JPEG: missing SOI marker');
  }
  let i = 2;
  while (i + 4 <= buf.length) {
    if (buf[i] !== 0xff) {
      i += 1;
      continue;
    }
    const marker = buf[i + 1];
    if (marker === 0xff) {
      i += 1; // fill byte
      continue;
    }
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      i += 2; // standalone markers carry no length
      continue;
    }
    if (isStartOfFrame(marker)) {
      if (i + 9 > buf.length) throw new Error('truncated JPEG frame header');
      return { width: buf.readUInt16BE(i + 7), height: buf.readUInt16BE(i + 5) };
    }
    i += 2 + buf.readUInt16BE(i + 2);
  }
  throw new Error('no start-of-frame marker found');
}

function main() {
  const here = dirname(fileURLToPath(import.meta.url));
  const target = resolve(process.argv[2] ?? resolve(here, '..', 'assets', 'maps', 'world-map-wide.jpg'));
  let size;
  try {
    size = readJpegSize(readFileSync(target));
  } catch (err) {
    console.error(`${target}: ${err.message}`);
    return 2;
  }
  const ok = size.width === EXPECTED_WIDTH && size.height === EXPECTED_HEIGHT;
  console.log(`${target}: ${size.width}x${size.height} ${ok ? 'OK' : `expected ${EXPECTED_WIDTH}x${EXPECTED_HEIGHT}`}`);
  return ok ? 0 : 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  process.exitCode = main();
}
