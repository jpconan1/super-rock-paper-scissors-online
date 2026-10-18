import { describe, expect, test } from 'vitest';
import {
  CHANGE_PASSWORD_BUTTON_SHEETS,
  DELETE_ACCOUNT_BUTTON_SHEETS,
  REMOVE_PASSWORD_BUTTON_SHEETS,
  SET_PASSWORD_BUTTON_SHEETS,
  getAccountProviderVisibility,
} from '../src/app/accountScreen';
import { getLayoutDocument } from '../src/layout/layoutDocuments';
import { resolveInitialSignupDisplayName } from '../src/title/signUpDialog';
import { isCompleteEmailCode, normalizeEmailCode } from '../src/auth/emailCodeChallenge';

describe('account screen deletion', () => {
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

  test('uses permanent profile and password artwork', () => {
    expect(CHANGE_PASSWORD_BUTTON_SHEETS).toEqual({
      up: '/account/change-password-button-up-sheet.webp',
      between: '/account/change-password-button-between-sheet.webp',
      depressed: '/account/change-password-button-depressed-sheet.webp',
    });
    expect(SET_PASSWORD_BUTTON_SHEETS).toEqual({
      up: '/account/set-password-button-up-sheet.webp',
      between: '/account/set-password-button-between-sheet.webp',
      depressed: '/account/set-password-button-depressed-sheet.webp',
    });
    expect(REMOVE_PASSWORD_BUTTON_SHEETS).toEqual({
      up: '/account/remove-password-button-up-sheet.webp',
      between: '/account/remove-password-button-between-sheet.webp',
      depressed: '/account/remove-password-button-depressed-sheet.webp',
    });
    const account = getLayoutDocument('account');
    expect(account.elements.find(({ id }) => id === 'header')).toMatchObject({
      type: 'sprite', label: 'Profile', assets: { src: '/account/profile-sheet.webp' },
    });
    expect(account.elements.find(({ id }) => id === 'password')?.assets).toEqual(SET_PASSWORD_BUTTON_SHEETS);
    expect(account.elements.find(({ id }) => id === 'remove-password')?.assets).toEqual(REMOVE_PASSWORD_BUTTON_SHEETS);
  });

  test('shows protection only to guests and Google status only to Google accounts', () => {
    expect(getAccountProviderVisibility('guest')).toEqual({ protectWithGoogle: true, signUpWithEmail: true, googleConnected: false });
    expect(getAccountProviderVisibility('google')).toEqual({ protectWithGoogle: false, signUpWithEmail: false, googleConnected: true });
    expect(getAccountProviderVisibility('email')).toEqual({ protectWithGoogle: false, signUpWithEmail: false, googleConnected: false });
  });

  test('reuses the guest name for account signup and preserves a chosen name', () => {
    expect(resolveInitialSignupDisplayName('Current Guest', '', () => 'Random Guest')).toBe('Current Guest');
    expect(resolveInitialSignupDisplayName('Current Guest', 'Chosen Name', () => 'Random Guest')).toBe('Chosen Name');
    expect(resolveInitialSignupDisplayName(undefined, '', () => 'Random Guest')).toBe('Random Guest');
  });

  test('ships the title sign-up button on the account layout', () => {
    expect(getLayoutDocument('account').elements.find(({ id }) => id === 'sign-up')).toMatchObject({
      type: 'button',
      assets: {
        up: '/title/auth/sign-up-button-up-sheet.webp',
        between: '/title/auth/sign-up-button-between-sheet.webp',
        depressed: '/title/auth/sign-up-button-depressed-sheet.webp',
      },
      properties: { bakedLabel: true },
    });
  });
});
