// Effects: the sword when you strike, the stab when you are hit, and one sound for a nearby wolf, bear or skeleton.
// Rules (all in `decide` and `pickCreature`, pure, so they can be tested with a table):
//  - Creature sounds: only one plays at a time on this device, however many enemies are near. While one plays, others
//    are skipped, not queued. A creature sound plays when the nearest enemy is within CREATURE_RANGE_PX of the player
//    (2.5 x the melee reach of 48 px) or when the player is fighting it. Each kind repeats no faster than every 6 s.
//  - The stab sound cuts in over a creature sound. The sword never does: it is skipped while a creature sound plays.
//    A creature sound is skipped while the sword or the stab plays (they are short).
//  - Sword and stab each play one at a time (a swing while its sound still plays is skipped).
// Nothing plays before the first click or key press, while the canvas is hidden or while muted; a bad file never throws.

export const CREATURE_RANGE_PX = 120;
export const CREATURE_COOLDOWN_MS = 6000;
// A sound that never reports its end is treated as finished after this long.
export const SFX_MAX_PLAY_MS = 4000;

export type CreatureKind = 'wolf' | 'bear' | 'skeleton';
export type EffectName = 'sword' | 'stab' | 'coin' | CreatureKind;

export const SFX_SRC: Readonly<Record<EffectName, string>> = {
  sword: '/sounds/sfx/sword-attack.ogg',
  stab: '/sounds/sfx/stab-hit.ogg',
  coin: '/sounds/sfx/coin.mp3',
  wolf: '/sounds/sfx/wolf.mp3',
  bear: '/sounds/sfx/bear.ogg',
  skeleton: '/sounds/sfx/skeleton-placeholder.ogg',
};

export interface SfxAudio {
  play(): Promise<void> | void;
  pause(): void;
  volume: number;
  currentTime: number;
  addEventListener?(type: string, listener: () => void): void;
}

export interface Creature {
  readonly id: string;
  readonly kind: string;
  readonly x: number;
  readonly y: number;
}

function isCreatureKind(kind: string): kind is CreatureKind {
  return kind === 'wolf' || kind === 'bear' || kind === 'skeleton';
}

// The enemy that decides which creature sound plays: the nearest one inside the range, where the enemy being fought
// counts however far it is. Null when nobody qualifies.
export function pickCreature(
  self: { readonly x: number; readonly y: number },
  creatures: readonly Creature[],
  fightingId: string | null,
): Creature | null {
  let best: Creature | null = null;
  let bestDist = Number.POSITIVE_INFINITY;
  for (const c of creatures) {
    if (!isCreatureKind(c.kind)) continue;
    const dist = Math.hypot(c.x - self.x, c.y - self.y);
    if (dist > CREATURE_RANGE_PX && c.id !== fightingId) continue;
    if (dist < bestDist) {
      best = c;
      bestDist = dist;
    }
  }
  return best;
}

export interface SfxState {
  readonly swordPlaying: boolean;
  readonly stabPlaying: boolean;
  readonly creaturePlaying: boolean;
  // When each creature kind last started, in ms; absent when never.
  readonly lastCreatureAt: Readonly<Partial<Record<CreatureKind, number>>>;
}

export interface Decision {
  readonly play: boolean;
  // Stop the creature sound first (the stab cutting in).
  readonly cutCreature: boolean;
}

export function decide(state: SfxState, effect: EffectName, nowMs: number): Decision {
  const no: Decision = { play: false, cutCreature: false };
  // A coin pickup (yours or your pet's) always plays; it is short and rare, and never cuts anything off.
  if (effect === 'coin') return { play: true, cutCreature: false };
  if (effect === 'stab') {
    if (state.stabPlaying) return no;
    return { play: true, cutCreature: state.creaturePlaying };
  }
  if (effect === 'sword') {
    if (state.swordPlaying || state.creaturePlaying) return no;
    return { play: true, cutCreature: false };
  }
  if (state.creaturePlaying || state.swordPlaying || state.stabPlaying) return no;
  const last = state.lastCreatureAt[effect];
  if (last !== undefined && nowMs - last < CREATURE_COOLDOWN_MS) return no;
  return { play: true, cutCreature: false };
}

export interface SfxSettings {
  effectsVolume: number;
  muted: boolean;
}

export interface SfxEngineOptions {
  createAudio: (src: string) => SfxAudio;
  now: () => number;
  readSettings: () => SfxSettings;
  listenSettings?: (fn: () => void) => () => void;
}

export interface SfxFrame {
  readonly selfId: string;
  readonly self: { readonly x: number; readonly y: number; readonly attacking?: boolean } | null;
  readonly monsters: readonly Creature[];
  readonly fightingId: string | null;
  readonly hits: readonly { readonly id: string; readonly targetKind: string; readonly targetId: string }[];
}

export interface SfxEngine {
  frame(frame: SfxFrame): void;
  // One simple coin sound (about 1 second) for a coin the player or the player's pet picked up.
  coin(): void;
  noteGesture(): void;
  setCanvasVisible(visible: boolean): void;
  dispose(): void;
}

function level(s: SfxSettings): number {
  if (s.muted) return 0;
  const v = Number.isFinite(s.effectsVolume) ? s.effectsVolume : 0;
  return Math.min(1, Math.max(0, v / 100));
}

export function createSfxEngine(options: SfxEngineOptions): SfxEngine {
  let unlocked = false;
  let canvasVisible = false;
  const playing = new Map<EffectName, { audio: SfxAudio; endsAt: number }>();
  const lastCreatureAt: Partial<Record<CreatureKind, number>> = {};
  const seenHits = new Set<string>();
  const audios = new Map<EffectName, SfxAudio>();

  function audioFor(effect: EffectName): SfxAudio | null {
    const known = audios.get(effect);
    if (known !== undefined) return known;
    try {
      const made = options.createAudio(SFX_SRC[effect]);
      audios.set(effect, made);
      return made;
    } catch {
      return null;
    }
  }

  function isPlaying(effect: EffectName, nowMs: number): boolean {
    const row = playing.get(effect);
    if (row === undefined) return false;
    if (nowMs >= row.endsAt) {
      playing.delete(effect);
      return false;
    }
    return true;
  }

  function state(nowMs: number): SfxState {
    return {
      swordPlaying: isPlaying('sword', nowMs),
      stabPlaying: isPlaying('stab', nowMs),
      creaturePlaying: (['wolf', 'bear', 'skeleton'] as const).some((k) => isPlaying(k, nowMs)),
      lastCreatureAt,
    };
  }

  function stop(effect: EffectName): void {
    const row = playing.get(effect);
    if (row === undefined) return;
    playing.delete(effect);
    try {
      row.audio.pause();
      row.audio.currentTime = 0;
    } catch {
      // A sound that cannot be stopped ends by itself.
    }
  }

  function start(effect: EffectName): void {
    const audio = audioFor(effect);
    if (audio === null) return;
    const nowMs = options.now();
    try {
      audio.volume = level(options.readSettings());
      audio.currentTime = 0;
      const ended = () => {
        if (playing.get(effect)?.audio === audio) playing.delete(effect);
      };
      audio.addEventListener?.('ended', ended);
      audio.addEventListener?.('error', ended);
      playing.set(effect, { audio, endsAt: nowMs + SFX_MAX_PLAY_MS });
      const result = audio.play();
      if (result !== undefined && typeof (result as Promise<void>).catch === 'function') {
        (result as Promise<void>).catch(() => {
          if (playing.get(effect)?.audio === audio) playing.delete(effect);
        });
      }
    } catch {
      playing.delete(effect);
    }
  }

  function request(effect: EffectName): void {
    if (!unlocked || !canvasVisible) return;
    if (level(options.readSettings()) <= 0) return;
    const nowMs = options.now();
    const verdict = decide(state(nowMs), effect, nowMs);
    if (!verdict.play) return;
    if (verdict.cutCreature) for (const k of ['wolf', 'bear', 'skeleton'] as const) stop(k);
    if (effect === 'wolf' || effect === 'bear' || effect === 'skeleton') lastCreatureAt[effect] = nowMs;
    start(effect);
  }

  const unlisten = options.listenSettings?.(() => {
    const v = level(options.readSettings());
    for (const row of playing.values()) {
      try {
        row.audio.volume = v;
      } catch {
        // ignore
      }
    }
  });

  return {
    frame(f) {
      if (f.self === null) return;
      // New hit marks: the stab when this player is hit, the sword for this player's own strikes.
      for (const hit of f.hits) {
        if (seenHits.has(hit.id)) continue;
        seenHits.add(hit.id);
        if (seenHits.size > 400) seenHits.clear();
        if (hit.targetKind === 'player' && hit.targetId === f.selfId) request('stab');
        else if (f.self.attacking === true && hit.targetId !== f.selfId) request('sword');
      }
      const near = pickCreature(f.self, f.monsters, f.fightingId);
      if (near !== null && isCreatureKind(near.kind)) request(near.kind);
    },
    coin() {
      // Restart the sound if an earlier pickup is still ringing.
      if (isPlaying('coin', options.now())) stop('coin');
      request('coin');
    },
    noteGesture() {
      unlocked = true;
    },
    setCanvasVisible(visible) {
      canvasVisible = visible;
      if (!visible) for (const effect of [...playing.keys()]) stop(effect);
    },
    dispose() {
      unlisten?.();
      for (const effect of [...playing.keys()]) stop(effect);
      audios.clear();
    },
  };
}
