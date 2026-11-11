// Background music: zone tracks, the border hold, the crossfade, and the gates
// around a gesture, a hidden canvas, a hidden tab, and a file that will not play.
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  MUSIC_FADE_MS,
  MUSIC_HOLD_MS,
  MUSIC_RESUME_FADE_MS,
  MUSIC_TICK_MS,
  MUSIC_TRACK_SRC,
  createMusicEngine,
  trackForZone,
  type MusicAudio,
  type MusicEngine,
} from '../../src/client/music';
import type { ZoneName } from '../../src/rules/tables';

class FakeAudio implements MusicAudio {
  volume = 1;
  loop = false;
  currentTime = 0;
  paused = true;
  playCalls = 0;
  pauseCalls = 0;
  readonly listeners: Record<string, Array<() => void>> = {};

  constructor(
    readonly src: string,
    private readonly fail: 'none' | 'play' | 'error' = 'none',
  ) {}

  play(): Promise<void> | void {
    this.playCalls += 1;
    if (this.fail === 'play') return Promise.reject(new Error('autoplay blocked'));
    this.paused = false;
    if (this.fail === 'error') {
      for (const listener of this.listeners.error ?? []) listener();
    }
    return Promise.resolve();
  }

  pause(): void {
    this.pauseCalls += 1;
    this.paused = true;
  }

  addEventListener(type: string, listener: () => void): void {
    (this.listeners[type] ??= []).push(listener);
  }
}

interface Harness {
  engine: MusicEngine;
  audios: FakeAudio[];
  advance(ms: number): void;
  setSettings(next: { musicVolume?: number; muted?: boolean }, notify?: boolean): void;
  time(): number;
}

const open: MusicEngine[] = [];

function createHarness(options?: {
  musicVolume?: number;
  muted?: boolean;
  fail?: 'none' | 'play' | 'error' | 'create';
  failSrc?: string;
}): Harness {
  let time = 0;
  let musicVolume = options?.musicVolume ?? 25;
  let muted = options?.muted ?? false;
  let tick: (() => void) | null = null;
  const audios: FakeAudio[] = [];
  const listeners = new Set<() => void>();
  const fail = options?.fail ?? 'none';
  const failSrc = options?.failSrc;
  const engine = createMusicEngine({
    zone: 'town',
    createAudio(src) {
      if (fail === 'create' && (failSrc === undefined || src === failSrc)) throw new Error('missing file');
      const thisOne = failSrc === undefined || src === failSrc;
      const mode = thisOne && (fail === 'play' || fail === 'error') ? fail : 'none';
      const audio = new FakeAudio(src, mode);
      audios.push(audio);
      return audio;
    },
    now: () => time,
    every(_ms, fn) {
      tick = fn;
      return () => {
        if (tick === fn) tick = null;
      };
    },
    readSettings: () => ({ musicVolume, muted }),
    listenSettings(fn) {
      listeners.add(fn);
      return () => {
        listeners.delete(fn);
      };
    },
  });
  open.push(engine);

  function advance(ms: number): void {
    const steps = Math.round(ms / MUSIC_TICK_MS);
    for (let i = 0; i < steps; i += 1) {
      time += MUSIC_TICK_MS;
      tick?.();
      const sounding = audios.filter((audio) => !audio.paused);
      if (sounding.length > 2) throw new Error(`heard ${sounding.length} tracks at once`);
    }
  }

  function setSettings(next: { musicVolume?: number; muted?: boolean }, notify = true): void {
    if (next.musicVolume !== undefined) musicVolume = next.musicVolume;
    if (next.muted !== undefined) muted = next.muted;
    if (!notify) return;
    for (const fn of listeners) fn();
  }

  return { engine, audios, advance, setSettings, time: () => time };
}

function live(audios: readonly FakeAudio[], src?: string): FakeAudio[] {
  return audios.filter((audio) => !audio.paused && (src === undefined || audio.src === src));
}

function volumeOf(audios: readonly FakeAudio[], src: string): number {
  return live(audios, src).reduce((sum, audio) => sum + audio.volume, 0);
}

function arm(h: Harness, zone: ZoneName = 'town'): void {
  h.engine.setCanvasVisible(true);
  h.engine.setZone(zone);
  h.engine.noteGesture();
}

function settle(h: Harness, zone: ZoneName = 'town'): void {
  arm(h, zone);
  h.advance(MUSIC_FADE_MS);
}

afterEach(() => {
  for (const engine of open) engine.dispose();
  open.length = 0;
});

describe('zone tracks', () => {
  it('maps town, fields, and cemetery, and shares fields across green and grey', () => {
    expect(trackForZone('town')).toBe(MUSIC_TRACK_SRC.town);
    expect(trackForZone('town')).toBe('/sounds/music/town.mp3');
    expect(trackForZone('green')).toBe(MUSIC_TRACK_SRC.fields);
    expect(trackForZone('grey')).toBe(MUSIC_TRACK_SRC.fields);
    expect(trackForZone('green')).toBe(trackForZone('grey'));
    expect(trackForZone('green')).toBe('/sounds/music/fields.ogg');
    expect(trackForZone('cemetery')).toBe('/sounds/music/cemetery.ogg');
    const zones: ZoneName[] = ['town', 'green', 'grey', 'cemetery'];
    expect(new Set(zones.map(trackForZone)).size).toBe(3);
  });
});

describe('starting, holding, and crossfading', () => {
  it('plays nothing before the first gesture, then fades the current zone in over 2 s', () => {
    const h = createHarness();
    h.engine.setZone('town');
    h.engine.noteGesture();
    h.advance(MUSIC_FADE_MS);
    expect(h.audios).toHaveLength(0);

    h.engine.setCanvasVisible(true);
    h.advance(MUSIC_FADE_MS);
    expect(h.audios).toHaveLength(0);

    h.engine.noteGesture();
    expect(h.audios).toHaveLength(1);
    const town = h.audios[0]!;
    expect(town.src).toBe(MUSIC_TRACK_SRC.town);
    expect(town.loop).toBe(true);
    expect(town.paused).toBe(false);
    expect(town.playCalls).toBe(1);
    expect(town.volume).toBe(0);

    h.advance(MUSIC_FADE_MS / 2);
    expect(town.volume).toBeCloseTo(0.125, 5);
    h.advance(MUSIC_FADE_MS / 2);
    expect(town.volume).toBeCloseTo(0.25, 5);
    expect(town.paused).toBe(false);
    expect(live(h.audios)).toHaveLength(1);
  });

  it('ignores a zone flip that reverts inside 0.5 s and fades a hold over 2 s', () => {
    const h = createHarness({ musicVolume: 100 });
    settle(h, 'town');
    const town = h.audios[0]!;
    town.currentTime = 14;
    const plays = town.playCalls;

    h.engine.setZone('green');
    h.advance(MUSIC_HOLD_MS - MUSIC_TICK_MS);
    expect(h.audios.map((audio) => audio.src)).toEqual([MUSIC_TRACK_SRC.town]);
    expect(town.paused).toBe(false);
    expect(town.currentTime).toBe(14);
    expect(town.playCalls).toBe(plays);

    h.engine.setZone('town');
    h.advance(MUSIC_FADE_MS);
    expect(h.audios).toHaveLength(1);
    expect(town.paused).toBe(false);
    expect(town.volume).toBeCloseTo(1, 5);
    expect(town.currentTime).toBe(14);

    h.engine.setZone('green');
    h.advance(MUSIC_HOLD_MS);
    expect(volumeOf(h.audios, MUSIC_TRACK_SRC.town)).toBeCloseTo(1, 5);
    expect(volumeOf(h.audios, MUSIC_TRACK_SRC.fields)).toBeCloseTo(0, 5);
    expect(live(h.audios)).toHaveLength(2);

    for (let elapsed = MUSIC_TICK_MS; elapsed < MUSIC_FADE_MS; elapsed += MUSIC_TICK_MS) {
      h.advance(MUSIC_TICK_MS);
      const townLevel = volumeOf(h.audios, MUSIC_TRACK_SRC.town);
      const fieldsLevel = volumeOf(h.audios, MUSIC_TRACK_SRC.fields);
      expect(townLevel + fieldsLevel).toBeCloseTo(1, 5);
      expect(fieldsLevel).toBeCloseTo(elapsed / MUSIC_FADE_MS, 5);
    }
    h.advance(MUSIC_TICK_MS);
    expect(live(h.audios).map((audio) => audio.src)).toEqual([MUSIC_TRACK_SRC.fields]);
    expect(volumeOf(h.audios, MUSIC_TRACK_SRC.fields)).toBeCloseTo(1, 5);
    expect(town.paused).toBe(true);
  });

  it('keeps fields playing with no fade when green and grey trade places', () => {
    const h = createHarness({ musicVolume: 100 });
    settle(h, 'green');
    const fields = live(h.audios)[0]!;
    expect(fields.src).toBe(MUSIC_TRACK_SRC.fields);
    fields.currentTime = 9;
    const plays = fields.playCalls;

    h.engine.setZone('grey');
    h.advance(MUSIC_HOLD_MS + MUSIC_FADE_MS);
    expect(live(h.audios)).toEqual([fields]);
    expect(fields.volume).toBeCloseTo(1, 5);
    expect(fields.currentTime).toBe(9);
    expect(fields.playCalls).toBe(plays);
    expect(fields.pauseCalls).toBe(0);

    h.engine.setZone('green');
    h.advance(MUSIC_HOLD_MS / 2);
    h.engine.setZone('grey');
    h.advance(MUSIC_HOLD_MS);
    expect(live(h.audios)).toEqual([fields]);
    expect(h.audios).toHaveLength(1);

    // Stepping away and back inside the hold leaves the fields track where it is.
    h.engine.setZone('town');
    h.advance(200);
    h.engine.setZone('grey');
    h.advance(MUSIC_HOLD_MS);
    expect(live(h.audios)).toEqual([fields]);
    expect(h.audios).toHaveLength(1);

    // Green then grey is one fields request, so the hold is not started over.
    h.engine.setZone('town');
    h.advance(MUSIC_HOLD_MS + MUSIC_FADE_MS);
    expect(live(h.audios).map((audio) => audio.src)).toEqual([MUSIC_TRACK_SRC.town]);
    h.engine.setZone('green');
    h.advance(200);
    expect(live(h.audios).map((audio) => audio.src)).toEqual([MUSIC_TRACK_SRC.town]);
    h.engine.setZone('grey');
    h.advance(MUSIC_HOLD_MS - 200);
    expect(volumeOf(h.audios, MUSIC_TRACK_SRC.town)).toBeCloseTo(1, 5);
    expect(volumeOf(h.audios, MUSIC_TRACK_SRC.fields)).toBeCloseTo(0, 5);
    expect(live(h.audios)).toHaveLength(2);
  });

  it('retargets a fade from the current levels and never sounds a third track', () => {
    const h = createHarness({ musicVolume: 100 });
    settle(h, 'town');
    h.engine.setZone('green');
    h.advance(MUSIC_HOLD_MS + MUSIC_FADE_MS / 2);
    expect(volumeOf(h.audios, MUSIC_TRACK_SRC.town)).toBeCloseTo(0.5, 5);
    expect(volumeOf(h.audios, MUSIC_TRACK_SRC.fields)).toBeCloseTo(0.5, 5);

    h.engine.setZone('town');
    h.advance(MUSIC_HOLD_MS);
    expect(volumeOf(h.audios, MUSIC_TRACK_SRC.town)).toBeCloseTo(0.25, 5);
    expect(volumeOf(h.audios, MUSIC_TRACK_SRC.fields)).toBeCloseTo(0.75, 5);
    expect(live(h.audios)).toHaveLength(2);

    h.advance(MUSIC_FADE_MS / 2);
    expect(volumeOf(h.audios, MUSIC_TRACK_SRC.town)).toBeCloseTo(0.625, 5);
    expect(volumeOf(h.audios, MUSIC_TRACK_SRC.fields)).toBeCloseTo(0.375, 5);
    expect(volumeOf(h.audios, MUSIC_TRACK_SRC.town) + volumeOf(h.audios, MUSIC_TRACK_SRC.fields)).toBeCloseTo(1, 5);

    h.engine.setZone('cemetery');
    h.advance(MUSIC_HOLD_MS);
    // The louder of the two tracks keeps its level. The quieter one stops so a third never joins.
    expect(live(h.audios).length).toBeLessThanOrEqual(2);
    expect(volumeOf(h.audios, MUSIC_TRACK_SRC.town)).toBeCloseTo(0.8125, 5);
    expect(live(h.audios).some((audio) => audio.src === MUSIC_TRACK_SRC.fields)).toBe(false);
    const cemetery = live(h.audios).find((audio) => audio.src === MUSIC_TRACK_SRC.cemetery);
    expect(cemetery).toBeDefined();
    expect(cemetery!.volume).toBeCloseTo(0, 5);

    h.advance(MUSIC_FADE_MS);
    expect(live(h.audios).map((audio) => audio.src)).toEqual([MUSIC_TRACK_SRC.cemetery]);
    expect(volumeOf(h.audios, MUSIC_TRACK_SRC.cemetery)).toBeCloseTo(1, 5);

    const zones: ZoneName[] = ['town', 'green', 'grey', 'cemetery', 'town', 'grey', 'green'];
    for (const zone of zones) {
      h.engine.setZone(zone);
      h.advance(MUSIC_HOLD_MS + MUSIC_FADE_MS);
      expect(live(h.audios).length).toBeLessThanOrEqual(2);
    }
  });
});

describe('volume, mute, and the screen gates', () => {
  it('scales by musicVolume, applies a live change and mute, and keeps the playhead', () => {
    const h = createHarness();
    settle(h, 'town');
    const town = live(h.audios)[0]!;
    expect(town.volume).toBeCloseTo(0.25, 5);
    town.currentTime = 6;

    h.setSettings({ musicVolume: 40 });
    expect(town.volume).toBeCloseTo(0.4, 5);
    expect(town.paused).toBe(false);
    expect(town.currentTime).toBe(6);

    h.setSettings({ musicVolume: 10 }, false);
    expect(town.volume).toBeCloseTo(0.4, 5);
    h.advance(MUSIC_TICK_MS);
    expect(town.volume).toBeCloseTo(0.1, 5);

    h.engine.setZone('cemetery');
    h.advance(MUSIC_HOLD_MS + MUSIC_FADE_MS / 2);
    expect(volumeOf(h.audios, MUSIC_TRACK_SRC.town)).toBeCloseTo(0.05, 5);
    expect(volumeOf(h.audios, MUSIC_TRACK_SRC.cemetery)).toBeCloseTo(0.05, 5);

    h.setSettings({ musicVolume: 80 });
    expect(volumeOf(h.audios, MUSIC_TRACK_SRC.town)).toBeCloseTo(0.4, 5);
    expect(volumeOf(h.audios, MUSIC_TRACK_SRC.cemetery)).toBeCloseTo(0.4, 5);

    const cemetery = live(h.audios, MUSIC_TRACK_SRC.cemetery)[0]!;
    cemetery.currentTime = 3;
    h.setSettings({ muted: true });
    expect(town.volume).toBe(0);
    expect(cemetery.volume).toBe(0);
    expect(town.paused).toBe(false);
    expect(cemetery.paused).toBe(false);
    expect(town.currentTime).toBe(6);
    expect(cemetery.currentTime).toBe(3);

    h.setSettings({ muted: false });
    expect(volumeOf(h.audios, MUSIC_TRACK_SRC.town)).toBeCloseTo(0.4, 5);
    expect(volumeOf(h.audios, MUSIC_TRACK_SRC.cemetery)).toBeCloseTo(0.4, 5);
    expect(cemetery.currentTime).toBe(3);
  });

  it('is silent while the canvas is hidden and fades back in when it returns', () => {
    const h = createHarness({ musicVolume: 100 });
    settle(h, 'green');
    const fields = live(h.audios)[0]!;
    fields.currentTime = 11;

    h.engine.setCanvasVisible(false);
    expect(fields.paused).toBe(true);
    expect(fields.currentTime).toBe(0);
    expect(live(h.audios)).toHaveLength(0);
    h.advance(MUSIC_FADE_MS);
    expect(live(h.audios)).toHaveLength(0);

    h.engine.noteGesture();
    h.advance(MUSIC_FADE_MS);
    expect(live(h.audios)).toHaveLength(0);

    h.engine.setCanvasVisible(true);
    expect(live(h.audios)).toHaveLength(1);
    expect(live(h.audios)[0]!.src).toBe(MUSIC_TRACK_SRC.fields);
    expect(live(h.audios)[0]!.volume).toBe(0);
    expect(live(h.audios)[0]!.currentTime).toBe(0);
    h.advance(MUSIC_FADE_MS);
    expect(volumeOf(h.audios, MUSIC_TRACK_SRC.fields)).toBeCloseTo(1, 5);
  });

  it('pauses on a hidden tab without rewinding and fades back in when it shows', () => {
    const h = createHarness({ musicVolume: 100 });
    settle(h, 'town');
    const town = live(h.audios)[0]!;
    town.currentTime = 18;

    h.engine.setZone('cemetery');
    h.engine.setTabVisible(false);
    h.advance(MUSIC_HOLD_MS + MUSIC_FADE_MS);
    expect(town.paused).toBe(true);
    expect(town.currentTime).toBe(18);
    expect(h.audios.map((audio) => audio.src)).toEqual([MUSIC_TRACK_SRC.town]);

    h.engine.setTabVisible(true);
    expect(town.paused).toBe(false);
    expect(town.currentTime).toBe(18);
    expect(town.volume).toBeCloseTo(0, 5);

    h.advance(MUSIC_RESUME_FADE_MS / 2);
    expect(town.volume).toBeCloseTo(0.5, 5);
    h.advance(MUSIC_RESUME_FADE_MS / 2);
    expect(town.volume).toBeCloseTo(1, 5);
    expect(town.currentTime).toBe(18);
    // The 0.5 s hold does not run while the tab is hidden, so it is still short of a fade.
    expect(h.audios.map((audio) => audio.src)).toEqual([MUSIC_TRACK_SRC.town]);

    h.advance(MUSIC_HOLD_MS - MUSIC_RESUME_FADE_MS);
    expect(volumeOf(h.audios, MUSIC_TRACK_SRC.cemetery)).toBeCloseTo(0, 5);
    expect(live(h.audios).some((audio) => audio.src === MUSIC_TRACK_SRC.cemetery)).toBe(true);
    expect(town.currentTime).toBe(18);
  });
});

describe('a bad audio file', () => {
  it('swallows a rejected play, a load error, and a missing file', async () => {
    const refused = createHarness({ fail: 'play', failSrc: MUSIC_TRACK_SRC.town, musicVolume: 100 });
    expect(() => arm(refused, 'town')).not.toThrow();
    await Promise.resolve();
    expect(live(refused.audios)).toHaveLength(0);
    refused.engine.setZone('green');
    expect(live(refused.audios).map((audio) => audio.src)).toEqual([MUSIC_TRACK_SRC.fields]);
    refused.advance(MUSIC_FADE_MS);
    expect(volumeOf(refused.audios, MUSIC_TRACK_SRC.fields)).toBeCloseTo(1, 5);

    const broken = createHarness({ fail: 'error', failSrc: MUSIC_TRACK_SRC.cemetery, musicVolume: 100 });
    expect(() => arm(broken, 'cemetery')).not.toThrow();
    expect(live(broken.audios)).toHaveLength(0);
    broken.engine.setZone('town');
    expect(live(broken.audios).map((audio) => audio.src)).toEqual([MUSIC_TRACK_SRC.town]);

    const missing = createHarness({ fail: 'create', failSrc: MUSIC_TRACK_SRC.town, musicVolume: 100 });
    expect(() => arm(missing, 'town')).not.toThrow();
    expect(missing.audios).toHaveLength(0);
    missing.engine.setZone('grey');
    missing.advance(MUSIC_FADE_MS);
    expect(live(missing.audios).map((audio) => audio.src)).toEqual([MUSIC_TRACK_SRC.fields]);
    expect(volumeOf(missing.audios, MUSIC_TRACK_SRC.fields)).toBeCloseTo(1, 5);
  });
});

describe('the game page', () => {
  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it('arms on the first key, follows the zone, pauses when the tab hides, and stops when the canvas hides', async () => {
    vi.useFakeTimers({ now: 1_000_000 });
    vi.resetModules();
    const made: PageAudio[] = [];
    class PageAudio {
      volume = 1;
      loop = false;
      currentTime = 0;
      paused = true;
      preload = '';
      constructor(readonly src: string) {
        made.push(this);
      }
      play(): Promise<void> {
        this.paused = false;
        return Promise.resolve();
      }
      pause(): void {
        this.paused = true;
      }
      addEventListener(): void {}
    }
    class FigSocket {
      static latest: FigSocket | null = null;
      listeners: Record<string, Array<(event: { data?: unknown }) => void>> = {};
      constructor(_url: string) {
        FigSocket.latest = this;
      }
      send(): void {}
      close(): void {}
      addEventListener(type: string, listener: (event: { data?: unknown }) => void): void {
        (this.listeners[type] ??= []).push(listener);
      }
      deliver(data: unknown): void {
        const payload = JSON.stringify(data);
        for (const listener of this.listeners.message ?? []) listener({ data: payload });
      }
    }
    class FakeObserver {
      static latest: FakeObserver | null = null;
      constructor(private readonly cb: () => void) {
        FakeObserver.latest = this;
      }
      observe(): void {}
      pull(): void {
        this.cb();
      }
    }
    const listeners: Record<string, Array<(event?: { key?: string; preventDefault?: () => void }) => void>> = {};
    const canvas = {
      id: 'papaya-canvas',
      hidden: false,
      width: 1280,
      height: 720,
      style: { cursor: '' },
      addEventListener(): void {},
      getBoundingClientRect: () => ({ left: 0, top: 0, width: 1280, height: 720 }),
      getContext: () => null,
    };
    const doc = {
      visibilityState: 'visible' as string,
      hidden: false,
      getElementById: (id: string) => (id === 'papaya-canvas' ? canvas : null),
      createElement: () => ({ width: 0, height: 0, getContext: () => null }),
      addEventListener(type: string, listener: (event?: { key?: string; preventDefault?: () => void }) => void) {
        (listeners[type] ??= []).push(listener);
      },
    };
    vi.stubGlobal('Audio', PageAudio);
    vi.stubGlobal('MutationObserver', FakeObserver);
    vi.stubGlobal('localStorage', { getItem: () => null, setItem: () => {} });
    vi.stubGlobal('window', {});
    vi.stubGlobal('document', doc);
    vi.stubGlobal('WebSocket', FigSocket);
    vi.stubGlobal('location', { protocol: 'http:', host: '127.0.0.1:8787' });

    const main = await import('../../src/client/main');
    main.sproutAfterLogin(doc as unknown as Document, { id: 'fig-self', place: 'town', gender: 'woman' });
    expect(made).toHaveLength(0);
    expect(listeners.pointerdown?.length).toBeGreaterThan(0);
    expect(listeners.keydown?.length).toBeGreaterThan(0);

    const key = { key: 'k', preventDefault() {} };
    for (const listener of listeners.keydown ?? []) listener(key);
    expect(made.map((audio) => audio.src)).toEqual([MUSIC_TRACK_SRC.town]);
    expect(made[0]!.loop).toBe(true);
    expect(made[0]!.paused).toBe(false);
    await vi.advanceTimersByTimeAsync(MUSIC_FADE_MS);
    expect(made[0]!.volume).toBeCloseTo(0.25, 5);
    made[0]!.currentTime = 4;

    FigSocket.latest?.deliver({
      type: 'snapshot',
      character: { id: 'fig-self', place: 'green', gender: 'woman' },
      snapshot: { players: [], monsters: [], coins: [], pickups: [] },
    });
    await vi.advanceTimersByTimeAsync(MUSIC_HOLD_MS - MUSIC_TICK_MS);
    expect(made).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(MUSIC_TICK_MS);
    expect(made.map((audio) => audio.src)).toEqual([MUSIC_TRACK_SRC.town, MUSIC_TRACK_SRC.fields]);

    FigSocket.latest?.deliver({
      type: 'snapshot',
      character: { id: 'fig-self', place: 'grey', gender: 'woman' },
      snapshot: { players: [], monsters: [], coins: [], pickups: [] },
    });
    await vi.advanceTimersByTimeAsync(MUSIC_FADE_MS);
    const fields = made.filter((audio) => audio.src === MUSIC_TRACK_SRC.fields && !audio.paused);
    expect(fields).toHaveLength(1);
    expect(made.filter((audio) => !audio.paused)).toHaveLength(1);

    doc.visibilityState = 'hidden';
    fields[0]!.currentTime = 21;
    for (const listener of listeners.visibilitychange ?? []) listener();
    expect(fields[0]!.paused).toBe(true);
    expect(fields[0]!.currentTime).toBe(21);
    await vi.advanceTimersByTimeAsync(MUSIC_FADE_MS);
    expect(fields[0]!.paused).toBe(true);
    expect(fields[0]!.currentTime).toBe(21);

    doc.visibilityState = 'visible';
    for (const listener of listeners.visibilitychange ?? []) listener();
    expect(fields[0]!.paused).toBe(false);
    expect(fields[0]!.currentTime).toBe(21);
    expect(fields[0]!.volume).toBeCloseTo(0, 5);
    await vi.advanceTimersByTimeAsync(MUSIC_RESUME_FADE_MS);
    expect(fields[0]!.volume).toBeCloseTo(0.25, 5);

    canvas.hidden = true;
    FakeObserver.latest?.pull();
    expect(fields[0]!.paused).toBe(true);
    expect(fields[0]!.currentTime).toBe(0);
    await vi.advanceTimersByTimeAsync(MUSIC_FADE_MS);
    expect(made.filter((audio) => !audio.paused)).toHaveLength(0);
  });
});
