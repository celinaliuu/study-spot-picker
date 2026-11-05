// Scoring engine. Pure functions, no DOM: rankSpots() is the entry point.
//
// Pipeline per spot:
//   1. hard filters (closed days, needs a car)
//   2. per-player utility from quiz answers
//   3. misery check per player ("avoid misery over majority")
//   4. group score = mean utility − misery penalty + group-level modifiers
//   5. sort: fewest miserable players first, then highest score
import { CONFIG, NOISE } from './spots.js';
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
  return null;
}

/** One player's utility for one spot, plus whether they'd be miserable there. */
export function playerUtility(answers, spot, ctx) {
  const { noise, coffee } = ctx;
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
 * @param {boolean} [p.keepClose=false]  "Keep it close": only then does distance (and weather's effect on it) count
 * @returns {{ ranked: object[], removed: {spot, reason}[] }}
 */
export function rankSpots({ players, spots, now, weather, origin, hasCar, keepClose = false }) {
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
    };

    const per = players.map((p) => ({ name: p.name, answers: p.answers, ...playerUtility(p.answers, spot, ctx) }));
    const miserable = per.filter((x) => x.miserable);
    const meanU = per.reduce((s, x) => s + x.u, 0) / n;

    let score = meanU - CONFIG.MISERY_PENALTY * miserable.length;
    const mods = {};

    // Distance only counts when the group picked "Keep it close". The walk time is
    // still computed so the result screen can show it.
    // (Downtown with a car is treated as a short drive.)
    const walkMin = walkMinutes(origin, spot);
    if (keepClose) {
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
    }

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
      keepClose,
      ctx,
      mods,
      per,
      activeRules,
    });
  }

  ranked.sort((a, b) => a.miserableCount - b.miserableCount || b.score - a.score);
  return { ranked, removed };
}

/**
 * The spots for wheel number `page` (0 = first wheel, 1 = after "None of these").
 * Walks the ranking in order and allows at most one spot per building, so the
 * slices are always different places. Later pages skip buildings shown earlier.
 */
export function wheelPage(ranked, page, size) {
  const used = new Set();
  let current = [];
  for (let p = 0; p <= page; p++) {
    current = [];
    for (const e of ranked) {
      if (current.length >= size) break;
      const b = e.spot.building ?? e.spot.id;
      if (used.has(b)) continue;
      used.add(b);
      current.push(e);
    }
  }
  return current;
}

// ---------------------------------------------------------------------------
// "Why" line: personal, uses names. e.g.
//   "Celina can actually lock in, and there's coffee for Sam. It's 41° and
//    drizzly, but it's only a ~4 min walk. ☔"
// ---------------------------------------------------------------------------
const WEATHER_EMOJI = { sun: '☀️', moon: '🌙', partly: '⛅', cloud: '☁️', fog: '🌫️', rain: '☔', snow: '❄️', storm: '⛈️' };

/** "Sam" / "Sam and Alex" / "Sam, Alex and Jo" / "everyone" */
export function who(names, groupSize) {
  if (names.length >= 2 && names.length === groupSize) return 'everyone';
  if (names.length <= 1) return names[0] ?? '';
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

/** Candidate reasons for one ranked entry, strongest first. */
export function reasonsFor(entry, { hasCar, weather } = {}) {
  const { spot, per, ctx, walkMin, miserableCount } = entry;
  const n = per.length;
  const out = [];
  const add = (weight, text, people = null) => out.push({ weight, text, people });
  const pick = (key, vals) => per.filter((x) => vals.includes(x.answers[key])).map((x) => x.name);

  const panicking = pick('stress', ['panic']);
  const stressed = pick('stress', ['kinda', 'panic']);
  const silence = pick('noise', ['silence']);
  const talkers = pick('noise', ['talk']);
  const coffeeFans = pick('coffee', ['yes']);
  const tired = pick('energy', ['tired']);
  const psets = pick('work', ['psets']);
  const project = pick('work', ['project']);
  const longHaul = pick('length', ['few', 'late']);

  // Noise / stress
  if (panicking.length && spot.lockIn) add(5 + panicking.length, `${who(panicking, n)} can actually lock in`, who(panicking, n));
  else if (ctx.noise === NOISE.QUIET && (stressed.length || silence.length)) {
    const quietFans = per.filter((x) => stressed.includes(x.name) || silence.includes(x.name)).map((x) => x.name);
    add(4 + quietFans.length, `it's quiet enough for ${who(quietFans, n)} to focus`, who(quietFans, n));
  } else if (stressed.length && ctx.noise === NOISE.CHILL) add(3 + stressed.length, `it's calm enough for ${who(stressed, n)}`, who(stressed, n));
  if (talkers.length && ctx.noise >= NOISE.BUZZY) add(3 + talkers.length, `${who(talkers, n)} can talk without getting shushed`, who(talkers, n));
  else if (talkers.length && ctx.noise === NOISE.CHILL) add(1 + talkers.length, `${who(talkers, n)} can still chat quietly`, who(talkers, n));

  // Coffee
  if (coffeeFans.length && ctx.coffee === 2) add(3 + coffeeFans.length, `there's coffee for ${who(coffeeFans, n)}`, who(coffeeFans, n));
  else if (coffeeFans.length && ctx.coffee === 1) add(2 + coffeeFans.length, `${who(coffeeFans, n)} can grab snacks nearby`, who(coffeeFans, n));

  // Group work
  if (spot.groupSpace && n >= 4 && psets.length + project.length >= 2) add(4 + psets.length + project.length, `there are big tables for all ${n} of you`);
  else if (spot.groupSpace && project.length >= 2) add(3 + project.length, "there's room to spread out for the group project");
  else if (spot.goodFor !== 'solo' && psets.length >= 2) add(2 + psets.length, 'you can work through problem sets together');

  // Energy / length
  if (tired.length && spot.comfy) add(2 + tired.length, tired.length === 1 ? `there are comfy seats for ${tired[0]}'s food coma` : 'there are comfy seats for the food-coma crew');
  if (longHaul.length && spot.outlets === 'many') add(1 + longHaul.length, 'there are outlets everywhere for the long haul');

  // Distance (the weather sentence covers the walk when it's gross out)
  if (entry.keepClose && walkMin != null && walkMin <= 6 && !spot.requiresCar && weather?.category !== 'bad') add(3, `it's only a ~${walkMin} min walk`);
  if (spot.requiresCar && hasCar) add(2, 'you get a change of scenery downtown');
  if (miserableCount === 0 && n >= 3) add(1, "nobody's going to be miserable");

  // Low-weight fillers from the spot itself, so there are always two reasons.
  if (spot.lockIn) add(0.5, "it's a proper lock-in spot");
  if (spot.comfy) add(0.4, 'the seats are comfy');
  if (spot.groupSpace) add(0.3, "there's space to spread out");
  if (spot.outlets === 'many') add(0.2, 'there are outlets everywhere');

  out.sort((a, b) => b.weight - a.weight);
  return out;
}

/** Weather sentence that relates the weather to the pick. */
export function weatherSentence(weather, entry) {
  if (!weather || weather.tempF == null) return null;
  const t = Math.round(weather.tempF);
  const emoji = WEATHER_EMOJI[weather.kind] ? ' ' + WEATHER_EMOJI[weather.kind] : '';
  const walk = entry?.walkMin;
  const close = entry?.keepClose && walk != null && walk <= 8 && !entry.spot.requiresCar;
  const base = `It's ${t}° and ${weather.phrase}`;
  if (entry?.spot.requiresCar) return `${base}, but you've got a car.${emoji}`;
  if (weather.category === 'bad') {
    return close ? `${base}, but it's only a ~${walk} min walk.${emoji}` : `${base}, so bring an umbrella or a hood.${emoji}`;
  }
  if (weather.category === 'nice') return `${base}, so enjoy the walk.${emoji}`;
  return `${base} out.${emoji}`;
}

/** Two personal reasons + a weather sentence. */
export function whyLine(entry, weather, opts = {}) {
  // Drop duplicate wording, then take the top two.
  const seen = new Set();
  const top = reasonsFor(entry, { ...opts, weather }).filter((r) => !seen.has(r.text) && seen.add(r.text)).slice(0, 2);
  const reasons = top.map((r) => r.text);
  // Don't repeat the same names twice in one sentence.
  if (top.length === 2 && top[0].people && top[0].people === top[1].people) {
    const p = top[1].people;
    reasons[1] = p === 'everyone' ? reasons[1].replace(/\beveryone\b/, 'the whole crew')
      : reasons[1].startsWith(p) ? 'they' + reasons[1].slice(p.length)
      : reasons[1].replace(p, 'them');
  }
  let s = reasons.length === 0 ? "It's the best balance for the group"
    : reasons.length === 1 ? reasons[0]
    : `${reasons[0]}, and ${reasons[1]}`;
  s = s[0].toUpperCase() + s.slice(1) + '.';
  const wx = weatherSentence(weather, entry);
  return wx ? `${s} ${wx}` : s;
}
