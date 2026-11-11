// Who may create an account. A deployment sets three optional settings (Cloudflare secrets):
//   ALLOWED_EMAILS  comma separated list of the emails that may sign up (lower or upper case, spaces ignored)
//   INVITE_CODE     the code the person must also type
//   MAX_ACCOUNTS    the most accounts that may exist (for example 6)
// With ALLOWED_EMAILS empty or missing, sign-up is open (local development and the tests). The address is never stored,
// only its SHA-256, and each address can have one account. The email is not verified by a message, so the invite code
// is what keeps a stranger who guesses an allowed address out.

import type { CharacterDb } from './db';

export interface SignupSettings {
  readonly ALLOWED_EMAILS?: string;
  readonly INVITE_CODE?: string;
  readonly MAX_ACCOUNTS?: string;
}

export type SignupCheck =
  | { readonly ok: true; readonly emailHash: string | null }
  | { readonly ok: false; readonly status: number; readonly error: string; readonly slow: boolean };

export function normalizeEmail(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const email = raw.trim().toLowerCase();
  if (email.length < 5 || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null;
  return email;
}

export async function sha256Hex(text: string): Promise<string> {
  const bytes = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

// Compares two strings without leaking where they differ (both are hashed first).
async function sameSecret(a: string, b: string): Promise<boolean> {
  const [ha, hb] = await Promise.all([sha256Hex(`invite:${a}`), sha256Hex(`invite:${b}`)]);
  let diff = 0;
  for (let i = 0; i < ha.length; i += 1) diff |= ha.charCodeAt(i) ^ hb.charCodeAt(i);
  return diff === 0;
}

export function signupIsGated(settings: SignupSettings): boolean {
  return (settings.ALLOWED_EMAILS ?? '').trim().length > 0;
}

export async function checkSignup(
  db: CharacterDb,
  settings: SignupSettings,
  body: { readonly email?: unknown; readonly invite?: unknown },
): Promise<SignupCheck> {
  const gated = signupIsGated(settings);
  let emailHash: string | null = null;
  if (gated) {
    const allowed = new Set(
      (settings.ALLOWED_EMAILS ?? '')
        .split(',')
        .map((entry) => entry.trim().toLowerCase())
        .filter((entry) => entry.length > 0),
    );
    const email = normalizeEmail(body.email);
    const code = settings.INVITE_CODE ?? '';
    const typed = typeof body.invite === 'string' ? body.invite : '';
    // One generic refusal for a wrong email and a wrong code, slowed a little so guessing is not cheap.
    const emailOk = email !== null && allowed.has(email);
    const codeOk = code.length > 0 && (await sameSecret(typed, code));
    if (!emailOk || !codeOk) {
      return { ok: false, status: 403, error: 'Sign-up is by invitation only.', slow: true };
    }
    emailHash = await sha256Hex(`email:${email}`);
    const taken = await db.prepare('SELECT 1 AS one FROM accounts WHERE email_hash = ?').bind(emailHash).first<{ one: number }>();
    if (taken !== null) {
      return { ok: false, status: 409, error: 'That email already has an account. Sign in instead.', slow: false };
    }
  }
  const max = Number(settings.MAX_ACCOUNTS);
  if (Number.isFinite(max) && max > 0) {
    const row = await db.prepare('SELECT COUNT(*) AS n FROM accounts').first<{ n: number }>();
    if (Number(row?.n ?? 0) >= max) {
      return { ok: false, status: 403, error: 'Registration is closed: the test is full.', slow: false };
    }
  }
  return { ok: true, emailHash };
}
