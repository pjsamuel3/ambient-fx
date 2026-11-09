import { FluidField, DEFAULTS } from './fluid.js';
import { buildPanel } from '../../shared/ui/panel.js';
import { bindPage } from '../../shared/ui/page.js';
import { mountNav } from '../../shared/ui/nav.js';

mountNav('fluid-simulation');

const field = new FluidField(document.getElementById('fluid'), {});
field.start();
window.fluid = field;

const CONTROLS = [
  { group: 'Grid', key: 'cellSize', label: 'Resolution (cell size)', min: 6,  max: 24,  step: 1,    unit: 'px' },
  { key: 'softness',     label: 'Softness (blur)',     min: 0,   max: 20,   step: 1,    unit: 'px' },
  { key: 'exposure',     label: 'Exposure',            min: 0.3, max: 3,    step: 0.05 },
  { key: 'grain',        label: 'Grain',               min: 0,   max: 0.15, step: 0.01 },
  { group: 'Fluid', key: 'pressureIterations', label: 'Pressure iterations', min: 4, max: 40, step: 1 },
  { key: 'vorticity',    label: 'Vorticity',           min: 0,   max: 1.5,  step: 0.05 },
  { key: 'velocityDamping', label: 'Velocity damping', min: 0,   max: 2,    step: 0.05, unit: '/s' },
  { key: 'dyeFade',      label: 'Dye fade',            min: 0,   max: 2,    step: 0.05, unit: '/s' },
  { group: 'Ambient', key: 'ambientFlow', label: 'Idle stirring',       min: 0,   max: 3,    step: 0.05 },
  { key: 'ambientScale', label: 'Eddy size',           min: 200, max: 1600, step: 10,   unit: 'px' },
  { key: 'ambientSpeed', label: 'Evolution',           min: 0,   max: 3,    step: 0.05, unit: '×' },
  { key: 'ambientDye',   label: 'Emitter dye',         min: 0,   max: 2,    step: 0.05 },
  { group: 'Pointer', key: 'pointerForce', label: 'Pointer force',      min: 0,   max: 3,    step: 0.05, unit: '×' },
  { key: 'pointerDye',   label: 'Pointer dye',         min: 0,   max: 3,    step: 0.05, unit: '×' },
  { key: 'brushRadius',  label: 'Brush radius',        min: 10,  max: 120,  step: 1,    unit: 'px' },
  { group: 'Page', key: 'opacity', label: 'Canvas opacity',            min: 0.1, max: 1,    step: 0.05 },
];

const panel = document.getElementById('panel');
buildPanel({
  panel, controls: CONTROLS, field, engine: 'fluid-simulation', defaults: DEFAULTS,
  initialPalette: 'Ember', onPalette: bindPage(panel),
});
