// Screen state machine: start → hand-off → quiz → … → wheel → result.
// UI only: all scoring lives in scoring.js / wild.js.
import { SPOTS, DINING_COURTS } from './spots.js';
import { rankSpots, whyLine, wheelPage } from './scoring.js';
import { getLocation } from './geo.js';
import { hoursToday } from './hours.js';
import { fetchWeather } from './weather.js';
import { renderWeatherCard } from './weather-card.js';
import { createWheel, wheelShares, sound } from './wheel.js';
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
    ['yes', '☕', 'Yes please'], ['any', '🤷', "Don't care"] ] },
];

// `python3 -m http.server` prints http://[::]:8000, which browsers don't treat as
// secure, so geolocation is blocked. Hop over to localhost instead.
if (['[::]', '0.0.0.0'].includes(location.hostname)) {
  location.replace(`${location.protocol}//localhost${location.port ? ':' + location.port : ''}${location.pathname}${location.search}`);
}

const $ = (id) => document.getElementById(id);
/** addEventListener that never crashes startup if an element is missing. */
const on = (id, evt, fn) => {
  const node = $(id);
  if (node) node.addEventListener(evt, fn);
  else console.warn(`[spot-picker] missing #${id}`);
};
const SLICE_VARS = ['--slice-1', '--slice-2', '--slice-3', '--slice-4', '--slice-5', '--slice-6'];
const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

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

/** Show one screen, sliding in from the right (forward) or left (back). */
function show(screenId, dir = 'fwd') {
  for (const s of document.querySelectorAll('.screen')) {
    s.hidden = s.id !== screenId;
    s.classList.remove('slide-fwd', 'slide-back');
  }
  const target = $(screenId);
  void target.offsetWidth; // restart the slide animation
  target.classList.add(dir === 'back' ? 'slide-back' : 'slide-fwd');
  window.scrollTo(0, 0);
  target.querySelector('h1')?.focus({ preventScroll: true });
  if (screenId === 'screen-start') requestAnimationFrame(syncAllThumbs);
}

// ---------------------------------------------------------------------------
// Segmented controls (sliding gold thumb) + chips
// ---------------------------------------------------------------------------
function syncThumb(container) {
  const thumb = container?.querySelector('.seg-thumb');
  const btn = container?.querySelector('.chip[aria-checked="true"]');
  if (!thumb) return;
  if (!btn || !btn.offsetWidth) { thumb.style.width = '0'; return; }
  thumb.style.width = `${btn.offsetWidth}px`;
  thumb.style.height = `${btn.offsetHeight}px`;
  thumb.style.transform = `translate(${btn.offsetLeft}px, ${btn.offsetTop}px)`;
}
const syncAllThumbs = () => document.querySelectorAll('.seg').forEach(syncThumb);
window.addEventListener('resize', syncAllThumbs);
document.fonts?.ready.then(syncAllThumbs);

function chipGroup(container, items, onPick, selected) {
  if (!container) return;
  container.innerHTML = '';
  if (container.classList.contains('seg')) {
    const thumb = document.createElement('span');
    thumb.className = 'seg-thumb';
    thumb.setAttribute('aria-hidden', 'true');
    container.append(thumb);
  }
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
  if (!container) return;
  container.addEventListener('click', (e) => {
    const b = e.target.closest('.chip');
    if (!b) return;
    setChecked(container, b.dataset.value);
    onPick(b.dataset.value);
  });
}

function setChecked(container, value) {
  if (!container) return;
  for (const c of container.querySelectorAll('.chip')) c.setAttribute('aria-checked', String(c.dataset.value === value));
  syncThumb(container);
}

// ---------------------------------------------------------------------------
// Start screen
// ---------------------------------------------------------------------------
function setOrigin(origin) {
  state.origin = origin;
  updateStartButton();
}

const needsOrigin = () => state.mode === 'quiz' && state.keepClose;
const startBlocked = () => needsOrigin() && !state.origin;

// The location question only appears (and is required) with "Keep it close".
function updateStartButton() {
  const btn = $('btn-start');
  const hint = $('start-hint');
  const section = $('origin-section');
  if (btn) btn.setAttribute('aria-disabled', String(startBlocked()));
  if (hint) {
    hint.hidden = !startBlocked();
    hint.textContent = 'Pick a starting point so we can keep it close.';
  }
  if (section) {
    const open = needsOrigin();
    section.classList.toggle('open', open);
    section.setAttribute('aria-hidden', String(!open));
    section.inert = !open;
  }
}

function updateModeUI() {
  const wild = state.mode === 'wild';
  setChecked($('mode-options'), state.mode);
  const card = $('players-card');
  if (card) card.hidden = wild;
  updateStartButton();
  if ($('btn-start')) $('btn-start').textContent = wild ? 'Spin the wild wheel' : "Let's play";
  if ($('hero-sub')) {
    $('hero-sub').textContent = wild
      ? 'Feeling lucky? Skip the quiz and let chaos pick.'
      : 'Pass the phone around, answer six taps each, and let the wheel decide.';
  }
  requestAnimationFrame(syncAllThumbs);
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
  }, String(state.playerCount));

  wireChips($('car-options'), (v) => { state.hasCar = v === 'yes'; });

  wireChips($('walk-options'), (v) => {
    state.keepClose = v === 'close';
    const hint = $('walk-hint');
    if (hint) {
      hint.textContent = state.keepClose
        ? 'Closer spots win, especially when the weather is bad.'
        : "Distance won't count.";
    }
    updateStartButton();
  });

  chipGroup($('size-options'), [3, 4, 5, 6].map((n) => [String(n), String(n)]), (v) => {
    state.wheelSize = Number(v);
  }, String(state.wheelSize));

  on('btn-locate', 'click', async () => {
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
      $('court-options')?.querySelector('.chip')?.focus();
    }
  });

  wireChips($('mode-options'), (v) => { state.mode = v; updateModeUI(); });

  on('btn-start', 'click', () => {
    if (startBlocked()) {
      // Not ready: shake the button and point at what's missing.
      const btn = $('btn-start');
      btn.classList.remove('shake'); void btn.offsetWidth; btn.classList.add('shake');
      const box = document.querySelector('.origin-box');
      if (box) {
        box.classList.remove('flash'); void box.offsetWidth; box.classList.add('flash');
        box.scrollIntoView({ behavior: reducedMotion() ? 'auto' : 'smooth', block: 'center' });
      }
      return;
    }
    if (state.mode === 'wild') { startWild(); return; }
    state.players = Array.from({ length: state.playerCount }, (_, i) => ({ name: `Player ${i + 1}`, answers: {} }));
    state.current = 0;
    showHandoff();
  });

  updateModeUI();

  weatherPromise.then((w) => {
    weather = w;
    const card = $('weather-card');
    if (card) renderWeatherCard(card, w);
  });
}

// ---------------------------------------------------------------------------
// Hand-off + quiz
// ---------------------------------------------------------------------------
function showHandoff(dir = 'fwd') {
  const i = state.current;
  const n = state.players.length;
  $('handoff-kicker').textContent = `Player ${i + 1} of ${n}`;
  $('handoff-title').textContent = i === 0 ? "You're up first" : 'Pass the phone!';
  const input = $('name-input');
  const existing = state.players[i].name;
  input.value = existing === `Player ${i + 1}` ? '' : existing; // keep the name if they came Back
  input.placeholder = `Player ${i + 1}`;
  show('screen-handoff', dir);
}

on('name-form', 'submit', (e) => {
  e.preventDefault();
  const name = $('name-input').value.trim();
  const p = state.players[state.current];
  p.name = name || `Player ${state.current + 1}`;
  p.answers = {};
  state.q = 0;
  $('name-input').blur();
  showQuestion();
});

function showQuestion(dir = 'fwd') {
  const q = QUESTIONS[state.q];
  const p = state.players[state.current];
  $('q-who').textContent = `${p.name} · ${state.q + 1}/${QUESTIONS.length}`;
  const qt = $('q-text');
  qt.textContent = q.text;
  qt.classList.remove('swap'); void qt.offsetWidth; qt.classList.add('swap');

  const prog = $('q-progress');
  // Reuse the bars so the fill animates from the previous question.
  if (prog.children.length !== QUESTIONS.length) {
    prog.innerHTML = '';
    QUESTIONS.forEach(() => prog.append(document.createElement('span')));
  }
  [...prog.children].forEach((s, i) => s.classList.toggle('done', i <= state.q));

  const box = $('q-options');
  box.innerHTML = '';
  q.options.forEach(([value, emoji, label], i) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'option' + (p.answers[q.key] === value ? ' picked' : '');
    b.style.setProperty('--i', i);
    const em = document.createElement('span');
    em.className = 'emoji';
    em.setAttribute('aria-hidden', 'true');
    em.textContent = emoji;
    const tx = document.createElement('span');
    tx.textContent = label;
    const check = document.createElement('span');
    check.className = 'check';
    check.setAttribute('aria-hidden', 'true');
    check.textContent = '✓';
    b.append(em, tx, check);
    b.addEventListener('click', () => answer(q.key, value, b));
    box.append(b);
  });

  // Only slide the whole screen when arriving from somewhere else.
  if ($('screen-question').hidden) show('screen-question', dir);
  else { window.scrollTo(0, 0); qt.focus({ preventScroll: true }); }
}

let answering = false;
function answer(key, value, btn) {
  if (answering) return; // ignore double taps during the highlight
  answering = true;
  state.players[state.current].answers[key] = value;
  for (const o of document.querySelectorAll('#q-options .option')) o.classList.toggle('picked', o === btn);
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
  }, 320);
}

on('btn-back', 'click', () => {
  if (state.q > 0) { state.q--; showQuestion('back'); }
  else showHandoff('back');
});

/** Jump back to a player's last question (their answers are kept). */
function backToLastQuestion(playerIndex) {
  state.current = playerIndex;
  state.q = QUESTIONS.length - 1;
  showQuestion('back');
}

// Pass-the-phone screen: player 1 → start screen; others → previous player's last question.
on('btn-handoff-back', 'click', () => {
  if (state.current === 0) show('screen-start', 'back');
  else backToLastQuestion(state.current - 1);
});

// Wheel: quiz → last player's last question; wild → start screen. Not mid-spin.
on('btn-wheel-back', 'click', () => {
  if (spinning) return;
  if (state.mode === 'wild' || !state.players.length) show('screen-start', 'back');
  else backToLastQuestion(state.players.length - 1);
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
    ? (state.page === 0 ? 'The wild wheel' : 'Wild wheel · round 2')
    : (state.page === 0 ? `Your top ${c.length}` : `The next ${c.length}`);
  $('wheel-sub').textContent = wild ? 'No quiz, no logic. Every slice has the same odds.' : 'Bigger slice = better fit for the group.';
  const legend = $('wheel-legend');
  legend.innerHTML = '';
  c.forEach((e, i) => {
    const li = document.createElement('li');
    li.style.setProperty('--i', i);
    const sw = document.createElement('span');
    sw.className = 'swatch';
    sw.style.background = `var(${SLICE_VARS[i % SLICE_VARS.length]})`;
    const name = document.createElement('span');
    name.textContent = e.spot.name;
    const pct = document.createElement('span');
    pct.className = 'pct';
    pct.textContent = `${Math.round(shares[i] * 100)}%`;
    li.append(sw, name, pct);
    legend.append(li);
  });

  $('btn-spin').disabled = false;
  if ($('btn-wheel-back')) $('btn-wheel-back').disabled = false;
  $('btn-spin').textContent = 'Spin the wheel';
  syncSoundButton();
  show('screen-wheel');
}

on('btn-spin', 'click', async () => {
  if (spinning || !wheel) return;
  spinning = true;
  $('btn-spin').disabled = true;
  if ($('btn-wheel-back')) $('btn-wheel-back').disabled = true;
  $('btn-spin').textContent = 'Spinning…';
  $('wheel').scrollIntoView({ behavior: reducedMotion() ? 'auto' : 'smooth', block: 'center' });
  const idx = await wheel.spin();
  spinning = false;
  $('btn-spin').textContent = 'We have a winner!';
  setTimeout(() => showResult(state.candidates[idx]), 1100);
});

function syncSoundButton() {
  const b = $('btn-sound');
  if (!b) return;
  b.textContent = sound.on ? '🔊' : '🔇';
  b.setAttribute('aria-pressed', String(sound.on));
  b.setAttribute('aria-label', sound.on ? 'Sound on' : 'Sound off');
}
on('btn-sound', 'click', () => { sound.on = !sound.on; syncSoundButton(); });

// ---------------------------------------------------------------------------
// Result: dramatic reveal + confetti
// ---------------------------------------------------------------------------
function confetti() {
  const box = $('confetti');
  if (!box || reducedMotion()) return;
  const colors = ['#cfb991', '#daaa00', '#ebd99f', '#8e6f3e', '#ffffff', '#ddb945'];
  const frag = document.createDocumentFragment();
  for (let i = 0; i < 110; i++) {
    const p = document.createElement('i');
    p.style.left = `${Math.random() * 100}%`;
    p.style.background = colors[i % colors.length];
    p.style.setProperty('--dx', `${(Math.random() - 0.5) * 160}px`);
    p.style.setProperty('--r', `${(Math.random() - 0.5) * 1080}deg`);
    p.style.setProperty('--t', `${2 + Math.random() * 1.6}s`);
    p.style.setProperty('--d', `${Math.random() * 0.35}s`);
    if (i % 3 === 0) { p.style.width = '7px'; p.style.height = '7px'; p.style.borderRadius = '50%'; }
    frag.append(p);
  }
  box.append(frag);
  setTimeout(() => { box.innerHTML = ''; }, 4200);
}

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
  if (entry.walkMin != null && state.origin) {
    fact(spot.requiresCar ? `~${entry.walkMin} min walk · short drive` : `~${entry.walkMin} min walk from ${state.origin.label}`);
  }
  const hrs = hoursToday(spot, state.now ?? new Date());
  if (hrs) fact(`🕘 ${hrs}`);
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
    if (e.walkMin != null && !e.spot.requiresCar && state.origin) bits.push(`${e.walkMin} min`);
    meta.textContent = `(${bits.join(', ')})`;
    li.append(meta);
    ol.append(li);
  }

  show('screen-result');
  setTimeout(confetti, 550); // in time with the name reveal
}

on('btn-respin', 'click', () => {
  if (state.rerollUsed) return;
  state.rerollUsed = true;
  showWheel();
});

on('btn-next3', 'click', () => {
  if (state.rerollUsed) return;
  state.rerollUsed = true;
  state.page += 1;
  showWheel();
});

function restart() {
  const keep = (({ origin, playerCount, hasCar, mode, keepClose, wheelSize }) => ({ origin, playerCount, hasCar, mode, keepClose, wheelSize }))(state);
  // Keep the start-screen choices: it's usually the same group.
  state = { ...fresh(), ...keep };
  setOrigin(keep.origin);
  show('screen-start', 'back');
}

// Opening page → start screen
on('btn-intro', 'click', () => show('screen-start'));

on('btn-restart', 'click', restart);
for (const b of document.querySelectorAll('.js-restart')) b.addEventListener('click', restart);

initStart();
