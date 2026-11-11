// Plum jar for one browser. One key, `pl-settings`. A sour fig in the jar
// falls back one field at a time, and a blocked jar never throws.

export const SETTINGS_KEY = 'pl-settings';

export const RESOLUTION_PRESETS = ['small', 'medium', 'large', 'fit', 'fullscreen'] as const;
export type ResolutionPreset = (typeof RESOLUTION_PRESETS)[number];

export const KEY_ACTIONS = ['bag', 'menu', 'settings'] as const;
export type KeyAction = (typeof KEY_ACTIONS)[number];

export const PRESET_WIDTH = { small: 960, medium: 1280, large: 1600 } as const;

// The papaya picture is 16:9. A preset only changes the displayed melon, not the 1280x720 buffer.
export const FIG_ASPECT = 16 / 9;

export interface FigSettings {
  resolution: ResolutionPreset;
  musicVolume: number;
  effectsVolume: number;
  muted: boolean;
  keys: Record<KeyAction, string>;
}

export const DEFAULT_SETTINGS: FigSettings = Object.freeze({
  resolution: 'fit',
  musicVolume: 25,
  effectsVolume: 35,
  muted: false,
  keys: Object.freeze({ bag: 'b', menu: 'm', settings: 's' }),
});

export interface FigJar {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export interface MelonBox {
  readonly width: number;
  readonly height: number;
}

export interface FigKeyPress {
  key?: string;
  ctrlKey?: boolean;
  altKey?: boolean;
  metaKey?: boolean;
}

export type RebindResult =
  | { ok: true; settings: FigSettings }
  | { ok: false; reason: 'forbidden' | 'conflict'; message: string };

const FORBIDDEN_KEYS = new Set([
  'escape',
  'esc',
  'tab',
  'enter',
  ' ',
  'space',
  'spacebar',
  'shift',
  'shiftleft',
  'shiftright',
  'control',
  'controlleft',
  'controlright',
  'alt',
  'altleft',
  'altright',
  'meta',
  'metaleft',
  'metaright',
  'os',
  'hyper',
  'super',
  'fn',
  'symbol',
  'altgraph',
  'capslock',
  'numlock',
  'scrolllock',
  'dead',
  'unidentified',
  'process',
  'contextmenu',
]);

const ACTION_LABEL: Record<KeyAction, string> = {
  bag: 'Bag',
  menu: 'Menu',
  settings: 'Settings',
};

type FigListener = (settings: FigSettings) => void;

let melonLive: FigSettings = cloneSettings(DEFAULT_SETTINGS);
const plumListeners = new Set<FigListener>();

function cloneSettings(s: FigSettings): FigSettings {
  return {
    resolution: s.resolution,
    musicVolume: s.musicVolume,
    effectsVolume: s.effectsVolume,
    muted: s.muted,
    keys: { bag: s.keys.bag, menu: s.keys.menu, settings: s.keys.settings },
  };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function readVolume(value: unknown, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  if (value < 0 || value > 100) return fallback;
  return Math.round(value);
}

function readResolution(value: unknown): ResolutionPreset {
  if (
    value === 'small' ||
    value === 'medium' ||
    value === 'large' ||
    value === 'fit' ||
    value === 'fullscreen'
  ) {
    return value;
  }
  return DEFAULT_SETTINGS.resolution;
}

// A bindable fig key, stored lower-case. Modifier-only keys, Esc, Tab, Enter and Space are refused.
export function normalizeKeyName(raw: string): string | null {
  if (typeof raw !== 'string') return null;
  const key = raw.toLowerCase();
  if (key.length === 0 || key.length > 32) return null;
  if (FORBIDDEN_KEYS.has(key)) return null;
  if (/\s/.test(key)) return null;
  return key;
}

export function bindableKey(press: FigKeyPress): string | null {
  if (press.ctrlKey === true || press.altKey === true || press.metaKey === true) return null;
  if (typeof press.key !== 'string') return null;
  return normalizeKeyName(press.key);
}

function readKeyCandidate(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  return normalizeKeyName(value);
}

function sanitizeKeys(raw: unknown): Record<KeyAction, string> {
  const result: Record<KeyAction, string> = {
    bag: DEFAULT_SETTINGS.keys.bag,
    menu: DEFAULT_SETTINGS.keys.menu,
    settings: DEFAULT_SETTINGS.keys.settings,
  };
  const record = asRecord(raw);
  if (record === null) return result;
  const candidates = new Map<KeyAction, string>();
  for (const action of KEY_ACTIONS) {
    const candidate = readKeyCandidate(record[action]);
    if (candidate !== null) candidates.set(action, candidate);
  }
  const claims = new Map<string, number>();
  for (const key of candidates.values()) claims.set(key, (claims.get(key) ?? 0) + 1);
  for (const [action, key] of candidates) {
    if ((claims.get(key) ?? 0) > 1) candidates.delete(action);
  }
  for (const [action, key] of [...candidates]) {
    const hitsKeptDefault = KEY_ACTIONS.some(
      (other) => other !== action && !candidates.has(other) && DEFAULT_SETTINGS.keys[other] === key,
    );
    if (hitsKeptDefault) candidates.delete(action);
  }
  for (const [action, key] of candidates) result[action] = key;
  const seen = new Set<string>();
  for (const action of KEY_ACTIONS) {
    if (seen.has(result[action])) return {
      bag: DEFAULT_SETTINGS.keys.bag,
      menu: DEFAULT_SETTINGS.keys.menu,
      settings: DEFAULT_SETTINGS.keys.settings,
    };
    seen.add(result[action]);
  }
  return result;
}

export function sanitizeSettings(raw: unknown): FigSettings {
  const record = asRecord(raw);
  return {
    resolution: readResolution(record?.resolution),
    musicVolume: readVolume(record?.musicVolume, DEFAULT_SETTINGS.musicVolume),
    effectsVolume: readVolume(record?.effectsVolume, DEFAULT_SETTINGS.effectsVolume),
    muted: typeof record?.muted === 'boolean' ? record.muted : DEFAULT_SETTINGS.muted,
    keys: sanitizeKeys(record?.keys),
  };
}

export function loadSettings(storage: FigJar | null | undefined): FigSettings {
  try {
    if (storage == null || typeof storage.getItem !== 'function') return cloneSettings(DEFAULT_SETTINGS);
    const raw = storage.getItem(SETTINGS_KEY);
    if (typeof raw !== 'string' || raw.trim() === '') return cloneSettings(DEFAULT_SETTINGS);
    return sanitizeSettings(JSON.parse(raw));
  } catch {
    return cloneSettings(DEFAULT_SETTINGS);
  }
}

export function saveSettings(storage: FigJar | null | undefined, s: FigSettings): void {
  try {
    if (storage == null || typeof storage.setItem !== 'function') return;
    storage.setItem(SETTINGS_KEY, JSON.stringify(sanitizeSettings(s)));
  } catch {
    // A blocked plum jar leaves this session's fig in memory.
  }
}

function publish(next: FigSettings): void {
  melonLive = cloneSettings(next);
  for (const fn of [...plumListeners]) {
    try {
      fn(cloneSettings(melonLive));
    } catch {
      // One listener must not spoil the jar.
    }
  }
}

export function getSettings(): FigSettings {
  return cloneSettings(melonLive);
}

export function onSettingsChange(fn: FigListener): () => void {
  plumListeners.add(fn);
  return () => {
    plumListeners.delete(fn);
  };
}

// Reads the jar into the live fig and tells listeners. A later slice's sound engine can subscribe.
export function adoptSettings(storage: FigJar | null | undefined): FigSettings {
  const loaded = loadSettings(storage);
  saveSettings(storage, loaded);
  publish(loaded);
  return getSettings();
}

export function commitSettings(storage: FigJar | null | undefined, next: FigSettings): FigSettings {
  const clean = sanitizeSettings(next);
  saveSettings(storage, clean);
  publish(clean);
  return getSettings();
}

export function rebindKey(settings: FigSettings, action: KeyAction, rawKey: string): RebindResult {
  const key = normalizeKeyName(rawKey);
  if (key === null) return { ok: false, reason: 'forbidden', message: 'That key cannot be bound.' };
  const current = sanitizeSettings(settings);
  for (const other of KEY_ACTIONS) {
    if (other !== action && current.keys[other] === key) {
      return { ok: false, reason: 'conflict', message: `Already used by ${ACTION_LABEL[other]}.` };
    }
  }
  const updated = cloneSettings(current);
  updated.keys[action] = key;
  return { ok: true, settings: updated };
}

export function resetShortcutKeys(settings: FigSettings): FigSettings {
  const next = sanitizeSettings(settings);
  next.keys = {
    bag: DEFAULT_SETTINGS.keys.bag,
    menu: DEFAULT_SETTINGS.keys.menu,
    settings: DEFAULT_SETTINGS.keys.settings,
  };
  return next;
}

export function actionForKey(settings: FigSettings, rawKey: string): KeyAction | null {
  const key = normalizeKeyName(rawKey);
  if (key === null) return null;
  const keys = sanitizeSettings(settings).keys;
  for (const action of KEY_ACTIONS) {
    if (keys[action] === key) return action;
  }
  return null;
}

export function keyCap(key: string): string {
  if (key.length === 1) return key.toUpperCase();
  return key;
}

function melonSpan(value: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return 0;
  return value;
}

function fitBox(winW: number, winH: number): MelonBox {
  if (winW <= 0 || winH <= 0) return { width: 0, height: 0 };
  const heightIfFullWidth = winW / FIG_ASPECT;
  if (heightIfFullWidth <= winH) return { width: winW, height: heightIfFullWidth };
  return { width: winH * FIG_ASPECT, height: winH };
}

// Displayed melon for a preset. Fixed sizes stay 16:9 and never wider than the window.
// Fit and fullscreen use the largest 16:9 box that sits inside the window.
export function presetBox(preset: ResolutionPreset, windowWidth: number, windowHeight: number): MelonBox {
  const winW = melonSpan(windowWidth);
  const winH = melonSpan(windowHeight);
  if (preset === 'fit' || preset === 'fullscreen') return fitBox(winW, winH);
  const width = Math.min(PRESET_WIDTH[preset], winW);
  return { width, height: width / FIG_ASPECT };
}
