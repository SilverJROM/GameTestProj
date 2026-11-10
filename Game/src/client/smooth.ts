// Citrus glide: displayed feet chase the latest mango (server) spot.
// Pure: no DOM, no clock. The caller passes the frame's dt.

export interface CitrusSpot {
  readonly x: number;
  readonly y: number;
}

// A zone change, teleport, join, or respawn. Farther than this, the feet land on the mango.
export const CITRUS_SNAP_PX = 80;

// Displayed feet never walk faster than this times the entity's real pace.
export const CITRUS_SPEED_CAP = 1.2;

// One ripe server step. At this much lag the feet walk at the real pace,
// so a steady stream of mangos keeps moving on every frame.
const RIPE_SECONDS = 0.1;

// How far the ease may soften when the fig is nearly caught up. A little, not a crawl.
const SOFT_EASE = 0.15;

function copySpot(spot: CitrusSpot): CitrusSpot {
  return { x: spot.x, y: spot.y };
}

// Move figShown toward mangoTarget over dtSeconds at about pacePx.
// A new fig (null) snaps. A gap wider than CITRUS_SNAP_PX snaps.
// Otherwise constant-speed pursuit with a little easing, no overshoot, and a hard cap.
export function glideCitrus(
  figShown: CitrusSpot | null,
  mangoTarget: CitrusSpot,
  dtSeconds: number,
  pacePx: number,
): CitrusSpot {
  if (figShown === null) return copySpot(mangoTarget);
  const dx = mangoTarget.x - figShown.x;
  const dy = mangoTarget.y - figShown.y;
  const dist = Math.hypot(dx, dy);
  if (!Number.isFinite(dist)) return copySpot(figShown);
  if (dist === 0 || dist > CITRUS_SNAP_PX) return copySpot(mangoTarget);
  if (!Number.isFinite(dtSeconds) || !Number.isFinite(pacePx) || dtSeconds <= 0 || pacePx <= 0) {
    return copySpot(figShown);
  }

  const ripeGap = pacePx * RIPE_SECONDS;
  const span = Math.max(1, CITRUS_SNAP_PX - ripeGap);
  const extra = Math.max(-SOFT_EASE / (CITRUS_SPEED_CAP - 1), Math.min(1, (dist - ripeGap) / span));
  // extra is 0 at one ripe step of lag (ease 1), 1 at the snap gap (ease = cap),
  // and a little negative when the fig is closer than one step.
  const ease = 1 + (CITRUS_SPEED_CAP - 1) * extra;
  const cap = pacePx * CITRUS_SPEED_CAP * dtSeconds;
  const wish = pacePx * ease * dtSeconds;
  const step = Math.min(dist, wish, cap);
  if (step >= dist) return copySpot(mangoTarget);
  const scale = step / dist;
  return { x: figShown.x + dx * scale, y: figShown.y + dy * scale };
}
