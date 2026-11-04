// Opening-hours helpers. Pure functions, no DOM.
import { CONFIG, HOURS } from './spots.js';

const DAY_MIN = 24 * 60;

/** [open, close] for a spot on a given weekday (0 = Sun), or null if closed that day. */
export function windowFor(spot, day) {
  if (spot.closedDays.includes(day)) return null;
  if (spot.hours === HOURS.ALWAYS) return [0, DAY_MIN];
  if (spot.hours == null) return [CONFIG.PLACEHOLDER_HOURS.open, CONFIG.PLACEHOLDER_HOURS.close];
  return spot.hours[day] ?? null;
}

/**
 * Minutes until the spot closes, measured from `date`.
 *   Infinity → open 24/7
 *   null     → closed right now
 * Handles windows that run past midnight (close > 1440).
 */
export function minutesUntilClose(spot, date) {
  if (spot.hours === HOURS.ALWAYS && !spot.closedDays.includes(date.getDay())) return Infinity;

  const day = date.getDay();
  const now = date.getHours() * 60 + date.getMinutes();

  // Yesterday's window spilling past midnight into today.
  const y = windowFor(spot, (day + 6) % 7);
  if (y && y[1] > DAY_MIN && now < y[1] - DAY_MIN) return y[1] - DAY_MIN - now;

  const t = windowFor(spot, day);
  if (t && now >= t[0] && now < t[1]) return t[1] - now;

  return null;
}

/** Short human label for the closing time, e.g. "closes 11pm" / "open 24/7". */
export function closingLabel(spot, date) {
  const left = minutesUntilClose(spot, date);
  if (left === Infinity) return 'open 24/7';
  if (left == null) return 'closed';
  const close = new Date(date.getTime() + left * 60000);
  const h = close.getHours();
  const m = close.getMinutes();
  const hh = ((h + 11) % 12) + 1;
  const suffix = h < 12 ? 'am' : 'pm';
  return `closes ${hh}${m ? ':' + String(m).padStart(2, '0') : ''}${suffix}`;
}
