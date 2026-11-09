/**
 * Scrollable demo content shared by the experiment pages, so the backgrounds
 * can be judged under real page content on phones as well as desktops:
 * a feature grid, a long-form section, a stats row, links to the other
 * experiments and a footer. Also `bindScrollRipples`, which turns scrolling
 * into gentle impulses so the background reacts while content moves.
 *
 *   import { mountDemoContent, bindScrollRipples } from '../../shared/ui/content.js';
 *   mountDemoContent('ripple-grid');
 *   bindScrollRipples(field);
 */
import { EXPERIMENTS } from './nav.js';

const FEATURES = [
  ['Behind everything', 'The canvas is a fixed layer with pointer-events: none. Buttons, links and text above it stay fully interactive while ripples still follow the cursor.'],
  ['Scroll-aware', 'The background is fixed to the viewport, so content slides over a living surface instead of dragging a static image with it. Scrolling also sends a gentle wave through the field.'],
  ['Zero dependencies', 'Plain ES modules and Canvas 2D. No build step to run the demos; an optional esbuild bundle for drop-in embedding.'],
  ['One look, many pages', 'Tune the sliders, copy the Settings JSON, and mount the same look anywhere with <ambient-fx> or mount().'],
  ['Frame-rate independent', 'Every engine integrates with a clamped delta time, pauses in hidden tabs and renders a still frame under prefers-reduced-motion.'],
  ['Six engines, one API', 'Dots, gradient, grid, particles, fluid and waves all expose the same lifecycle, so the panel, export and embed work with any of them.'],
];

const STATS = [
  ['6', 'engines'],
  ['0', 'dependencies'],
  ['< 3 ms', 'per frame on a laptop'],
  ['12', 'palette presets'],
];

export function mountDemoContent(currentSlug, { root = '../../' } = {}) {
  const hero = document.querySelector('main.hero');
  if (!hero) return null;

  const others = EXPERIMENTS.filter((e) => e.slug !== currentSlug);
  const wrap = document.createElement('div');
  wrap.className = 'demo-content';
  wrap.innerHTML = `
    <section class="section">
      <p class="kicker">Why a background like this</p>
      <h2>Made to sit under real content.</h2>
      <p class="section-lede">Scroll on. The effect keeps running behind the page, reacts to the pointer and to scrolling, and never gets in the way of what you came to read.</p>
      <div class="feature-grid">
        ${FEATURES.map(([t, d]) => `<article class="glass"><h3>${t}</h3><p>${d}</p></article>`).join('')}
      </div>
    </section>

    <section class="section prose">
      <p class="kicker">Reading over motion</p>
      <h2>Long text, still legible.</h2>
      <p>A moving background has to earn its place. The rules we followed here: keep the motion slow, keep contrast between text and the quiet areas of the field high, and let the brightest parts of the effect avoid the column the eye is reading. The panel's "Canvas opacity" slider is the quickest way to dial the effect back for text-heavy pages.</p>
      <p>On phones the field is coarser (fewer particles, bigger cells) so it costs the same fraction of a frame as on a laptop. Touch scrolling does not move the pointer, so the engines also listen for scroll velocity and send a soft wave in from the edge the content arrives from. Try flicking the page.</p>
      <blockquote class="glass">"The effect should feel like weather behind a window: always there, never asking for attention."</blockquote>
      <p>Everything on this page is static HTML over a single <code>&lt;canvas&gt;</code>. Open the panel at the bottom right to change the palette, switch between dark and light, or export the exact settings you are looking at.</p>
    </section>

    <section class="section">
      <div class="stats glass">
        ${STATS.map(([n, l]) => `<div class="stat"><span class="stat-n">${n}</span><span class="stat-l">${l}</span></div>`).join('')}
      </div>
    </section>

    <section class="section">
      <p class="kicker">More experiments</p>
      <h2>Same palettes, different physics.</h2>
      <div class="card-grid">
        ${others.map((e) => `<a class="glass card-link" href="../${e.slug}/"><span class="card-title">${e.name}</span><span class="card-arrow" aria-hidden="true">→</span></a>`).join('')}
      </div>
    </section>

    <footer class="site-footer">
      <span>ambient-fx</span>
      <nav aria-label="Footer">
        <a href="${root}gallery/">Gallery</a>
        <a href="${root}embed/demo.html">Embed demo</a>
        <a href="https://github.com/pjsamuel3/ambient-fx">GitHub</a>
      </nav>
    </footer>`;

  hero.insertAdjacentElement('afterend', wrap);
  return wrap;
}

/**
 * Turn scroll velocity into gentle impulses on the field. Works with every
 * engine's `addRipple(x, y, strength)` (viewport coordinates, since the
 * background canvas is fixed to the viewport).
 */
export function bindScrollRipples(field, { strength = 1, minInterval = 70 } = {}) {
  let lastY = window.scrollY;
  let lastT = 0;
  function onScroll() {
    if (!field || field.paused || field.reducedMotion || typeof field.addRipple !== 'function') return;
    const now = performance.now();
    const y = window.scrollY;
    const dy = y - lastY;
    if (now - lastT < minInterval) return;
    lastY = y; lastT = now;
    const speed = Math.min(1, Math.abs(dy) / 220);
    if (speed < 0.05) return;
    const w = window.innerWidth, h = window.innerHeight;
    // Waves enter from the edge the new content arrives from.
    const edgeY = dy > 0 ? h * 0.92 : h * 0.08;
    const count = w > 900 ? 3 : 2;
    for (let i = 0; i < count; i++) {
      const x = ((i + 0.5 + (Math.random() - 0.5) * 0.6) / count) * w;
      field.addRipple(x, edgeY, (1.5 + 6 * speed) * strength);
    }
  }
  window.addEventListener('scroll', onScroll, { passive: true });
  return () => window.removeEventListener('scroll', onScroll);
}
