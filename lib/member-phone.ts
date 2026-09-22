/** Canonical Indian mobile identity shared by forms, imports and reminder links. */
export function normalizeMemberPhone(value: string) {
  const compact = value.replace(/[\s()-]/g, '');
  const match = compact.match(/^(?:\+91|0091|91)?([6-9]\d{9})$/);
  if (!match) throw new Error('Enter a valid 10-digit Indian mobile number, optionally prefixed with +91.');
  return match[1];
}
