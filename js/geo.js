// Distance math (pure) + browser geolocation wrapper with fallbacks.
import { CONFIG } from './spots.js';

const toRad = (d) => (d * Math.PI) / 180;

export function haversineKm(a, b) {
  const R = 6371;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Approximate walking minutes (straight line × detour factor ÷ walking speed). */
export function walkMinutes(from, to) {
  if (!from || !to) return null;
  const km = haversineKm(from, to) * CONFIG.DETOUR_FACTOR;
  return Math.max(1, Math.round((km / CONFIG.WALK_SPEED_KMH) * 60));
}

function locateOnce(opts) {
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ pos }),
      (err) => resolve({ err }),
      opts,
    );
  });
}

const PICK = 'Or just pick your dining court below.';

/**
 * Ask the browser for the current position.
 * Always resolves (never rejects): { ok: true, lat, lng, accuracy } or { ok: false, reason }.
 * Tries a quick low-accuracy fix first, then retries once with high accuracy
 * (GPS) if that times out or comes back unavailable.
 * Falls back if: no API, not a secure context, denied, unavailable, timeout, or off campus.
 */
export async function getLocation({ onRetry } = {}) {
  if (typeof window !== 'undefined' && !window.isSecureContext) {
    return {
      ok: false,
      reason: `Location only works on https or localhost, and this page is ${location.host}. On a phone, use the https (GitHub Pages) link. ${PICK}`,
    };
  }
  if (typeof navigator === 'undefined' || !navigator.geolocation) {
    return { ok: false, reason: `This browser can't share location. ${PICK}` };
  }

  let { pos, err } = await locateOnce({ enableHighAccuracy: false, timeout: 8000, maximumAge: 5 * 60 * 1000 });
  if (err && err.code !== 1) {
    onRetry?.();
    ({ pos, err } = await locateOnce({ enableHighAccuracy: true, timeout: 12000, maximumAge: 0 }));
  }

  if (err) {
    const reason =
      err.code === 1
        ? `Location is blocked for this site. Allow it from the icon next to the address bar, then tap the button again. ${PICK}`
        : err.code === 2
          ? `Your device couldn't find you. On a Mac, turn on Location Services for your browser in System Settings → Privacy & Security. On a phone, check that Location is on. ${PICK}`
          : `Finding you took too long. Try again near a window or outside. ${PICK}`;
    return { ok: false, reason };
  }

  const here = { lat: pos.coords.latitude, lng: pos.coords.longitude };
  const km = haversineKm(here, CONFIG.WEST_LAFAYETTE);
  if (km > CONFIG.MAX_DISTANCE_FROM_CAMPUS_KM) {
    return { ok: false, reason: `You seem to be ${km.toFixed(km < 10 ? 1 : 0)} km from campus, too far for walking times. ${PICK}` };
  }
  return { ok: true, ...here, accuracy: Math.round(pos.coords.accuracy) };
}
