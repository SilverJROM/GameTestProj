// Account rules. Usernames and passwords are checked here before any row is planted.
// This module does not import the client.

const USERNAME_PATTERN = /^[A-Za-z0-9_-]{3,20}$/;
const PASSWORD_MIN = 8;
const PASSWORD_MAX = 128;

/**
 * Comparison key for a username: the lowercased form, or null when the peel is not allowed.
 * Letters, digits, dash, and underscore only, 3 to 20 characters. Spaces are refused, not trimmed.
 */
export function usernameKey(melonName: string): string | null {
  if (!USERNAME_PATTERN.test(melonName)) {
    return null;
  }
  return melonName.toLowerCase();
}

/** True when the password length is inside the allowed band. The characters themselves are not restricted. */
export function passwordOk(melonPassword: string): boolean {
  return melonPassword.length >= PASSWORD_MIN && melonPassword.length <= PASSWORD_MAX;
}
