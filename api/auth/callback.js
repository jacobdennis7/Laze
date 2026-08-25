// Exchanges the authorization code for tokens; seals the refresh token into an
// encrypted httpOnly cookie on the user's device. Nothing is stored server-side.
import { seal, cookie, parseCookies, SESSION_COOKIE, STATE_COOKIE, SESSION_DAYS, clientId, clientSecret, redirectUri } from '../_lib/session.js';

export default async function handler(req, res) {
  const { code, state, error } = req.query;
  const cookies = parseCookies(req);

  const fail = (reason) => {
    res.setHeader('Set-Cookie', cookie(STATE_COOKIE, '', 0));
    res.redirect(302, `/?auth_error=${encodeURIComponent(reason)}`);
  };

  if (error) return fail(error);
  if (!code || !state || state !== cookies[STATE_COOKIE]) return fail('state_mismatch');

  try {
    const r = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: clientId(),
        client_secret: clientSecret(),
        redirect_uri: redirectUri(req),
        grant_type: 'authorization_code',
      }),
    });
    const tok = await r.json();
    if (!r.ok || !tok.refresh_token) return fail(tok.error || 'no_refresh_token');

    res.setHeader('Set-Cookie', [
      cookie(SESSION_COOKIE, seal({ rt: tok.refresh_token, v: 1 }), SESSION_DAYS * 86400),
      cookie(STATE_COOKIE, '', 0),
    ]);
    res.redirect(302, '/?connected=1');
  } catch {
    return fail('exchange_failed');
  }
}
