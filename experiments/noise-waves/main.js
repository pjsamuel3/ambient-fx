import { NoiseWaves, DEFAULTS } from './waves.js';
import { buildPanel } from '../../shared/ui/panel.js';
import { bindPage } from '../../shared/ui/page.js';

const field = new NoiseWaves(document.getElementById('waves'), {});
field.start();
window.waves = field;

const CONTROLS = [
  { group: 'Strands', key: 'lineCount', label: 'Line count',         min: 4,   max: 80,   step: 1 },
  { key: 'lineWidth',    label: 'Line width',          min: 0.5, max: 4,    step: 0.1,  unit: 'px' },
  { key: 'lineOpacity',  label: 'Line opacity',        min: 0,   max: 1,    step: 0.05 },
  { key: 'fillOpacity',  label: 'Fill between lines',  min: 0,   max: 0.5,  step: 0.01 },
  { key: 'sampleSpacing', label: 'Smoothness (sample spacing)', min: 4, max: 30, step: 1, unit: 'px' },
  { group: 'Motion', key: 'amplitude', label: 'Amplitude',           min: 0,   max: 200,  step: 2,    unit: 'px' },
  { key: 'waveScale',    label: 'Wave scale',          min: 100, max: 1400, step: 10,   unit: 'px' },
  { key: 'coherence',    label: 'Line coherence',      min: 0,   max: 0.5,  step: 0.01 },
  { key: 'waveSpeed',    label: 'Wave speed',          min: 0,   max: 3,    step: 0.05, unit: '×' },
  { key: 'drift',        label: 'Horizontal drift',    min: -80, max: 80,   step: 1,    unit: 'px/s' },
  { group: 'Aurora', key: 'auroraIntensity', label: 'Aurora intensity',  min: 0,   max: 2,    step: 0.05 },
  { key: 'auroraScale',  label: 'Aurora scale',        min: 200, max: 1400, step: 10,   unit: 'px' },
  { group: 'Ripples', key: 'rippleStrength', label: 'Ripple strength',  min: 0,   max: 3,    step: 0.05, unit: '×' },
  { key: 'rippleGlow',   label: 'Ripple glow',         min: 0,   max: 1.5,  step: 0.05 },
  { key: 'rippleSpeed',  label: 'Ripple speed',        min: 80,  max: 1000, step: 10,   unit: 'px/s' },
  { key: 'rippleDamping', label: 'Ripple damping',     min: 0.2, max: 5,    step: 0.1,  unit: '/s' },
  { group: 'Page', key: 'opacity', label: 'Canvas opacity',            min: 0.1, max: 1,    step: 0.05 },
];

const panel = document.getElementById('panel');
buildPanel({
  panel, controls: CONTROLS, field, engine: 'noise-waves', defaults: DEFAULTS,
  initialPalette: 'Dawn Pastel', onPalette: bindPage(panel),
});
