// Starts the Google OAuth authorization-code flow (full-page redirect — no
// popups to block, works identically on desktop, mobile, and future iOS).
import crypto from 'node:crypto';
import { cookie, STATE_COOKIE, clientId, redirectUri } from '../_lib/session.js';

export default function handler(req, res) {
  if (!clientId() || !process.env.GOOGLE_CLIENT_SECRET || !process.env.SESSION_SECRET) {
    res.status(503).json({ error: 'server auth not configured' });
    return;
  }
  const state = crypto.randomBytes(16).toString('hex');
  const params = new URLSearchParams({
    client_id: clientId(),
    redirect_uri: redirectUri(req),
    response_type: 'code',
    // openid/email/profile are non-sensitive basic-identity scopes (no
    // re-verification) — they let us greet the user and identify sign-ups.
    scope: 'openid email profile https://www.googleapis.com/auth/calendar.readonly',
    access_type: 'offline', // this is what yields the long-lived refresh token
    prompt: 'consent',      // guarantees a refresh token even on re-login
    state,
  });
  res.setHeader('Set-Cookie', cookie(STATE_COOKIE, state, 600));
  res.redirect(302, `https://accounts.google.com/o/oauth2/v2/auth?${params}`);
}
