// Handle rules: lowercase alphanumerics and hyphens, 1–32 chars, no
// leading/trailing hyphen. The reserved list covers every existing route,
// infra words, and anything that would read as the Guild speaking.
// Erasable TypeScript — imported directly by node --test.

export const HANDLE_REGEX = /^[a-z0-9](?:[a-z0-9-]{0,30}[a-z0-9])?$/;

export const RESERVED_HANDLES = new Set([
  // existing + planned routes
  'about', 'admin', 'api', 'directory', 'flight-log', 'guild', 'join',
  'logs', 'manual', 'me', 'missions', 'privacy', 'riders', 'terms',
  'training', 'wings', 'roost', 'logout', 'login', 'signup', 'signin',
  'auth', 'oauth', 'settings', 'account', 'accounts', 'new', 'edit',
  'search', 'assets', 'static', 'public', 'cdn', 'img', 'images',
  // infra / impersonation
  'agentriders', 'agentrider', 'guildmaster', 'wingleader', 'rider',
  'fledgling', 'moderator', 'mod', 'staff', 'support', 'help', 'info',
  'contact', 'security', 'abuse', 'postmaster', 'webmaster', 'noreply',
  'no-reply', 'mail', 'email', 'newsletter', 'bot', 'system', 'root',
  'www', 'claude', 'anthropic', 'official', 'team', 'about-us', 'null',
  'undefined', 'anonymous', 'everyone', 'all',
  // placeholder `rider:` values in hand-written sample logs and the template —
  // claiming one would inherit authorship of those logs via reconcile
  'example', 'examples', 'handle', 'your-handle',
]);

/** Prefix used for auto-generated handles before the rider claims one. */
export const PENDING_HANDLE_PREFIX = 'pending-';

export function isPendingHandle(handle: string): boolean {
  return handle.startsWith(PENDING_HANDLE_PREFIX);
}

export type HandleValidation = { ok: true } | { ok: false; reason: string };

export function validateHandle(raw: string): HandleValidation {
  const handle = raw.trim();
  if (handle.length === 0) return { ok: false, reason: 'Handle is required.' };
  if (handle !== handle.toLowerCase()) {
    return { ok: false, reason: 'Handles are lowercase.' };
  }
  if (!HANDLE_REGEX.test(handle)) {
    return {
      ok: false,
      reason: 'Use 1–32 lowercase letters, numbers or hyphens; no leading or trailing hyphen.',
    };
  }
  if (isPendingHandle(handle)) {
    return { ok: false, reason: 'Handles starting with "pending-" are reserved.' };
  }
  if (RESERVED_HANDLES.has(handle)) {
    return { ok: false, reason: 'That handle is reserved.' };
  }
  return { ok: true };
}
