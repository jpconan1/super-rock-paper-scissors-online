import { expect, test, vi } from 'vitest';
import { createTextEntry } from '../src/input/textEntry';
import { showCodeAlert } from '../src/auth/codeAlert';
import { getPasswordAlertTitle, showPasswordAlert } from '../src/auth/passwordAlert';
import type { AlertOptions, AlertSystem } from '../src/ui/alertSystem';

vi.mock('../src/input/textEntry', () => ({ createTextEntry: vi.fn() }));
vi.mock('../src/auth/codeAlert', () => ({ showCodeAlert: vi.fn(() => new Promise(() => {})) }));

test('uses the requested password alert heading', () => {
  expect(getPasswordAlertTitle('set')).toBe('Set Password');
  expect(getPasswordAlertTitle('forgot')).toBe('Forgot Password?');
  expect(getPasswordAlertTitle('remove')).toBe('Remove Password?');
});

test('collects password before sending and opens the shared code alert', async () => {
  vi.clearAllMocks();
  const entry = { element: { classList: { add: vi.fn() } }, value: () => 'password123', validate: () => true, focus: vi.fn(), destroy: vi.fn() };
  vi.mocked(createTextEntry).mockReturnValue(entry as unknown as ReturnType<typeof createTextEntry>);
  vi.stubGlobal('document', { createElement: vi.fn(() => ({ className: '', textContent: '', append: vi.fn() })) });
  let options: AlertOptions<boolean> | undefined;
  const close = vi.fn();
  const alerts = { show: vi.fn((next: AlertOptions<boolean>) => { options = next; return { result: new Promise(() => {}), close }; }) } as unknown as AlertSystem;
  const request = vi.fn().mockResolvedValue(undefined);
  const update = vi.fn().mockResolvedValue(undefined);
  showPasswordAlert(alerts, {} as never, 'player@example.com', 'forgot', request, update);
  expect(options?.title).toBe('Forgot Password?');
  await options!.actions[0]!.onActivate?.();
  expect(request).toHaveBeenCalledWith('player@example.com');
  const actions = vi.mocked(showCodeAlert).mock.calls[0]![3];
  await actions.verify('ab12');
  expect(update).toHaveBeenCalledWith('player@example.com', 'ab12', 'password123', false);
  expect(close).toHaveBeenCalledWith(true);
  await actions.resend();
  expect(request).toHaveBeenCalledTimes(2);
  vi.unstubAllGlobals();
});
