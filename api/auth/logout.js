import { cookie, SESSION_COOKIE } from '../_lib/session.js';

export default function handler(req, res) {
  res.setHeader('Set-Cookie', cookie(SESSION_COOKIE, '', 0));
  res.status(204).end();
}
