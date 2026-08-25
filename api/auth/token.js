// Mints a fresh Google access token from the sealed refresh token in the
// user's cookie. Called by the SPA on load and whenever its token nears expiry.
import { unseal, cookie, parseCookies, SESSION_COOKIE, clientId, clientSecret } from '../_lib/session.js';

export default async function handler(req, res) {
  const sealed = parseCookies(req)[SESSION_COOKIE];
  const session = sealed && unseal(sealed);
  if (!session?.rt) {
    res.status(401).json({ error: 'no_session' });
    return;
  }

  try {
    const r = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        refresh_token: session.rt,
        client_id: clientId(),
        client_secret: clientSecret(),
        grant_type: 'refresh_token',
      }),
    });
    const tok = await r.json();
    if (!r.ok) {
      // revoked or expired grant — clear the dead session so the UI re-prompts
      res.setHeader('Set-Cookie', cookie(SESSION_COOKIE, '', 0));
      res.status(401).json({ error: tok.error || 'refresh_failed' });
      return;
    }
    res.status(200).json({ access_token: tok.access_token, expires_in: tok.expires_in });
  } catch {
    res.status(502).json({ error: 'google_unreachable' });
  }
}
