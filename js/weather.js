// Current weather from Open-Meteo (free, no key) → 'bad' | 'meh' | 'nice',
// plus an icon kind and cute copy for the UI.
import { CONFIG } from './spots.js';

// WMO weather codes → phrase, icon kind, and whether it counts as precipitation.
function describe(code, isDay) {
  const sunOrMoon = isDay ? 'sun' : 'moon';
  if (code === 0) return { phrase: isDay ? 'sunny' : 'clear', kind: sunOrMoon, wet: false };
  if (code <= 2) return { phrase: isDay ? 'mostly sunny' : 'mostly clear', kind: isDay ? 'partly' : 'moon', wet: false };
  if (code === 3) return { phrase: 'cloudy', kind: 'cloud', wet: false };
  if (code === 45 || code === 48) return { phrase: 'foggy', kind: 'fog', wet: false };
  if (code >= 51 && code <= 57) return { phrase: 'drizzly', kind: 'rain', wet: true };
  if (code >= 61 && code <= 67) return { phrase: 'rainy', kind: 'rain', wet: true };
  if (code >= 71 && code <= 77) return { phrase: 'snowy', kind: 'snow', wet: true };
  if (code >= 80 && code <= 82) return { phrase: 'showery', kind: 'rain', wet: true };
  if (code === 85 || code === 86) return { phrase: 'snowy', kind: 'snow', wet: true };
  if (code >= 95) return { phrase: 'stormy', kind: 'storm', wet: true };
  return { phrase: 'meh', kind: 'cloud', wet: false };
}

/** One cute line for the start screen. */
function blurb({ kind, category, tempF, isDay }) {
  if (kind === 'storm') return "Stormy out! We're staying close. ⛈️";
  if (kind === 'snow') return 'Snow day! Short walks only. ❄️';
  if (kind === 'rain') return "Rainy day. We'll keep the walk short. ☔";
  if (tempF < CONFIG.COLD_F) return 'Brr, bundle up. Closer spots win today. 🧣';
  if (kind === 'fog') return 'Spooky foggy vibes. 👻';
  if (category === 'nice') return isDay ? 'Gorgeous out! Any walk is fair game. 🌷' : 'Lovely night for a walk. ✨';
  if (tempF > CONFIG.NICE_MAX_F) return "Toasty! Somewhere with AC sounds good. 🧊";
  if (!isDay) return 'Cozy night-study weather. 🌙';
  if (kind === 'cloud') return 'Soft cloudy day. Good walking weather. ☁️';
  return 'Decent out. Walks are fine. 🙂';
}

/** Pure: Open-Meteo `current` block → { category, tempF, phrase, kind, isDay, blurb }. */
export function classifyWeather({ temperature_2m: tempF, precipitation = 0, weather_code: code, is_day = 1 }) {
  const isDay = is_day !== 0;
  const { phrase, kind: baseKind, wet } = describe(code, isDay);
  const raining = wet || precipitation > 0;
  const kind = raining && !wet ? 'rain' : baseKind;
  let category = 'meh';
  if (raining || tempF < CONFIG.COLD_F) category = 'bad';
  else if (code <= 2 && tempF >= CONFIG.NICE_MIN_F && tempF <= CONFIG.NICE_MAX_F) category = 'nice';
  const w = { category, tempF, phrase: raining && !wet ? 'wet' : phrase, kind, isDay };
  return { ...w, blurb: blurb(w) };
}

/**
 * Fetch current weather. Always resolves:
 *   { ok: true, category, tempF, phrase, kind, isDay, blurb } or { ok: false, category: 'meh' } (neutral fallback).
 */
export async function fetchWeather({ timeoutMs = 5000 } = {}) {
  const { lat, lng } = CONFIG.WEST_LAFAYETTE;
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}` +
    `&current=temperature_2m,precipitation,weather_code,is_day` +
    `&temperature_unit=fahrenheit&precipitation_unit=inch&timezone=America%2FNew_York`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (!data.current) throw new Error('no current block');
    return { ok: true, ...classifyWeather(data.current) };
  } catch {
    return { ok: false, category: 'meh', tempF: null, phrase: null, kind: 'unknown', blurb: "Couldn't peek outside, so weather won't count. 🙈" };
  } finally {
    clearTimeout(timer);
  }
}
