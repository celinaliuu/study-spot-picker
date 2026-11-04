// Screen state machine: start → hand-off → quiz → … → wheel → result.
import { SPOTS, DINING_COURTS } from './spots.js';
import { rankSpots, whyLine } from './scoring.js';
import { getLocation } from './geo.js';
import { fetchWeather } from './weather.js';
import { renderWeatherCard } from './weather-card.js';
import { createWheel, wheelShares } from './wheel.js';

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

const $ = (id) => document.getElementById(id);
const SLICE_VARS = ['--slice-1', '--slice-2', '--slice-3', '--slice-4'];

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------
const weatherPromise = fetchWeather();
let weather = null;

const fresh = () => ({
  origin: null,          // { lat, lng, label, kind: 'gps' | 'court' }
  playerCount: 2,
  hasCar: false,
  players: [],           // [{ name, answers }]
  current: 0,            // player index
  q: 0,                  // question index
  ranked: [],
  offset: 0,             // 0 = top 3, 3 = next 3
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
  $('btn-start').disabled = !origin;
  $('start-hint').hidden = !!origin;
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

  $('btn-locate').addEventListener('click', async () => {
    const btn = $('btn-locate');
    const st = $('locate-status');
    btn.disabled = true;
    st.className = 'status';
    st.textContent = 'Finding you…';
    const loc = await getLocation();
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

  $('btn-start').addEventListener('click', () => {
    if (!state.origin) return;
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
    spots: SPOTS,
    now: state.now,
    weather: weather.ok ? weather : null,
    origin: state.origin,
    hasCar: state.hasCar,
  });
  state.ranked = ranked;
  state.offset = 0;
  state.rerollUsed = false;
  showWheel();
}

function showWheel() {
  state.candidates = state.ranked.slice(state.offset, state.offset + 3);
  const c = state.candidates;

  if (c.length === 0) {
    $('none-text').textContent = state.offset === 0
      ? 'No spots are available right now. Try WALC, which is 24/7 with a PUID swipe.'
      : 'There are no other open spots left to try.';
    show('screen-none');
    return;
  }
  if (c.length === 1) {
    showResult(c[0], 'Only one spot works right now, so no spin needed.');
    return;
  }

  const shares = wheelShares(c.map((e) => e.score));
  const labels = c.map((e) => e.spot.shortName || e.spot.name);
  wheel = createWheel($('wheel'), labels, shares);

  $('wheel-title').textContent = state.offset === 0 ? `Your top ${c.length}` : `The next ${c.length}`;
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
  $('result-why').textContent = note ? `${note} ${whyLine(entry, weather?.ok ? weather : null, { hasCar: state.hasCar })}` : whyLine(entry, weather?.ok ? weather : null, { hasCar: state.hasCar });

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
  const canNext = state.ranked.length > 3 && state.offset === 0;
  const canRespin = state.candidates.length >= 2;
  $('btn-respin').disabled = state.rerollUsed || !canRespin;
  $('btn-next3').disabled = state.rerollUsed || !canNext;
  $('reroll-box').querySelector('.hint').textContent = state.rerollUsed
    ? 'Reroll used. This is the one!'
    : 'You get one reroll.';

  // Transparency: how every open spot scored
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
  state.offset = 3;
  showWheel();
});

function restart() {
  const keepOrigin = state.origin;
  const keepCount = state.playerCount;
  const keepCar = state.hasCar;
  state = fresh();
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
