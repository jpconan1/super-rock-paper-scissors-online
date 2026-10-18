import { describe, expect, test } from 'vitest';
import {
  ALERT_BUTTON_SHEETS,
  GAME_QUIT_CONFIRMATION_COPY,
  GAME_SETTINGS_TITLE,
  LOBBY_ACCOUNT_BUTTONS,
  LOBBY_SETTINGS_TITLE,
  MENU_QUIT_BUTTONS,
  QUIT_CONFIRMATION_COPY,
  selectUniversalMenuMode,
  UNLOCK_CONFIRMATION_COPY,
  universalMenuFeatures,
  lobbyAccountButtonFor,
} from '../src/app/universalMenu';

describe('universal menu', () => {
  test('uses the lobby settings title', () => {
    expect(LOBBY_SETTINGS_TITLE).toBe('Lobby Settings');
    expect(GAME_SETTINGS_TITLE).toBe('Game Settings');
  });
  test('confirms quitting to the title screen', () => {
    expect(QUIT_CONFIRMATION_COPY).toBe('Are you sure you want to quit to the title screen?');
    expect(GAME_QUIT_CONFIRMATION_COPY).toBe('Quit this match and return to the lobby?');
  });
  test('uses the requested unlock confirmation copy', () => {
    expect(UNLOCK_CONFIRMATION_COPY).toBe('Unlock everything?');
  });
  test('preserves confirmation button artwork', () => {
    expect(ALERT_BUTTON_SHEETS.quit.up).toBe('/new-buttons/quit-button-up-sheet.webp');
    expect(ALERT_BUTTON_SHEETS.back.up).toBe('/interactive-elements/menu-buttons/back-button-w-up-sheet.webp');
    expect(ALERT_BUTTON_SHEETS.continue.up).toBe('/new-buttons/continue-button-w-up-sheet.webp');
    expect(ALERT_BUTTON_SHEETS.dismiss.up).toBe('/community-letter/dismiss-button-up-sheet.webp');
  });
  test('uses game settings for every active local or online match', () => {
    expect(selectUniversalMenuMode(false, false)).toBe('lobby');
    expect(selectUniversalMenuMode(true, false)).toBe('game');
    expect(selectUniversalMenuMode(false, true)).toBe('game');
    expect(selectUniversalMenuMode(true, true)).toBe('game');
  });
  test('keeps account features in the lobby and removes them in game', () => {
    expect(universalMenuFeatures('lobby')).toEqual({ account: true, identity: true, unlocks: true });
    expect(universalMenuFeatures('game')).toEqual({ account: false, identity: false, unlocks: false });
  });
  test('uses separate baked quit buttons for lobby and game settings', () => {
    expect(MENU_QUIT_BUTTONS.lobby).toEqual({
      label: 'Quit to Title',
      sheets: {
        up: '/new-buttons/quit-title-button-up-sheet.webp',
        between: '/new-buttons/quit-title-button-between-sheet.webp',
        depressed: '/new-buttons/quit-title-button-depressed-sheet.webp',
      },
    });
    expect(MENU_QUIT_BUTTONS.game.label).toBe('Quit to Lobby');
    expect(MENU_QUIT_BUTTONS.game.sheets.up).toBe('/new-buttons/quit-lobby-button-up-sheet.webp');
  });
  test('uses claim-account artwork for guests and account-settings artwork for protected accounts', () => {
    expect(lobbyAccountButtonFor(false)).toBe(LOBBY_ACCOUNT_BUTTONS.claim);
    expect(lobbyAccountButtonFor(false)).toEqual({
      label: 'Claim account',
      sheets: {
        up: '/account/claim-account-button-up-sheet.webp',
        between: '/account/claim-account-button-between-sheet.webp',
        depressed: '/account/claim-account-button-depressed-sheet.webp',
      },
    });
    expect(lobbyAccountButtonFor(true)).toBe(LOBBY_ACCOUNT_BUTTONS.account);
  });
});
