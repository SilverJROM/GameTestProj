// Papaya paint: one snapshot becomes the stills the canvas draws.
// Heights come from sprites.ts. The ground coin is the peach crop inside the axolotl pickup still.
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
import { mangoForgeBox, type Box } from '../rules/regions';
import { pearTimings } from '../rules/tables';
import {
  coinCrop,
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
  readonly redGlow: boolean;
  readonly crop: CropRect | null;
  readonly box: Box | null;
  readonly kind: SpriteKind | 'forge';
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
      crop: null,
      box: mangoForgeBox,
      kind: 'forge',
    }),
  );

  for (const seed of orchard.coins) {
    const crop = coinCrop();
    const coinSize = scaledSize(crop.width, crop.height, 'axolotl');
    stills.push(
      makeStill({
        role: 'coin',
        id: seed.id,
        ownerId: seed.ownerId,
        still: 'coin',
        src: '/avatars/axolotl/pickup.png',
        x: seed.x,
        y: seed.y,
        width: coinSize.width,
        height: coinSize.height,
        facing: 'right',
        redGlow: false,
        crop,
        box: null,
        kind: 'axolotl',
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
    const size = sizedStill(kind, src);
    stills.push(
      makeStill({
        role: 'monster',
        id: beet.id,
        ownerId: null,
        still: stem,
        src,
        x: beet.x,
        y: beet.y,
        width: size.width,
        height: size.height,
        facing: 'right',
        redGlow: false,
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
      x: (mangoForgeBox.x0 + mangoForgeBox.x1) / 2,
      y: (mangoForgeBox.y0 + mangoForgeBox.y1) / 2,
      width: smithSize.width,
      height: smithSize.height,
      facing: 'right',
      redGlow: false,
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
    const src = `/avatars/axolotl/${stem}.png`;
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
        crop: null,
        box: null,
        kind: 'axolotl',
      }),
    );
  }

  return stills;
}

export interface BlitCtx {
  save(): void;
  restore(): void;
  translate(x: number, y: number): void;
  scale(x: number, y: number): void;
  drawImage(image: unknown, ...args: number[]): void;
  shadowColor: string;
  shadowBlur: number;
}

// Paints a still list. Feet sit on x,y. A left-facing fig is mirrored. A duelist gets a red glow.
export function blitGuava(
  ctx: BlitCtx,
  stills: readonly GuavaStill[],
  picture: (src: string) => unknown,
): void {
  for (const still of stills) {
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
