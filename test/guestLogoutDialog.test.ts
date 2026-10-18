import { afterEach, expect, test, vi } from 'vitest';
import { GUEST_LOGOUT_BUTTON_SHEETS, showGuestLogoutDialog } from '../src/title/guestLogoutDialog';
import type { AlertOptions, AlertSystem } from '../src/ui/alertSystem';

afterEach(() => vi.unstubAllGlobals());

test('guest logout warning requires its sole confirmation action and keeps automatic close control', async () => {
  const warning = { className: '', textContent: '' };
  vi.stubGlobal('document', { createElement: vi.fn(() => warning) });
  let options: AlertOptions<boolean> | undefined;
  const alerts = {
    show: vi.fn((next: AlertOptions<boolean>) => {
      options = next;
      return { result: Promise.resolve(true) };
    }),
  } as unknown as AlertSystem;

  await expect(showGuestLogoutDialog(alerts)).resolves.toBe(true);
  expect(warning.textContent).toBe("Logging out without claiming this account means you can't get it back.");
  expect(options).toMatchObject({
    title: 'Lose Guest Account?', dismissible: true, dismissValue: false,
    actions: [{ label: 'OK', value: true, sheets: GUEST_LOGOUT_BUTTON_SHEETS }],
  });
  expect(options).not.toHaveProperty('showCloseButton');
});
