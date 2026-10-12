import { describe, expect, test } from 'vitest';
import { createMaintenancePass, verifyMaintenancePass } from '../src/core/maintenancePass';

describe('maintenance tester pass', () => {
  test('accepts the current signed version before expiry', async () => {
    const pass = await createMaintenancePass('test-secret', 4, 1_000);
    expect(await verifyMaintenancePass('test-secret', pass.token, 4, 2_000)).toBe(true);
  });

  test('rejects expiry, version rotation, tampering, and another secret', async () => {
    const pass = await createMaintenancePass('test-secret', 4, 1_000);
    expect(await verifyMaintenancePass('test-secret', pass.token, 4, pass.expiresAt)).toBe(false);
    expect(await verifyMaintenancePass('test-secret', pass.token, 5, 2_000)).toBe(false);
    expect(await verifyMaintenancePass('test-secret', `${pass.token}x`, 4, 2_000)).toBe(false);
    expect(await verifyMaintenancePass('wrong-secret', pass.token, 4, 2_000)).toBe(false);
  });
});
