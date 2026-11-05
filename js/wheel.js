// Weighted spinning wheel. Pure math (wheelShares, pickIndex, targetRotation)
// plus a small SVG renderer/animator.
import { CONFIG } from './spots.js';

/**
 * Turn scores into slice shares: shift so the worst is > 0, normalize, then
 * clamp each share to [lo, hi] (water-filling, so shares still sum to 1).
 */
export function wheelShares(scores, lo = CONFIG.WHEEL_MIN_SHARE, hi = CONFIG.WHEEL_MAX_SHARE) {
  const n = scores.length;
  if (n === 0) return [];
  if (n === 1) return [1];
  const min = Math.min(...scores);
  const max = Math.max(...scores);
  const floor = 1 + 0.2 * (max - min);
  // With more slices, let the smallest ones shrink a bit so the best fit still stands out.
  lo = Math.min(lo, 0.6 / n);
  const w = scores.map((s) => s - min + floor);

  // Infeasible limits (e.g. 2 slices with hi < 0.5) → relax them.
  if (n * hi < 1) hi = 1 / n;
  if (n * lo > 1) lo = 1 / n;

  const locked = new Array(n).fill(null);
  for (let iter = 0; iter < n + 1; iter++) {
    const free = locked.map((v, i) => (v == null ? i : -1)).filter((i) => i >= 0);
    const remaining = 1 - locked.reduce((s, v) => s + (v ?? 0), 0);
    const freeW = free.reduce((s, i) => s + w[i], 0);
    const prov = free.map((i) => [i, (w[i] / freeW) * remaining]);
    const over = prov.filter(([, v]) => v > hi);
    const under = prov.filter(([, v]) => v < lo);
    if (!over.length && !under.length) {
      for (const [i, v] of prov) locked[i] = v;
      break;
    }
    // Lock the violators at the limit and redistribute among the rest.
    for (const [i] of over) locked[i] = hi;
    if (!over.length) for (const [i] of under) locked[i] = lo;
  }
  return locked;
}

/** Weighted random index. `rand` is injectable for tests. */
export function pickIndex(shares, rand = Math.random) {
  let r = rand();
  for (let i = 0; i < shares.length; i++) {
    r -= shares[i];
    if (r < 0) return i;
  }
  return shares.length - 1;
}

/** Slice i spans [starts[i], starts[i] + shares[i]*360) degrees, clockwise from the top. */
export function sliceAngles(shares) {
  let acc = 0;
  return shares.map((s) => {
    const start = acc;
    acc += s * 360;
    return { start, end: acc, mid: (start + acc) / 2 };
  });
}

/**
 * Rotation (degrees, clockwise) that lands the top pointer inside slice `idx`.
 * Picks a random spot in the inner 70% of the slice so it never lands on an edge.
 */
export function targetRotation(currentRotation, shares, idx, { spins = 5, rand = Math.random } = {}) {
  const a = sliceAngles(shares)[idx];
  const width = a.end - a.start;
  const target = a.start + width * (0.15 + 0.7 * rand());
  // The pointer reads wheel angle (-rotation mod 360), so we need rotation ≡ -target.
  const currentMod = ((currentRotation % 360) + 360) % 360;
  const desiredMod = (360 - target) % 360;
  const delta = (desiredMod - currentMod + 360) % 360;
  return currentRotation + spins * 360 + delta;
}

// ---------------------------------------------------------------------------
// DOM: game-show wheel with marquee bulbs, pegs, a ticking pointer,
// and a JS-driven ease-out spin (so ticks slow down naturally).
// ---------------------------------------------------------------------------
const SVG_NS = 'http://www.w3.org/2000/svg';
const C = 120;          // center (viewBox 0 0 240 240)
const R = 100;          // slice radius
const RIM = 112;        // outer rim radius
const PEGS = 24;        // pointer ticks once per peg
const BULBS = 28;

const el = (tag, attrs = {}) => {
  const n = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
  return n;
};
const pt = (deg, r) => {
  const t = (deg * Math.PI) / 180;
  return [C + r * Math.sin(t), C - r * Math.cos(t)];
};
function slicePath(start, end) {
  if (end - start >= 359.999) return `M ${C} ${C - R} A ${R} ${R} 0 1 1 ${C - 0.01} ${C - R} Z`;
  const [x1, y1] = pt(start, R);
  const [x2, y2] = pt(end, R);
  const large = end - start > 180 ? 1 : 0;
  return `M ${C} ${C} L ${x1} ${y1} A ${R} ${R} 0 ${large} 1 ${x2} ${y2} Z`;
}
const easeOutQuart = (t) => 1 - (1 - t) ** 4;

// --- Sound: a tiny synthesized "tick" (no audio files) ---
let audioCtx = null;
let soundOn = true;
try { soundOn = localStorage.getItem('ssp-sound') !== 'off'; } catch { /* storage blocked */ }
export const sound = {
  get on() { return soundOn; },
  set on(v) { soundOn = v; try { localStorage.setItem('ssp-sound', v ? 'on' : 'off'); } catch { /* ignore */ } },
};
function tickSound(pitch = 1) {
  if (!soundOn) return;
  try {
    audioCtx ??= new (window.AudioContext || window.webkitAudioContext)();
    const t = audioCtx.currentTime;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'square';
    osc.frequency.setValueAtTime(1400 * pitch, t);
    gain.gain.setValueAtTime(0.05, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.03);
    osc.connect(gain).connect(audioCtx.destination);
    osc.start(t);
    osc.stop(t + 0.035);
  } catch { /* audio unavailable */ }
}
function dingSound() {
  if (!soundOn) return;
  [0, 0.12, 0.24].forEach((d, i) => setTimeout(() => tickSound(1.6 + i * 0.35), d * 1000));
}

/** Render a wheel into `container`. Returns { spin(): Promise<index> }. */
export function createWheel(container, labels, shares) {
  container.innerHTML = '';
  container.className = 'wheel idle';

  const svg = el('svg', { viewBox: '0 0 240 240', class: 'wheel-svg', role: 'img', 'aria-label': `Wheel with ${labels.join(', ')}` });
  const defs = el('defs');
  defs.innerHTML = `<radialGradient id="hubGrad" cx="40%" cy="35%" r="70%"><stop offset="0%" stop-color="#fff3c4"/><stop offset="55%" stop-color="#cfb991"/><stop offset="100%" stop-color="#8e6f3e"/></radialGradient>`;
  svg.append(defs);

  // Rim with marquee bulbs
  svg.append(el('circle', { cx: C, cy: C, r: RIM + 6, class: 'wheel-rim' }));
  for (let i = 0; i < BULBS; i++) {
    const [x, y] = pt((i * 360) / BULBS, RIM);
    const b = el('circle', { cx: x, cy: y, r: 3.2, class: 'wheel-bulb' });
    b.style.setProperty('--b', i % 2 ? 1 : 0);
    svg.append(b);
  }
  svg.append(el('circle', { cx: C, cy: C, r: R + 3, class: 'wheel-rim-inner' }));

  // Rotor: slices, labels, pegs
  const rotor = el('g', { class: 'wheel-rotor' });
  const sliceEls = [];
  sliceAngles(shares).forEach((a, i) => {
    const n = (i % 6) + 1;
    const path = el('path', { d: slicePath(a.start, a.end), class: 'wheel-slice', fill: `var(--slice-${n})` });
    sliceEls.push(path);
    rotor.append(path);

    // Label runs along the radius; flipped on the left half so it's never upside down.
    // Fit the label between the hub (r≈26) and the pegs (r≈92).
    const label = labels[i].toUpperCase();
    const shown = label.length > 15 ? label.slice(0, 14) + '…' : label;
    const fontSize = Math.min(13, 64 / (shown.length * 0.42));
    const [tx, ty] = pt(a.mid, 59);
    const angle = a.mid > 180 ? a.mid + 90 : a.mid - 90;
    const text = el('text', {
      x: tx, y: ty, class: 'wheel-label', fill: `var(--slice-${n}-text)`, 'font-size': fontSize.toFixed(1),
      'text-anchor': 'middle', 'dominant-baseline': 'middle', transform: `rotate(${angle} ${tx} ${ty})`,
    });
    text.textContent = shown;
    rotor.append(text);
  });
  for (let i = 0; i < PEGS; i++) {
    const [x, y] = pt((i * 360) / PEGS, R - 4);
    rotor.append(el('circle', { cx: x, cy: y, r: 2.1, class: 'wheel-peg' }));
  }
  svg.append(rotor);

  // Hub
  svg.append(el('circle', { cx: C, cy: C, r: 20, class: 'wheel-hub' }));
  const hubText = el('text', { x: C, y: C + 1, class: 'wheel-hub-text', 'text-anchor': 'middle', 'dominant-baseline': 'middle' });
  hubText.textContent = 'SPIN';
  svg.append(hubText);

  // Pointer (a gold flapper at 12 o'clock)
  const pointer = document.createElement('div');
  pointer.className = 'wheel-pointer';
  pointer.setAttribute('aria-hidden', 'true');
  pointer.innerHTML = `<svg viewBox="0 0 40 54"><defs><linearGradient id="ptrGrad" x1="0" x2="1"><stop offset="0" stop-color="#8e6f3e"/><stop offset=".5" stop-color="#fff3c4"/><stop offset="1" stop-color="#cfb991"/></linearGradient></defs>
    <path d="M20 52 L6 16 A14 14 0 1 1 34 16 Z" fill="url(#ptrGrad)" stroke="#3a2c14" stroke-width="1.5"/><circle cx="20" cy="13" r="5" fill="#0b0b0b"/></svg>`;

  container.append(pointer, svg);

  let rotation = 0;
  const setRotation = (deg) => rotor.setAttribute('transform', `rotate(${deg} ${C} ${C})`);
  setRotation(0);

  const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

  const tick = () => {
    pointer.classList.remove('tick');
    void pointer.offsetWidth; // restart the animation
    pointer.classList.add('tick');
    tickSound();
  };

  return {
    spin() {
      const idx = pickIndex(shares);
      const from = rotation;
      const to = targetRotation(rotation, shares, idx, { spins: reduced ? 1 : 6 });
      const duration = reduced ? 1200 : 5600;
      container.classList.remove('idle', 'landed');
      container.classList.add('spinning');
      sliceEls.forEach((s) => s.classList.remove('winner'));

      return new Promise((resolve) => {
        const t0 = performance.now();
        // Which peg is under the pointer: pointer reads wheel angle (-rotation mod 360).
        const pegAt = (deg) => Math.floor((((-deg % 360) + 360) % 360) / (360 / PEGS));
        let lastPeg = pegAt(from);
        const frame = (now) => {
          const t = Math.min(1, (now - t0) / duration);
          rotation = from + (to - from) * easeOutQuart(t);
          setRotation(rotation);
          const peg = pegAt(rotation);
          if (peg !== lastPeg) { lastPeg = peg; tick(); }
          if (t < 1) { requestAnimationFrame(frame); return; }
          container.classList.remove('spinning');
          container.classList.add('landed');
          sliceEls[idx].classList.add('winner');
          dingSound();
          try { navigator.vibrate?.([30, 40, 60]); } catch { /* not supported */ }
          resolve(idx);
        };
        requestAnimationFrame(frame);
      });
    },
  };
}
