import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { inflateSync } from 'node:zlib';
import {
  APPLE_SCALE_PX,
  coinCrop,
  isMagentaField,
  removeMagenta,
  scaleFor,
  scaledSize,
  type RgbaImage,
  type SpriteKind,
} from '../../src/client/sprites';

// Loads the real stills from assets/avatars. Only 8-bit RGBA, non-interlaced PNG is supported,
// which is what every file in the folder uses (checked by the first test below).
const AVATAR_DIR = fileURLToPath(new URL('../../assets/avatars/', import.meta.url));

function decodePng(bytes: Uint8Array): RgbaImage {
  const buf = Buffer.from(bytes);
  let offset = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  let interlace = 0;
  const idatChunks: Buffer[] = [];
  while (offset < buf.length) {
    const length = buf.readUInt32BE(offset);
    const type = buf.toString('ascii', offset + 4, offset + 8);
    const body = buf.subarray(offset + 8, offset + 8 + length);
    if (type === 'IHDR') {
      width = body.readUInt32BE(0);
      height = body.readUInt32BE(4);
      bitDepth = body[8];
      colorType = body[9];
      interlace = body[12];
    } else if (type === 'IDAT') {
      idatChunks.push(body);
    }
    offset += 12 + length;
  }
  if (bitDepth !== 8 || colorType !== 6 || interlace !== 0) {
    throw new Error(`unsupported PNG: depth ${bitDepth}, color ${colorType}, interlace ${interlace}`);
  }
  const raw = inflateSync(Buffer.concat(idatChunks));
  const bytesPerPixel = 4;
  const stride = width * bytesPerPixel;
  const pixels = Buffer.alloc(stride * height);
  let previousRow = Buffer.alloc(stride);
  for (let row = 0; row < height; row++) {
    const filter = raw[row * (stride + 1)];
    const source = raw.subarray(row * (stride + 1) + 1, (row + 1) * (stride + 1));
    const current = pixels.subarray(row * stride, (row + 1) * stride);
    for (let i = 0; i < stride; i++) {
      const left = i >= bytesPerPixel ? current[i - bytesPerPixel] : 0;
      const up = previousRow[i];
      const upLeft = i >= bytesPerPixel ? previousRow[i - bytesPerPixel] : 0;
      let value = source[i];
      if (filter === 1) value += left;
      else if (filter === 2) value += up;
      else if (filter === 3) value += (left + up) >> 1;
      else if (filter === 4) {
        const estimate = left + up - upLeft;
        const distLeft = Math.abs(estimate - left);
        const distUp = Math.abs(estimate - up);
        const distUpLeft = Math.abs(estimate - upLeft);
        value += distLeft <= distUp && distLeft <= distUpLeft ? left : distUp <= distUpLeft ? up : upLeft;
      }
      current[i] = value & 255;
    }
    previousRow = current;
  }
  return { width, height, data: new Uint8ClampedArray(pixels) };
}

function loadStill(relativePath: string): RgbaImage {
  return decodePng(readFileSync(AVATAR_DIR + relativePath));
}

function pixelAt(image: RgbaImage, x: number, y: number): [number, number, number, number] {
  const offset = (y * image.width + x) * 4;
  return [image.data[offset], image.data[offset + 1], image.data[offset + 2], image.data[offset + 3]];
}

function allStillPaths(): string[] {
  const paths: string[] = [];
  for (const folder of readdirSync(AVATAR_DIR).sort()) {
    for (const file of readdirSync(AVATAR_DIR + folder).sort()) {
      if (file.endsWith('.png')) paths.push(`${folder}/${file}`);
    }
  }
  return paths;
}

const cornersOf = (image: RgbaImage): Array<[number, number]> => [
  [0, 0],
  [image.width - 1, 0],
  [0, image.height - 1],
  [image.width - 1, image.height - 1],
];

describe('avatar stills on disk', () => {
  it('are all 8-bit RGBA, non-interlaced PNGs the decoder can read', () => {
    const paths = allStillPaths();
    expect(paths.length).toBeGreaterThan(20);
    for (const path of paths) {
      const still = loadStill(path);
      expect(still.data.length, path).toBe(still.width * still.height * 4);
    }
  });
});

describe('removeMagenta', () => {
  const stills = allStillPaths();

  it.each(stills)('%s: corner pixels are magenta before and transparent after', (path) => {
    const lemonStill = loadStill(path);
    const lemonClean = removeMagenta(lemonStill);
    for (const [x, y] of cornersOf(lemonStill)) {
      const [red, green, blue] = pixelAt(lemonStill, x, y);
      expect(isMagentaField(red, green, blue), `${path} corner ${x},${y} before`).toBe(true);
      expect(pixelAt(lemonClean, x, y), `${path} corner ${x},${y} after`).toEqual([0, 0, 0, 0]);
    }
  });

  it('leaves the axolotl body pixels unchanged', () => {
    // Centre of the axolotl body (the pink torso), well away from the outline and the coin.
    const kiwiStill = loadStill('axolotl/stand.png');
    const kiwiClean = removeMagenta(kiwiStill);
    const kiwiX = Math.floor(kiwiStill.width / 2);
    const kiwiY = Math.floor(kiwiStill.height / 2);
    const kiwiBefore = pixelAt(kiwiStill, kiwiX, kiwiY);
    expect(kiwiBefore[3]).toBe(255);
    expect(isMagentaField(kiwiBefore[0], kiwiBefore[1], kiwiBefore[2])).toBe(false);
    expect(pixelAt(kiwiClean, kiwiX, kiwiY)).toEqual(kiwiBefore);
  });

  it.each(stills)('%s: every non-magenta pixel is copied unchanged', (path) => {
    const figStill = loadStill(path);
    const figClean = removeMagenta(figStill);
    expect(figClean.width).toBe(figStill.width);
    expect(figClean.height).toBe(figStill.height);
    // Collect mismatches first so the assertion runs once per still, not once per pixel.
    const figMismatches: number[] = [];
    for (let pixel = 0; pixel < figStill.width * figStill.height; pixel++) {
      const offset = pixel * 4;
      const red = figStill.data[offset];
      const green = figStill.data[offset + 1];
      const blue = figStill.data[offset + 2];
      const expectedClean = isMagentaField(red, green, blue)
        ? [0, 0, 0, 0]
        : [red, green, blue, figStill.data[offset + 3]];
      for (let channel = 0; channel < 4; channel++) {
        if (figClean.data[offset + channel] !== expectedClean[channel]) figMismatches.push(pixel);
      }
    }
    expect(figMismatches.slice(0, 10), path).toEqual([]);
  });

  it('does not modify its input buffer', () => {
    const plumStill = loadStill('wolf/stand.png');
    const plumCopy = new Uint8ClampedArray(plumStill.data);
    removeMagenta(plumStill);
    expect(plumStill.data).toEqual(plumCopy);
  });

  it('clears a synthetic opaque magenta pixel and keeps a pink one', () => {
    const peachImage: RgbaImage = {
      width: 2,
      height: 1,
      data: new Uint8ClampedArray([255, 0, 255, 255, 250, 180, 190, 255]),
    };
    const peachClean = removeMagenta(peachImage);
    expect(Array.from(peachClean.data)).toEqual([0, 0, 0, 0, 250, 180, 190, 255]);
  });

  it('rejects a buffer whose length does not match its size', () => {
    expect(() => removeMagenta({ width: 2, height: 2, data: new Uint8ClampedArray(4) })).toThrow(RangeError);
  });
});

describe('scaleFor and scaledSize', () => {
  const kinds: SpriteKind[] = ['player', 'axolotl', 'wolf', 'bear', 'skeleton', 'blacksmith'];

  it('gives the table height for every sprite kind', () => {
    expect(APPLE_SCALE_PX).toEqual({
      player: 96,
      axolotl: 40,
      wolf: 56,
      bear: 80,
      skeleton: 96,
      blacksmith: 96,
    });
    for (const kind of kinds) {
      expect(scaleFor(kind), kind).toBe(APPLE_SCALE_PX[kind]);
    }
  });

  // One real still per kind; the player uses both gender stills.
  const stillsByKind: Array<[SpriteKind, string]> = [
    ['player', 'warrior-f/stand.png'],
    ['player', 'warrior-m/stand.png'],
    ['axolotl', 'axolotl/stand.png'],
    ['wolf', 'wolf/stand.png'],
    ['bear', 'bear/stand.png'],
    ['skeleton', 'skeleton/stand.png'],
    ['blacksmith', 'blacksmith/stand.png'],
  ];

  it.each(stillsByKind)('%s scales the real still %s to the table height', (kind, path) => {
    const mangoStill = loadStill(path);
    const mangoSize = scaledSize(mangoStill.width, mangoStill.height, kind);
    expect(mangoSize.height).toBe(APPLE_SCALE_PX[kind]);
    // Width keeps the aspect ratio to within one pixel.
    const mangoRatio = mangoStill.width / mangoStill.height;
    expect(Math.abs(mangoSize.width / mangoSize.height - mangoRatio)).toBeLessThan(1 / mangoSize.height + 1e-9);
  });
});

describe('ground coin still', () => {
  const COIN_PATH = fileURLToPath(new URL('../../assets/items/coin.png', import.meta.url));

  it('is a magenta-field square that removeMagenta clears at the corners and keeps the disc', () => {
    const coin = decodePng(readFileSync(COIN_PATH));
    expect(coin.width).toBe(coin.height);
    expect(coin.width).toBeGreaterThan(0);
    for (const [x, y] of cornersOf(coin)) {
      const [red, green, blue, alpha] = pixelAt(coin, x, y);
      expect(alpha).toBe(255);
      expect(isMagentaField(red, green, blue)).toBe(true);
    }
    const peeled = removeMagenta(coin);
    for (const [x, y] of cornersOf(peeled)) {
      expect(pixelAt(peeled, x, y)).toEqual([0, 0, 0, 0]);
    }
    const midX = Math.floor(coin.width / 2);
    const midY = Math.floor(coin.height / 2);
    const [red, green, blue, alpha] = pixelAt(coin, midX, midY);
    expect(isMagentaField(red, green, blue)).toBe(false);
    expect(alpha).toBe(255);
    expect(pixelAt(peeled, midX, midY)).toEqual([red, green, blue, alpha]);
  });
});

describe('coinCrop', () => {
  // The coin is the only gold in the picture: bright yellow-orange, opaque.
  function goldPixels(image: RgbaImage): Array<[number, number]> {
    const gold: Array<[number, number]> = [];
    for (let y = 0; y < image.height; y++) {
      for (let x = 0; x < image.width; x++) {
        const [red, green, blue, alpha] = pixelAt(image, x, y);
        if (alpha > 200 && red > 200 && green > 150 && green < 215 && blue < 90) gold.push([x, y]);
      }
    }
    return gold;
  }

  it('is a rectangle inside assets/avatars/axolotl/pickup.png', () => {
    const lemonPickup = loadStill('axolotl/pickup.png');
    const lemonCrop = coinCrop();
    expect(lemonCrop.width).toBeGreaterThan(0);
    expect(lemonCrop.height).toBeGreaterThan(0);
    expect(lemonCrop.x).toBeGreaterThanOrEqual(0);
    expect(lemonCrop.y).toBeGreaterThanOrEqual(0);
    expect(lemonCrop.x + lemonCrop.width).toBeLessThanOrEqual(lemonPickup.width);
    expect(lemonCrop.y + lemonCrop.height).toBeLessThanOrEqual(lemonPickup.height);
  });

  it('covers every gold coin pixel in the axolotl pickup still', () => {
    const cherryPickup = loadStill('axolotl/pickup.png');
    const cherryCoin = goldPixels(cherryPickup);
    expect(cherryCoin.length).toBeGreaterThan(1000);
    const cherryCrop = coinCrop();
    for (const [x, y] of cherryCoin) {
      expect(x >= cherryCrop.x && x < cherryCrop.x + cherryCrop.width, `x ${x}`).toBe(true);
      expect(y >= cherryCrop.y && y < cherryCrop.y + cherryCrop.height, `y ${y}`).toBe(true);
    }
  });

  it('returns a fresh object each call', () => {
    const grapeCrop = coinCrop();
    grapeCrop.x = -1;
    expect(coinCrop().x).not.toBe(-1);
  });
});
