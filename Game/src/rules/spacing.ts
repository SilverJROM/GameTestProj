// Monster spacing. Sprites may overlap, but only in pairs, never one on top of the other, and every sprite stays clearly
// visible: two sprites may overlap by at most MAX_OVERLAP of the smaller one's area, and a sprite touching another one
// may not touch a third. Each monster is a rectangle: its feet are the bottom middle, width and height from the picture.

export type BodyKind = 'wolf' | 'bear' | 'skeleton';

// Drawn size on the map (height from the sprite table, width from the pictures' proportions).
export const monsterBody: Readonly<Record<BodyKind, { readonly w: number; readonly h: number }>> = {
  wolf: { w: 42, h: 34 },
  bear: { w: 68, h: 48 },
  skeleton: { w: 24, h: 58 },
};

// Overlap allowed between two sprites, as a share of the smaller sprite's area.
export const MAX_OVERLAP = 0.4;

export interface Spot {
  readonly id: string;
  readonly kind: string;
  readonly x: number;
  readonly y: number;
}

function body(kind: string): { w: number; h: number } {
  return monsterBody[kind as BodyKind] ?? monsterBody.wolf;
}

// Share of the smaller sprite's area that the two sprites cover together (0 apart, 1 one inside the other).
export function overlapShare(a: Spot, b: Spot): number {
  const ba = body(a.kind);
  const bb = body(b.kind);
  const ox = Math.min((ba.w + bb.w) / 2 - Math.abs(a.x - b.x), Math.min(ba.w, bb.w));
  const oy = Math.min((ba.h + bb.h) / 2 - Math.abs(a.y - b.y), Math.min(ba.h, bb.h));
  if (ox <= 0 || oy <= 0) return 0;
  return (ox * oy) / (Math.min(ba.w, bb.w) * Math.min(ba.h, bb.h));
}

function touching(a: Spot, others: readonly Spot[]): Spot[] {
  return others.filter((o) => o.id !== a.id && overlapShare(a, o) > 0);
}

// May `mover` stand at (x, y) among `others`? Not when it would cover another sprite by more than MAX_OVERLAP, touch two
// others at once, or touch a sprite that already touches a different one. A move that does not make an existing
// overlap worse is always allowed, so monsters that were put close together can still walk apart.
export function spotAllowed(mover: Spot, x: number, y: number, others: readonly Spot[]): boolean {
  const next: Spot = { ...mover, x, y };
  const before = touching(mover, others);
  const after = touching(next, others);
  for (const o of after) {
    const was = before.find((b) => b.id === o.id) === undefined ? 0 : overlapShare(mover, o);
    const now = overlapShare(next, o);
    if (now > MAX_OVERLAP && now > was + 1e-9) return false;
  }
  if (after.length > 1 && after.length > before.length) return false;
  for (const o of after) {
    // The neighbour may not already touch a third sprite (that would be three in a row).
    const third = touching(o, others.filter((p) => p.id !== mover.id));
    const wasTouching = before.some((b) => b.id === o.id);
    if (third.length > 0 && !wasTouching) return false;
  }
  return true;
}
