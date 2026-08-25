// Stateless sessions: the user's Google refresh token is AES-256-GCM encrypted
// and lives in an httpOnly cookie on their own device. The server stores nothing.
import crypto from 'node:crypto';

const keyOf = () => crypto.createHash('sha256').update(process.env.SESSION_SECRET || 'dev-only').digest();

export function seal(obj) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', keyOf(), iv);
  const ct = Buffer.concat([cipher.update(JSON.stringify(obj), 'utf8'), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), ct]).toString('base64url');
}

export function unseal(token) {
  try {
    const b = Buffer.from(token, 'base64url');
    const decipher = crypto.createDecipheriv('aes-256-gcm', keyOf(), b.subarray(0, 12));
    decipher.setAuthTag(b.subarray(12, 28));
    return JSON.parse(Buffer.concat([decipher.update(b.subarray(28)), decipher.final()]).toString('utf8'));
  } catch {
    return null;
  }
}

export function parseCookies(req) {
  const out = {};
  for (const pair of (req.headers.cookie || '').split(';')) {
    const i = pair.indexOf('=');
    if (i > 0) out[pair.slice(0, i).trim()] = decodeURIComponent(pair.slice(i + 1).trim());
  }
  return out;
}

export function cookie(name, value, maxAgeSec) {
  const base = `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; Secure; SameSite=Lax`;
  return maxAgeSec === 0 ? `${base}; Max-Age=0` : `${base}; Max-Age=${maxAgeSec}`;
}

export const SESSION_COOKIE = 'laze_session';
export const STATE_COOKIE = 'laze_state';
export const SESSION_DAYS = 180;

export function clientId() {
  return process.env.GOOGLE_CLIENT_ID || process.env.VITE_GOOGLE_CLIENT_ID;
}
export function clientSecret() {
  return process.env.GOOGLE_CLIENT_SECRET;
}
export function redirectUri(req) {
  return `https://${req.headers.host}/api/auth/callback`;
}
