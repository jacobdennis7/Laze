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

    // The id_token (from the openid scope) carries the user's email + name.
    // They live only in the sealed cookie on the user's device, like the token.
    let email = null, name = null;
    try {
      const claims = JSON.parse(Buffer.from(tok.id_token.split('.')[1], 'base64url').toString());
      email = claims.email || null;
      name = claims.name || null;
    } catch { /* id_token absent or malformed — proceed without identity */ }

    res.setHeader('Set-Cookie', [
      cookie(SESSION_COOKIE, seal({ rt: tok.refresh_token, email, name, v: 2 }), SESSION_DAYS * 86400),
      cookie(STATE_COOKIE, '', 0),
    ]);

    // Server-authoritative sign-up record: captured here so every sign-in is
    // counted even when the client's analytics are ad-blocked. Same distinct_id
    // (email) as the client-side identify, so it lands on the same person.
    const phKey = process.env.VITE_POSTHOG_KEY;
    if (phKey && email) {
      try {
        await fetch('https://us.i.posthog.com/i/v0/e/', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            api_key: phKey,
            event: 'user_signed_up',
            distinct_id: email,
            properties: { name, $set: { email, name } },
          }),
        });
      } catch { /* analytics must never block sign-in */ }
    }

    res.redirect(302, '/?connected=1');
  } catch {
    return fail('exchange_failed');
  }
}
