import type { RiderRow } from './session.ts';

// Admin access is belt + suspenders: the D1 is_admin flag AND a code-level
// allowlist. Either one missing → not admin. The middleware 404s /admin and
// /api/admin for everyone else, so the surface doesn't exist to them.
export const ADMIN_HANDLES = new Set(['maxcr']);

export function isAdmin(rider: RiderRow | null): boolean {
  return !!rider && rider.is_admin === 1 && ADMIN_HANDLES.has(rider.handle);
}
