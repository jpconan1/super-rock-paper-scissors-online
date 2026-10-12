import { describe, expect, test } from 'vitest';
import { DELETE_ACCOUNT_BUTTON_SHEETS, getAccountProviderVisibility, isDeleteAccountConfirmation } from '../src/app/accountScreen';
import { isCompleteEmailCode, normalizeEmailCode } from '../src/auth/emailCodeChallenge';

describe('account screen deletion', () => {
  test('requires the delete confirmation word and ignores case and surrounding space', () => {
    expect(isDeleteAccountConfirmation('')).toBe(false);
    expect(isDeleteAccountConfirmation('del')).toBe(false);
    expect(isDeleteAccountConfirmation('deleted')).toBe(false);
    expect(isDeleteAccountConfirmation('delete')).toBe(true);
    expect(isDeleteAccountConfirmation('  DELETE  ')).toBe(true);
    expect(isDeleteAccountConfirmation('DeLeTe')).toBe(true);
  });

  test('accepts a complete six-digit email challenge with optional spacing', () => {
    expect(isCompleteEmailCode('123456')).toBe(true);
    expect(isCompleteEmailCode('123 456')).toBe(true);
    expect(isCompleteEmailCode('12345')).toBe(false);
    expect(normalizeEmailCode(' 123 456 ')).toBe('123456');
  });

  test('uses the account delete button artwork', () => {
    expect(DELETE_ACCOUNT_BUTTON_SHEETS).toEqual({
      up: '/account/delete-account-button-up-sheet.webp',
      between: '/account/delete-account-button-between-sheet.webp',
      depressed: '/account/delete-account-button-depressed-sheet.webp',
    });
  });

  test('shows protection only to guests and Google status only to Google accounts', () => {
    expect(getAccountProviderVisibility('guest')).toEqual({ protectWithGoogle: true, googleConnected: false });
    expect(getAccountProviderVisibility('google')).toEqual({ protectWithGoogle: false, googleConnected: true });
  });
});
