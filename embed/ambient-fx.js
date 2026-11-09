/**
 * ambient-fx embed entry point.
 *
 *   import { mount } from './ambient-fx/embed/ambient-fx.js';
 *   const fx = mount(document.querySelector('.hero'), settings);   // settings = exported JSON
 *   fx.destroy();
 *
 * or, with no JavaScript of your own:
 *
 *   <script type="module" src="./ambient-fx/embed/ambient-fx.js"></script>
 *   <ambient-fx src="./aurora-settings.json"></ambient-fx>
 *   <ambient-fx settings='{"engine":"flowing-gradient", ...}'></ambient-fx>
 *
 * `settings` is the JSON produced by the "Settings JSON" box in each experiment's
 * control panel: { ambientFx: 1, engine, theme, palette: {name, hue, saturation, bg, stops}, config }.
 *
 * The background is inserted as an absolutely positioned layer that fills `target`,
 * sits behind its content (z-index 0; your content needs position: relative + z-index ≥ 1
 * or it must come after in DOM order), and ignores pointer events. Pointer ripples still
 * work because the engines listen on `window`.
 */

import { AuroraField } from '../experiments/aurora-particles/aurora.js';
import { GradientField } from '../experiments/flowing-gradient/gradient.js';
import { resolvePalette, PALETTES, adjustPalette, getPalette } from '../shared/rendering/palettes.js';

export { AuroraField, GradientField, PALETTES, adjustPalette, getPalette, resolvePalette };

const ENGINES = {
  'aurora-particles': AuroraField,
  'flowing-gradient': GradientField,
};

/**
 * @param {HTMLElement} target   element to fill (made position: relative if static)
 * @param {object} settings      exported settings JSON (parsed)
 * @param {{ applyBackground?: boolean, zIndex?: number|string, className?: string }} [opts]
 *   applyBackground: paint the palette's bg colour on the layer (default true).
 * @returns {{ field: object, layer: HTMLElement, destroy(): void, setSettings(s: object): void }}
 */
export function mount(target, settings = {}, opts = {}) {
  const engineId = settings.engine || 'aurora-particles';
  const Engine = ENGINES[engineId];
  if (!Engine) throw new Error(`ambient-fx: unknown engine "${engineId}"`);

  const cs = getComputedStyle(target);
  if (cs.position === 'static') target.style.position = 'relative';
  if (cs.overflow === 'visible') target.style.overflow = 'hidden';

  const layer = document.createElement('div');
  layer.className = opts.className || 'ambient-fx-layer';
  layer.setAttribute('aria-hidden', 'true');
  Object.assign(layer.style, {
    position: 'absolute', inset: '0', zIndex: String(opts.zIndex ?? 0),
    pointerEvents: 'none', overflow: 'hidden',
  });
  const canvas = document.createElement('canvas');
  canvas.style.display = 'block';
  canvas.style.width = '100%';
  canvas.style.height = '100%';
  layer.appendChild(canvas);
  target.insertBefore(layer, target.firstChild);

  const palette = resolvePalette(settings.palette || {});
  if (opts.applyBackground !== false) layer.style.background = palette.bg;

  const field = new Engine(canvas, { ...(settings.config || {}), palette });
  field.start();

  return {
    field,
    layer,
    setSettings(next) {
      const pal = resolvePalette(next.palette || {});
      field.setPalette(pal);
      if (opts.applyBackground !== false) layer.style.background = pal.bg;
      if (next.config) field.setConfig(next.config);
    },
    destroy() {
      field.destroy();
      layer.remove();
    },
  };
}

/**
 * <ambient-fx> custom element. Attributes:
 *   src       URL of a settings JSON file
 *   settings  inline JSON (takes precedence over src)
 *   fill      "parent" (default) — fills the parent element; "self" — fills the element's own box
 */
export class AmbientFx extends HTMLElement {
  static get observedAttributes() { return ['src', 'settings']; }

  connectedCallback() {
    this.style.display = this.getAttribute('fill') === 'self' ? 'block' : 'contents';
    this._load();
  }

  disconnectedCallback() { this._teardown(); }

  attributeChangedCallback() { if (this.isConnected) this._load(); }

  _teardown() {
    if (this._mounted) { this._mounted.destroy(); this._mounted = null; }
  }

  async _load() {
    let settings = {};
    const inline = this.getAttribute('settings');
    const src = this.getAttribute('src');
    try {
      if (inline) settings = JSON.parse(inline);
      else if (src) settings = await (await fetch(src)).json();
    } catch (e) {
      console.error('ambient-fx: could not read settings', e);
    }
    if (!this.isConnected) return;
    this._teardown();
    const target = this.getAttribute('fill') === 'self' ? this : (this.parentElement || document.body);
    if (target === this) {
      this.style.position = 'relative';
      this.style.overflow = 'hidden';
    }
    this._mounted = mount(target, settings);
  }
}

if (typeof customElements !== 'undefined' && !customElements.get('ambient-fx')) {
  customElements.define('ambient-fx', AmbientFx);
}
