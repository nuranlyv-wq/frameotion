// Палитра ролика по умолчанию берётся из ИДЕНТИЧНОСТИ САЙТА (его цвета и светлая/тёмная тема), а не из стиля:
// стиль задаёт грамматику (типографика, ритм, подача), бренд — лицо.
import { hexToRgb, mix, contrast, isHex } from '../util.js';

const sat = (hex) => { const [r, g, b] = hexToRgb(hex).map((v) => v / 255); const mx = Math.max(r, g, b), mn = Math.min(r, g, b); return mx === 0 ? 0 : (mx - mn) / mx; };
const hue = (hex) => { const [r, g, b] = hexToRgb(hex).map((v) => v / 255); const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn; if (!d) return 0; const h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; return ((h * 60) + 360) % 360; };
const hueDist = (a, b) => { const d = Math.abs(hue(a) - hue(b)); return Math.min(d, 360 - d); };

// Подтягивает цвет к нужному контрасту с фоном, не меняя оттенок заметно.
function legible(color, bg, min) {
  let c = color;
  const toward = contrast(bg, '#000000') > contrast(bg, '#ffffff') ? '#000000' : '#ffffff';
  for (let i = 0; i < 8 && contrast(c, bg) < min; i++) c = mix(c, toward, 0.18);
  return c;
}

export function brandPalette(identity, style) {
  const mode = identity?.mode === 'dark' ? 'dark' : 'light';
  const base = mode === 'dark' ? { bg: '#0f1115', fg: '#f5f7fa' } : { bg: '#f7f6f2', fg: '#14161a' };
  const brand = (identity?.colors || []).filter((c) => isHex(c) && sat(c) > 0.25);
  const fallback = style?.palette || {};
  const a1 = brand[0] || fallback.accent || '#2f6df0';
  const a2 = brand.find((c) => c !== a1 && hueDist(c, a1) > 40) || brand[1] || fallback.accent2 || '#ffb020';
  const accent = legible(a1, base.bg, 3), accent2 = legible(a2, base.bg, 2.2);
  return { bg: base.bg, fg: base.fg, accent, accent2, muted: mix(base.bg, base.fg, 0.55), source: brand.length ? 'brand' : 'style-fallback', mode };
}
