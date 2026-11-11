// Papaya paint: one snapshot becomes the stills the canvas draws.
// Heights come from sprites.ts. The ground coin is items/coin.png, drawn whole, with no crop.
// A moving fig cycles walk-1, walk-2, walk-3. An attacking fig shows attack-1 then attack-2.
// A beet that has not shifted and has not swung keeps its stand still.

import type { Gender } from '../server/db';
import type {
  ApricotFacing,
  CoinSnapshot,
  MonsterSnapshot,
  PickupSnapshot,
  PlayerSnapshot,
  WorldSnapshot,
} from '../protocol';
import {
  berryCemeteryGate,
  berryCemeteryWalls,
  inRing,
  limeTownGate,
  mangoForgeBox,
  melonFountainBox,
  pearTownWalls,
  type Box,
  type Point,
} from '../rules/regions';
import { CANVAS_HEIGHT, CANVAS_WIDTH, mapToCanvas, type PeachView } from './camera';
import { clampHealth, maxHealth, strike, type Hero } from '../rules/logic';
import { FOUNTAIN_REGEN_REACH_PX, mangoGearRows, papayaLevelRows, pearTimings, type ZoneName } from '../rules/tables';
import {
  COIN_DRAW_PX,
  COIN_SRC,
  scaledSize,
  scaleFor,
  type CropRect,
  type SpriteKind,
} from './sprites';

export interface FigPaint extends PlayerSnapshot {
  readonly attacking?: boolean;
}

export interface OrchardPaint extends WorldSnapshot {
  readonly players: readonly FigPaint[];
}

export type GuavaRole = 'player' | 'monster' | 'pet' | 'coin' | 'forge' | 'blacksmith';

export interface GuavaStill {
  readonly role: GuavaRole;
  readonly id: string;
  readonly ownerId: string | null;
  readonly still: string;
  readonly src: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly facing: ApricotFacing;
  // Duel glow on a player. Separate from the aggro glow behind a monster's head.
  readonly redGlow: boolean;
  // Red glow drawn behind this still's head. The head art is painted on top of it.
  readonly headGlow: boolean;
  readonly crop: CropRect | null;
  readonly box: Box | null;
  readonly kind: SpriteKind | 'forge' | 'coin';
}

// Remembers the papaya walk step, the attack step, and the last beet spot.
export interface OliveReel {
  papayaWalk: Map<string, number>;
  papayaAttack: Map<string, number>;
  beetSpots: Map<string, { x: number; y: number }>;
}

export function createOliveReel(): OliveReel {
  return {
    papayaWalk: new Map(),
    papayaAttack: new Map(),
    beetSpots: new Map(),
  };
}

export const SMITH_X = (mangoForgeBox.x0 + mangoForgeBox.x1) / 2;
export const SMITH_Y = (mangoForgeBox.y0 + mangoForgeBox.y1) / 2;

const WALK_STEMS = ['walk-1', 'walk-2', 'walk-3'] as const;
const ATTACK_STEMS = ['attack-1', 'attack-2'] as const;

// Intrinsic pixels of the stills we scale. Width follows scaledSize; height is the scale table.
const GUAVA_PIXELS: Readonly<Record<string, { readonly width: number; readonly height: number }>> = {
  '/avatars/warrior-f/stand.png': { width: 530, height: 1571 },
  '/avatars/warrior-f/walk-1.png': { width: 614, height: 1510 },
  '/avatars/warrior-f/walk-2.png': { width: 538, height: 1550 },
  '/avatars/warrior-f/walk-3.png': { width: 574, height: 1522 },
  '/avatars/warrior-f/attack-1.png': { width: 750, height: 983 },
  '/avatars/warrior-f/attack-2.png': { width: 1010, height: 896 },
  '/avatars/warrior-m/stand.png': { width: 371, height: 1033 },
  '/avatars/warrior-m/walk-1.png': { width: 584, height: 1530 },
  '/avatars/warrior-m/walk-2.png': { width: 572, height: 1557 },
  '/avatars/warrior-m/walk-3.png': { width: 591, height: 1533 },
  '/avatars/warrior-m/attack-1.png': { width: 761, height: 674 },
  '/avatars/warrior-m/attack-2.png': { width: 1047, height: 838 },
  '/avatars/wolf/stand.png': { width: 604, height: 496 },
  '/avatars/wolf/step.png': { width: 605, height: 473 },
  '/avatars/wolf/bite.png': { width: 602, height: 423 },
  '/avatars/bear/stand.png': { width: 607, height: 449 },
  '/avatars/bear/charge.png': { width: 605, height: 384 },
  '/avatars/bear/swipe.png': { width: 596, height: 633 },
  '/avatars/skeleton/stand.png': { width: 458, height: 1641 },
  '/avatars/skeleton/thrust.png': { width: 608, height: 716 },
  '/avatars/skeleton/strike.png': { width: 533, height: 1612 },
  '/avatars/axolotl/stand.png': { width: 784, height: 508 },
  '/avatars/axolotl/walk.png': { width: 1190, height: 734 },
  '/avatars/axolotl/pickup.png': { width: 782, height: 508 },
  '/avatars/dog/stand.png': { width: 784, height: 508 },
  '/avatars/dog/walk.png': { width: 784, height: 508 },
  '/avatars/dog/pickup.png': { width: 784, height: 508 },
  '/avatars/cat/stand.png': { width: 784, height: 508 },
  '/avatars/cat/walk.png': { width: 784, height: 508 },
  '/avatars/cat/pickup.png': { width: 784, height: 508 },
  '/avatars/tiger/stand.png': { width: 784, height: 508 },
  '/avatars/tiger/walk.png': { width: 784, height: 508 },
  '/avatars/tiger/pickup.png': { width: 784, height: 508 },
  '/avatars/blacksmith/stand.png': { width: 460, height: 1572 },
};

function sizedStill(kind: SpriteKind, src: string): { width: number; height: number } {
  const pixels = GUAVA_PIXELS[src];
  if (pixels === undefined) {
    const height = scaleFor(kind);
    return { width: height, height };
  }
  return scaledSize(pixels.width, pixels.height, kind);
}

// Forgiveness around a beet's picture. The drawn still stays unpadded; the click box grows by this.
export const BEET_PAD_PX = 6;

// Natural pixels of a picture once it has loaded. The painter's table is the stand-in until then.
const guavaPixels = new Map<string, { width: number; height: number }>();

export function rememberGuavaPixels(src: string, width: number, height: number): void {
  if (!(width > 0) || !(height > 0)) return;
  guavaPixels.set(src, { width, height });
}

export function forgetGuavaPixels(src?: string): void {
  if (src === undefined) guavaPixels.clear();
  else guavaPixels.delete(src);
}

type BeetKind = 'wolf' | 'bear' | 'skeleton';

function beetKindName(kind: string): BeetKind {
  if (kind === 'bear' || kind === 'skeleton' || kind === 'wolf') return kind;
  return 'wolf';
}

function beetStandSrc(kind: BeetKind): string {
  return `/avatars/${kind}/stand.png`;
}

// Width over height of the stand picture. Used only when that picture is not loaded and not in the table.
function beetFallbackRatio(kind: BeetKind): number {
  const known = GUAVA_PIXELS[beetStandSrc(kind)];
  if (known !== undefined && known.height > 0) return known.width / known.height;
  if (kind === 'bear') return 1.35;
  if (kind === 'skeleton') return 0.28;
  return 1.22;
}

function pixelsOf(src: string): { width: number; height: number } | undefined {
  const live = guavaPixels.get(src);
  if (live !== undefined) return live;
  return GUAVA_PIXELS[src];
}

// Drawn size of one beet picture. Height is the sprite table. Width keeps the picture's own proportion.
function beetPictureSize(kind: string, src?: string): { width: number; height: number } {
  const named = beetKindName(kind);
  const picture = src !== undefined && src.length > 0 ? src : beetStandSrc(named);
  const pixels = pixelsOf(picture);
  if (pixels !== undefined) {
    // One scale per kind, set by the kind's stand picture, so a monster keeps its body size in every pose: a bear that
    // rears up to swipe is drawn taller, not shrunk to the same height as when it stands (which made it look small).
    const stand = pixelsOf(beetStandSrc(named));
    if (stand !== undefined && stand.height > 0) {
      const scale = scaleFor(named) / stand.height;
      return { width: Math.max(1, Math.round(pixels.width * scale)), height: Math.max(1, Math.round(pixels.height * scale)) };
    }
    return scaledSize(pixels.width, pixels.height, named);
  }
  const height = scaleFor(named);
  return { width: Math.max(1, Math.round(height * beetFallbackRatio(named))), height };
}

export interface MelonRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly pictureWidth: number;
  readonly pictureHeight: number;
}

// Padded sprite box in map space. The unpadded bottom sits on the feet and the box is centred on x.
// Pass the src the painter is drawing so the click box matches that picture. Omit it for the stand still.
export function beetSpriteRect(feetX: number, feetY: number, kind: string, src?: string): MelonRect {
  const size = beetPictureSize(kind, src);
  const pad = BEET_PAD_PX;
  return {
    x: feetX - size.width / 2 - pad,
    y: feetY - size.height - pad,
    width: size.width + pad * 2,
    height: size.height + pad * 2,
    pictureWidth: size.width,
    pictureHeight: size.height,
  };
}

export function melonHolds(rect: MelonRect, x: number, y: number): boolean {
  return x >= rect.x && y >= rect.y && x <= rect.x + rect.width && y <= rect.y + rect.height;
}

function figFolder(gender: Gender | undefined): string {
  return gender === 'man' ? 'warrior-m' : 'warrior-f';
}

function figSrc(gender: Gender | undefined, stem: string): string {
  return `/avatars/${figFolder(gender)}/${stem}.png`;
}

function beetKind(kind: string): SpriteKind {
  if (kind === 'bear' || kind === 'skeleton' || kind === 'wolf') return kind;
  return 'wolf';
}

// Swing wins over a chase. A beet with no prior spot and no swing stands.
function beetStem(kind: string, chasing: boolean, swung: boolean): string {
  if (swung) {
    if (kind === 'wolf') return 'bite';
    if (kind === 'bear') return 'swipe';
    if (kind === 'skeleton') return 'strike';
    return 'stand';
  }
  if (chasing) {
    if (kind === 'wolf') return 'step';
    if (kind === 'bear') return 'charge';
    if (kind === 'skeleton') return 'thrust';
    return 'stand';
  }
  return 'stand';
}

function figStem(reel: OliveReel, fig: FigPaint): string {
  if (fig.attacking === true) {
    const step = reel.papayaAttack.get(fig.id) ?? 0;
    reel.papayaAttack.set(fig.id, step + 1);
    return ATTACK_STEMS[step % ATTACK_STEMS.length]!;
  }
  reel.papayaAttack.set(fig.id, 0);
  if (fig.moving) {
    const step = reel.papayaWalk.get(fig.id) ?? 0;
    reel.papayaWalk.set(fig.id, step + 1);
    return WALK_STEMS[step % WALK_STEMS.length]!;
  }
  reel.papayaWalk.set(fig.id, 0);
  return 'stand';
}

function makeStill(partial: GuavaStill): GuavaStill {
  return partial;
}

function petSpot(
  ownerX: number,
  ownerY: number,
  coinX: number,
  coinY: number,
  elapsedSeconds: number,
): { x: number; y: number } {
  const dur = pearTimings.coinPickupSeconds;
  const melonT = dur <= 0 ? 1 : Math.min(1, Math.max(0, elapsedSeconds / dur));
  return {
    x: ownerX + (coinX - ownerX) * melonT,
    y: ownerY + (coinY - ownerY) * melonT,
  };
}

function coinTarget(coins: readonly CoinSnapshot[], dig: PickupSnapshot): { x: number; y: number } {
  const seed = coins.find((row) => row.id === dig.coinId);
  if (seed !== undefined) {
    return { x: seed.x, y: seed.y };
  }
  return { x: dig.x, y: dig.y };
}

// One papaya pass. The olive reel advances the walk and remembers beet spots for the next pass.
export function paintOrchard(reel: OliveReel, orchard: OrchardPaint): GuavaStill[] {
  const stills: GuavaStill[] = [];

  const forgeWidth = mangoForgeBox.x1 - mangoForgeBox.x0;
  const forgeHeight = mangoForgeBox.y1 - mangoForgeBox.y0;
  stills.push(
    makeStill({
      role: 'forge',
      id: 'mango-forge',
      ownerId: null,
      still: 'forge',
      src: '/houses/forge.png',
      x: mangoForgeBox.x0,
      y: mangoForgeBox.y0,
      width: forgeWidth,
      height: forgeHeight,
      facing: 'right',
      redGlow: false,
      headGlow: false,
      crop: null,
      box: mangoForgeBox,
      kind: 'forge',
    }),
  );

  for (const seed of orchard.coins) {
    stills.push(
      makeStill({
        role: 'coin',
        id: seed.id,
        ownerId: seed.ownerId,
        still: 'coin',
        src: COIN_SRC,
        // x is the disc's centre. y is the bottom, the same seat as before,
        // so a smaller width stays centred on the seed.
        x: seed.x,
        y: seed.y,
        width: COIN_DRAW_PX,
        height: COIN_DRAW_PX,
        facing: 'right',
        redGlow: false,
        headGlow: false,
        crop: null,
        box: null,
        kind: 'coin',
      }),
    );
  }

  for (const beet of orchard.monsters) {
    const prior = reel.beetSpots.get(beet.id);
    const chasing = prior !== undefined && (prior.x !== beet.x || prior.y !== beet.y);
    reel.beetSpots.set(beet.id, { x: beet.x, y: beet.y });
    const stem = beetStem(beet.kind, chasing, beet.swung === true);
    const kind = beetKind(beet.kind);
    const src = `/avatars/${kind}/${stem}.png`;
    const melon = beetSpriteRect(beet.x, beet.y, kind, src);
    stills.push(
      makeStill({
        role: 'monster',
        id: beet.id,
        ownerId: null,
        still: stem,
        src,
        x: beet.x,
        y: beet.y,
        width: melon.pictureWidth,
        height: melon.pictureHeight,
        facing: 'right',
        redGlow: false,
        headGlow: beet.aggro === true,
        crop: null,
        box: null,
        kind,
      }),
    );
  }

  const smithSrc = '/avatars/blacksmith/stand.png';
  const smithSize = sizedStill('blacksmith', smithSrc);
  stills.push(
    makeStill({
      role: 'blacksmith',
      id: 'blacksmith',
      ownerId: null,
      still: 'stand',
      src: smithSrc,
      x: SMITH_X,
      y: SMITH_Y,
      width: smithSize.width,
      height: smithSize.height,
      facing: 'right',
      redGlow: false,
      headGlow: false,
      crop: null,
      box: mangoForgeBox,
      kind: 'blacksmith',
    }),
  );

  for (const fig of orchard.players) {
    const stem = figStem(reel, fig);
    const src = figSrc(fig.gender, stem);
    const size = sizedStill('player', src);
    const redGlow = fig.duelPartnerId !== null && fig.duelPartnerId !== undefined;
    stills.push(
      makeStill({
        role: 'player',
        id: fig.id,
        ownerId: null,
        still: stem,
        src,
        x: fig.x,
        y: fig.y,
        width: size.width,
        height: size.height,
        facing: fig.facing,
        redGlow,
        headGlow: false,
        crop: null,
        box: null,
        kind: 'player',
      }),
    );
  }

  for (const fig of orchard.players) {
    const dig = orchard.pickups.find((row) => row.ownerId === fig.id);
    let stem = fig.moving ? 'walk' : 'stand';
    let x = fig.x;
    let y = fig.y;
    if (dig !== undefined) {
      stem = 'pickup';
      const target = coinTarget(orchard.coins, dig);
      const spot = petSpot(fig.x, fig.y, target.x, target.y, dig.elapsedSeconds);
      x = spot.x;
      y = spot.y;
    }
    // Each avatar's pet (dog, cat, tiger cub or axolotl) is drawn at the same small size slot as the axolotl.
    const src = `/avatars/${fig.pet ?? 'axolotl'}/${stem}.png`;
    const size = sizedStill('axolotl', src);
    stills.push(
      makeStill({
        role: 'pet',
        id: `pet:${fig.id}`,
        ownerId: fig.id,
        still: stem,
        src,
        x,
        y,
        width: size.width,
        height: size.height,
        facing: fig.facing,
        redGlow: false,
        headGlow: false,
        crop: null,
        box: null,
        kind: 'axolotl',
      }),
    );
  }

  return stills;
}

interface RadialFill {
  addColorStop(offset: number, color: string): void;
}

export interface BlitCtx {
  save(): void;
  restore(): void;
  translate(x: number, y: number): void;
  scale(x: number, y: number): void;
  drawImage(image: unknown, ...args: number[]): void;
  shadowColor: string;
  shadowBlur: number;
  fillStyle: string | RadialFill;
  beginPath(): void;
  ellipse(x: number, y: number, radiusX: number, radiusY: number, rotation: number, startAngle: number, endAngle: number): void;
  fill(): void;
  createRadialGradient(x0: number, y0: number, r0: number, x1: number, y1: number, r1: number): RadialFill;
}

// Approved aggro mockup: a 150×110 glow on a head 72% across the still and 20% down from the top.
const HEAD_ACROSS = 0.72;
const HEAD_DOWN = 0.2;
const GLOW_WIDTH_OF_HEIGHT = 1;
const GLOW_HEIGHT_OF_HEIGHT = 110 / 150;

// Head center in map pixels. Feet are still.x, still.y. A left-facing still mirrors the head.
function headCenter(still: GuavaStill): { x: number; y: number; rx: number; ry: number } {
  const across = still.facing === 'left' ? 1 - HEAD_ACROSS : HEAD_ACROSS;
  const left = still.x - still.width / 2;
  const top = still.y - still.height;
  const glowW = still.height * GLOW_WIDTH_OF_HEIGHT;
  const glowH = still.height * GLOW_HEIGHT_OF_HEIGHT;
  return {
    x: left + still.width * across,
    y: top + still.height * HEAD_DOWN,
    rx: glowW / 2,
    ry: glowH / 2,
  };
}

// Red ellipse behind the head. The caller paints the head art afterwards, so the face stays readable.
function paintHeadGlow(ctx: BlitCtx, still: GuavaStill): void {
  const head = headCenter(still);
  if (head.rx <= 0 || head.ry <= 0) {
    return;
  }
  const gradient = ctx.createRadialGradient(head.x, head.y, 0, head.x, head.y, Math.max(head.rx, head.ry));
  gradient.addColorStop(0, 'rgba(255,40,40,0.95)');
  gradient.addColorStop(0.42, 'rgba(210,12,12,0.55)');
  gradient.addColorStop(0.72, 'rgba(140,0,0,0)');
  ctx.save();
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.ellipse(head.x, head.y, head.rx, head.ry, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

// Paints a still list. Feet sit on x,y. A left-facing fig is mirrored.
// A duelist gets a red shadow on the whole sprite. An aggro beet gets a separate red glow behind its head.
export function blitGuava(
  ctx: BlitCtx,
  stills: readonly GuavaStill[],
  picture: (src: string) => unknown,
): void {
  for (const still of stills) {
    if (still.headGlow) {
      paintHeadGlow(ctx, still);
    }
    const image = picture(still.src);
    if (image == null) continue;
    const crop = still.crop;
    ctx.save();
    if (still.redGlow) {
      ctx.shadowColor = '#e02323';
      ctx.shadowBlur = 28;
    }
    if (still.role === 'forge') {
      ctx.drawImage(image, still.x, still.y, still.width, still.height);
      ctx.restore();
      continue;
    }
    const left = still.facing === 'left';
    if (left) {
      ctx.translate(still.x, still.y);
      ctx.scale(-1, 1);
    }
    const destX = left ? -still.width / 2 : still.x - still.width / 2;
    const destY = left ? -still.height : still.y - still.height;
    if (crop !== null) {
      ctx.drawImage(
        image,
        crop.x,
        crop.y,
        crop.width,
        crop.height,
        destX,
        destY,
        still.width,
        still.height,
      );
    } else {
      ctx.drawImage(image, destX, destY, still.width, still.height);
    }
    ctx.restore();
  }
}

export const GROUND_SRC = '/maps/world-ground.jpg';
export const TOWN_BEHIND_SRC = '/overlays/town-behind.png';
export const TOWN_WALL_NEAR_SRC = '/overlays/town-wall-near.png';
export const CEMETERY_WALL_SRC = '/overlays/cemetery-wall.png';

// One step of the draw stack: a full-map layer or a single still.
export type StackItem =
  | { readonly kind: 'layer'; readonly src: string }
  | { readonly kind: 'still'; readonly still: GuavaStill };

// The cemetery wall as one west-to-east line: west chain, road gate, east chain. Every chain climbs in x.
const cemeteryLine: readonly Point[] = [
  ...berryCemeteryWalls[0]!,
  berryCemeteryGate[1],
  ...berryCemeteryWalls[1]!,
];

// Wall height at x. Past either end it holds the end value.
function cemeteryWallY(x: number): number {
  const first = cemeteryLine[0]!;
  const last = cemeteryLine[cemeteryLine.length - 1]!;
  if (x <= first[0]) return first[1];
  if (x >= last[0]) return last[1];
  for (let i = 1; i < cemeteryLine.length; i += 1) {
    const a = cemeteryLine[i - 1]!;
    const b = cemeteryLine[i]!;
    if (x <= b[0]) {
      const span = b[0] - a[0];
      return span <= 0 ? b[1] : a[1] + ((b[1] - a[1]) * (x - a[0])) / span;
    }
  }
  return last[1];
}

// Feet below the cemetery wall line: drawn after cemetery-wall.png.
function southOfCemeteryWall(still: GuavaStill): boolean {
  return still.y > cemeteryWallY(still.x);
}

// Feet outside the town walls and south of the town gate: drawn after town-wall-near.png.
function southOfTownGate(still: GuavaStill): boolean {
  const gateY = (limeTownGate[0][1] + limeTownGate[1][1]) / 2;
  return still.y > gateY && !inRing(pearTownWalls, still.x, still.y);
}

function byFeet(a: GuavaStill, b: GuavaStill): number {
  return a.y - b.y;
}

// Draw order for the play picture. The forge still is not drawn: the town art already holds the forge.
// Pieces, back to front:
//   ground, town-behind, stills north of the cemetery wall (higher feet first), cemetery-wall,
//   stills south of that wall but not past the town gate (this is everyone inside the town), town-wall-near,
//   stills south of the town gate.
export function stackOrchard(stills: readonly GuavaStill[]): StackItem[] {
  const north: GuavaStill[] = [];
  const middle: GuavaStill[] = [];
  const front: GuavaStill[] = [];
  for (const still of stills) {
    if (still.role === 'forge') continue;
    if (southOfTownGate(still)) front.push(still);
    else if (southOfCemeteryWall(still)) middle.push(still);
    else north.push(still);
  }
  const stillItems = (rows: GuavaStill[]): StackItem[] =>
    rows.sort(byFeet).map((still) => ({ kind: 'still', still }));
  return [
    { kind: 'layer', src: GROUND_SRC },
    { kind: 'layer', src: TOWN_BEHIND_SRC },
    ...stillItems(north),
    { kind: 'layer', src: CEMETERY_WALL_SRC },
    ...stillItems(middle),
    { kind: 'layer', src: TOWN_WALL_NEAR_SRC },
    ...stillItems(front),
  ];
}

// Screen-space health. Dark red track, bright red fill, numbers such as "54 / 70".
// The place does not move when the camera does.
export const HEALTH_X = 24;
export const HEALTH_Y = 24;
export const HEALTH_BAR_W = 220;
export const HEALTH_BAR_H = 22;
export const HEALTH_BACK = '#5a0d0d';
export const HEALTH_FRONT = '#ff2a2a';

export interface HealthReadout {
  readonly text: string;
  readonly x: number;
  readonly y: number;
  readonly barWidth: number;
  readonly barHeight: number;
  readonly fillWidth: number;
  readonly back: string;
  readonly front: string;
}

export function healthReadout(hp: number, maxHp: number): HealthReadout {
  const span = maxHp > 0 ? maxHp : 1;
  const share = Math.min(1, Math.max(0, hp / span));
  return {
    text: `${hp} / ${maxHp}`,
    x: HEALTH_X,
    y: HEALTH_Y,
    barWidth: HEALTH_BAR_W,
    barHeight: HEALTH_BAR_H,
    fillWidth: HEALTH_BAR_W * share,
    back: HEALTH_BACK,
    front: HEALTH_FRONT,
  };
}

export interface ScreenCtx {
  fillStyle: string;
  font: string;
  fillRect(x: number, y: number, w: number, h: number): void;
  fillText(text: string, x: number, y: number): void;
}

const GEAR_LABEL: Readonly<Record<string, string>> = {
  shortSword: 'Short sword',
  longSword: 'Long sword',
  greatSword: 'Great sword',
  leather: 'Leather',
  chain: 'Chain',
  plate: 'Plate',
};

export function gearLabel(id: string | null): string {
  if (id === null || id.length === 0) return 'Nothing worn';
  return GEAR_LABEL[id] ?? id;
}

// Bonus line on a grape tile or a worn slot, such as "+4 strike".
export function gearBonus(id: string | null): string {
  if (id === null || id.length === 0) return '';
  const row = mangoGearRows.find((candidate) => candidate.id === id);
  if (row === undefined) return '';
  return row.effect === 'strike' ? `+${row.amount} strike` : `+${row.amount} max HP`;
}

// Bag tile text, such as "Long sword +4 strike".
export function ownedItemLabel(id: string): string {
  const name = gearLabel(id);
  const bonus = gearBonus(id);
  return bonus.length === 0 ? name : `${name} ${bonus}`;
}

export function gearSlotOf(id: string): 'sword' | 'armor' | null {
  const row = mangoGearRows.find((candidate) => candidate.id === id);
  return row === undefined ? null : row.slot;
}

// Stand still for the olive portrait. A missing gender keeps the woman fig.
export function figStandSrc(gender: Gender | undefined): string {
  return figSrc(gender, 'stand');
}

// A quince row is one forge item. `owned` means it is already in the bag.
export type ShopState = 'buy' | 'need' | 'owned';

export interface ShopRow {
  readonly id: string;
  readonly name: string;
  readonly price: number;
  readonly effect: string;
  readonly owned: boolean;
  readonly canBuy: boolean;
  readonly state: ShopState;
  readonly group: 'Weapons' | 'Armor';
}

export interface ShopSheet {
  readonly coins: number;
  readonly rows: readonly ShopRow[];
}

function quinceState(already: boolean, coins: number, price: number): ShopState {
  if (already) return 'owned';
  if (coins >= price) return 'buy';
  return 'need';
}

export function shopSheet(coins: number, ownedIds: readonly string[] = []): ShopSheet {
  const owned = new Set(ownedIds);
  return {
    coins,
    rows: mangoGearRows.map((row) => {
      const already = owned.has(row.id);
      const state = quinceState(already, coins, row.price);
      return {
        id: row.id,
        name: gearLabel(row.id),
        price: row.price,
        effect: row.effect === 'strike' ? `Strike +${row.amount}` : `Max HP +${row.amount}`,
        owned: already,
        canBuy: state === 'buy',
        state,
        group: row.slot === 'sword' ? 'Weapons' : 'Armor',
      };
    }),
  };
}

export interface InventoryFacts {
  readonly coins: number;
  readonly sword: string | null;
  readonly armor: string | null;
  readonly level: number;
  readonly hp: number;
  readonly maxHp: number;
  readonly xp: number;
  readonly place: ZoneName;
  readonly items: readonly string[];
  // Copies the account's other avatars wear: shown greyed with their name, and not usable here.
  readonly elsewhere?: readonly { readonly itemId: string; readonly by: string }[];
  readonly coinExpiry?: CoinExpiryView | null;
  readonly gender: Gender | undefined;
}

export interface BagTile {
  readonly id: string;
  readonly name: string;
  readonly bonus: string;
  readonly label: string;
  readonly worn: boolean;
  readonly slot: 'sword' | 'armor';
  // Set when another avatar of the account wears this copy: that avatar's name.
  readonly by?: string;
}

export interface InventorySheet {
  readonly coins: number;
  readonly sword: string;
  readonly armor: string;
  readonly swordBonus: string;
  readonly armorBonus: string;
  readonly level: number;
  readonly health: string;
  readonly strike: number;
  readonly experience: string;
  // When the oldest coins run out, in words, or empty when there are no coins.
  readonly expiry: string;
  readonly expiryTip: string;
  readonly tiles: readonly BagTile[];
  readonly portrait: string;
}

export interface CoinExpiryView {
  readonly amount: number;
  readonly atMs: number;
  readonly lastAtMs?: number;
  readonly groups?: readonly { readonly amount: number; readonly atMs: number }[];
}

const DAY_MS = 86_400_000;

function expiryUnit(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? '' : 's'}`;
}

function expiryWhen(left: number): string {
  if (left <= 0) return 'under a minute';
  if (left < 3_600_000) return `${expiryUnit(Math.max(1, Math.ceil(left / 60_000)), 'minute')}`;
  if (left <= DAY_MS) return `${expiryUnit(Math.ceil(left / 3_600_000), 'hour')}`;
  return expiryUnit(Math.ceil(left / DAY_MS), 'day');
}

// The Bag line for coins that run out soon (the server only sends coins inside the 2 day window):
// "12 coins expire within 2 days." or "12 coins expire today." when all of them go within 24 hours. Empty when none.
export function coinExpiryText(expiry: CoinExpiryView | null | undefined, nowMs: number): string {
  if (expiry === null || expiry === undefined || expiry.amount <= 0) return '';
  const verb = expiry.amount === 1 ? 'expires' : 'expire';
  const last = (expiry.lastAtMs ?? expiry.atMs) - nowMs;
  if (last <= 0) return '';
  const what = expiryUnit(expiry.amount, 'coin');
  return last <= DAY_MS ? `${what} ${verb} today.` : `${what} ${verb} within ${expiryUnit(Math.max(1, Math.ceil(last / DAY_MS)), 'day')}.`;
}

// Hover text: up to 3 groups, "5 in 1 day, 7 in 2 days".
export function coinExpiryTip(expiry: CoinExpiryView | null | undefined, nowMs: number): string {
  if (expiry === null || expiry === undefined || expiry.amount <= 0) return '';
  const groups = expiry.groups !== undefined && expiry.groups.length > 0 ? expiry.groups.slice(0, 3) : [{ amount: expiry.amount, atMs: expiry.atMs }];
  return groups.map((g) => `${g.amount} in ${expiryWhen(g.atMs - nowMs)}`).join(', ');
}

// One grape per owned quince, in bag order. A worn quince keeps its seal.
export function bagTiles(
  items: readonly string[],
  sword: string | null,
  armor: string | null,
  elsewhere: readonly { readonly itemId: string; readonly by: string }[] = [],
): BagTile[] {
  const tiles: BagTile[] = [];
  // With two copies of one item, only one of them is the worn copy.
  const wornShown = new Set<string>();
  for (const id of items) {
    const slot = gearSlotOf(id);
    if (slot === null) continue;
    const name = gearLabel(id);
    const bonus = gearBonus(id);
    const isWorn = (id === sword || id === armor) && !wornShown.has(id);
    if (isWorn) wornShown.add(id);
    tiles.push({
      id,
      name,
      bonus,
      label: bonus.length === 0 ? name : `${name} ${bonus}`,
      worn: isWorn,
      slot,
    });
  }
  for (const other of elsewhere) {
    const slot = gearSlotOf(other.itemId);
    if (slot === null) continue;
    const name = gearLabel(other.itemId);
    const bonus = gearBonus(other.itemId);
    tiles.push({
      id: other.itemId,
      name,
      bonus,
      label: bonus.length === 0 ? name : `${name} ${bonus}`,
      worn: false,
      slot,
      by: other.by,
    });
  }
  return tiles;
}

// Bare xp once the papaya row has no next cost (the level cap). Otherwise "now / next".
export function papayaXpText(level: number, xp: number): string {
  const row = papayaLevelRows.find((candidate) => candidate.level === level);
  const next = row?.xpToNext ?? null;
  return next === null ? String(xp) : `${xp} / ${next}`;
}

export function inventorySheet(facts: InventoryFacts): InventorySheet {
  const hero: Hero = {
    level: facts.level,
    xp: facts.xp,
    health: facts.hp,
    coins: facts.coins,
    sword: facts.sword,
    armor: facts.armor,
    place: facts.place,
  };
  return {
    coins: facts.coins,
    sword: gearLabel(facts.sword),
    armor: gearLabel(facts.armor),
    swordBonus: gearBonus(facts.sword),
    armorBonus: gearBonus(facts.armor),
    level: facts.level,
    health: `${facts.hp} / ${facts.maxHp}`,
    strike: strike(hero),
    experience: papayaXpText(facts.level, facts.xp),
    expiry: coinExpiryText(facts.coinExpiry, Date.now()),
    expiryTip: coinExpiryTip(facts.coinExpiry, Date.now()),
    tiles: bagTiles(facts.items, facts.sword, facts.armor, facts.elsewhere ?? []),
    portrait: figStandSrc(facts.gender),
  };
}

export interface OliveCarry {
  readonly from: 'tile' | 'slot';
  readonly itemId: string;
  readonly slot: 'sword' | 'armor';
}

export type OliveTarget =
  | { readonly kind: 'slot'; readonly slot: 'sword' | 'armor' }
  | { readonly kind: 'row' };

export type OliveAction =
  | { readonly type: 'equip'; readonly itemId: string }
  | { readonly type: 'unequip'; readonly slot: 'sword' | 'armor' };

export type OliveMood = 'lime' | 'peach' | 'rest';

export interface OliveDragFace {
  readonly sword: OliveMood;
  readonly armor: OliveMood;
  readonly row: 'lime' | 'rest';
  readonly hint: string;
}

function heroWearing(facts: InventoryFacts, sword: string | null, armor: string | null): Hero {
  return {
    level: facts.level,
    xp: facts.xp,
    health: facts.hp,
    coins: facts.coins,
    sword,
    armor,
    place: facts.place,
  };
}

// The mango line under a drag: the stat that would change, or "" when nothing moves.
export function oliveHint(facts: InventoryFacts, sword: string | null, armor: string | null): string {
  const beforeStrike = strike(heroWearing(facts, facts.sword, facts.armor));
  const afterStrike = strike(heroWearing(facts, sword, armor));
  if (beforeStrike !== afterStrike) return `Strike ${beforeStrike} becomes ${afterStrike}`;
  const afterMax = maxHealth(heroWearing(facts, sword, armor));
  if (facts.maxHp !== afterMax) {
    const afterHp = clampHealth(facts.hp, afterMax);
    return `Health ${facts.hp} / ${facts.maxHp} becomes ${afterHp} / ${afterMax}`;
  }
  return '';
}

export function oliveCarryText(carry: OliveCarry): string {
  return JSON.stringify({ from: carry.from, itemId: carry.itemId, slot: carry.slot });
}

export function oliveCarryFromText(raw: string): OliveCarry | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
  const row = parsed as Record<string, unknown>;
  if (row.from !== 'tile' && row.from !== 'slot') return null;
  if (typeof row.itemId !== 'string' || row.itemId.length === 0) return null;
  if (row.slot !== 'sword' && row.slot !== 'armor') return null;
  if (gearSlotOf(row.itemId) !== row.slot) return null;
  return { from: row.from, itemId: row.itemId, slot: row.slot };
}

// A grape on its own slot equips. A worn quince dragged out of its slot onto the row unequips.
// A quince on the wrong slot, or a tile dropped back on the row, is ignored.
export function oliveDrop(
  carry: OliveCarry,
  target: OliveTarget,
  worn: { readonly sword: string | null; readonly armor: string | null },
): OliveAction | null {
  if (gearSlotOf(carry.itemId) !== carry.slot) return null;
  if (carry.from === 'tile' && target.kind === 'slot') {
    if (target.slot !== carry.slot) return null;
    const current = carry.slot === 'sword' ? worn.sword : worn.armor;
    if (current === carry.itemId) return null;
    return { type: 'equip', itemId: carry.itemId };
  }
  if (carry.from === 'slot' && target.kind === 'row') {
    const current = carry.slot === 'sword' ? worn.sword : worn.armor;
    if (current === null || current.length === 0) return null;
    return { type: 'unequip', slot: carry.slot };
  }
  return null;
}

// Lime is the slot that can take this quince. Peach is the other slot, dimmed.
export function oliveDragFace(facts: InventoryFacts, carry: OliveCarry): OliveDragFace {
  if (carry.from === 'slot') {
    const nextSword = carry.slot === 'sword' ? null : facts.sword;
    const nextArmor = carry.slot === 'armor' ? null : facts.armor;
    return { sword: 'rest', armor: 'rest', row: 'lime', hint: oliveHint(facts, nextSword, nextArmor) };
  }
  const current = carry.slot === 'sword' ? facts.sword : facts.armor;
  if (current === carry.itemId) return { sword: 'rest', armor: 'rest', row: 'rest', hint: '' };
  const nextSword = carry.slot === 'sword' ? carry.itemId : facts.sword;
  const nextArmor = carry.slot === 'armor' ? carry.itemId : facts.armor;
  return {
    sword: carry.slot === 'sword' ? 'lime' : 'peach',
    armor: carry.slot === 'armor' ? 'lime' : 'peach',
    row: 'rest',
    hint: oliveHint(facts, nextSword, nextArmor),
  };
}

// The olive panel is a centered fig. These match the #olive-sheet rule in index.html.
export const OLIVE_PANEL_MAX_PX = 860;
export const OLIVE_PANEL_VIEW_SHARE = 0.94;

export interface PapayaRect {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
}

export function olivePanelBox(viewportWidth: number, viewportHeight: number, contentHeight: number): PapayaRect {
  const width = Math.min(OLIVE_PANEL_MAX_PX, OLIVE_PANEL_VIEW_SHARE * viewportWidth);
  const height = Math.min(Math.max(contentHeight, 0), OLIVE_PANEL_VIEW_SHARE * viewportHeight);
  const left = (viewportWidth - width) / 2;
  const top = (viewportHeight - height) / 2;
  return { left, top, right: left + width, bottom: top + height };
}

// The kiwi rail sits on the right edge of the stage. rootPx is the page's rem.
export function kiwiSliderBox(viewportWidth: number, stageHeight: number, rootPx = 16): PapayaRect {
  const width = 2.4 * rootPx;
  const right = viewportWidth - 0.35 * rootPx;
  const top = stageHeight * 0.12;
  const bottom = stageHeight * 0.92;
  return { left: right - width, top, right, bottom };
}

export function papayaRectsOverlap(a: PapayaRect, b: PapayaRect): boolean {
  return a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
}

export interface HudFacts {
  readonly level: number;
  readonly xp: number;
  readonly coins: number;
}

export interface HudReadout {
  readonly lines: readonly string[];
  readonly x: number;
  readonly y: number;
  readonly lineGap: number;
}

// Screen-space lines under the health bar: "Lv N", "XP x / y", "Coins n".
const HUD_LINE_GAP = 22;

export function hudReadout(facts: HudFacts): HudReadout {
  return {
    lines: [`Lv ${facts.level}`, `XP ${papayaXpText(facts.level, facts.xp)}`, `Coins ${facts.coins}`],
    x: HEALTH_X,
    y: HEALTH_Y + HEALTH_BAR_H + 20,
    lineGap: HUD_LINE_GAP,
  };
}

export interface ScreenControl {
  readonly id: 'bubble' | 'bag' | 'menu';
  readonly text: string;
  // Accessible name. The bag and menu icons are painted; this word is not drawn.
  readonly label?: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly font: string;
}

// Lime thought over the fig smith: three dots, shown in town only.
export const LIME_BUBBLE_W = 64;
export const LIME_BUBBLE_H = 36;
export const LIME_BUBBLE_FONT = '800 24px system-ui, Arial, sans-serif';

// Screen-space fig buttons. The bag keeps its old hit box. The menu sits one gap to its left.
const FIG_EDGE = 24;
const FIG_BAG_W = 92;
const FIG_BAG_H = 44;
const FIG_MENU_W = 44;
const FIG_MENU_H = 44;
const FIG_ICON_GAP = 12;
const FIG_ICON_FONT = '800 22px Georgia, serif';

// Thought bubble over the blacksmith, the menu, and the Bag. All three are screen space.
export function townControls(view: PeachView): ScreenControl[] {
  const feet = mapToCanvas(view, SMITH_X, SMITH_Y);
  const headTop = feet.y - scaleFor('blacksmith') * view.scale;
  const bubbleWidth = LIME_BUBBLE_W;
  const bubbleHeight = LIME_BUBBLE_H;
  let bubbleY = headTop - 8 - bubbleHeight;
  if (bubbleY < 8) bubbleY = 8;
  let bubbleX = feet.x - bubbleWidth / 2;
  if (bubbleX < 8) bubbleX = 8;
  if (bubbleX + bubbleWidth > CANVAS_WIDTH - 8) bubbleX = CANVAS_WIDTH - 8 - bubbleWidth;
  // With the closer camera the forge can be off screen; a bubble pinned to the top-right corner must not sit on the Menu and Bag buttons.
  if (bubbleX + bubbleWidth > CANVAS_WIDTH - FIG_EDGE - FIG_BAG_W - 80 && bubbleY < FIG_EDGE + 60) bubbleY = FIG_EDGE + 60;
  const bagX = CANVAS_WIDTH - FIG_EDGE - FIG_BAG_W;
  const bagY = FIG_EDGE;
  return [
    {
      id: 'bubble',
      text: '...',
      x: bubbleX,
      y: bubbleY,
      width: bubbleWidth,
      height: bubbleHeight,
      font: LIME_BUBBLE_FONT,
    },
    {
      id: 'menu',
      text: 'Menu',
      label: 'Menu',
      x: bagX - FIG_ICON_GAP - FIG_MENU_W,
      y: bagY,
      width: FIG_MENU_W,
      height: FIG_MENU_H,
      font: FIG_ICON_FONT,
    },
    {
      id: 'bag',
      text: 'Bag',
      label: 'Bag',
      x: bagX,
      y: bagY,
      width: FIG_BAG_W,
      height: FIG_BAG_H,
      font: FIG_ICON_FONT,
    },
  ];
}

// Dark fig button, light glyph. fillRect only, so a double with fillRect and fillText can paint it.
const FIG_ICON_BACK = '#1c1814';
const FIG_ICON_INK = '#ffffff';

function paintBagGlyph(ctx: ScreenCtx, control: ScreenControl): void {
  const bodyW = 22;
  const bodyH = 14;
  const bodyX = Math.round(control.x + (control.width - bodyW) / 2);
  const bodyY = Math.round(control.y + (control.height - bodyH) / 2 + 3);
  const handleW = 10;
  const handleH = 3;
  const handleX = bodyX + Math.round((bodyW - handleW) / 2);
  const handleY = bodyY - 7;
  const flapH = 4;
  const flapY = bodyY - flapH - 1;
  ctx.fillRect(handleX, handleY, handleW, handleH);
  ctx.fillRect(bodyX, flapY, bodyW, flapH);
  ctx.fillRect(bodyX, bodyY, bodyW, bodyH);
}

function paintMenuBars(ctx: ScreenCtx, control: ScreenControl): void {
  const barW = 18;
  const barH = 3;
  const gap = 4;
  const stack = barH * 3 + gap * 2;
  const left = Math.round(control.x + (control.width - barW) / 2);
  const top = Math.round(control.y + (control.height - stack) / 2);
  ctx.fillRect(left, top, barW, barH);
  ctx.fillRect(left, top + barH + gap, barW, barH);
  ctx.fillRect(left, top + (barH + gap) * 2, barW, barH);
}

// Paints the bag (body, handle, flap) or the three-bar menu. The control text stays undrawn.
export function paintControlIcon(ctx: ScreenCtx, control: ScreenControl): void {
  if (control.id !== 'bag' && control.id !== 'menu') return;
  ctx.fillStyle = FIG_ICON_BACK;
  ctx.fillRect(control.x, control.y, control.width, control.height);
  ctx.fillStyle = FIG_ICON_INK;
  if (control.id === 'menu') paintMenuBars(ctx, control);
  else paintBagGlyph(ctx, control);
}

export function controlAt(
  controls: readonly ScreenControl[],
  x: number,
  y: number,
): ScreenControl | null {
  for (const control of controls) {
    if (x >= control.x && x < control.x + control.width && y >= control.y && y < control.y + control.height) {
      return control;
    }
  }
  return null;
}

export function paintHealth(ctx: ScreenCtx, row: HealthReadout): void {
  ctx.fillStyle = row.back;
  ctx.fillRect(row.x, row.y, row.barWidth, row.barHeight);
  ctx.fillStyle = row.front;
  ctx.fillRect(row.x, row.y, row.fillWidth, row.barHeight);
  ctx.fillStyle = '#ffffff';
  ctx.font = '700 20px Georgia, serif';
  ctx.fillText(row.text, row.x + row.barWidth + 12, row.y + 18);
}

// Same ink and type as the health numbers, stacked just under the bar.
export function paintHud(ctx: ScreenCtx, row: HudReadout): void {
  ctx.fillStyle = '#ffffff';
  ctx.font = '700 20px Georgia, serif';
  let lineIndex = 0;
  for (const line of row.lines) {
    ctx.fillText(line, row.x, row.y + lineIndex * row.lineGap);
    lineIndex += 1;
  }
}

// Soft rim around the drawn picture only. Two screen pixels, warm white, a little see-through.
const BEET_RIM_PX = 2;
const BEET_RIM_INK = 'rgba(255, 244, 224, 0.72)';
const BEET_RIM_RADIUS = 6;

export interface RimCtx {
  save(): void;
  restore(): void;
  beginPath(): void;
  stroke(): void;
  strokeStyle: string;
  lineWidth: number;
  lineJoin: string;
  roundRect?(x: number, y: number, w: number, h: number, radii?: number): void;
  rect?(x: number, y: number, w: number, h: number): void;
  moveTo?(x: number, y: number): void;
  lineTo?(x: number, y: number): void;
  quadraticCurveTo?(cpx: number, cpy: number, x: number, y: number): void;
  closePath?(): void;
}

function traceMelonRound(ctx: RimCtx, x: number, y: number, w: number, h: number, radius: number): void {
  if (typeof ctx.roundRect === 'function') {
    ctx.roundRect(x, y, w, h, radius);
    return;
  }
  const r = Math.min(radius, w / 2, h / 2);
  ctx.moveTo?.(x + r, y);
  ctx.lineTo?.(x + w - r, y);
  ctx.quadraticCurveTo?.(x + w, y, x + w, y + r);
  ctx.lineTo?.(x + w, y + h - r);
  ctx.quadraticCurveTo?.(x + w, y + h, x + w - r, y + h);
  ctx.lineTo?.(x + r, y + h);
  ctx.quadraticCurveTo?.(x, y + h, x, y + h - r);
  ctx.lineTo?.(x, y + r);
  ctx.quadraticCurveTo?.(x, y, x + r, y);
  ctx.closePath?.();
}

// Rounded rim in screen pixels around the unpadded picture. The caller draws it only while the pointer is over the beet.
export function paintBeetRim(
  ctx: RimCtx,
  feetX: number,
  feetY: number,
  kind: string,
  src: string | undefined,
  view: PeachView,
): void {
  const box = beetSpriteRect(feetX, feetY, kind, src);
  if (!(box.pictureWidth > 0) || !(box.pictureHeight > 0)) return;
  const left = feetX - box.pictureWidth / 2;
  const top = feetY - box.pictureHeight;
  const screen = mapToCanvas(view, left, top);
  const width = box.pictureWidth * view.scale;
  const height = box.pictureHeight * view.scale;
  const radius = Math.min(BEET_RIM_RADIUS, width / 2, height / 2);
  ctx.save();
  ctx.strokeStyle = BEET_RIM_INK;
  ctx.lineWidth = BEET_RIM_PX;
  ctx.lineJoin = 'round';
  ctx.beginPath();
  traceMelonRound(ctx, screen.x, screen.y, width, height, radius);
  ctx.stroke();
  ctx.restore();
}

// The same white outline for the duel partner: around the drawn body (feet at the bottom middle), shown while the pointer
// is over them once the duel has started.
export function paintFigRim(ctx: RimCtx, feetX: number, feetY: number, view: PeachView): void {
  const height = scaleFor('player');
  const halfWidth = Math.ceil(height * 0.36);
  const left = feetX - halfWidth;
  const top = feetY - height;
  const screen = mapToCanvas(view, left, top);
  const width = halfWidth * 2 * view.scale;
  const tall = height * view.scale;
  const radius = Math.min(BEET_RIM_RADIUS, width / 2, tall / 2);
  ctx.save();
  ctx.strokeStyle = BEET_RIM_INK;
  ctx.lineWidth = BEET_RIM_PX;
  ctx.lineJoin = 'round';
  ctx.beginPath();
  traceMelonRound(ctx, screen.x, screen.y, width, tall, radius);
  ctx.stroke();
  ctx.restore();
}

// Paints the whole stack through the camera: one scale, map pixels in, canvas pixels out.
// The caller clears the canvas. Each still keeps its head glow behind its own art (see blitGuava).
export function paintStack(
  ctx: BlitCtx,
  stills: readonly GuavaStill[],
  view: PeachView,
  picture: (src: string) => unknown,
): void {
  ctx.save();
  ctx.scale(view.scale, view.scale);
  ctx.translate(-view.x, -view.y);
  for (const item of stackOrchard(stills)) {
    if (item.kind === 'layer') {
      const image = picture(item.src);
      if (image != null) ctx.drawImage(image, 0, 0, 1280, 720);
    } else {
      blitGuava(ctx, [item.still], picture);
    }
  }
  ctx.restore();
}


// A cross where an avatar was killed. It stays for GRAVE_LIFETIME_MS. Screen space is derived from the map spot.
// Another player's cross is drawn for this long. The player's own cross stays until they respawn (see `mine`).
export const GRAVE_LIFETIME_MS = 10_000;

export interface Grave {
  readonly x: number;
  readonly y: number;
  readonly at: number;
  // The local player's own cross: it stays while the death panel is open and is removed when they respawn.
  readonly mine?: boolean;
}

export interface GraveCtx {
  fillStyle: string | CanvasGradient | CanvasPattern;
  fillRect(x: number, y: number, w: number, h: number): void;
}

// Draws every grave still alive that falls inside the view: a pale cross with a dark edge, sized with the map scale.
export function paintGraves(ctx: GraveCtx, graves: readonly Grave[], view: PeachView, nowMs: number): number {
  let drawn = 0;
  for (const grave of graves) {
    if (grave.mine !== true && nowMs - grave.at >= GRAVE_LIFETIME_MS) continue;
    const spot = mapToCanvas(view, grave.x, grave.y);
    const k = Math.max(0.6, view.scale);
    const height = 34 * k;
    const arm = 22 * k;
    const bar = Math.max(4, 6 * k);
    if (spot.x < -arm || spot.x > CANVAS_WIDTH + arm || spot.y < -height || spot.y > CANVAS_HEIGHT + height) continue;
    const top = spot.y - height;
    const left = spot.x - arm / 2;
    // Edge first, then the pale cross on top: upright bar, then the cross arm a third of the way down.
    ctx.fillStyle = '#1a140c';
    ctx.fillRect(spot.x - bar / 2 - 2, top - 2, bar + 4, height + 4);
    ctx.fillRect(left - 2, top + height * 0.28 - 2, arm + 4, bar + 4);
    ctx.fillStyle = '#d9d2c2';
    ctx.fillRect(spot.x - bar / 2, top, bar, height);
    ctx.fillRect(left, top + height * 0.28, arm, bar);
    drawn += 1;
  }
  return drawn;
}


// A soft pulsing light on the spot where the avatar comes back in town, so the player finds it at once.
export const RESPAWN_GLOW_MS = 3500;

export interface GlowCtx {
  globalAlpha?: number;
  fillStyle: string | CanvasGradient | CanvasPattern;
  fillRect(x: number, y: number, w: number, h: number): void;
  createRadialGradient?: (x0: number, y0: number, r0: number, x1: number, y1: number, r1: number) => CanvasGradient;
}

// Draws the glow (a warm radial light that breathes) at the map spot for RESPAWN_GLOW_MS. Returns whether it drew.
export function paintRespawnGlow(ctx: GlowCtx, glow: { readonly x: number; readonly y: number; readonly at: number } | null, view: PeachView, nowMs: number): boolean {
  if (glow === null) return false;
  const age = nowMs - glow.at;
  if (age < 0 || age >= RESPAWN_GLOW_MS) return false;
  const spot = mapToCanvas(view, glow.x, glow.y);
  const k = Math.max(0.6, view.scale);
  // Breathes about twice a second and fades out over the last second.
  const pulse = 0.65 + 0.35 * Math.sin((age / 1000) * Math.PI * 4);
  const fade = Math.min(1, (RESPAWN_GLOW_MS - age) / 1000);
  const radius = (54 + 10 * pulse) * k;
  const centreY = spot.y - 14 * k;
  if (typeof ctx.createRadialGradient === 'function') {
    const gradient = ctx.createRadialGradient(spot.x, centreY, 2, spot.x, centreY, radius);
    gradient.addColorStop(0, 'rgba(255, 236, 160, 0.85)');
    gradient.addColorStop(0.45, 'rgba(255, 214, 110, 0.35)');
    gradient.addColorStop(1, 'rgba(255, 200, 80, 0)');
    const before = ctx.globalAlpha ?? 1;
    ctx.globalAlpha = before * fade * (0.7 + 0.3 * pulse);
    ctx.fillStyle = gradient;
    ctx.fillRect(spot.x - radius, centreY - radius, radius * 2, radius * 2);
    ctx.globalAlpha = before;
  } else {
    // A plain ring of squares when the canvas has no gradients (older test doubles): still marks the spot.
    ctx.fillStyle = 'rgba(255, 226, 140, 0.35)';
    ctx.fillRect(spot.x - radius / 2, centreY - radius / 2, radius, radius);
  }
  return true;
}


// A light green glow on the town fountain (plan 11): it breathes slowly and marks where health regenerates.
export function paintFountainGlow(ctx: GlowCtx, view: PeachView, nowMs: number): void {
  const centre = mapToCanvas(view, (melonFountainBox.x0 + melonFountainBox.x1) / 2, (melonFountainBox.y0 + melonFountainBox.y1) / 2);
  const k = Math.max(0.6, view.scale);
  const pulse = 0.7 + 0.3 * Math.sin((nowMs / 1000) * Math.PI);
  const radius = (FOUNTAIN_REGEN_REACH_PX + 36 + 6 * pulse) * k;
  if (typeof ctx.createRadialGradient === 'function') {
    const gradient = ctx.createRadialGradient(centre.x, centre.y, 2, centre.x, centre.y, radius);
    gradient.addColorStop(0, 'rgba(170, 255, 190, 0.8)');
    gradient.addColorStop(0.5, 'rgba(140, 240, 170, 0.42)');
    gradient.addColorStop(1, 'rgba(120, 230, 160, 0)');
    const before = ctx.globalAlpha ?? 1;
    ctx.globalAlpha = before * (0.75 + 0.25 * pulse);
    ctx.fillStyle = gradient;
    ctx.fillRect(centre.x - radius, centre.y - radius, radius * 2, radius * 2);
    ctx.globalAlpha = before;
  } else {
    ctx.fillStyle = 'rgba(150, 240, 175, 0.3)';
    ctx.fillRect(centre.x - radius / 2, centre.y - radius / 2, radius, radius);
  }
}

// Level up: a bright burst of light around the avatar and a "Level N" plate that rises from above its head, then fades.
export const LEVEL_UP_MS = 3000;
export interface LevelUpCtx extends GlowCtx {
  font: string;
  textAlign?: string;
  fillText(text: string, x: number, y: number): void;
}

// feet is where the avatar stands on the canvas (already mapped), k the view scale. Returns whether it drew.
export function paintLevelUp(ctx: LevelUpCtx, level: number, at: number, feet: { x: number; y: number }, k: number, nowMs: number): boolean {
  const age = nowMs - at;
  if (age < 0 || age >= LEVEL_UP_MS) return false;
  const t = age / LEVEL_UP_MS;
  const bodyY = feet.y - 30 * Math.max(0.6, k);
  const kk = Math.max(0.6, k);
  // Burst: grows quickly, then eases out and fades.
  const burst = Math.min(1, age / 350);
  const fade = 1 - Math.max(0, (t - 0.45) / 0.55);
  const radius = (40 + 70 * burst + 10 * Math.sin(age / 120)) * kk;
  if (typeof ctx.createRadialGradient === 'function') {
    const gradient = ctx.createRadialGradient(feet.x, bodyY, 2, feet.x, bodyY, radius);
    gradient.addColorStop(0, 'rgba(255, 255, 255, 0.95)');
    gradient.addColorStop(0.35, 'rgba(255, 236, 140, 0.6)');
    gradient.addColorStop(1, 'rgba(255, 210, 80, 0)');
    const before = ctx.globalAlpha ?? 1;
    ctx.globalAlpha = before * Math.max(0, fade);
    ctx.fillStyle = gradient;
    ctx.fillRect(feet.x - radius, bodyY - radius, radius * 2, radius * 2);
    ctx.globalAlpha = before;
  } else {
    ctx.fillStyle = 'rgba(255, 240, 160, 0.5)';
    ctx.fillRect(feet.x - radius / 2, bodyY - radius / 2, radius, radius);
  }
  // Sparkles rising around the body.
  const beforeSpark = ctx.globalAlpha ?? 1;
  ctx.globalAlpha = beforeSpark * Math.max(0, fade);
  ctx.fillStyle = '#fff7c2';
  for (let i = 0; i < 10; i += 1) {
    const angle = (i / 10) * Math.PI * 2 + age / 700;
    const rise = ((t * 1.4 + i / 10) % 1) * 70 * kk;
    const sx = feet.x + Math.cos(angle) * (26 + (i % 3) * 8) * kk;
    const sy = bodyY + 24 * kk - rise;
    ctx.fillRect(sx - 2, sy - 2, 4, 4);
  }
  ctx.globalAlpha = beforeSpark;
  // The plate: rises from over the head by about 22 map px and fades out in the last third.
  const label = `Level ${level}`;
  const riseY = (1 - Math.pow(1 - Math.min(1, t * 1.6), 3)) * 22 * kk;
  const plateW = 120 * Math.max(0.9, kk * 0.8);
  const plateH = 36 * Math.max(0.9, kk * 0.8);
  const plateX = feet.x - plateW / 2;
  const plateY = feet.y - 58 * kk - 20 - plateH - riseY;
  const plateAlpha = Math.min(1, age / 250) * (t > 0.7 ? Math.max(0, (1 - t) / 0.3) : 1);
  const before = ctx.globalAlpha ?? 1;
  ctx.globalAlpha = before * plateAlpha;
  ctx.fillStyle = '#e6b84a';
  ctx.fillRect(plateX - 3, plateY - 3, plateW + 6, plateH + 6);
  ctx.fillStyle = '#2a1d0c';
  ctx.fillRect(plateX, plateY, plateW, plateH);
  ctx.fillStyle = '#ffe58a';
  ctx.font = `700 ${Math.round(plateH * 0.56)}px Georgia, serif`;
  ctx.textAlign = 'center';
  ctx.fillText(label, feet.x, plateY + plateH * 0.7);
  ctx.textAlign = 'left';
  ctx.globalAlpha = before;
  return true;
}

// Three dots over a player's head while a duel request waits for an answer: a white bubble like the blacksmith's, with
// the dots lighting one after another so it is clearly alive.
export interface DotsCtx {
  fillStyle: string | CanvasGradient | CanvasPattern;
  font: string;
  fillRect(x: number, y: number, w: number, h: number): void;
}

export function paintDuelDots(ctx: DotsCtx, view: PeachView, x: number, y: number, nowMs: number): boolean {
  const spot = mapToCanvas(view, x, y);
  const k = Math.max(0.6, view.scale);
  const width = 46;
  const height = 24;
  const left = spot.x - width / 2;
  const top = spot.y - scaleFor('player') * k - 14 - height;
  if (spot.x < -width || spot.x > CANVAS_WIDTH + width || top < -height || top > CANVAS_HEIGHT) return false;
  ctx.fillStyle = '#1a140c';
  ctx.fillRect(left - 2, top - 2, width + 4, height + 4);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(left, top, width, height);
  // The little tail pointing at the player.
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(spot.x - 3, top + height, 6, 5);
  const lit = Math.floor(nowMs / 350) % 3;
  for (let i = 0; i < 3; i += 1) {
    ctx.fillStyle = i === lit ? '#1a140c' : '#9a9184';
    ctx.fillRect(left + 9 + i * 13, top + height / 2 - 3, 7, 7);
  }
  return true;
}
