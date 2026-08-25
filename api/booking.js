// Booking-link proxy: reads a public Calendly booking page's availability
// server-side (their APIs block cross-origin browser reads). Only fetches
// domains on the allowlist; returns normalized open slots.
const ALLOWED_HOSTS = new Set(['calendly.com', 'www.calendly.com']);

export default async function handler(req, res) {
  const { url, start, end, tz } = req.query;
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    res.status(400).json({ ok: false, reason: 'bad_url' });
    return;
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start || '') || !/^\d{4}-\d{2}-\d{2}$/.test(end || '')) {
    res.status(400).json({ ok: false, reason: 'bad_range' });
    return;
  }

  if (!ALLOWED_HOSTS.has(parsed.hostname)) {
    // cal.com / vimcal: not yet supported server-side — client falls back to paste
    res.status(200).json({ ok: false, reason: 'unsupported_provider' });
    return;
  }

  const timezone = tz || 'America/New_York';
  const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36';
  const jfetch = async (u) => {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 10000);
    try {
      const r = await fetch(u, { headers: { 'User-Agent': UA, Accept: 'application/json, text/html' }, signal: ctrl.signal });
      clearTimeout(t);
      return r;
    } catch (e) {
      clearTimeout(t);
      throw e;
    }
  };

  try {
    // 1. Resolve the event type UUID: try the lookup API, fall back to page HTML.
    const parts = parsed.pathname.split('/').filter(Boolean);
    let uuid = null;
    let duration = null;
    if (parts.length >= 2) {
      const lookup = await jfetch(
        `https://calendly.com/api/booking/event_types/lookup?event_type_slug=${encodeURIComponent(parts[1])}&profile_slug=${encodeURIComponent(parts[0])}`
      );
      if (lookup.ok) {
        const js = await lookup.json();
        uuid = js.uuid || js.event_type?.uuid || null;
        duration = js.duration || js.event_type?.duration || null;
      }
    }
    if (!uuid) {
      const page = await jfetch(url);
      if (page.ok) {
        const html = await page.text();
        const m = html.match(/"uuid":"([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})"/);
        if (m) uuid = m[1];
        const d = html.match(/"duration":(\d{1,3})/);
        if (d) duration = +d[1];
      }
    }
    if (!uuid) {
      res.status(200).json({ ok: false, reason: 'event_type_not_found' });
      return;
    }

    // 2. Pull the availability range (public endpoint the booking widget itself uses).
    const range = await jfetch(
      `https://calendly.com/api/booking/event_types/${uuid}/calendar/range?timezone=${encodeURIComponent(timezone)}&diagnostics=false&range_start=${start}&range_end=${end}`
    );
    if (!range.ok) {
      res.status(200).json({ ok: false, reason: `availability_${range.status}` });
      return;
    }
    const js = await range.json();
    const slots = [];
    for (const day of js.days || []) {
      for (const spot of day.spots || []) {
        if (spot.status === 'available' && spot.start_time) slots.push(spot.start_time);
      }
    }
    res.status(200).json({ ok: true, provider: 'calendly', durationMin: duration, slots: slots.slice(0, 200) });
  } catch {
    res.status(200).json({ ok: false, reason: 'fetch_failed' });
  }
}
