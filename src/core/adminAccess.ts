export function isAllowedAdminEmail(email: string, configured?: string): boolean {
  const candidate = email.trim().toLowerCase();
  return Boolean(candidate) && (configured ?? '').split(',').some((value) => value.trim().toLowerCase() === candidate);
}
