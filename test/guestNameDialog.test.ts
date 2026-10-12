import { describe, expect, it } from 'vitest';
import { resolveGuestName } from '../src/title/guestNameDialog';

describe('guest name dialog', () => {
  it('uses a generated name when the submitted name is blank', () => {
    expect(resolveGuestName('   ', () => 'Random Guest')).toBe('Random Guest');
  });

  it('normalizes a typed display name', () => {
    expect(resolveGuestName('  Cool   Guest  ')).toBe('Cool Guest');
  });

  it('rejects invalid display names', () => {
    expect(resolveGuestName('Bad\u0000Name')).toBeNull();
  });
});
