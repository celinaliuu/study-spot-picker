// Scoring engine. Pure functions, no DOM: rankSpots() is the entry point.
//
// Pipeline per spot:
//   1. hard filters (closed / closing soon, closed days, needs a car)
//   2. per-player utility from quiz answers
//   3. misery check per player ("avoid misery over majority")
//   4. group score = mean utility − misery penalty + group-level modifiers
//   5. sort: fewest miserable players first, then highest score
import { CONFIG, NOISE } from './spots.js';
import { minutesUntilClose } from './hours.js';
import { walkMinutes } from './geo.js';

// Answer values used by the quiz (app.js) and here.
export const ANSWERS = {
  stress: ['chill', 'kinda', 'panic'],
  energy: ['wired', 'normal', 'tired'],
  noise: ['silence', 'buzz', 'talk'],
  work: ['solo', 'psets', 'project'],
  length: ['quick', 'few', 'late'],
  coffee: ['yes', 'any'],
};

const IDEAL_NOISE = { silence: 0, buzz: 1.5, talk: 2.5 };
const STRESS_NOISE_MULT = { chill: 0.75, kinda: 1, panic: 1.5 };
const SESSION_WEIGHT = { quick: 0, few: 0.5, late: 1 };

const inHourWindow = (h, from, to) => (from <= to ? h >= from && h < to : h >= from || h < to);

/** Noise level at this time of day (e.g. WALC goes quiet after 7pm). */
export function effectiveNoise(spot, date) {
  const h = date.getHours();
  for (const r of spot.noiseRules) if (inHourWindow(h, r.fromHour, r.toHour)) return r.noise;
  return spot.noise;
}

/** Coffee level that counts today (Burton Morgan's market is weekdays only). */
function coffeeToday(spot, date) {
  if (spot.coffeeDays && !spot.coffeeDays.includes(date.getDay())) return 0;
  return spot.coffee;
}

/** Returns a reason string if the spot must be removed, else null. */
export function hardFilter(spot, { now, hasCar }) {
  if (spot.closedDays.includes(now.getDay())) return 'closed today';
  if (spot.requiresCar && !hasCar) return 'needs a car or a long walk';
  const left = minutesUntilClose(spot, now);
  if (left == null) return 'closed now';
  if (left < CONFIG.CLOSING_BUFFER_MIN) return `closes in ${left} min`;
  return null;
}

/** One player's utility for one spot, plus whether they'd be miserable there. */
export function playerUtility(answers, spot, ctx) {
  const { noise, coffee, minsLeft } = ctx;
  let u = 0;

  // --- Noise (scaled by stress) ---
  let heard = noise;
  if (answers.noise === 'silence' && spot.quirks.includes('instruments')) heard = Math.max(heard, NOISE.BUZZY);
  let diff = Math.abs(IDEAL_NOISE[answers.noise] - heard);
  if (answers.energy === 'wired') diff = Math.max(0, diff - 0.5);
  u += (3 - 2 * diff) * STRESS_NOISE_MULT[answers.stress];
  if (answers.stress === 'panic' && spot.lockIn) u += 1;

  // --- Work type ---
  const g = spot.goodFor;
  if (answers.work === 'solo') u += g === 'solo' ? 2 : g === 'both' ? 1 : -2;
  if (answers.work === 'psets') u += g === 'solo' ? -3 : 2;
  if (answers.work === 'project') {
    u += g === 'group' ? 3 : g === 'both' ? 1 : -4;
    if (spot.groupSpace) u += 1;
  }
  if ((answers.work === 'psets' || answers.work === 'project') && spot.roomsOftenFull) u -= 1;

  // --- Energy ---
  if (answers.energy === 'tired') {
    if (spot.comfy) u += 1;
    if (coffee > 0) u += 1;
  }

  // --- Session length ---
  if (answers.length !== 'quick') {
    if (spot.outlets === 'many') u += 1;
    if (spot.outlets === 'few') u -= 1;
  }
  if (minsLeft !== Infinity && minsLeft < CONFIG.SESSION_MINUTES[answers.length]) {
    u -= CONFIG.CLOSES_BEFORE_SESSION_END_PENALTY;
  }

  // --- Coffee ---
  if (answers.coffee === 'yes') u += coffee === 2 ? 2 : coffee === 1 ? 1 : -1;

  // --- Misery: strong dislikes, regardless of how everyone else votes ---
  const veto =
    (answers.noise === 'silence' && heard >= NOISE.BUZZY) ||
    (answers.noise === 'talk' && noise === NOISE.QUIET) ||
    ((answers.work === 'psets' || answers.work === 'project') && g === 'solo');
  const miserable = veto || u < CONFIG.MISERY_THRESHOLD;

  return { u, miserable };
}

/**
 * Rank every spot for this group.
 * @param {object} p
 * @param {{name:string, answers:object}[]} p.players
 * @param {object[]} p.spots
 * @param {Date} p.now
 * @param {{category:'bad'|'meh'|'nice', tempF?:number, phrase?:string}|null} p.weather
 * @param {{lat:number,lng:number}|null} p.origin
 * @param {boolean} p.hasCar
 * @returns {{ ranked: object[], removed: {spot, reason}[] }}
 */
export function rankSpots({ players, spots, now, weather, origin, hasCar }) {
  const n = players.length;
  const wx = weather?.category ?? 'meh';
  const removed = [];
  const ranked = [];

  const tiredShare = players.filter((p) => p.answers.energy === 'tired').length / n;
  const sessionFactor = players.reduce((s, p) => s + SESSION_WEIGHT[p.answers.length], 0) / n;
  const groupFactor = (n - 2) / 4;

  for (const spot of spots) {
    const reason = hardFilter(spot, { now, hasCar });
    if (reason) { removed.push({ spot, reason }); continue; }

    const ctx = {
      noise: effectiveNoise(spot, now),
      coffee: coffeeToday(spot, now),
      minsLeft: minutesUntilClose(spot, now),
    };

    const per = players.map((p) => ({ name: p.name, answers: p.answers, ...playerUtility(p.answers, spot, ctx) }));
    const miserable = per.filter((x) => x.miserable);
    const meanU = per.reduce((s, x) => s + x.u, 0) / n;

    let score = meanU - CONFIG.MISERY_PENALTY * miserable.length;
    const mods = {};

    // Distance (walk from the origin; downtown with a car is treated as a short drive).
    const walkMin = walkMinutes(origin, spot);
    if (spot.requiresCar) {
      mods.travel = -3;
    } else if (walkMin != null) {
      mods.distance =
        -CONFIG.DISTANCE_PENALTY_PER_MIN *
        Math.max(0, walkMin - CONFIG.FREE_WALK_MIN) *
        CONFIG.WEATHER_DISTANCE_FACTOR[wx] *
        (1 + 0.3 * tiredShare);
    }
    if (wx === 'bad' && spot.requiresCar) mods.badWeatherDowntown = -CONFIG.BAD_WEATHER_DOWNTOWN_PENALTY;

    if (spot.lowPriority) mods.lowPriority = -CONFIG.LOW_PRIORITY_PENALTY;
    if (spot.oftenFull) mods.oftenFull = -spot.oftenFull * CONFIG.OFTEN_FULL_BASE * (1 + sessionFactor + groupFactor);
    if (n >= CONFIG.GROUP_SPACE_MIN_PLAYERS && spot.groupSpace) mods.groupSpace = CONFIG.GROUP_SPACE_BONUS;

    const h = now.getHours();
    const activeRules = spot.timeRules.filter((r) => inHourWindow(h, r.fromHour, r.toHour ?? 24));
    for (const r of activeRules) mods['time:' + r.why] = -r.penalty;

    for (const v of Object.values(mods)) score += v;

    ranked.push({
      spot,
      score,
      meanU,
      miserableCount: miserable.length,
      miserableNames: miserable.map((x) => x.name),
      walkMin,
      ctx,
      mods,
      per,
      activeRules,
    });
  }

  ranked.sort((a, b) => a.miserableCount - b.miserableCount || b.score - a.score);
  return { ranked, removed };
}

// ---------------------------------------------------------------------------
// "Why" line
// ---------------------------------------------------------------------------
const count = (per, key, vals) => per.filter((x) => vals.includes(x.answers[key])).length;

/** Candidate reasons for one ranked entry, strongest first. */
export function reasonsFor(entry, { now, hasCar } = {}) {
  const { spot, per, ctx, walkMin, miserableCount } = entry;
  const n = per.length;
  const out = [];
  const add = (weight, text) => out.push({ weight, text });

  const stressed = count(per, 'stress', ['kinda', 'panic']);
  const panicking = count(per, 'stress', ['panic']);
  const silence = count(per, 'noise', ['silence']);
  const talkers = count(per, 'noise', ['talk']);
  const coffeeFans = count(per, 'coffee', ['yes']);
  const groupWork = count(per, 'work', ['psets', 'project']);
  const tired = count(per, 'energy', ['tired']);
  const late = count(per, 'length', ['few', 'late']);

  if (stressed && ctx.noise <= NOISE.CHILL) {
    add(2 + stressed, ctx.noise === NOISE.QUIET ? 'quiet enough for the stressed people' : 'calm enough for the stressed people');
  } else if (silence && ctx.noise === NOISE.QUIET) add(2 + silence, 'properly silent');
  if (talkers && ctx.noise >= NOISE.BUZZY) add(2 + talkers, 'you can actually talk');
  if (panicking && spot.lockIn) add(3, 'a real lock-in spot');
  if (coffeeFans && ctx.coffee === 2) add(2 + coffeeFans, 'coffee right there');
  else if (coffeeFans && ctx.coffee === 1) add(1 + coffeeFans, 'food and snacks nearby');
  if (groupWork >= 2 && spot.groupSpace) add(2 + groupWork, n >= 4 ? `big tables for all ${n} of you` : 'room to work together');
  if (tired && spot.comfy) add(1 + tired, 'comfy seats for the food coma');
  if (late && ctx.minsLeft === Infinity) add(1 + late, 'open all night');
  else if (late && spot.outlets === 'many') add(1 + late, 'plenty of outlets');
  if (walkMin != null && walkMin <= 6 && !spot.requiresCar) add(3, `only ~${walkMin} min away`);
  if (spot.requiresCar && hasCar) add(2, 'a change of scenery downtown');
  if (miserableCount === 0 && n >= 3) add(1, 'nobody ends up miserable');

  out.sort((a, b) => b.weight - a.weight);
  return out;
}

export function weatherFragment(weather) {
  if (!weather || weather.tempF == null) return null;
  const t = Math.round(weather.tempF);
  if (weather.category === 'nice') return `it's ${t}° and nice out`;
  return `it's ${t}° and ${weather.phrase || 'meh'}`;
}

/** e.g. "Quiet enough for the stressed people, coffee right there, and it's 41° and drizzly." */
export function whyLine(entry, weather, opts) {
  const parts = reasonsFor(entry, opts).slice(0, 2).map((r) => r.text);
  const wx = weatherFragment(weather);
  if (wx) parts.push(wx);
  if (!parts.length) return 'The best fit for everyone right now.';
  let s;
  if (parts.length === 1) s = parts[0];
  else if (parts.length === 2) s = `${parts[0]} and ${parts[1]}`;
  else s = `${parts.slice(0, -1).join(', ')}, and ${parts[parts.length - 1]}`;
  return s[0].toUpperCase() + s.slice(1) + '.';
}
