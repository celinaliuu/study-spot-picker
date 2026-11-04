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

/**
 * Ask the browser for the current position.
 * Always resolves (never rejects): { ok: true, lat, lng, accuracy } or { ok: false, reason }.
 * Falls back if: no API, not a secure context, denied, timeout, or the fix is off campus.
 */
export function getLocation() {
  return new Promise((resolve) => {
    if (typeof window !== 'undefined' && !window.isSecureContext) {
      resolve({ ok: false, reason: "Location needs https or localhost. Pick your dining court instead." });
      return;
    }
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      resolve({ ok: false, reason: "This browser can't share location. Pick your dining court instead." });
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const here = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        const km = haversineKm(here, CONFIG.WEST_LAFAYETTE);
        if (km > CONFIG.MAX_DISTANCE_FROM_CAMPUS_KM) {
          resolve({ ok: false, reason: `You seem to be ${km.toFixed(0)} km from campus. Pick your dining court instead.` });
          return;
        }
        resolve({ ok: true, ...here, accuracy: Math.round(pos.coords.accuracy) });
      },
      (err) => {
        const reason =
          err.code === 1 ? 'Location was blocked. Pick your dining court instead.'
          : err.code === 3 ? 'Location timed out. Pick your dining court instead.'
          : "Couldn't get your location. Pick your dining court instead.";
        resolve({ ok: false, reason });
      },
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 5 * 60 * 1000 },
    );
  });
}
