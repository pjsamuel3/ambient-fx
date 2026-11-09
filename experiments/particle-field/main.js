import { ParticleField, DEFAULTS } from './particles.js';
import { buildPanel } from '../../shared/ui/panel.js';
import { bindPage } from '../../shared/ui/page.js';

const field = new ParticleField(document.getElementById('particles'), {});
field.start();
window.particles = field;

const CONTROLS = [
  { group: 'Particles', key: 'particleCount', label: 'Particle count',   min: 200, max: 6000, step: 100 },
  { key: 'particleSize', label: 'Trail width',         min: 0.5, max: 4,    step: 0.1,  unit: 'px' },
  { key: 'speed',        label: 'Speed',               min: 10,  max: 300,  step: 5,    unit: 'px/s' },
  { key: 'trailFade',    label: 'Trail fade',          min: 0.01, max: 0.4, step: 0.01 },
  { key: 'brightness',   label: 'Brightness',          min: 0.1, max: 2,    step: 0.05 },
  { group: 'Flow', key: 'flowScale', label: 'Eddy size',              min: 150, max: 1600, step: 10,  unit: 'px' },
  { key: 'flowCurl',     label: 'Curl',                min: 0,   max: 2.5,  step: 0.05, unit: '×' },
  { key: 'flowSpeed',    label: 'Flow evolution',      min: 0,   max: 3,    step: 0.05, unit: '×' },
  { group: 'Aurora', key: 'auroraIntensity', label: 'Aurora intensity',  min: 0,   max: 2,    step: 0.05 },
  { key: 'auroraScale',  label: 'Aurora scale',        min: 200, max: 1200, step: 10,   unit: 'px' },
  { group: 'Pointer', key: 'pointerForce', label: 'Pointer force',      min: 0,   max: 3,    step: 0.05, unit: '×' },
  { key: 'rippleSpeed',  label: 'Ripple speed',        min: 80,  max: 1000, step: 10,   unit: 'px/s' },
  { key: 'rippleDamping', label: 'Ripple damping',     min: 0.2, max: 5,    step: 0.1,  unit: '/s' },
  { group: 'Page', key: 'opacity', label: 'Canvas opacity',            min: 0.1, max: 1,    step: 0.05 },
];

const panel = document.getElementById('panel');
buildPanel({
  panel, controls: CONTROLS, field, engine: 'particle-field', defaults: DEFAULTS,
  initialPalette: 'Northern Lights', onPalette: bindPage(panel),
});
