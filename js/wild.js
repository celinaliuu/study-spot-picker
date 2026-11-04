// Wild mode: skip the quiz, spin between random spots with equal odds.
import { hardFilter, weatherSentence } from './scoring.js';
import { walkMinutes } from './geo.js';

export const WILD_SLICES = 6;

/** Fisher–Yates shuffle (copy). `rand` is injectable for tests. */
export function shuffle(arr, rand = Math.random) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Every spot that passes the hard filters (Burton Morgan on weekends, Downtown
 * without a car), shuffled. Entries match the shape the result screen expects.
 */
export function buildWildPool({ spots, now, origin, hasCar, rand = Math.random }) {
  const ok = spots.filter((spot) => !hardFilter(spot, { now, hasCar }));
  return shuffle(ok, rand).map((spot) => ({
    spot,
    score: 0,
    walkMin: walkMinutes(origin, spot),
    miserableCount: 0,
    miserableNames: [],
    activeRules: [],
    per: [],
    wild: true,
  }));
}

const LINES = [
  'The wheel has spoken. No take-backs.',
  'Chaos picked this one. Trust the process.',
  "You asked for wild. Here's wild.",
  'The universe said {spot}. Who are we to argue?',
  'Fate rolled the dice and the dice said {spot}.',
  'Plot twist: {spot}. Main character energy.',
  "New study spot just dropped: {spot}. It's giving adventure.",
];

/** Random fun line + the usual weather sentence. */
export function wildLine(entry, weather, rand = Math.random) {
  const line = LINES[Math.floor(rand() * LINES.length)].replace('{spot}', entry.spot.shortName || entry.spot.name);
  const wx = weatherSentence(weather, entry);
  return wx ? `${line} ${wx}` : line;
}
