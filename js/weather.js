// Current weather from Open-Meteo (free, no key) → 'bad' | 'meh' | 'nice'.
import { CONFIG } from './spots.js';

// WMO weather codes → short phrase + whether it counts as precipitation.
function describe(code) {
  if (code === 0) return { phrase: 'clear', wet: false };
  if (code <= 2) return { phrase: 'mostly sunny', wet: false };
  if (code === 3) return { phrase: 'cloudy', wet: false };
  if (code === 45 || code === 48) return { phrase: 'foggy', wet: false };
  if (code >= 51 && code <= 57) return { phrase: 'drizzly', wet: true };
  if (code >= 61 && code <= 67) return { phrase: 'rainy', wet: true };
  if (code >= 71 && code <= 77) return { phrase: 'snowing', wet: true };
  if (code >= 80 && code <= 82) return { phrase: 'showery', wet: true };
  if (code === 85 || code === 86) return { phrase: 'snowing', wet: true };
  if (code >= 95) return { phrase: 'stormy', wet: true };
  return { phrase: 'meh', wet: false };
}

/** Pure: Open-Meteo `current` block → { category, tempF, phrase }. */
export function classifyWeather({ temperature_2m: tempF, precipitation = 0, weather_code: code }) {
  const { phrase, wet } = describe(code);
  const raining = wet || precipitation > 0;
  let category = 'meh';
  if (raining || tempF < CONFIG.COLD_F) category = 'bad';
  else if (code <= 2 && tempF >= CONFIG.NICE_MIN_F && tempF <= CONFIG.NICE_MAX_F) category = 'nice';
  return { category, tempF, phrase: raining && !wet ? 'wet' : tempF < CONFIG.COLD_F && !wet ? `cold and ${phrase}` : phrase };
}

/**
 * Fetch current weather. Always resolves:
 *   { ok: true, category, tempF, phrase } or { ok: false, category: 'meh' } (neutral fallback).
 */
export async function fetchWeather({ timeoutMs = 5000 } = {}) {
  const { lat, lng } = CONFIG.WEST_LAFAYETTE;
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}` +
    `&current=temperature_2m,precipitation,weather_code` +
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
    return { ok: false, category: 'meh', tempF: null, phrase: null };
  } finally {
    clearTimeout(timer);
  }
}
