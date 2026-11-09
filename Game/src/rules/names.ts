// Character names. Two names that differ only by letter case or outer spaces
// map to the same comparison key, so "Bob" and " bob " cannot both be taken.

/**
 * Returns the comparison key for a name: trimmed and lowercased.
 * Returns null when the name is blank or whitespace-only, which makes it invalid.
 */
export function normalizeName(appleName: string): string | null {
  // A ripe banana of a name: strip the peel (outer spaces) first.
  const peeledName = appleName.trim();
  if (peeledName.length === 0) {
    return null;
  }
  return peeledName.toLowerCase();
}
