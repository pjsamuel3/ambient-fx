import { RippleGrid, DEFAULTS } from './grid.js';
import { buildPanel } from '../../shared/ui/panel.js';
import { bindPage } from '../../shared/ui/page.js';
import { mountNav } from '../../shared/ui/nav.js';
import { mountDemoContent, bindScrollRipples } from '../../shared/ui/content.js';

mountNav('ripple-grid');
mountDemoContent('ripple-grid');

const field = new RippleGrid(document.getElementById('grid'), {});
field.start();
window.grid = field;

const CONTROLS = [
  { group: 'Lattice', key: 'gridSpacing', label: 'Grid spacing',       min: 16,  max: 64,  step: 1,    unit: 'px' },
  { key: 'lineWidth',    label: 'Line width',          min: 0.5, max: 3,   step: 0.1,  unit: 'px' },
  { key: 'lineOpacity',  label: 'Line opacity',        min: 0.05, max: 1,  step: 0.05 },
  { key: 'nodeSize',     label: 'Node size',           min: 0,   max: 4,   step: 0.1,  unit: 'px' },
  { group: 'Water', key: 'waveSpeed', label: 'Wave speed',            min: 0.1, max: 0.7, step: 0.01 },
  { key: 'waveDamping',  label: 'Wave damping',        min: 0.2, max: 6,   step: 0.1,  unit: '/s' },
  { key: 'displacement', label: 'Refraction',          min: 0,   max: 40,  step: 1,    unit: 'px' },
  { key: 'waveGlow',     label: 'Wave glow',           min: 0,   max: 3,   step: 0.05 },
  { key: 'brushRadius',  label: 'Brush radius',        min: 10,  max: 120, step: 1,    unit: 'px' },
  { key: 'brushStrength', label: 'Pointer strength',   min: 0,   max: 3,   step: 0.05, unit: '×' },
  { key: 'rainRate',     label: 'Raindrops',           min: 0,   max: 4,   step: 0.1,  unit: '/s' },
  { group: 'Aurora', key: 'auroraIntensity', label: 'Colour bands',     min: 0,   max: 2,   step: 0.05 },
  { key: 'auroraSpeed',  label: 'Band speed',          min: 0,   max: 3,   step: 0.05, unit: '×' },
  { key: 'auroraScale',  label: 'Band scale',          min: 200, max: 1200, step: 10,  unit: 'px' },
  { group: 'Page', key: 'opacity', label: 'Canvas opacity',          min: 0.1, max: 1,   step: 0.05 },
];

const panel = document.getElementById('panel');
buildPanel({
  panel, controls: CONTROLS, field, engine: 'ripple-grid', defaults: DEFAULTS,
  initialPalette: 'Aurora', onPalette: bindPage(panel),
});
bindScrollRipples(field);
