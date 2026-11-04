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
// DOM
// ---------------------------------------------------------------------------
const SVG_NS = 'http://www.w3.org/2000/svg';
const COLORS = ['var(--slice-1)', 'var(--slice-2)', 'var(--slice-3)', 'var(--slice-4)', 'var(--slice-5)', 'var(--slice-6)'];
const C = 100;
const R = 96;

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

/** Render a wheel into `container`. Returns { spin(): Promise<index> }. */
export function createWheel(container, labels, shares) {
  container.innerHTML = '';
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 200 200');
  svg.setAttribute('class', 'wheel-svg');
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', `Wheel with ${labels.join(', ')}`);

  const g = document.createElementNS(SVG_NS, 'g');
  g.setAttribute('class', 'wheel-rotor');

  sliceAngles(shares).forEach((a, i) => {
    const path = document.createElementNS(SVG_NS, 'path');
    path.setAttribute('d', slicePath(a.start, a.end));
    path.setAttribute('fill', COLORS[i % COLORS.length]);
    path.setAttribute('class', 'wheel-slice');
    g.appendChild(path);

    // Label runs along the radius; flipped on the left half so it's never upside down.
    const text = document.createElementNS(SVG_NS, 'text');
    const [tx, ty] = pt(a.mid, R * 0.55);
    const angle = a.mid > 180 ? a.mid + 90 : a.mid - 90;
    text.setAttribute('x', tx);
    text.setAttribute('y', ty);
    text.setAttribute('class', 'wheel-label');
    text.setAttribute('text-anchor', 'middle');
    text.setAttribute('dominant-baseline', 'middle');
    text.setAttribute('transform', `rotate(${angle} ${tx} ${ty})`);
    const label = labels[i];
    text.textContent = label.length > 15 ? label.slice(0, 14) + '…' : label;
    g.appendChild(text);
  });

  const hub = document.createElementNS(SVG_NS, 'circle');
  hub.setAttribute('cx', C);
  hub.setAttribute('cy', C);
  hub.setAttribute('r', 9);
  hub.setAttribute('class', 'wheel-hub');

  svg.append(g, hub);
  const pointer = document.createElement('div');
  pointer.className = 'wheel-pointer';
  pointer.setAttribute('aria-hidden', 'true');
  container.append(pointer, svg);

  let rotation = 0;
  const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const duration = reduced ? 1000 : 4500;

  return {
    spin() {
      const idx = pickIndex(shares);
      rotation = targetRotation(rotation, shares, idx, { spins: reduced ? 1 : 5 });
      g.style.transition = `transform ${duration}ms cubic-bezier(0.17, 0.67, 0.12, 0.99)`;
      g.style.transform = `rotate(${rotation}deg)`;
      return new Promise((resolve) => {
        let done = false;
        const finish = () => { if (!done) { done = true; resolve(idx); } };
        g.addEventListener('transitionend', finish, { once: true });
        setTimeout(finish, duration + 300); // safety net if transitionend never fires
      });
    },
  };
}
