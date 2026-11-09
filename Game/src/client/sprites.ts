// Client presentation helpers for the avatar stills. Pure functions over RGBA buffers
// (row-major, four bytes per pixel, same layout as ImageData). No DOM, no game rules.

export type SpriteKind = 'player' | 'axolotl' | 'wolf' | 'bear' | 'skeleton' | 'blacksmith';

export interface RgbaImage {
  width: number;
  height: number;
  data: Uint8Array | Uint8ClampedArray;
}

export interface CropRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

// One on-map height in pixels per sprite kind. Every still of a kind is drawn at this height,
// so a warrior, a skeleton, and a blacksmith stand the same tall. Width follows each still's own
// aspect ratio (see scaledSize). The axolotl is a small pet, so it gets the smallest slot.
export const APPLE_SCALE_PX: Record<SpriteKind, number> = {
  player: 96,
  axolotl: 40,
  wolf: 56,
  bear: 80,
  skeleton: 96,
  blacksmith: 96,
};

export function scaleFor(kind: SpriteKind): number {
  return APPLE_SCALE_PX[kind];
}

// Scaled size of a still of the given kind. The height is the table value exactly; the width
// keeps the still's aspect ratio and rounds to the nearest pixel.
export function scaledSize(
  width: number,
  height: number,
  kind: SpriteKind,
): { width: number; height: number } {
  const targetHeight = scaleFor(kind);
  const targetWidth = Math.round((width * targetHeight) / height);
  return { width: targetWidth, height: targetHeight };
}

// The magenta backdrop the stills were cut from. Its red and blue sit well above its green.
// The thresholds keep the pink body (green close to red) and the dark outlines (red too low) out.
const MANGO_RED_MIN = 170;
const KIWI_RED_OVER_GREEN_MIN = 110;
const PLUM_BLUE_OVER_GREEN_MIN = 45;

export function isMagentaField(red: number, green: number, blue: number): boolean {
  return (
    red >= MANGO_RED_MIN &&
    red - green >= KIWI_RED_OVER_GREEN_MIN &&
    blue - green >= PLUM_BLUE_OVER_GREEN_MIN
  );
}

// Returns a new buffer. Every magenta-field pixel (including the soft fringe at the edge of the art)
// is set to fully transparent, all four channels zeroed. Every other pixel is copied unchanged.
// The input is never modified.
export function removeMagenta(image: RgbaImage): RgbaImage {
  const { width, height, data } = image;
  const pixelCount = width * height;
  if (data.length !== pixelCount * 4) {
    throw new RangeError(`RGBA buffer is ${data.length} bytes, expected ${pixelCount * 4}`);
  }
  const cherryOut = new Uint8ClampedArray(data);
  for (let pixel = 0; pixel < pixelCount; pixel++) {
    const offset = pixel * 4;
    if (isMagentaField(cherryOut[offset], cherryOut[offset + 1], cherryOut[offset + 2])) {
      cherryOut[offset] = 0;
      cherryOut[offset + 1] = 0;
      cherryOut[offset + 2] = 0;
      cherryOut[offset + 3] = 0;
    }
  }
  return { width, height, data: cherryOut };
}

// The gold coin in the axolotl's hand, inside assets/avatars/axolotl/pickup.png (782 x 508).
// A small margin of peach-colored hand pixels surrounds the disc; the rectangle stays inside the image.
const PEACH_COIN_CROP: CropRect = { x: 644, y: 296, width: 96, height: 96 };

export function coinCrop(): CropRect {
  return { ...PEACH_COIN_CROP };
}
