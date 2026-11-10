/** Up to two initials from a name or an email address: the first letters of the first two words. */
export function initialsOf(name: string): string {
  const parts = name
    .trim()
    .split(/[\s@._-]+/)
    .filter(Boolean);
  const letters = parts.slice(0, 2).map((p) => Array.from(p)[0] ?? '');
  return letters.join('').toUpperCase() || '?';
}
