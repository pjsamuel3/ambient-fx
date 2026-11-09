/**
 * Page glue: mounts the AuroraField and wires the shared control panel.
 * The engine itself (aurora.js) knows nothing about this UI.
 */
import { AuroraField, DEFAULTS } from './aurora.js';
import { buildPanel } from '../../shared/ui/panel.js';
import { luminance } from '../../shared/rendering/palettes.js';

const canvas = document.getElementById('aurora');
const field = new AuroraField(canvas, {
  opacity: 1, // lower this (e.g. 0.7) if foreground text needs more contrast
});
field.start();
window.aurora = field; // for poking around in DevTools

const CONTROLS = [
  { group: 'Lattice', key: 'gridSpacing',     label: 'Grid spacing',       min: 16,  max: 60,   step: 1,    unit: 'px' },
  { key: 'baseRadius',      label: 'Base particle size', min: 0.5, max: 3,    step: 0.1,  unit: 'px' },
  { key: 'displacement',    label: 'Displacement',       min: 0,   max: 20,   step: 0.5,  unit: 'px' },
  { group: 'Aurora', key: 'auroraIntensity', label: 'Aurora intensity',   min: 0,   max: 2,    step: 0.05 },
  { key: 'auroraSpeed',     label: 'Aurora speed',       min: 0,   max: 3,    step: 0.05, unit: '×' },
  { key: 'auroraScale',     label: 'Aurora scale',       min: 150, max: 1000, step: 10,   unit: 'px' },
  { key: 'glowIntensity',   label: 'Dot halo',           min: 0,   max: 2,    step: 0.05 },
  { group: 'Look', key: 'dotOpacity',      label: 'Dot visibility',     min: 0,   max: 1,    step: 0.05 },
  { key: 'auroraGlow',      label: 'Aurora light',       min: 0,   max: 1.5,  step: 0.05 },
  { key: 'auroraBlur',      label: 'Light softness',     min: 4,   max: 60,   step: 1,    unit: 'px' },
  { group: 'Ripples', key: 'rippleStrength', label: 'Ripple strength',    min: 0,   max: 3,    step: 0.05, unit: '×' },
  { key: 'rippleSpeed',     label: 'Ripple speed',       min: 80,  max: 1000, step: 10,   unit: 'px/s' },
  { key: 'rippleDamping',   label: 'Ripple damping',     min: 0.2, max: 5,    step: 0.1,  unit: '/s' },
  { group: 'Page', key: 'opacity',           label: 'Canvas opacity',     min: 0.1, max: 1,    step: 0.05 },
];

const panel = document.getElementById('panel');
buildPanel({
  panel,
  controls: CONTROLS,
  field,
  engine: 'aurora-particles',
  defaults: DEFAULTS,
  initialPalette: 'Aurora',
  onPalette(p) {
    // Let the page background and UI follow the palette.
    const light = p.theme ? p.theme === 'light' : luminance(p.bg) >= 0.5;
    document.documentElement.style.setProperty('--bg', p.bg);
    document.documentElement.style.setProperty('--accent', p.stops[1] || p.stops[0]);
    document.body.classList.toggle('light', light);
    panel.classList.toggle('light', light);
  },
});

// Demo button: does nothing except prove clicks reach the foreground.
document.getElementById('cta').addEventListener('click', (e) => {
  e.preventDefault();
  const el = e.currentTarget;
  el.textContent = 'Clicked ✓';
  setTimeout(() => (el.textContent = 'Get started'), 1200);
});
