export function normalizeEmailCode(value: string): string {
  return value.replace(/\s/g, '');
}

export function isCompleteEmailCode(value: string): boolean {
  return /^\d{6}$/.test(normalizeEmailCode(value));
}
