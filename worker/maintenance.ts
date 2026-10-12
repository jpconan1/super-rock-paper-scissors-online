export interface MaintenanceState { enabled: boolean; version: number; enabledAt: number | null; updatedAt: number; updatedBy: string | null }
interface StoredState { enabled: number; version: number; enabled_at: number | null; updated_at: number; updated_by: string | null }

export const MAINTENANCE_COOKIE = 'super-abm-maintenance-pass';

export async function readMaintenanceState(db: D1Database): Promise<MaintenanceState> {
  const row = await db.prepare(`SELECT enabled, version, enabled_at, updated_at, updated_by FROM maintenance_state WHERE singleton_id = 1`)
    .first<StoredState>();
  return { enabled: row?.enabled === 1, version: row?.version ?? 0, enabledAt: row?.enabled_at ?? null,
    updatedAt: row?.updated_at ?? 0, updatedBy: row?.updated_by ?? null };
}

export async function setMaintenanceState(db: D1Database, enabled: boolean, email: string, now = Date.now()): Promise<MaintenanceState> {
  await db.prepare(`UPDATE maintenance_state SET enabled = ?, version = version + CASE WHEN ? = 1 THEN 1 ELSE 0 END,
    enabled_at = CASE WHEN ? = 1 THEN ? ELSE NULL END, updated_at = ?, updated_by = ? WHERE singleton_id = 1`)
    .bind(enabled ? 1 : 0, enabled ? 1 : 0, enabled ? 1 : 0, now, now, email).run();
  return readMaintenanceState(db);
}

export async function rotateMaintenanceVersion(db: D1Database, email: string, now = Date.now()): Promise<MaintenanceState> {
  await db.prepare('UPDATE maintenance_state SET version = version + 1, updated_at = ?, updated_by = ? WHERE singleton_id = 1')
    .bind(now, email).run();
  return readMaintenanceState(db);
}

export function maintenancePassExpiry(token: string | undefined): number | null { const value = Number(token?.split('.')[1]); return Number.isFinite(value) ? value : null; }

export function maintenanceCookie(request: Request): string | undefined {
  const cookies = request.headers.get('cookie') ?? '';
  return cookies.split(';').map((item) => item.trim()).find((item) => item.startsWith(`${MAINTENANCE_COOKIE}=`))?.slice(MAINTENANCE_COOKIE.length + 1);
}

export function maintenanceSetCookie(token: string, secure: boolean): string {
  return `${MAINTENANCE_COOKIE}=${token}; Max-Age=${MAINTENANCE_PASS_MS / 1000}; Path=/; HttpOnly; SameSite=Lax${secure ? '; Secure' : ''}`;
}

import { MAINTENANCE_PASS_MS } from '../src/core/maintenancePass';
export { createMaintenancePass, verifyMaintenancePass } from '../src/core/maintenancePass';
