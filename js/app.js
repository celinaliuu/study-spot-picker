// Screen state machine: start → hand-off → quiz → … → wheel → result.
import { SPOTS, DINING_COURTS } from './spots.js';
import { rankSpots, whyLine, wheelPage } from './scoring.js';
import { getLocation } from './geo.js';
import { fetchWeather } from './weather.js';
import { renderWeatherCard } from './weather-card.js';
import { createWheel, wheelShares } from './wheel.js';
import { buildWildPool, wildLine, WILD_SLICES, shuffle } from './wild.js';

const QUESTIONS = [
  { key: 'stress', text: 'How stressed are you?', options: [
    ['chill', '😌', 'Chill'], ['kinda', '😬', 'Kinda stressed'], ['panic', '😱', 'Panicking'] ] },
  { key: 'energy', text: "How's your energy?", options: [
    ['wired', '⚡', 'Wired'], ['normal', '🙂', 'Normal'], ['tired', '😴', 'Food-coma tired'] ] },
  { key: 'noise', text: 'How much noise do you want?', options: [
    ['silence', '🤫', 'Silence please'], ['buzz', '🎧', 'Background buzz'], ['talk', '💬', 'Want to talk'] ] },
  { key: 'work', text: 'What are you working on?', options: [
    ['solo', '📖', 'Solo reading / writing'], ['psets', '✏️', 'Problem sets together'], ['project', '👥', 'Group project'] ] },
  { key: 'length', text: 'How long are you staying?', options: [
    ['quick', '⏱️', 'Quick hour'], ['few', '⌛', 'A few hours'], ['late', '🌙', 'Until they kick us out'] ] },
  { key: 'coffee', text: 'Coffee?', options: [
    ['yes', '☕', 'Yes'], ['any', '🤷', "Don't care"] ] },
];

// `python3 -m http.server` prints http://[::]:8000, which browsers don't treat as
// secure, so geolocation is blocked. Hop over to localhost instead.
if (['[::]', '0.0.0.0'].includes(location.hostname)) {
  location.replace(`${location.protocol}//localhost${location.port ? ':' + location.port : ''}${location.pathname}${location.search}`);
}

const $ = (id) => document.getElementById(id);
const SLICE_VARS = ['--slice-1', '--slice-2', '--slice-3', '--slice-4', '--slice-5', '--slice-6'];

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------
const weatherPromise = fetchWeather();
let weather = null;

const fresh = () => ({
  mode: 'quiz',          // 'quiz' = fit the group, 'wild' = no quiz, random spots
  origin: null,          // { lat, lng, label, kind: 'gps' | 'court' }
  playerCount: 2,
  keepClose: false,      // "Keep it close": only then does distance count
  wheelSize: 5,          // spots on the quiz wheel (3–6)
  hasCar: false,
  players: [],           // [{ name, answers }]
  current: 0,            // player index
  q: 0,                  // question index
  ranked: [],
  page: 0,               // 0 = first wheel, 1 = after "None of these"
  candidates: [],
  rerollUsed: false,
  now: null,
});
let state = fresh();
let wheel = null;
let spinning = false;

function show(screenId) {
  for (const s of document.querySelectorAll('.screen')) s.hidden = s.id !== screenId;
  window.scrollTo(0, 0);
  const h = $(screenId).querySelector('h1');
  if (h) h.focus({ preventScroll: true });
}

// ---------------------------------------------------------------------------
// Start screen
// ---------------------------------------------------------------------------
function chipGroup(container, items, onPick, selected) {
  container.innerHTML = '';
  for (const [value, label] of items) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'chip';
    b.setAttribute('role', 'radio');
    b.dataset.value = value;
    b.textContent = label;
    b.setAttribute('aria-checked', String(value === selected));
    container.append(b);
  }
  wireChips(container, onPick);
}

function wireChips(container, onPick) {
  container.addEventListener('click', (e) => {
    const b = e.target.closest('.chip');
    if (!b) return;
    setChecked(container, b.dataset.value);
    onPick(b.dataset.value);
  });
}

const setChecked = (container, value) => {
  for (const c of container.querySelectorAll('.chip')) c.setAttribute('aria-checked', String(c.dataset.value === value));
};

function setOrigin(origin) {
  state.origin = origin;
  updateStartButton();
}

// A starting point is only required when distance counts ("Keep it close").
// Otherwise it's optional and just adds walk times + directions.
function updateStartButton() {
  const needsOrigin = state.mode === 'quiz' && state.keepClose;
  const blocked = needsOrigin && !state.origin;
  $('btn-start').disabled = blocked;
  $('start-hint').hidden = !blocked;
  $('start-hint').textContent = 'Pick a starting point so we can keep it close.';
  $('origin-optional').hidden = needsOrigin;
}

function initStart() {
  chipGroup($('court-options'), DINING_COURTS.map((d) => [d.id, d.name]), (id) => {
    const d = DINING_COURTS.find((x) => x.id === id);
    setOrigin({ lat: d.lat, lng: d.lng, label: `${d.name} Dining Court`, kind: 'court' });
    const st = $('locate-status');
    st.textContent = `Leaving from ${d.name}.`;
    st.className = 'status ok';
  });

  chipGroup($('player-options'), [2, 3, 4, 5, 6].map((n) => [String(n), String(n)]), (v) => {
    state.playerCount = Number(v);
  }, '2');

  wireChips($('car-options'), (v) => { state.hasCar = v === 'yes'; });

  wireChips($('walk-options'), (v) => {
    state.keepClose = v === 'close';
    $('walk-hint').textContent = state.keepClose
      ? 'Closer spots win, especially when the weather is bad.'
      : "Distance won't count.";
    updateStartButton();
  });

  chipGroup($('size-options'), [3, 4, 5, 6].map((n) => [String(n), String(n)]), (v) => {
    state.wheelSize = Number(v);
  }, String(state.wheelSize));

  $('btn-locate').addEventListener('click', async () => {
    const btn = $('btn-locate');
    const st = $('locate-status');
    btn.disabled = true;
    st.className = 'status';
    st.textContent = 'Finding you…';
    const loc = await getLocation({ onRetry: () => { st.textContent = 'Still looking, trying GPS…'; } });
    btn.disabled = false;
    if (loc.ok) {
      setChecked($('court-options'), null);
      setOrigin({ lat: loc.lat, lng: loc.lng, label: 'your location', kind: 'gps' });
      st.className = 'status ok';
      st.textContent = `Using your location (±${loc.accuracy} m).`;
    } else {
      st.className = 'status warn';
      st.textContent = loc.reason;
      $('court-options').querySelector('.chip')?.focus();
    }
  });

  wireChips($('mode-options'), (v) => { state.mode = v; updateModeUI(); });
  updateModeUI();

  $('btn-start').addEventListener('click', () => {
    if ($('btn-start').disabled) return;
    if (state.mode === 'wild') { startWild(); return; }
    state.players = Array.from({ length: state.playerCount }, (_, i) => ({ name: `Player ${i + 1}`, answers: {} }));
    state.current = 0;
    showHandoff();
  });

  weatherPromise.then((w) => {
    weather = w;
    renderWeatherCard($('weather-card'), w);
  });
}

// ---------------------------------------------------------------------------
// Hand-off + quiz
// ---------------------------------------------------------------------------
function showHandoff() {
  const i = state.current;
  const n = state.players.length;
  $('handoff-kicker').textContent = `Player ${i + 1} of ${n}`;
  $('handoff-title').textContent = i === 0 ? "You're up first" : 'Pass the phone to the next person';
  const input = $('name-input');
  const existing = state.players[i].name;
  input.value = existing === `Player ${i + 1}` ? '' : existing; // keep the name if they came Back
  input.placeholder = `Player ${i + 1}`;
  show('screen-handoff');
}

$('name-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const name = $('name-input').value.trim();
  const p = state.players[state.current];
  p.name = name || `Player ${state.current + 1}`;
  p.answers = {};
  state.q = 0;
  $('name-input').blur();
  showQuestion();
});

function showQuestion() {
  const q = QUESTIONS[state.q];
  const p = state.players[state.current];
  $('q-who').textContent = `${p.name} · ${state.q + 1}/${QUESTIONS.length}`;
  $('q-text').textContent = q.text;

  const prog = $('q-progress');
  prog.innerHTML = '';
  QUESTIONS.forEach((_, i) => {
    const s = document.createElement('span');
    if (i <= state.q) s.className = 'done';
    prog.append(s);
  });

  const box = $('q-options');
  box.innerHTML = '';
  for (const [value, emoji, label] of q.options) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'option' + (p.answers[q.key] === value ? ' picked' : '');
    const em = document.createElement('span');
    em.className = 'emoji';
    em.setAttribute('aria-hidden', 'true');
    em.textContent = emoji;
    const tx = document.createElement('span');
    tx.textContent = label;
    b.append(em, tx);
    b.addEventListener('click', () => answer(q.key, value, b));
    box.append(b);
  }
  show('screen-question');
}

let answering = false;
function answer(key, value, btn) {
  if (answering) return; // ignore double taps during the short highlight
  answering = true;
  state.players[state.current].answers[key] = value;
  btn.classList.add('picked');
  setTimeout(() => {
    answering = false;
    if (state.q < QUESTIONS.length - 1) {
      state.q++;
      showQuestion();
    } else if (state.current < state.players.length - 1) {
      state.current++;
      showHandoff();
    } else {
      finishQuiz();
    }
  }, 180);
}

$('btn-back').addEventListener('click', () => {
  if (state.q > 0) { state.q--; showQuestion(); }
  else showHandoff();
});

// ---------------------------------------------------------------------------
// Scoring → wheel
// ---------------------------------------------------------------------------
async function finishQuiz() {
  if (!weather) weather = await weatherPromise;
  state.now = new Date();
  const { ranked } = rankSpots({
    players: state.players,
    spots: shuffle(SPOTS), // ranking is stable, so shuffling first breaks score ties randomly
    now: state.now,
    weather: weather.ok ? weather : null,
    origin: state.origin,
    hasCar: state.hasCar,
    keepClose: state.keepClose,
  });
  state.ranked = ranked;
  state.page = 0;
  state.rerollUsed = false;
  showWheel();
}

const wheelSize = () => (state.mode === 'wild' ? WILD_SLICES : state.wheelSize);

function updateModeUI() {
  const wild = state.mode === 'wild';
  setChecked($('mode-options'), state.mode);
  $('players-card').hidden = wild;
  updateStartButton();
  $('btn-start').textContent = wild ? '🎲 Spin the wild wheel' : "Let's go";
  $('hero-sub').textContent = wild
    ? 'Feeling lucky? Skip the quiz and let chaos pick.'
    : 'Pass the phone around, answer six taps each, and let the wheel decide.';
}

async function startWild() {
  if (!weather) weather = await weatherPromise;
  state.now = new Date();
  state.ranked = buildWildPool({ spots: SPOTS, now: state.now, origin: state.origin, hasCar: state.hasCar });
  state.page = 0;
  state.rerollUsed = false;
  showWheel();
}

function showWheel() {
  const wild = state.mode === 'wild';
  state.candidates = wheelPage(state.ranked, state.page, wheelSize());
  const c = state.candidates;

  if (c.length === 0) {
    $('none-text').textContent = state.page === 0
      ? 'No spots are available right now. Try WALC, which is 24/7 with a PUID swipe.'
      : 'There are no other open spots left to try.';
    show('screen-none');
    return;
  }
  if (c.length === 1) {
    showResult(c[0], 'Only one spot works right now, so no spin needed.');
    return;
  }

  const shares = wild ? c.map(() => 1 / c.length) : wheelShares(c.map((e) => e.score));
  const labels = c.map((e) => e.spot.shortName || e.spot.name);
  wheel = createWheel($('wheel'), labels, shares);

  $('wheel-title').textContent = wild
    ? (state.page === 0 ? 'The wild wheel 🎲' : 'Wild wheel, round 2 🎲')
    : (state.page === 0 ? `Your top ${c.length}` : `The next ${c.length}`);
  $('wheel-sub').textContent = wild ? 'No quiz, no logic. Every slice has the same odds.' : 'Bigger slice = better fit for the group.';
  const legend = $('wheel-legend');
  legend.innerHTML = '';
  c.forEach((e, i) => {
    const li = document.createElement('li');
    const sw = document.createElement('span');
    sw.className = 'swatch';
    sw.style.background = `var(${SLICE_VARS[i]})`;
    const name = document.createElement('span');
    name.textContent = e.spot.name;
    const pct = document.createElement('span');
    pct.className = 'pct';
    pct.textContent = `${Math.round(shares[i] * 100)}%`;
    li.append(sw, name, pct);
    legend.append(li);
  });

  $('btn-spin').disabled = false;
  $('btn-spin').textContent = 'Spin!';
  show('screen-wheel');
}

$('btn-spin').addEventListener('click', async () => {
  if (spinning || !wheel) return;
  spinning = true;
  $('btn-spin').disabled = true;
  $('btn-spin').textContent = 'Spinning…';
  const idx = await wheel.spin();
  spinning = false;
  setTimeout(() => showResult(state.candidates[idx]), 500);
});

// ---------------------------------------------------------------------------
// Result
// ---------------------------------------------------------------------------
function mapsUrl(spot) {
  if (spot.requiresCar) {
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(spot.mapsQuery)}`;
  }
  const o = state.origin;
  if (!o) return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(spot.mapsQuery)}`;
  const params = new URLSearchParams({
    api: '1',
    origin: `${o.lat},${o.lng}`,
    destination: spot.mapsQuery,
    travelmode: 'walking',
  });
  return `https://www.google.com/maps/dir/?${params}`;
}

function showResult(entry, note) {
  const { spot } = entry;
  $('result-name').textContent = spot.name;
  $('result-vibe').textContent = spot.vibe;
  const wx = weather?.ok ? weather : null;
  const why = entry.wild ? wildLine(entry, wx) : whyLine(entry, wx, { hasCar: state.hasCar });
  $('result-why').textContent = note ? `${note} ${why}` : why;

  const facts = $('result-facts');
  facts.innerHTML = '';
  const fact = (t) => { const li = document.createElement('li'); li.textContent = t; facts.append(li); };
  if (entry.walkMin != null) {
    fact(spot.requiresCar ? `~${entry.walkMin} min walk · short drive` : `~${entry.walkMin} min walk from ${state.origin.label}`);
  }
  for (const r of entry.activeRules) fact(`Heads up: ${r.why}`);

  const hu = $('result-heads-up');
  if (entry.miserableCount > 0) {
    const names = entry.miserableNames;
    const who = names.length === 1 ? names[0] : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`;
    hu.textContent = `Heads up: ${who} might not love this one. It was the least-bad option.`;
    hu.hidden = false;
  } else {
    hu.hidden = true;
  }

  $('result-maps').href = mapsUrl(spot);

  // Reroll
  const canNext = wheelPage(state.ranked, state.page + 1, wheelSize()).length > 0;
  const canRespin = state.candidates.length >= 2;
  $('btn-respin').disabled = state.rerollUsed || !canRespin;
  $('btn-next3').disabled = state.rerollUsed || !canNext;
  $('reroll-box').querySelector('.hint').textContent = state.rerollUsed
    ? 'Reroll used. This is the one!'
    : 'You get one reroll.';

  // Transparency: how every open spot scored (not meaningful in wild mode)
  $('result-ranking').closest('details').hidden = !!entry.wild;
  const ol = $('result-ranking');
  ol.innerHTML = '';
  for (const e of state.ranked.slice(0, 8)) {
    const li = document.createElement('li');
    li.textContent = e.spot.name + ' ';
    const meta = document.createElement('span');
    meta.className = 'meta';
    const bits = [`score ${e.score.toFixed(1)}`];
    if (e.miserableCount) bits.push(`${e.miserableCount} unhappy`);
    if (e.walkMin != null && !e.spot.requiresCar) bits.push(`${e.walkMin} min`);
    meta.textContent = `(${bits.join(', ')})`;
    li.append(meta);
    ol.append(li);
  }

  show('screen-result');
}

$('btn-respin').addEventListener('click', () => {
  if (state.rerollUsed) return;
  state.rerollUsed = true;
  showWheel();
});

$('btn-next3').addEventListener('click', () => {
  if (state.rerollUsed) return;
  state.rerollUsed = true;
  state.page += 1;
  showWheel();
});

function restart() {
  const keepOrigin = state.origin;
  const keepCount = state.playerCount;
  const keepCar = state.hasCar;
  const keepMode = state.mode;
  const keepClose = state.keepClose;
  const keepSize = state.wheelSize;
  state = fresh();
  state.mode = keepMode;
  state.keepClose = keepClose;
  state.wheelSize = keepSize;
  // Keep the start-screen choices: it's usually the same group.
  state.origin = keepOrigin;
  state.playerCount = keepCount;
  state.hasCar = keepCar;
  setOrigin(keepOrigin);
  show('screen-start');
}

$('btn-restart').addEventListener('click', restart);
for (const b of document.querySelectorAll('.js-restart')) b.addEventListener('click', restart);

initStart();
