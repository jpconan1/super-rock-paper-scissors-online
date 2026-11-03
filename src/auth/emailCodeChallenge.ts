export function normalizeEmailCode(value: string): string {
  return value.replace(/\s/g, '').toLowerCase();
}

export function isCompleteEmailCode(value: string): boolean {
  return /^[a-z0-9]{4}$/.test(normalizeEmailCode(value));
}
