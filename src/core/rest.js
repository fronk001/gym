// The rest timer, as pure functions. A timer is { endAt, total, sid }: when
// it ends (ms), how long it was, which workout. Only the end moment is kept,
// never a ticking count, so a phone that locked or switched apps comes back
// to the right time: an iPhone stops a page's clock while it isn't in view.

export const startRest = (now, seconds, sid) => ({ endAt: now + seconds * 1000, total: seconds, sid });

// Seconds to go (negative once over).
export const left = (t, now) => (t ? (t.endAt - now) / 1000 : 0);

// Push the end by `delta` seconds; never into the past. Once over, +15
// means 15 more seconds from now.
export function adjust(t, now, delta) {
  if (!t) return t;
  const endAt = Math.max(now, Math.max(t.endAt, now) + delta * 1000);
  return { ...t, endAt, total: Math.max(1, t.total + delta) };
}

// How far through, 0 … 1, for the bar.
export const progress = (t, now) => (t ? Math.min(1, Math.max(0, 1 - left(t, now) / t.total)) : 0);

// A finished timer stays on screen this long ("Rest over"), then goes.
export const LINGER = 60;
export const visible = (t, now) => !!t && left(t, now) > -LINGER;
