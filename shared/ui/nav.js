/**
 * Demo navigation strip shared by every experiment page: a link back to the
 * gallery, previous / next arrows through all experiments in gallery order,
 * and a dropdown to jump straight to one.
 *
 *   import { mountNav } from '../../shared/ui/nav.js';
 *   mountNav('ripple-grid');
 */
export const EXPERIMENTS = [
  { slug: 'aurora-particles', name: 'Aurora Particles' },
  { slug: 'flowing-gradient', name: 'Flowing Gradient' },
  { slug: 'ripple-grid',      name: 'Ripple Grid' },
  { slug: 'particle-field',   name: 'Particle Field' },
  { slug: 'fluid-simulation', name: 'Fluid Simulation' },
  { slug: 'noise-waves',      name: 'Noise Waves' },
];

export function mountNav(currentSlug, { root = '../../' } = {}) {
  const idx = Math.max(0, EXPERIMENTS.findIndex((e) => e.slug === currentSlug));
  const prev = EXPERIMENTS[(idx - 1 + EXPERIMENTS.length) % EXPERIMENTS.length];
  const next = EXPERIMENTS[(idx + 1) % EXPERIMENTS.length];

  const nav = document.createElement('nav');
  nav.className = 'fx-nav';
  nav.setAttribute('aria-label', 'Experiments');
  nav.innerHTML = `
    <a class="fx-nav-gallery" href="${root}gallery/">← Gallery</a>
    <span class="fx-nav-sep" aria-hidden="true"></span>
    <a class="fx-nav-arrow" href="../${prev.slug}/" title="Previous: ${prev.name}" aria-label="Previous: ${prev.name}">‹</a>
    <label class="fx-nav-select">
      <span class="sr-only">Jump to experiment</span>
      <select aria-label="Jump to experiment">
        ${EXPERIMENTS.map((e, i) => `<option value="${e.slug}"${i === idx ? ' selected' : ''}>${e.name}</option>`).join('')}
      </select>
      <span class="fx-nav-count">${idx + 1}/${EXPERIMENTS.length}</span>
    </label>
    <a class="fx-nav-arrow" href="../${next.slug}/" title="Next: ${next.name}" aria-label="Next: ${next.name}">›</a>`;

  nav.querySelector('select').addEventListener('change', (e) => {
    location.href = `../${e.target.value}/`;
  });

  // Keyboard: [ and ] step through the demos when focus is not in a form field.
  window.addEventListener('keydown', (e) => {
    const t = e.target;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT')) return;
    if (e.key === '[') location.href = `../${prev.slug}/`;
    else if (e.key === ']') location.href = `../${next.slug}/`;
  });

  document.body.appendChild(nav);
  return nav;
}
