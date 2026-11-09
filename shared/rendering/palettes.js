/**
 * Colour palettes shared by all ambient-fx experiments, plus helpers to
 * hue-shift / saturate them and to bake a palette into a lookup table.
 *
 * A palette is { name, theme: 'dark'|'light', bg, stops: [hex, ...], pair?: name }.
 * `stops` are spread evenly from 0 → 1. `pair` names the counterpart palette in the
 * other theme, used by the Dark/Light toggle.
 */

export const PALETTES = [
  // --- Dark, luminous (suits the dot lattice) -----------------------------
  {
    name: 'Aurora', theme: 'dark', pair: 'Dawn Pastel',
    bg: '#080B12',
    stops: ['#173B75', '#39C9ED', '#30D5B0', '#8864D8'],
  },
  {
    name: 'Northern Lights', theme: 'dark', pair: 'Meadow Pastel',
    bg: '#06090F',
    stops: ['#123C5C', '#2FE3C6', '#3DF59A', '#7A5CE6', '#E24FA7'],
  },
  {
    name: 'Full Spectrum', theme: 'dark', pair: 'Sorbet Pastel',
    bg: '#07090F',
    stops: ['#1E3F8A', '#39C9ED', '#3DF59A', '#FFB341', '#FF6B1A', '#E24FA7', '#8864D8'],
  },
  {
    name: 'Ember', theme: 'dark', pair: 'Ember Pastel',
    bg: '#0B0A12',
    stops: ['#2A1E5C', '#8864D8', '#C8532A', '#FF6B1A', '#FFB341'],
  },
  {
    name: 'Solar Flare', theme: 'dark', pair: 'Sorbet Pastel',
    bg: '#0A0710',
    stops: ['#4A1D6E', '#E24FA7', '#FF6B1A', '#FFD166', '#39C9ED'],
  },
  {
    name: 'Glacier', theme: 'dark', pair: 'Glacier Pastel',
    bg: '#070B14',
    stops: ['#1B2A6B', '#3B7BDC', '#39C9ED', '#B8F3FF', '#8864D8'],
  },

  {
    name: 'Night Pastel', theme: 'dark', pair: 'Dawn Pastel',
    bg: '#14131C',
    stops: ['#7D6FB3', '#C77DA5', '#E8A98A', '#8FC9B8', '#7FA8D8'],
  },

  // --- Light / pastel (suits the smooth gradient) ---------------------------
  {
    name: 'Dawn Pastel', theme: 'light', pair: 'Aurora',
    bg: '#F7F3EE',
    stops: ['#C9B8F2', '#F5B8C8', '#FFD0A8', '#B9E8D8', '#BFD7F7'],
  },
  {
    name: 'Meadow Pastel', theme: 'light', pair: 'Northern Lights',
    bg: '#F4F7F3',
    stops: ['#BDEBD4', '#BFE3F7', '#D7C8F5', '#FFF0B8', '#F8C9D4'],
  },
  {
    name: 'Sorbet Pastel', theme: 'light', pair: 'Full Spectrum',
    bg: '#FBF4F0',
    stops: ['#FFC7A8', '#F9B4C9', '#D9BDF4', '#A9E6E2', '#FFE3B3'],
  },
  {
    name: 'Ember Pastel', theme: 'light', pair: 'Ember',
    bg: '#F8F2EC',
    stops: ['#D9C9F2', '#F2B8A6', '#E8906E', '#FFC98F', '#FDE3B0'],
  },
  {
    name: 'Glacier Pastel', theme: 'light', pair: 'Glacier',
    bg: '#F2F6FA',
    stops: ['#C9D9F5', '#B8E6F7', '#D9F3FA', '#D3C9F2', '#E8EEF8'],
  },
];

export function getPalette(name) {
  return PALETTES.find((p) => p.name === name) || PALETTES[0];
}

/** Palettes for one theme, in listing order. */
export function palettesForTheme(theme) {
  return PALETTES.filter((p) => p.theme === theme);
}

/** The counterpart of `name` in `theme` (its `pair`, else the first palette of that theme). */
export function pairedPalette(name, theme) {
  const p = getPalette(name);
  if (p.theme === theme) return p;
  if (p.pair) {
    const q = getPalette(p.pair);
    if (q.theme === theme) return q;
  }
  return palettesForTheme(theme)[0] || p;
}

/**
 * Resolve a palette from exported settings: a preset name plus hue/saturation,
 * or explicit { bg, stops } for palettes that were hand-edited.
 */
export function resolvePalette(spec = {}) {
  if (Array.isArray(spec.stops) && spec.stops.length >= 2 && spec.bg && !spec.name) {
    return { name: spec.customName || 'Custom', theme: luminance(spec.bg) < 0.5 ? 'dark' : 'light', bg: spec.bg, stops: spec.stops };
  }
  const base = getPalette(spec.name);
  return adjustPalette(base, { hue: spec.hue || 0, saturation: spec.saturation ?? 1 });
}

// ----------------------------------------------------------------- colour maths

export function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function rgbToHex([r, g, b]) {
  const to = (v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0');
  return `#${to(r)}${to(g)}${to(b)}`;
}

export function rgbToHsl([r, g, b]) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h;
  if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return [h * 60, s, l];
}

export function hslToRgb([h, s, l]) {
  h = ((h % 360) + 360) % 360;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let r, g, b;
  if (h < 60) [r, g, b] = [c, x, 0];
  else if (h < 120) [r, g, b] = [x, c, 0];
  else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c];
  else if (h < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  return [(r + m) * 255, (g + m) * 255, (b + m) * 255];
}

/**
 * Return a new palette with every stop hue-rotated by `hue` degrees and its
 * saturation scaled by `saturation` (1 = unchanged). The background is kept.
 */
export function adjustPalette(palette, { hue = 0, saturation = 1 } = {}) {
  if (hue === 0 && saturation === 1) return palette;
  const stops = palette.stops.map((hex) => {
    const hsl = rgbToHsl(hexToRgb(hex));
    hsl[0] += hue;
    hsl[1] = Math.max(0, Math.min(1, hsl[1] * saturation));
    return rgbToHex(hslToRgb(hsl));
  });
  return { ...palette, stops };
}

/**
 * Bake the stops into a flat RGB lookup table of `size` entries.
 * @returns {Uint8ClampedArray} length size*3
 */
export function buildLut(stops, size = 64) {
  const rgb = stops.map(hexToRgb);
  const lut = new Uint8ClampedArray(size * 3);
  const segs = rgb.length - 1;
  for (let i = 0; i < size; i++) {
    const t = (i / (size - 1)) * segs;
    const s = Math.min(segs - 1, Math.floor(t));
    const f = t - s;
    const a = rgb[s], b = rgb[s + 1];
    lut[i * 3] = a[0] + (b[0] - a[0]) * f;
    lut[i * 3 + 1] = a[1] + (b[1] - a[1]) * f;
    lut[i * 3 + 2] = a[2] + (b[2] - a[2]) * f;
  }
  return lut;
}

/** Perceived lightness 0..1 of a hex colour, for choosing light/dark UI. */
export function luminance(hex) {
  const [r, g, b] = hexToRgb(hex);
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}
