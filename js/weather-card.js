// Cute weather card for the start screen: little animated SVG icons with faces.

const CLOUD = 'M18 46 H46 A10 10 0 0 0 46 26 A13 13 0 0 0 21 24 A11 11 0 0 0 18 46 Z';

const face = (cx, cy, { sleepy = false, worried = false } = {}) => `
  <g class="w-face">
    ${sleepy
      ? `<path d="M${cx - 7} ${cy} q2 2 4 0 M${cx + 3} ${cy} q2 2 4 0" fill="none" stroke-width="1.6" stroke-linecap="round"/>`
      : `<circle cx="${cx - 5}" cy="${cy}" r="1.7"/><circle cx="${cx + 5}" cy="${cy}" r="1.7"/>`}
    <path d="${worried ? `M${cx - 2.5} ${cy + 5} q2.5 -2 5 0` : `M${cx - 3} ${cy + 3.5} q3 3 6 0`}" fill="none" stroke-width="1.6" stroke-linecap="round"/>
  </g>
  <ellipse class="w-blush" cx="${cx - 9}" cy="${cy + 3.5}" rx="2.6" ry="1.6"/>
  <ellipse class="w-blush" cx="${cx + 9}" cy="${cy + 3.5}" rx="2.6" ry="1.6"/>`;

const rays = Array.from({ length: 8 }, (_, i) => {
  const a = (i * Math.PI) / 4;
  const p = (r) => `${(32 + r * Math.cos(a)).toFixed(1)} ${(32 + r * Math.sin(a)).toFixed(1)}`;
  return `<path d="M${p(18)} L${p(24)}"/>`;
}).join('');

const cloud = (opts) => `<g class="w-bob"><path class="w-cloud" d="${CLOUD}"/>${face(32, 35, opts)}</g>`;

const ICONS = {
  sun: `<g class="w-rays">${rays}</g><circle class="w-sun" cx="32" cy="32" r="13"/>${face(32, 31)}`,
  moon: `
    <path class="w-star w-twinkle" d="M12 14 l1.2 2.8 2.8 1.2 -2.8 1.2 -1.2 2.8 -1.2 -2.8 -2.8 -1.2 2.8 -1.2z"/>
    <path class="w-star w-twinkle w-delay" d="M52 46 l1 2.2 2.2 1 -2.2 1 -1 2.2 -1 -2.2 -2.2 -1 2.2 -1z"/>
    <path class="w-moon" d="M38 10 A22 22 0 1 0 54 42 A17 17 0 1 1 38 10 Z"/>
    ${face(25, 36, { sleepy: true })}`,
  partly: `
    <g transform="translate(-8 -9) scale(0.8)" class="w-small-sun"><g class="w-rays">${rays}</g><circle class="w-sun" cx="32" cy="32" r="13"/></g>
    <g transform="translate(4 6) scale(0.9)">${cloud()}</g>`,
  cloud: cloud(),
  fog: `${cloud({ sleepy: true })}<g class="w-fog"><path d="M10 52 H40"/><path d="M22 58 H54"/></g>`,
  rain: `<g transform="translate(0 -6)">${cloud({ worried: true })}</g>
    <g class="w-drops"><path class="w-drop" d="M22 46 q-3 5 0 6.5 q3 -1.5 0 -6.5z"/><path class="w-drop w-delay" d="M32 48 q-3 5 0 6.5 q3 -1.5 0 -6.5z"/><path class="w-drop w-delay2" d="M42 46 q-3 5 0 6.5 q3 -1.5 0 -6.5z"/></g>`,
  snow: `<g transform="translate(0 -6)">${cloud()}</g>
    <g><circle class="w-flake" cx="22" cy="48" r="2.6"/><circle class="w-flake w-delay" cx="33" cy="50" r="2.6"/><circle class="w-flake w-delay2" cx="43" cy="47" r="2.6"/></g>`,
  storm: `<g transform="translate(0 -6)">${cloud({ worried: true })}</g><path class="w-bolt" d="M34 42 L27 52 H32 L29 61 L39 49 H34 L37 42 Z"/>`,
  unknown: cloud({ sleepy: true }),
};

/** Render (or re-render) the weather card into `el` from a fetchWeather() result. */
export function renderWeatherCard(el, w) {
  const kind = w.ok ? w.kind : 'unknown';
  el.dataset.kind = kind;
  el.innerHTML = `
    <svg class="w-icon" viewBox="0 0 64 64" aria-hidden="true">${ICONS[kind] || ICONS.cloud}</svg>
    <div class="w-text">
      ${w.ok
        ? `<p class="w-temp"><strong>${Math.round(w.tempF)}°</strong> <span>${w.phrase}</span></p>`
        : `<p class="w-temp"><span>Weather's hiding</span></p>`}
      <p class="w-blurb"></p>
    </div>`;
  el.querySelector('.w-blurb').textContent = w.blurb;
  el.setAttribute('aria-label', w.ok ? `${Math.round(w.tempF)} degrees and ${w.phrase}. ${w.blurb}` : w.blurb);
}
