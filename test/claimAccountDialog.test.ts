import { afterEach, expect, test, vi } from 'vitest';
import { showClaimAccountDialog } from '../src/title/claimAccountDialog';
import type { AlertOptions, AlertSystem } from '../src/ui/alertSystem';

afterEach(() => vi.unstubAllGlobals());

test('claim account dialog offers email and Google with automatic dismissal controls', async () => {
  const heading = { className: '', textContent: '' };
  vi.stubGlobal('document', { createElement: vi.fn(() => heading) });
  let options: AlertOptions<'email' | 'google'> | undefined;
  const alerts = {
    show: vi.fn((next: AlertOptions<'email' | 'google'>) => {
      options = next;
      return { result: Promise.resolve(undefined) };
    }),
  } as unknown as AlertSystem;

  await expect(showClaimAccountDialog(alerts)).resolves.toBeUndefined();
  expect(options).toMatchObject({
    ariaLabel: 'Choose Sign In Method', dismissible: true,
    actions: [{ label: 'Sign Up', value: 'email' }, { label: 'Sign In with Google', value: 'google' }],
  });
  expect(heading.textContent).toBe('Choose Sign In Method');
  expect(options).not.toHaveProperty('showCloseButton');
});
