import { GradientField, DEFAULTS } from './gradient.js';
import { buildPanel } from '../../shared/ui/panel.js';
import { luminance } from '../../shared/rendering/palettes.js';

const canvas = document.getElementById('gradient');
const field = new GradientField(canvas, {});
field.start();
window.gradient = field;

const CONTROLS = [
  { group: 'Surface', key: 'cellSize',       label: 'Resolution (cell size)', min: 5, max: 24, step: 1, unit: 'px' },
  { key: 'softness',        label: 'Softness (blur)',    min: 0,   max: 40,   step: 1,    unit: 'px' },
  { key: 'baseWash',        label: 'Base colour wash',   min: 0,   max: 1,    step: 0.05 },
  { key: 'grain',           label: 'Grain',              min: 0,   max: 0.15, step: 0.01 },
  { group: 'Aurora', key: 'auroraIntensity', label: 'Aurora intensity',   min: 0,   max: 2,    step: 0.05 },
  { key: 'auroraSpeed',     label: 'Aurora speed',       min: 0,   max: 3,    step: 0.05, unit: '×' },
  { key: 'auroraScale',     label: 'Aurora scale',       min: 200, max: 1400, step: 10,   unit: 'px' },
  { group: 'Ripples', key: 'rippleStrength', label: 'Ripple strength',    min: 0,   max: 3,    step: 0.05, unit: '×' },
  { key: 'displacement',    label: 'Refraction',         min: 0,   max: 3,    step: 0.05, unit: '×' },
  { key: 'rippleGlow',      label: 'Ripple glow',        min: 0,   max: 1.5,  step: 0.05 },
  { key: 'rippleSpeed',     label: 'Ripple speed',       min: 80,  max: 1000, step: 10,   unit: 'px/s' },
  { key: 'rippleDamping',   label: 'Ripple damping',     min: 0.2, max: 5,    step: 0.1,  unit: '/s' },
  { group: 'Page', key: 'opacity',           label: 'Canvas opacity',     min: 0.1, max: 1,    step: 0.05 },
];

const panel = document.getElementById('panel');
buildPanel({
  panel,
  controls: CONTROLS,
  field,
  engine: 'flowing-gradient',
  defaults: DEFAULTS,
  initialPalette: 'Dawn Pastel',
  onPalette(p) {
    const light = p.theme ? p.theme === 'light' : luminance(p.bg) >= 0.5;
    document.documentElement.style.setProperty('--bg', p.bg);
    document.documentElement.style.setProperty('--accent', p.stops[Math.min(2, p.stops.length - 1)]);
    document.body.classList.toggle('light', light);
    document.body.classList.toggle('dark', !light);
    panel.classList.toggle('light', light);
  },
});

document.getElementById('cta').addEventListener('click', (e) => {
  e.preventDefault();
  const el = e.currentTarget;
  el.textContent = 'Clicked ✓';
  setTimeout(() => (el.textContent = 'Get started'), 1200);
});
