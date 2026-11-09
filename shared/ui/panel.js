/**
 * Control-panel builder shared by the experiments.
 *
 * buildPanel({ panel, controls, field, engine, defaults, initialPalette, onPalette })
 *   - Theme toggle (Dark / Light) and a palette select grouped by theme,
 *     plus hue-shift and saturation sliders → field.setPalette(adjusted)
 *   - range sliders bound to field.config via field.setConfig
 *   - pause / reset / collapse / fps readout
 *   - Export / import of the full look as JSON (see `getSettings` / `applySettings`),
 *     in the same format `embed/ambient-fx.js` consumes.
 */
import {
  PALETTES, adjustPalette, getPalette, palettesForTheme, pairedPalette,
} from '../rendering/palettes.js';

export const SETTINGS_VERSION = 1;

function fmt(v, c) {
  const n = Number(v);
  const s = c.step >= 1 ? String(Math.round(n)) : n.toFixed(c.step < 0.1 ? 2 : 1);
  return c.unit ? `${s} ${c.unit}` : s;
}

function rangeControl(c, value, onInput) {
  const wrap = document.createElement('div');
  wrap.className = 'control';
  const id = `ctl-${c.key}`;
  wrap.innerHTML = `
    <label for="${id}">${c.label}</label>
    <output for="${id}"></output>
    <input id="${id}" type="range" min="${c.min}" max="${c.max}" step="${c.step}" />`;
  const input = wrap.querySelector('input');
  const output = wrap.querySelector('output');
  input.value = value;
  output.value = fmt(value, c);
  input.addEventListener('input', () => {
    output.value = fmt(input.value, c);
    onInput(Number(input.value));
  });
  return { el: wrap, input, output, c, set(v) { input.value = v; output.value = fmt(v, c); } };
}

function groupLabel(text) {
  const el = document.createElement('div');
  el.className = 'control-group';
  el.textContent = text;
  return el;
}

export function buildPanel({
  panel, controls, field, engine, defaults = {}, palettes = PALETTES, initialPalette, onPalette,
}) {
  const controlsEl = panel.querySelector('.controls');
  const sliders = new Map();
  const startPalette = getPalette(initialPalette || palettes[0].name);

  const paletteState = {
    name: startPalette.name,
    theme: startPalette.theme,
    hue: 0,
    saturation: 1,
  };

  // ---- Theme toggle ----------------------------------------------------------
  const themeWrap = document.createElement('div');
  themeWrap.className = 'control';
  themeWrap.innerHTML = `<label>Theme</label><span></span>
    <div class="segmented" role="group" aria-label="Theme">
      <button type="button" data-theme="dark">Dark</button>
      <button type="button" data-theme="light">Light</button>
    </div>`;
  const themeButtons = [...themeWrap.querySelectorAll('button')];

  // ---- Palette select, grouped by theme -------------------------------------
  const sel = document.createElement('div');
  sel.className = 'control';
  sel.innerHTML = `<label for="ctl-palette">Palette</label><span></span>
    <select id="ctl-palette"></select><div class="swatches"></div>`;
  const select = sel.querySelector('select');
  const swatches = sel.querySelector('.swatches');
  for (const theme of ['dark', 'light']) {
    const og = document.createElement('optgroup');
    og.label = theme === 'dark' ? 'Dark' : 'Light';
    for (const p of palettes.filter((q) => q.theme === theme)) {
      const o = document.createElement('option');
      o.value = p.name; o.textContent = p.name;
      og.appendChild(o);
    }
    select.appendChild(og);
  }

  function syncPaletteUi() {
    select.value = paletteState.name;
    for (const b of themeButtons) b.classList.toggle('active', b.dataset.theme === paletteState.theme);
    panel.classList.toggle('light', paletteState.theme === 'light');
  }

  function applyPalette() {
    const adjusted = adjustPalette(getPalette(paletteState.name), paletteState);
    paletteState.theme = adjusted.theme;
    swatches.innerHTML = adjusted.stops.map((s) => `<span style="background:${s}"></span>`).join('');
    syncPaletteUi();
    field.setPalette(adjusted);
    if (onPalette) onPalette(adjusted);
    refreshExport();
  }

  select.addEventListener('change', () => { paletteState.name = select.value; applyPalette(); });
  for (const b of themeButtons) {
    b.addEventListener('click', () => {
      paletteState.name = pairedPalette(paletteState.name, b.dataset.theme).name;
      applyPalette();
    });
  }

  const hue = rangeControl({ key: 'hue', label: 'Hue shift', min: -180, max: 180, step: 1, unit: '°' }, 0,
    (v) => { paletteState.hue = v; applyPalette(); });
  const sat = rangeControl({ key: 'saturation', label: 'Saturation', min: 0, max: 1.6, step: 0.05, unit: '×' }, 1,
    (v) => { paletteState.saturation = v; applyPalette(); });

  controlsEl.appendChild(groupLabel('Colour'));
  controlsEl.appendChild(themeWrap);
  controlsEl.appendChild(sel);
  controlsEl.appendChild(hue.el);
  controlsEl.appendChild(sat.el);

  // ---- Numeric controls ------------------------------------------------------
  let lastGroup = null;
  for (const c of controls) {
    if (c.group && c.group !== lastGroup) {
      controlsEl.appendChild(groupLabel(c.group));
      lastGroup = c.group;
    }
    const r = rangeControl(c, field.config[c.key], (v) => { field.setConfig({ [c.key]: v }); refreshExport(); });
    sliders.set(c.key, r);
    controlsEl.appendChild(r.el);
  }

  function syncSliders() {
    for (const r of sliders.values()) r.set(field.config[r.c.key]);
  }

  // ---- Export / import -------------------------------------------------------
  const exportKeys = Object.keys(defaults).filter((k) => !['seed', 'respectReducedMotion', 'maxParticles', 'maxCells', 'mobileSpacingFactor', 'maxRipples'].includes(k));

  function getSettings() {
    const adjusted = adjustPalette(getPalette(paletteState.name), paletteState);
    const config = {};
    for (const k of exportKeys) if (field.config[k] !== defaults[k]) config[k] = field.config[k];
    return {
      ambientFx: SETTINGS_VERSION,
      engine,
      theme: adjusted.theme,
      palette: {
        name: paletteState.name,
        hue: paletteState.hue,
        saturation: paletteState.saturation,
        // Resolved colours, so a consumer without the preset table can still use them.
        bg: adjusted.bg,
        stops: adjusted.stops,
      },
      config,
    };
  }

  function applySettings(obj) {
    if (!obj || typeof obj !== 'object') throw new Error('Settings must be an object');
    if (obj.engine && obj.engine !== engine) {
      throw new Error(`These settings are for "${obj.engine}", this page runs "${engine}".`);
    }
    field.setConfig({ ...defaults, opacity: field.config.opacity, ...(obj.config || {}) });
    syncSliders();
    const pal = obj.palette || {};
    if (pal.name && getPalette(pal.name).name === pal.name) {
      paletteState.name = pal.name;
      paletteState.hue = Number(pal.hue) || 0;
      paletteState.saturation = pal.saturation === undefined ? 1 : Number(pal.saturation);
      hue.set(paletteState.hue); sat.set(paletteState.saturation);
      applyPalette();
    } else if (pal.stops && pal.bg) {
      // Unknown preset: use the resolved colours directly.
      const custom = { name: 'Custom', theme: obj.theme || 'dark', bg: pal.bg, stops: pal.stops };
      field.setPalette(custom);
      if (onPalette) onPalette(custom);
      refreshExport();
    }
  }

  const io = document.createElement('div');
  io.className = 'control io';
  io.innerHTML = `
    <label for="ctl-settings">Settings JSON</label><span></span>
    <textarea id="ctl-settings" rows="5" spellcheck="false" aria-label="Settings JSON"></textarea>
    <div class="io-actions">
      <button type="button" class="btn small" data-io="copy">Copy</button>
      <button type="button" class="btn small" data-io="download">Download</button>
      <button type="button" class="btn small ghost" data-io="apply">Apply pasted</button>
    </div>
    <div class="io-status" aria-live="polite"></div>`;
  const ta = io.querySelector('textarea');
  const status = io.querySelector('.io-status');
  let dirty = false;
  ta.addEventListener('input', () => { dirty = true; });

  function refreshExport() {
    if (!dirty) ta.value = JSON.stringify(getSettings(), null, 2);
  }
  function say(msg) { status.textContent = msg; setTimeout(() => { if (status.textContent === msg) status.textContent = ''; }, 2500); }

  io.querySelector('[data-io="copy"]').addEventListener('click', async () => {
    dirty = false; refreshExport();
    try { await navigator.clipboard.writeText(ta.value); say('Copied to clipboard'); }
    catch { ta.select(); say('Select-all + copy to use'); }
  });
  io.querySelector('[data-io="download"]').addEventListener('click', () => {
    dirty = false; refreshExport();
    const blob = new Blob([ta.value], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${engine}-settings.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    say('Downloaded');
  });
  io.querySelector('[data-io="apply"]').addEventListener('click', () => {
    try {
      applySettings(JSON.parse(ta.value));
      dirty = false; refreshExport();
      say('Applied');
    } catch (e) { say(`Could not apply: ${e.message}`); }
  });

  controlsEl.appendChild(groupLabel('Export / import'));
  controlsEl.appendChild(io);

  // ---- Buttons ---------------------------------------------------------------
  const pauseBtn = panel.querySelector('[data-action="pause"]');
  pauseBtn.addEventListener('click', () => {
    field.setPaused(!field.paused);
    pauseBtn.textContent = field.paused ? 'Resume' : 'Pause';
  });
  panel.querySelector('[data-action="reset"]').addEventListener('click', () => {
    field.resetConfig();
    syncSliders();
    paletteState.name = startPalette.name;
    paletteState.hue = 0; paletteState.saturation = 1;
    hue.set(0); sat.set(1);
    dirty = false;
    applyPalette();
  });

  const toggle = panel.querySelector('.panel-toggle');
  toggle.addEventListener('click', () => {
    const collapsed = panel.classList.toggle('collapsed');
    toggle.setAttribute('aria-expanded', String(!collapsed));
  });
  if (window.innerWidth < 700) {
    panel.classList.add('collapsed');
    toggle.setAttribute('aria-expanded', 'false');
  }

  const fpsEl = panel.querySelector('.fps');
  setInterval(() => {
    if (field.reducedMotion) fpsEl.textContent = 'static (reduced motion)';
    else fpsEl.textContent = `${Math.round(field.fps)} fps · ${field.statLabel()}`;
  }, 500);

  applyPalette();
  return { applyPalette, syncSliders, paletteState, getSettings, applySettings };
}
