// Scenario tests for scoring and wheel math.
// Browser: open /tests.html.
// Node: node --experimental-detect-module --input-type=module -e "import('./js/tests.js').then(m => m.runAndPrint())"
import { SPOTS, DINING_COURTS, NOISE } from './spots.js';
import { rankSpots, effectiveNoise, whyLine } from './scoring.js';
import { wheelShares, pickIndex, targetRotation, sliceAngles } from './wheel.js';
import { walkMinutes } from './geo.js';
import { classifyWeather } from './weather.js';

// Mon 2 Nov 2026 + offset → a date on the given weekday (0 = Sun … 6 = Sat).
const at = (weekday, h, m = 0) => new Date(2026, 10, 2 + ((weekday + 6) % 7), h, m);
const SUN = 0, MON = 1, FRI = 5, SAT = 6;

const byId = Object.fromEntries(SPOTS.map((s) => [s.id, s]));
const court = (id) => DINING_COURTS.find((d) => d.id === id);
const P = (name, a) => ({
  name,
  answers: { stress: 'chill', energy: 'normal', noise: 'buzz', work: 'solo', length: 'few', coffee: 'any', ...a },
});
const run = (over = {}) =>
  rankSpots({
    players: [P('A'), P('B')],
    spots: SPOTS,
    now: at(MON, 15),
    weather: { category: 'meh', tempF: 50, phrase: 'cloudy' },
    origin: court('windsor'),
    hasCar: false,
    ...over,
  });
const ids = (r) => r.ranked.map((e) => e.spot.id);
const entry = (r, id) => r.ranked.find((e) => e.spot.id === id);

const tests = [];
const test = (name, fn) => tests.push({ name, fn });
const assert = (cond, msg) => { if (!cond) throw new Error(msg || 'assertion failed'); };

// --- Hard filters ---------------------------------------------------------
test('Burton Morgan is removed on Saturday', () => {
  assert(!ids(run({ now: at(SAT, 15) })).includes('burton-morgan'));
  assert(ids(run({ now: at(MON, 15) })).includes('burton-morgan'), 'should be present on Monday');
});
test('Downtown needs a car', () => {
  assert(!ids(run({ hasCar: false })).includes('downtown'));
  assert(ids(run({ hasCar: true })).includes('downtown'));
});
test('No opening-hours filter: every spot except Burton Morgan (weekend) / Downtown (no car) is kept at any hour', () => {
  for (const [day, h, m] of [[MON, 3, 0], [FRI, 16, 30], [SUN, 23, 30], [SAT, 2, 0], [MON, 0, 10]]) {
    const r = run({ now: at(day, h, m), hasCar: true });
    const expected = SPOTS.length - (day === SAT || day === SUN ? 1 : 0);
    assert(r.ranked.length === expected, `${day} ${h}:${m} → ${r.ranked.length}/${expected}; removed ${r.removed.map((x) => x.spot.id)}`);
  }
});

// --- Time of day ----------------------------------------------------------
test('WALC loud at 3pm, quiet at 9pm and 3am', () => {
  assert(effectiveNoise(byId.walc, at(MON, 15)) === NOISE.LOUD);
  assert(effectiveNoise(byId.walc, at(MON, 21)) === NOISE.QUIET);
  assert(effectiveNoise(byId.walc, at(MON, 3)) === NOISE.QUIET);
});
test('Frieda gets the lights-off penalty after 10pm', () => {
  const r = run({ now: at(MON, 22, 10) });
  assert(Object.keys(entry(r, 'frieda').mods).some((k) => k.startsWith('time:')));
  assert(!Object.keys(entry(run(), 'frieda').mods).some((k) => k.startsWith('time:')));
});

// --- Misery ---------------------------------------------------------------
test('Panicking + silence: PMU is miserable and ranks below every misery-free spot', () => {
  const r = run({ players: [P('Panic', { stress: 'panic', noise: 'silence' }), P('Talky', { noise: 'talk' }), P('C')] });
  const pmu = entry(r, 'pmu');
  assert(pmu.miserableCount >= 1, 'PMU should make someone miserable');
  assert(pmu.miserableNames.includes('Panic'));
  const pmuRank = ids(r).indexOf('pmu');
  const happyRanks = r.ranked.map((e, i) => (e.miserableCount === 0 ? i : -1)).filter((i) => i >= 0);
  assert(happyRanks.every((i) => i < pmuRank), 'all misery-free spots should rank above PMU');
});
test('Misery beats majority: 3 talkers + 1 panicking-silence never get a loud spot on top', () => {
  const r = run({
    players: [P('A', { noise: 'talk' }), P('B', { noise: 'talk' }), P('C', { noise: 'talk' }), P('D', { stress: 'panic', noise: 'silence' })],
  });
  const top = r.ranked[0];
  assert(top.ctx.noise < NOISE.BUZZY, `top was ${top.spot.id}`);
});

// --- Group work -----------------------------------------------------------
test('5-person group project: top 3 has no solo-only spots and has a group space', () => {
  const players = ['A', 'B', 'C', 'D', 'E'].map((n) => P(n, { work: 'project', noise: 'talk' }));
  const top3 = run({ players }).ranked.slice(0, 3);
  assert(top3.every((e) => e.spot.goodFor !== 'solo'), top3.map((e) => e.spot.id).join(','));
  assert(top3.some((e) => e.spot.groupSpace), top3.map((e) => e.spot.id).join(','));
});
test('Solo readers who want silence get quiet spots on top', () => {
  const players = [P('A', { noise: 'silence', stress: 'kinda' }), P('B', { noise: 'silence' })];
  const top3 = run({ players }).ranked.slice(0, 3);
  assert(top3.every((e) => e.ctx.noise === NOISE.QUIET), top3.map((e) => e.spot.id).join(','));
});

// --- Weather & distance ---------------------------------------------------
test('Rain makes far spots worse; nice weather removes the distance penalty', () => {
  const origin = court('hillenbrand');
  const score = (category) => entry(run({ origin, weather: { category, tempF: 50 } }), 'rawls');
  const bad = score('bad'), meh = score('meh'), nice = score('nice');
  assert(bad.mods.distance < meh.mods.distance, 'bad < meh');
  assert(nice.mods.distance === 0 || Object.is(nice.mods.distance, -0), 'nice = 0');
});
test('Walking time Hillenbrand → Rawls is plausible (10–30 min)', () => {
  const m = walkMinutes(court('hillenbrand'), byId.rawls);
  assert(m >= 10 && m <= 30, `got ${m}`);
});
test('Bad weather adds a downtown penalty', () => {
  const r = run({ hasCar: true, weather: { category: 'bad', tempF: 35 } });
  assert(entry(r, 'downtown').mods.badWeatherDowntown < 0);
});

test('Weather classifier: drizzle/cold → bad, sunny 68° → nice, cloudy 50° → meh', () => {
  assert(classifyWeather({ temperature_2m: 41, precipitation: 0.02, weather_code: 53 }).category === 'bad');
  assert(classifyWeather({ temperature_2m: 35, precipitation: 0, weather_code: 0 }).category === 'bad');
  assert(classifyWeather({ temperature_2m: 68, precipitation: 0, weather_code: 1 }).category === 'nice');
  assert(classifyWeather({ temperature_2m: 50, precipitation: 0, weather_code: 3 }).category === 'meh');
});

// --- Why line -------------------------------------------------------------
test('Why line includes weather and ends with a period', () => {
  const r = run({ players: [P('A', { stress: 'panic', noise: 'silence', coffee: 'yes' }), P('B', { coffee: 'yes' })] });
  const s = whyLine(r.ranked[0], { category: 'bad', tempF: 41, phrase: 'drizzly' });
  assert(s.includes("41° and drizzly") && s.endsWith('.'), s);
});

// --- Wheel ----------------------------------------------------------------
test('Wheel shares sum to 1 and stay within 15–60%', () => {
  for (const scores of [[10, 0, -5], [100, 1, 0], [3, 3, 3], [-20, -21, -40], [5, 4]]) {
    const sh = wheelShares(scores);
    const sum = sh.reduce((a, b) => a + b, 0);
    assert(Math.abs(sum - 1) < 1e-9, `sum ${sum} for ${scores}`);
    assert(sh.every((x) => x >= 0.15 - 1e-9 && x <= 0.6 + 1e-9), `${sh} for ${scores}`);
  }
  const eq = wheelShares([3, 3, 3]);
  assert(Math.abs(eq[0] - 1 / 3) < 1e-9, 'equal scores → equal slices');
  const sh = wheelShares([9, 5, 1]);
  assert(sh[0] > sh[1] && sh[1] > sh[2], 'higher score → bigger slice');
});
test('Pointer lands inside the picked slice', () => {
  const shares = wheelShares([9, 5, 1]);
  const angles = sliceAngles(shares);
  for (let i = 0; i < 3; i++) {
    for (const r of [0, 0.5, 0.999]) {
      const rot = targetRotation(123.4, shares, i, { rand: () => r });
      const read = ((-rot % 360) + 360) % 360;
      assert(read >= angles[i].start && read < angles[i].end, `slice ${i}, read ${read}`);
      assert(rot >= 123.4 + 5 * 360, 'spins forward at least 5 turns');
    }
  }
  assert(pickIndex([0.5, 0.3, 0.2], () => 0.6) === 1);
});

export function runTests() {
  return tests.map(({ name, fn }) => {
    try { fn(); return { name, ok: true }; }
    catch (e) { return { name, ok: false, error: e.message }; }
  });
}

export function runAndPrint() {
  const results = runTests();
  for (const r of results) console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.name}${r.ok ? '' : '  → ' + r.error}`);
  const failed = results.filter((r) => !r.ok).length;
  console.log(`\n${results.length - failed}/${results.length} passed`);
  if (typeof process !== 'undefined' && failed) process.exitCode = 1;
  return results;
}
