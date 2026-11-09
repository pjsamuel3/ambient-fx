/**
 * Demo-page glue shared by the experiments: applies a palette to the page
 * chrome (CSS variables + light/dark classes) and wires the demo CTA button.
 *
 *   buildPanel({ ..., onPalette: bindPage(panel) });
 */
import { luminance } from '../rendering/palettes.js';

export function bindPage(panel) {
  const cta = document.getElementById('cta');
  if (cta && !cta.dataset.bound) {
    cta.dataset.bound = '1';
    cta.addEventListener('click', (e) => {
      e.preventDefault();
      cta.textContent = 'Clicked ✓';
      setTimeout(() => (cta.textContent = 'Get started'), 1200);
    });
  }
  return function onPalette(p) {
    const light = p.theme ? p.theme === 'light' : luminance(p.bg) >= 0.5;
    const root = document.documentElement.style;
    root.setProperty('--bg', p.bg);
    root.setProperty('--accent', p.stops[Math.min(2, p.stops.length - 1)]);
    document.body.classList.toggle('light', light);
    document.body.classList.toggle('dark', !light);
    if (panel) panel.classList.toggle('light', light);
  };
}
