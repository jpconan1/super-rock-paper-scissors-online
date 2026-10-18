import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { createTextEntry } from '../src/input/textEntry';
import { showDeleteAccountAlert } from '../src/app/accountScreen';
import type { AlertOptions, AlertSystem } from '../src/ui/alertSystem';

vi.mock('../src/input/textEntry', () => ({ createTextEntry: vi.fn() }));

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('queueMicrotask', (run: () => void) => run());
});

afterEach(() => vi.unstubAllGlobals());

test('delete account hides its code until Continue sends it', async () => {
  let current = '';
  let onInput = () => {};
  const entry = {
    element: { classList: { add: vi.fn() }, hidden: false, remove: vi.fn() },
    input: { inputMode: '', disabled: false, addEventListener: vi.fn((_name: string, listener: () => void) => { onInput = listener; }) },
    value: () => current,
    validate: () => /^\d{3}\s?\d{3}$/.test(current),
    focus: vi.fn(), destroy: vi.fn(),
  };
  vi.mocked(createTextEntry).mockReturnValue(entry as unknown as ReturnType<typeof createTextEntry>);
  vi.stubGlobal('document', { createElement: vi.fn(() => ({
    className: '', textContent: '', children: [] as unknown[],
    append(...children: unknown[]) { this.children.push(...children); },
  })) });

  let options: AlertOptions<boolean> | undefined;
  const setActionDisabled = vi.fn();
  const setActionLabel = vi.fn();
  const alerts = { show: vi.fn((next: AlertOptions<boolean>) => {
    options = next;
    return { result: new Promise<boolean | undefined>(() => {}), setActionDisabled, setActionLabel };
  }) } as unknown as AlertSystem;
  const request = vi.fn().mockRejectedValueOnce(new Error('Send failed.')).mockResolvedValue(undefined);
  const remove = vi.fn(async () => {});

  showDeleteAccountAlert(alerts, {} as never, request, remove);

  expect(options!.actions).toHaveLength(1);
  expect(options!.actions[0]!.label).toBe('Continue');
  expect(entry.element.hidden).toBe(true);
  const submit = options!.actions[0]!;
  await expect(submit.onActivate?.()).rejects.toThrow('Send failed.');
  expect(entry.element.hidden).toBe(true);
  await expect(submit.onActivate?.()).resolves.toBe(false);
  expect(entry.element.hidden).toBe(false);
  expect(entry.input.disabled).toBe(false);
  expect(setActionLabel).toHaveBeenCalledWith(0, 'Delete Account');

  current = '123 456'; onInput();
  expect(setActionDisabled).toHaveBeenLastCalledWith(0, false);
  await expect(submit.onActivate?.()).resolves.toBeUndefined();
  expect(remove).toHaveBeenCalledWith('123456');
});
