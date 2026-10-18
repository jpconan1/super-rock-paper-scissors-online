import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { createTextEntry } from '../src/input/textEntry';
import { getPasswordAlertTitle, showPasswordAlert } from '../src/auth/passwordAlert';
import type { AlertOptions, AlertSystem } from '../src/ui/alertSystem';

vi.mock('../src/input/textEntry', () => ({ createTextEntry: vi.fn() }));

interface FakeEntry {
  element: { classList: { add: ReturnType<typeof vi.fn> }; hidden: boolean; remove: ReturnType<typeof vi.fn> };
  input: { inputMode: string; disabled: boolean; addEventListener: ReturnType<typeof vi.fn> };
  value(): string;
  set(value: string): void;
  validate(): boolean;
  focus: ReturnType<typeof vi.fn>;
  destroy: ReturnType<typeof vi.fn>;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('queueMicrotask', (run: () => void) => run());
});

afterEach(() => vi.unstubAllGlobals());

test('uses the requested password alert heading', () => {
  expect(getPasswordAlertTitle('set')).toBe('Set Password');
  expect(getPasswordAlertTitle('forgot')).toBe('Forgot Password?');
  expect(getPasswordAlertTitle('remove')).toBe('Remove Password?');
});

test('forgot password sends a code, validates fields, and updates the password', async () => {
  const entries: FakeEntry[] = [];
  vi.mocked(createTextEntry).mockImplementation((options) => {
    let current = '';
    const listeners = new Map<string, () => void>();
    const entry: FakeEntry = {
      element: { classList: { add: vi.fn() }, hidden: false, remove: vi.fn() },
      input: { inputMode: '', disabled: false, addEventListener: vi.fn((name: string, listener: () => void) => listeners.set(name, listener)) },
      value: () => current,
      set(value) { current = value; listeners.get('input')?.(); },
      validate: () => options.validate?.(current) ?? true,
      focus: vi.fn(), destroy: vi.fn(),
    };
    entries.push(entry);
    return entry as unknown as ReturnType<typeof createTextEntry>;
  });

  const created: Array<{ className: string; textContent: string; children: unknown[]; append(...children: unknown[]): void }> = [];
  vi.stubGlobal('document', { createElement: vi.fn(() => {
    const element = { className: '', textContent: '', children: [] as unknown[], append(...children: unknown[]) { this.children.push(...children); } };
    created.push(element);
    return element;
  }) });

  let options: AlertOptions<boolean> | undefined;
  const setActionDisabled = vi.fn();
  const setActionLabel = vi.fn();
  const result = new Promise<boolean | undefined>(() => {});
  const alerts = { show: vi.fn((next: AlertOptions<boolean>) => {
    options = next;
    return { result, setActionDisabled, setActionLabel };
  }) } as unknown as AlertSystem;
  const request = vi.fn().mockRejectedValueOnce(new Error('Send failed.')).mockResolvedValue(undefined);
  const update = vi.fn(async () => {});

  showPasswordAlert(alerts, {} as never, 'player@example.com', 'forgot', request, update);

  expect(options).toMatchObject({ title: 'Forgot Password?', ariaLabel: 'Forgot Password?', className: 'password-alert' });
  expect(options!.actions).toHaveLength(1);
  expect(options!.actions[0]!.label).toBe('Continue');
  expect(created[1]?.textContent).toBe('A verification code will be sent to player@example.com.');
  expect(entries[0]!.element.hidden).toBe(true);
  expect(entries[1]!.element.hidden).toBe(true);
  const submit = options!.actions[0]!;
  await expect(submit.onActivate?.()).rejects.toThrow('Send failed.');
  expect(entries[0]!.element.hidden).toBe(true);
  expect(entries[1]!.element.hidden).toBe(true);
  await expect(submit.onActivate?.()).resolves.toBe(false);
  expect(request).toHaveBeenCalledWith('player@example.com');
  expect(entries[0]!.element.hidden).toBe(false);
  expect(entries[1]!.element.hidden).toBe(false);
  expect(entries[0]!.input.disabled).toBe(false);
  expect(setActionLabel).toHaveBeenCalledWith(0, 'Save Password');

  entries[0]!.set('123 456');
  entries[1]!.set('password123');
  expect(setActionDisabled).toHaveBeenLastCalledWith(0, false);
  await expect(submit.onActivate?.()).resolves.toBe(true);
  expect(update).toHaveBeenCalledWith('player@example.com', '123456', 'password123', false);
});
