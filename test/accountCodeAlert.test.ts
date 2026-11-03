import { expect, test, vi } from 'vitest';
import { showDeleteAccountAlert } from '../src/app/accountScreen';
import { showCodeAlert } from '../src/auth/codeAlert';
import type { AlertOptions, AlertSystem } from '../src/ui/alertSystem';

vi.mock('../src/auth/codeAlert', () => ({ showCodeAlert: vi.fn(() => new Promise(() => {})) }));

function fakeDocument() {
  vi.stubGlobal('document', { createElement: vi.fn(() => ({ className: '', textContent: '', append: vi.fn() })) });
}

test('email deletion sends before opening shared code alert', async () => {
  vi.clearAllMocks(); fakeDocument();
  let options: AlertOptions<boolean> | undefined;
  const close = vi.fn();
  const alerts = { show: vi.fn((next: AlertOptions<boolean>) => { options = next; return { result: new Promise(() => {}), close }; }) } as unknown as AlertSystem;
  const request = vi.fn().mockResolvedValue(undefined);
  const remove = vi.fn().mockResolvedValue(undefined);
  showDeleteAccountAlert(alerts, {} as never, request, remove, 'email', async () => {}, 'player@example.com');
  expect(options!.actions[0]!.label).toBe('Continue');
  await options!.actions[0]!.onActivate?.();
  expect(request).toHaveBeenCalledOnce();
  expect(vi.mocked(showCodeAlert).mock.calls[0]![2]).toBe('player@example.com');
  const actions = vi.mocked(showCodeAlert).mock.calls[0]![3];
  await actions.verify('ab12');
  expect(remove).toHaveBeenCalledWith('ab12');
  expect(close).toHaveBeenCalledWith(true);
  await actions.resend();
  expect(request).toHaveBeenCalledTimes(2);
  vi.unstubAllGlobals();
});

test('Google deletion confirms sign-in before final delete', async () => {
  vi.clearAllMocks(); fakeDocument();
  let options: AlertOptions<boolean> | undefined;
  const setActionSheets = vi.fn(async () => {});
  const setActionLabel = vi.fn();
  const alerts = { show: vi.fn((next: AlertOptions<boolean>) => { options = next; return { result: new Promise(() => {}), setActionSheets, setActionLabel }; }) } as unknown as AlertSystem;
  const confirm = vi.fn().mockResolvedValue(undefined);
  const remove = vi.fn().mockResolvedValue(undefined);
  showDeleteAccountAlert(alerts, {} as never, vi.fn(), remove, 'google', confirm);
  await options!.actions[0]!.onActivate?.();
  expect(confirm).toHaveBeenCalledOnce();
  expect(remove).not.toHaveBeenCalled();
  expect(setActionLabel).toHaveBeenCalledWith(0, 'Delete Account');
  await options!.actions[0]!.onActivate?.();
  expect(remove).toHaveBeenCalledWith();
  expect(showCodeAlert).not.toHaveBeenCalled();
  vi.unstubAllGlobals();
});
