// Background music for the fig's zone. Tracks loop. A zone must sit still for
// half a second before the track changes, then the old one fades out and the
// new one fades in together. Green and grey share one track, so that border
// does not fade. The engine stays quiet until the canvas is up and the player
// has pressed a key or the pointer, and it never lets a bad file throw.

import type { ZoneName } from '../rules/tables';

export const MUSIC_TICK_MS = 50;
export const MUSIC_HOLD_MS = 500;
export const MUSIC_FADE_MS = 2000;
// Coming back to a visible tab fades in shorter than a zone change.
export const MUSIC_RESUME_FADE_MS = 400;

export const MUSIC_TRACK_SRC = {
  town: '/sounds/music/town.mp3',
  fields: '/sounds/music/fields.ogg',
  cemetery: '/sounds/music/cemetery.ogg',
} as const;

export function trackForZone(zone: ZoneName): string {
  if (zone === 'town') return MUSIC_TRACK_SRC.town;
  if (zone === 'cemetery') return MUSIC_TRACK_SRC.cemetery;
  return MUSIC_TRACK_SRC.fields;
}

export interface MusicAudio {
  play(): Promise<void> | void;
  pause(): void;
  volume: number;
  loop: boolean;
  currentTime: number;
  src: string;
  addEventListener?(type: string, listener: () => void): void;
}

export interface MusicSettings {
  musicVolume: number;
  muted: boolean;
}

export interface MusicEngineOptions {
  createAudio: (src: string) => MusicAudio;
  now: () => number;
  every: (ms: number, fn: () => void) => () => void;
  readSettings: () => MusicSettings;
  listenSettings?: (fn: () => void) => () => void;
  zone?: ZoneName;
}

export interface MusicEngine {
  setZone(zone: ZoneName): void;
  setCanvasVisible(visible: boolean): void;
  setTabVisible(visible: boolean): void;
  noteGesture(): void;
  dispose(): void;
}

interface Ramp {
  from: number;
  to: number;
  startedAt: number;
  duration: number;
}

interface Slot {
  src: string;
  audio: MusicAudio;
  level: number;
  ramp: Ramp | null;
  failed: boolean;
}

const ZERO_LEVEL = 1e-4;

export function createMusicEngine(options: MusicEngineOptions): MusicEngine {
  let currentZone: ZoneName = options.zone ?? 'town';
  let requested = trackForZone(currentZone);
  let goalSrc: string | null = null;
  let pending: { src: string; at: number } | null = null;
  let canvasVisible = false;
  let tabHidden = false;
  let unlocked = false;
  let resumeGain = 1;
  let resumeRamp: { startedAt: number; duration: number } | null = null;
  let skew = 0;
  let frozenAt: number | null = null;
  let slots: Slot[] = [];
  let stopped = false;

  function logicalNow(): number {
    if (frozenAt !== null) return frozenAt - skew;
    return options.now() - skew;
  }

  function freezeClock(): void {
    if (frozenAt !== null) return;
    frozenAt = options.now();
  }

  function thawClock(): void {
    if (frozenAt === null) return;
    skew += options.now() - frozenAt;
    frozenAt = null;
  }

  function masterGain(): number {
    if (!canvasVisible || tabHidden) return 0;
    let settings: MusicSettings;
    try {
      settings = options.readSettings();
    } catch {
      settings = { musicVolume: 25, muted: false };
    }
    if (settings.muted === true) return 0;
    const raw = typeof settings.musicVolume === 'number' && Number.isFinite(settings.musicVolume) ? settings.musicVolume : 25;
    const scale = Math.min(1, Math.max(0, raw / 100));
    return scale * resumeGain;
  }

  function applyOutputs(): void {
    const gain = masterGain();
    for (const slot of slots) {
      const level = slot.failed ? 0 : slot.level;
      try {
        slot.audio.volume = Math.min(1, Math.max(0, level * gain));
      } catch {
        // A sour element does not stop the fig.
      }
    }
  }

  function dropSlot(slot: Slot): void {
    slot.ramp = null;
    slot.level = 0;
    slot.failed = true;
    try {
      slot.audio.volume = 0;
    } catch {
      // Ignore a sealed volume.
    }
    try {
      slot.audio.pause();
    } catch {
      // Ignore a pause that the element refuses.
    }
    try {
      slot.audio.currentTime = 0;
    } catch {
      // A file that never loaded has no position to clear.
    }
    slots = slots.filter((row) => row !== slot);
  }

  function failSlot(slot: Slot): void {
    dropSlot(slot);
  }

  function watchErrors(audio: MusicAudio, slot: Slot): void {
    try {
      audio.addEventListener?.('error', () => failSlot(slot));
    } catch {
      // play() rejection is the other door. A missing listener stays quiet.
    }
  }

  function isThenable(value: unknown): value is Promise<void> {
    return value !== null && typeof value === 'object' && typeof (value as Promise<void>).then === 'function';
  }

  function safePlay(slot: Slot): void {
    if (slot.failed || !slots.includes(slot)) return;
    let result: unknown;
    try {
      result = slot.audio.play();
    } catch {
      failSlot(slot);
      return;
    }
    if (slot.failed || !slots.includes(slot)) return;
    if (!isThenable(result)) return;
    result.then(
      () => {},
      () => failSlot(slot),
    );
  }

  function ensureSlot(src: string): Slot | null {
    const existing = slots.find((slot) => slot.src === src && !slot.failed);
    if (existing) return existing;
    let audio: MusicAudio;
    try {
      audio = options.createAudio(src);
    } catch {
      return null;
    }
    const slot: Slot = { src, audio, level: 0, ramp: null, failed: false };
    try {
      audio.loop = true;
    } catch {
      // Loop is the wanted state. A refusal just plays the file once.
    }
    try {
      audio.volume = 0;
    } catch {
      // Volume is applied again before the fade is heard.
    }
    watchErrors(audio, slot);
    if (slot.failed) return null;
    slots.push(slot);
    return slot;
  }

  function audible(): boolean {
    return slots.some((slot) => !slot.failed && (slot.level > ZERO_LEVEL || slot.ramp !== null));
  }

  function beginFadeTo(src: string): void {
    const previousGoal = goalSrc;
    goalSrc = src;
    pending = null;
    const incoming = ensureSlot(src);
    const others = slots.filter((slot) => slot !== incoming);
    others.sort((a, b) => {
      const delta = b.level - a.level;
      if (Math.abs(delta) > ZERO_LEVEL) return delta;
      if (a.src === previousGoal) return -1;
      if (b.src === previousGoal) return 1;
      return 0;
    });
    const keep = others[0] ?? null;
    for (const extra of others.slice(1)) dropSlot(extra);
    const t = logicalNow();
    if (keep && keep.level <= ZERO_LEVEL && keep.ramp === null) {
      dropSlot(keep);
    } else if (keep) {
      keep.ramp = { from: keep.level, to: 0, startedAt: t, duration: MUSIC_FADE_MS };
    }
    if (incoming && !incoming.failed) {
      incoming.ramp = { from: incoming.level, to: 1, startedAt: t, duration: MUSIC_FADE_MS };
    }
    // Two slots at most: the one fading out and the one fading in.
    const kept = new Set<Slot>();
    if (keep && slots.includes(keep)) kept.add(keep);
    if (incoming && slots.includes(incoming)) kept.add(incoming);
    for (const slot of [...slots]) {
      if (!kept.has(slot)) dropSlot(slot);
    }
    applyOutputs();
    if (keep && slots.includes(keep)) safePlay(keep);
    if (incoming && slots.includes(incoming)) safePlay(incoming);
  }

  function stepRamps(t: number): void {
    if (resumeRamp) {
      const span = resumeRamp.duration <= 0 ? 1 : (t - resumeRamp.startedAt) / resumeRamp.duration;
      const clamped = Math.min(1, Math.max(0, span));
      resumeGain = clamped;
      if (clamped >= 1) resumeRamp = null;
    }
    for (const slot of [...slots]) {
      const ramp = slot.ramp;
      if (ramp === null) continue;
      const span = ramp.duration <= 0 ? 1 : (t - ramp.startedAt) / ramp.duration;
      const clamped = Math.min(1, Math.max(0, span));
      slot.level = ramp.from + (ramp.to - ramp.from) * clamped;
      if (clamped >= 1) {
        slot.level = ramp.to;
        slot.ramp = null;
        if (slot.level <= ZERO_LEVEL) dropSlot(slot);
      }
    }
  }

  function tick(): void {
    if (stopped || !canvasVisible || tabHidden) return;
    const t = logicalNow();
    stepRamps(t);
    if (unlocked && pending && t - pending.at >= MUSIC_HOLD_MS) {
      const src = pending.src;
      pending = null;
      beginFadeTo(src);
      return;
    }
    applyOutputs();
  }

  function consider(src: string): void {
    requested = src;
    if (!canvasVisible || !unlocked) {
      pending = null;
      return;
    }
    if (src === goalSrc) {
      pending = null;
      return;
    }
    if (!audible()) {
      pending = null;
      beginFadeTo(src);
      return;
    }
    if (pending?.src === src) return;
    pending = { src, at: logicalNow() };
  }

  let stopTicker: (() => void) | null = null;
  try {
    stopTicker = options.every(MUSIC_TICK_MS, () => {
      try {
        tick();
      } catch {
        // One bad tick leaves the fig running and the next tick tries again.
      }
    });
  } catch {
    stopTicker = null;
  }

  let unlisten: (() => void) | null = null;
  try {
    unlisten =
      options.listenSettings?.(() => {
        try {
          applyOutputs();
        } catch {
          // The slider still moves if a track refuses the new level.
        }
      }) ?? null;
  } catch {
    unlisten = null;
  }

  function setZone(zone: ZoneName): void {
    try {
      if (stopped || zone === currentZone) return;
      currentZone = zone;
      consider(trackForZone(zone));
    } catch {
      // A zone change with a broken file keeps the picture moving.
    }
  }

  function setCanvasVisible(visible: boolean): void {
    try {
      if (stopped || visible === canvasVisible) return;
      canvasVisible = visible;
      if (!visible) {
        pending = null;
        goalSrc = null;
        resumeRamp = null;
        resumeGain = 1;
        for (const slot of [...slots]) dropSlot(slot);
        return;
      }
      if (unlocked && !tabHidden) beginFadeTo(requested);
    } catch {
      // Hiding or showing the canvas must not throw into the screen loop.
    }
  }

  function setTabVisible(visible: boolean): void {
    try {
      if (stopped) return;
      if (!visible) {
        if (tabHidden) return;
        tabHidden = true;
        freezeClock();
        resumeRamp = null;
        for (const slot of slots) {
          try {
            slot.audio.pause();
          } catch {
            // Already quiet is the state we wanted.
          }
        }
        return;
      }
      if (!tabHidden) return;
      tabHidden = false;
      thawClock();
      if (!canvasVisible || !unlocked) return;
      if (!audible()) {
        resumeGain = 1;
        resumeRamp = null;
        beginFadeTo(requested);
        return;
      }
      resumeGain = 0;
      resumeRamp = { startedAt: logicalNow(), duration: MUSIC_RESUME_FADE_MS };
      applyOutputs();
      for (const slot of [...slots]) safePlay(slot);
    } catch {
      // The tab switch still finishes if a track cannot pause.
    }
  }

  function noteGesture(): void {
    try {
      if (stopped || !canvasVisible || unlocked) return;
      unlocked = true;
      if (tabHidden) return;
      beginFadeTo(requested);
    } catch {
      // Autoplay refusal leaves the fig silent.
    }
  }

  function dispose(): void {
    stopped = true;
    try {
      stopTicker?.();
    } catch {
      // The ticker is already gone.
    }
    stopTicker = null;
    try {
      unlisten?.();
    } catch {
      // The settings jar can drop a listener that already left.
    }
    unlisten = null;
    pending = null;
    goalSrc = null;
    canvasVisible = false;
    unlocked = false;
    for (const slot of [...slots]) dropSlot(slot);
  }

  return { setZone, setCanvasVisible, setTabVisible, noteGesture, dispose };
}
