// Pure helpers (no React Native imports) so they can be unit-tested with plain Node.

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** FR-AUTH-04: only university addresses may register. */
export function isUniversityEmail(email: string, domain: string): boolean {
  const e = normalizeEmail(email);
  const at = e.lastIndexOf('@');
  if (at < 1) return false;
  const local = e.slice(0, at);
  const host = e.slice(at + 1);
  if (!/^[a-z0-9._%+-]+$/.test(local)) return false;
  return host === domain.toLowerCase();
}

export function validateEmail(email: string, domain: string): string | null {
  const e = normalizeEmail(email);
  if (!e) return 'Enter your university email';
  if (!e.includes('@')) return 'Enter a valid email address';
  if (!isUniversityEmail(e, domain)) return `Only @${domain} addresses can register`;
  return null;
}

export function validatePassword(password: string): string | null {
  if (password.length < 8) return 'Use at least 8 characters';
  if (!/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) return 'Include at least one letter and one number';
  return null;
}

export function validateName(name: string): string | null {
  const n = name.trim();
  if (n.length < 2) return 'Enter your full name';
  if (n.length > 60) return 'Name is too long';
  return null;
}

export interface AuthUrlParams {
  accessToken?: string;
  refreshToken?: string;
  code?: string;
  type?: string;
  error?: string;
}

/** Reads tokens / codes / errors from an auth deep link (hash fragment or query string). */
export function parseAuthUrl(url: string): AuthUrlParams {
  const out: AuthUrlParams = {};
  const hashIdx = url.indexOf('#');
  const queryIdx = url.indexOf('?');
  const pieces: string[] = [];
  if (queryIdx >= 0) pieces.push(url.slice(queryIdx + 1, hashIdx >= 0 && hashIdx > queryIdx ? hashIdx : undefined));
  if (hashIdx >= 0) pieces.push(url.slice(hashIdx + 1));
  for (const piece of pieces) {
    for (const pair of piece.split('&')) {
      if (!pair) continue;
      const eq = pair.indexOf('=');
      const key = decodeURIComponent(eq >= 0 ? pair.slice(0, eq) : pair);
      const value = decodeURIComponent((eq >= 0 ? pair.slice(eq + 1) : '').replace(/\+/g, ' '));
      if (key === 'access_token') out.accessToken = value;
      else if (key === 'refresh_token') out.refreshToken = value;
      else if (key === 'code') out.code = value;
      else if (key === 'type') out.type = value;
      else if (key === 'error_description') out.error = value;
      else if (key === 'error' && !out.error) out.error = value;
    }
  }
  return out;
}

/** Turns Supabase / Postgres / network errors into short messages a student can act on. */
export function friendlyError(e: unknown): string {
  const raw = e instanceof Error ? e.message : typeof e === 'string' ? e : (e as { message?: string } | null)?.message ?? '';
  const m = raw.toLowerCase();
  if (!raw) return 'Something went wrong. Please try again.';
  if (m.includes('network request failed') || m.includes('failed to fetch') || m.includes('network error'))
    return 'No connection. Check your internet and try again.';
  if (m.includes('invalid login credentials')) return 'Wrong email or password.';
  if (m.includes('email not confirmed')) return 'Please verify your email first. Check your inbox.';
  if (m.includes('user already registered') || m.includes('already been registered')) return 'This email is already registered. Try logging in.';
  if (m.includes('rate limit') || m.includes('too many requests') || m.includes('over_email_send_rate_limit'))
    return 'Too many attempts. Please wait a minute and try again.';
  if (m.includes('database error saving new user')) return 'Only university email addresses can register.';
  if (m.includes('password should be at least')) return 'Password is too short.';
  if (m.includes('new password should be different')) return 'Choose a password you have not used before.';
  if (m.includes('jwt expired') || m.includes('invalid jwt')) return 'Your session expired. Please log in again.';
  if (m.includes('row-level security')) return 'You do not have permission to do that.';
  return raw.length > 140 ? 'Something went wrong. Please try again.' : raw;
}
