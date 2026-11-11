import { describe, expect, it } from 'vitest';
import {
  CREATURE_COOLDOWN_MS,
  CREATURE_RANGE_PX,
  SFX_MAX_PLAY_MS,
  SFX_SRC,
  createSfxEngine,
  decide,
  pickCreature,
  type SfxAudio,
  type SfxState,
} from '../../src/client/sfx';

const idle: SfxState = { swordPlaying: false, stabPlaying: false, creaturePlaying: false, lastCreatureAt: {} };

describe('which enemy decides the creature sound', () => {
  const self = { x: 100, y: 100 };
  it('uses 120 px: 119 and 120 qualify, 121 does not', () => {
    expect(CREATURE_RANGE_PX).toBe(120);
    expect(pickCreature(self, [{ id: 'a', kind: 'wolf', x: 219, y: 100 }], null)?.id).toBe('a');
    expect(pickCreature(self, [{ id: 'a', kind: 'wolf', x: 220, y: 100 }], null)?.id).toBe('a');
    expect(pickCreature(self, [{ id: 'a', kind: 'wolf', x: 221, y: 100 }], null)).toBeNull();
  });
  it('the nearest enemy decides', () => {
    const near = pickCreature(self, [
      { id: 'far', kind: 'bear', x: 200, y: 100 },
      { id: 'near', kind: 'wolf', x: 130, y: 100 },
    ], null);
    expect(near?.id).toBe('near');
  });
  it('an enemy being fought counts however far, and ignores unknown kinds', () => {
    expect(pickCreature(self, [{ id: 'f', kind: 'skeleton', x: 900, y: 900 }], 'f')?.id).toBe('f');
    expect(pickCreature(self, [{ id: 'x', kind: 'dragon', x: 101, y: 100 }], null)).toBeNull();
  });
});

describe('the one-at-a-time rules', () => {
  it('creature sounds: one at a time and 6 s per kind', () => {
    expect(decide(idle, 'wolf', 0).play).toBe(true);
    expect(decide({ ...idle, creaturePlaying: true }, 'bear', 0).play).toBe(false);
    expect(decide({ ...idle, lastCreatureAt: { wolf: 1000 } }, 'wolf', 1000 + CREATURE_COOLDOWN_MS - 1).play).toBe(false);
    expect(decide({ ...idle, lastCreatureAt: { wolf: 1000 } }, 'wolf', 1000 + CREATURE_COOLDOWN_MS).play).toBe(true);
    // A different kind can play once the first has ended.
    expect(decide({ ...idle, lastCreatureAt: { wolf: 1000 } }, 'bear', 1500).play).toBe(true);
  });
  it('stab cuts in over a creature sound, the sword does not', () => {
    expect(decide({ ...idle, creaturePlaying: true }, 'stab', 0)).toEqual({ play: true, cutCreature: true });
    expect(decide({ ...idle, creaturePlaying: true }, 'sword', 0).play).toBe(false);
  });
  it('sword and stab play one at a time each; a creature waits for them', () => {
    expect(decide({ ...idle, swordPlaying: true }, 'sword', 0).play).toBe(false);
    expect(decide({ ...idle, stabPlaying: true }, 'stab', 0).play).toBe(false);
    expect(decide({ ...idle, swordPlaying: true }, 'wolf', 0).play).toBe(false);
    expect(decide({ ...idle, stabPlaying: true }, 'bear', 0).play).toBe(false);
  });
});

class FakeAudio implements SfxAudio {
  volume = 1;
  currentTime = 0;
  plays = 0;
  paused = 0;
  listeners = new Map<string, () => void>();
  constructor(readonly src: string) {}
  play() {
    this.plays += 1;
  }
  pause() {
    this.paused += 1;
  }
  addEventListener(type: string, fn: () => void) {
    this.listeners.set(type, fn);
  }
  end() {
    this.listeners.get('ended')?.();
  }
}

function rig(initial = { effectsVolume: 35, muted: false }) {
  const made: FakeAudio[] = [];
  const settings = { ...initial };
  const listeners: (() => void)[] = [];
  let now = 1000;
  const engine = createSfxEngine({
    createAudio: (src) => {
      const a = new FakeAudio(src);
      made.push(a);
      return a;
    },
    now: () => now,
    readSettings: () => settings,
    listenSettings: (fn) => {
      listeners.push(fn);
      return () => {};
    },
  });
  engine.setCanvasVisible(true);
  engine.noteGesture();
  return {
    engine,
    made,
    settings,
    setNow: (n: number) => {
      now = n;
    },
    notify: () => listeners.forEach((fn) => fn()),
    played: (name: string) => made.filter((a) => a.src === SFX_SRC[name as keyof typeof SFX_SRC]).reduce((n, a) => n + a.plays, 0),
  };
}

const me = { x: 100, y: 100, attacking: false };

describe('the effects engine', () => {
  it('plays nothing before the first click or key press, and nothing while the canvas is hidden', () => {
    const r = rig();
    const quiet = createSfxEngine({ createAudio: (s) => new FakeAudio(s), now: () => 0, readSettings: () => ({ effectsVolume: 35, muted: false }) });
    quiet.setCanvasVisible(true);
    const mon = [{ id: 'w', kind: 'wolf', x: 110, y: 100 }];
    quiet.frame({ selfId: 'me', self: me, monsters: mon, fightingId: null, hits: [] });
    r.engine.setCanvasVisible(false);
    r.engine.frame({ selfId: 'me', self: me, monsters: mon, fightingId: null, hits: [] });
    expect(r.played('wolf')).toBe(0);
  });

  it('a creature sound plays near an enemy at the effects volume, then holds to 6 s and one at a time', () => {
    const r = rig();
    const mon = [
      { id: 'w', kind: 'wolf', x: 130, y: 100 },
      { id: 'b', kind: 'bear', x: 140, y: 100 },
    ];
    r.engine.frame({ selfId: 'me', self: me, monsters: mon, fightingId: null, hits: [] });
    expect(r.played('wolf')).toBe(1);
    expect(r.made[0]!.volume).toBeCloseTo(0.35, 5);
    // Still playing: the bear is skipped, not queued.
    r.setNow(1500);
    r.engine.frame({ selfId: 'me', self: me, monsters: [mon[1]!], fightingId: null, hits: [] });
    expect(r.played('bear')).toBe(0);
    // The wolf ends; the bear may play, the wolf waits out 6 s.
    r.made[0]!.end();
    r.engine.frame({ selfId: 'me', self: me, monsters: mon, fightingId: null, hits: [] });
    expect(r.played('wolf')).toBe(1);
    r.made[0]!.end();
    r.engine.frame({ selfId: 'me', self: me, monsters: [mon[1]!], fightingId: null, hits: [] });
    expect(r.played('bear')).toBe(1);
  });

  it('nothing plays beyond 120 px unless fighting that enemy', () => {
    const r = rig();
    const far = [{ id: 's', kind: 'skeleton', x: 400, y: 100 }];
    r.engine.frame({ selfId: 'me', self: me, monsters: far, fightingId: null, hits: [] });
    expect(r.played('skeleton')).toBe(0);
    r.engine.frame({ selfId: 'me', self: me, monsters: far, fightingId: 's', hits: [] });
    expect(r.played('skeleton')).toBe(1);
  });

  it('stab plays when this player is hit and cuts in over a creature sound; the sword plays for own strikes', () => {
    const r = rig();
    const mon = [{ id: 'w', kind: 'wolf', x: 130, y: 100 }];
    r.engine.frame({ selfId: 'me', self: me, monsters: mon, fightingId: null, hits: [] });
    expect(r.played('wolf')).toBe(1);
    r.engine.frame({ selfId: 'me', self: me, monsters: mon, fightingId: null, hits: [{ id: 'h1', targetKind: 'player', targetId: 'me' }] });
    expect(r.played('stab')).toBe(1);
    expect(r.made.find((a) => a.src === SFX_SRC.wolf)!.paused).toBeGreaterThan(0);
    // The sword for this player's own strike on a monster; a repeat of the same mark does nothing.
    r.made.find((a) => a.src === SFX_SRC.stab)!.end();
    const strike = { id: 'h2', targetKind: 'monster', targetId: 'w' };
    r.engine.frame({ selfId: 'me', self: { ...me, attacking: true }, monsters: [], fightingId: null, hits: [strike] });
    r.engine.frame({ selfId: 'me', self: { ...me, attacking: true }, monsters: [], fightingId: null, hits: [strike] });
    expect(r.played('sword')).toBe(1);
    // A strike by someone else (self not attacking) makes no sword sound.
    r.made.find((a) => a.src === SFX_SRC.sword)!.end();
    r.engine.frame({ selfId: 'me', self: me, monsters: [], fightingId: null, hits: [{ id: 'h3', targetKind: 'monster', targetId: 'w' }] });
    expect(r.played('sword')).toBe(1);
  });

  it('the sword is skipped while a creature sound plays; in the same frame the strike wins over the growl', () => {
    const r = rig();
    const mon = [{ id: 'w', kind: 'wolf', x: 130, y: 100 }];
    r.engine.frame({ selfId: 'me', self: me, monsters: mon, fightingId: null, hits: [] });
    expect(r.played('wolf')).toBe(1);
    r.engine.frame({ selfId: 'me', self: { ...me, attacking: true }, monsters: mon, fightingId: null, hits: [{ id: 'k1', targetKind: 'monster', targetId: 'w' }] });
    expect(r.played('sword')).toBe(0);
    const r2 = rig();
    r2.engine.frame({ selfId: 'me', self: { ...me, attacking: true }, monsters: mon, fightingId: null, hits: [{ id: 'k2', targetKind: 'monster', targetId: 'w' }] });
    expect(r2.played('sword')).toBe(1);
    expect(r2.played('wolf')).toBe(0);
  });

  it('volume and mute follow the settings, live', () => {
    const r = rig();
    r.engine.frame({ selfId: 'me', self: me, monsters: [{ id: 'w', kind: 'wolf', x: 130, y: 100 }], fightingId: null, hits: [] });
    r.settings.effectsVolume = 80;
    r.notify();
    expect(r.made[0]!.volume).toBeCloseTo(0.8, 5);
    r.settings.muted = true;
    r.notify();
    expect(r.made[0]!.volume).toBe(0);
    // Muted: nothing new starts.
    const before = r.made.length;
    r.setNow(100000);
    r.engine.frame({ selfId: 'me', self: me, monsters: [{ id: 'b', kind: 'bear', x: 120, y: 100 }], fightingId: null, hits: [] });
    expect(r.played('bear')).toBe(0);
    expect(r.made.length).toBe(before);
  });

  it('a sound that never reports its end is treated as finished', () => {
    const r = rig();
    r.engine.frame({ selfId: 'me', self: me, monsters: [{ id: 'w', kind: 'wolf', x: 130, y: 100 }], fightingId: null, hits: [] });
    r.setNow(1000 + SFX_MAX_PLAY_MS + 1);
    r.engine.frame({ selfId: 'me', self: me, monsters: [{ id: 'b', kind: 'bear', x: 130, y: 100 }], fightingId: null, hits: [] });
    expect(r.played('bear')).toBe(1);
  });

  it('a failed file or play() never throws', () => {
    const engine = createSfxEngine({
      createAudio: () => {
        throw new Error('no file');
      },
      now: () => 0,
      readSettings: () => ({ effectsVolume: 35, muted: false }),
    });
    engine.setCanvasVisible(true);
    engine.noteGesture();
    expect(() => engine.frame({ selfId: 'me', self: me, monsters: [{ id: 'w', kind: 'wolf', x: 110, y: 100 }], fightingId: null, hits: [] })).not.toThrow();
    const rejecting = createSfxEngine({
      createAudio: () => ({ play: () => Promise.reject(new Error('blocked')), pause() {}, volume: 1, currentTime: 0 }),
      now: () => 0,
      readSettings: () => ({ effectsVolume: 35, muted: false }),
    });
    rejecting.setCanvasVisible(true);
    rejecting.noteGesture();
    expect(() => rejecting.frame({ selfId: 'me', self: me, monsters: [{ id: 'w', kind: 'wolf', x: 110, y: 100 }], fightingId: null, hits: [] })).not.toThrow();
  });
});
