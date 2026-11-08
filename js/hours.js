// Opening-hours helpers (pure, no DOM). Only spots with an `hours` field are
// checked; everything else counts as always open.

const DAY_MIN = 24 * 60;

/** [open, close] for a spot on a weekday (0 = Sun), or null if closed that day. */
export function windowFor(spot, day) {
  if (spot.closedDays?.includes(day)) return null;
  if (!spot.hours) return [0, DAY_MIN];
  return spot.hours[day] ?? null;
}

/**
 * Minutes until the spot closes, measured from `date`.
 *   Infinity → no hours set (always open)
 *   null     → closed right now
 * Handles windows that run past midnight (close > 1440).
 */
export function minutesUntilClose(spot, date) {
  if (!spot.hours) return Infinity;
  const day = date.getDay();
  const now = date.getHours() * 60 + date.getMinutes();

  // Yesterday's window spilling past midnight into today.
  const y = windowFor(spot, (day + 6) % 7);
  if (y && y[1] > DAY_MIN && now < y[1] - DAY_MIN) return y[1] - DAY_MIN - now;

  const t = windowFor(spot, day);
  if (t && now >= t[0] && now < t[1]) return t[1] - now;
  return null;
}

const fmt = (min) => {
  const m = ((min % DAY_MIN) + DAY_MIN) % DAY_MIN;
  const h = Math.floor(m / 60);
  const mm = m % 60;
  const hh = ((h + 11) % 12) + 1;
  return `${hh}${mm ? ':' + String(mm).padStart(2, '0') : ''}${h < 12 ? 'am' : 'pm'}`;
};

/** e.g. "Open today 8am–12am", or null if the spot has no hours. */
export function hoursToday(spot, date) {
  if (!spot.hours) return null;
  const w = windowFor(spot, date.getDay());
  return w ? `Open today ${fmt(w[0])}–${fmt(w[1])}` : 'Closed today';
}
