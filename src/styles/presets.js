// Стили. Пресеты ниже — ПРОВИЗОРНЫЕ: публичную подборку утвердим позже.
// Пресет на основе видеореференса создаётся через src/styles/reference.js
// (отпечаток: палитра, темп монтажа, энергия движения) и сохраняется в styles/library/*.json.
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from '../config.js';

export const BUILTIN_STYLES = {
  clean: {
    id: 'clean', name: 'Чистый графит', source: 'builtin', status: 'placeholder',
    description: 'Тёмный графит, белая плотная гротескная типографика, синий и тёплый жёлтый акценты. Сетка на фоне, аккуратные пружинные движения.',
    palette: { bg: '#0f1115', fg: '#f5f7fa', accent: '#4f8cff', accent2: '#ffd166', muted: '#9aa3b2' },
    typography: { family: 'Inter', weight: 800 }, bg: 'grid', music: { mood: 'warm', key: 'A' },
  },
  poster: {
    id: 'poster', name: 'Контрастный постер', source: 'builtin', status: 'placeholder',
    description: 'Светлая бумажная подложка, чёрная тяжёлая типографика, красно-оранжевый акцент и синий второй акцент. Плакатная подача, крупные слова.',
    palette: { bg: '#f3eee4', fg: '#111111', accent: '#ff4d2e', accent2: '#2a2cff', muted: '#5b5750' },
    typography: { family: 'Inter', weight: 800 }, bg: 'dots', music: { mood: 'bright', key: 'C' },
  },
  neon: {
    id: 'neon', name: 'Неон', source: 'builtin', status: 'placeholder',
    description: 'Глубокий фиолетово-чёрный фон, белый текст, розовый и голубой неоновые акценты, кольца-пульсы в такт.',
    palette: { bg: '#0a0618', fg: '#ffffff', accent: '#ff3df2', accent2: '#38f2ff', muted: '#a79bd0' },
    typography: { family: 'Montserrat', weight: 800 }, bg: 'rings', music: { mood: 'tense', key: 'E' },
  },
};

const LIB_DIR = path.join(ROOT, 'src', 'styles', 'library');

export function listStyles() {
  const lib = [];
  if (fs.existsSync(LIB_DIR)) for (const f of fs.readdirSync(LIB_DIR)) if (f.endsWith('.json')) {
    try { lib.push(JSON.parse(fs.readFileSync(path.join(LIB_DIR, f), 'utf8'))); } catch { /* пропуск битого файла */ }
  }
  return [...Object.values(BUILTIN_STYLES), ...lib];
}

export function getStyle(id) {
  return listStyles().find((s) => s.id === id) || BUILTIN_STYLES.clean;
}

export function saveStyle(style) {
  fs.mkdirSync(LIB_DIR, { recursive: true });
  const id = String(style.id).replace(/[^a-z0-9_-]/gi, '').slice(0, 40) || 'style';
  fs.writeFileSync(path.join(LIB_DIR, `${id}.json`), JSON.stringify({ ...style, id }, null, 2));
  return id;
}

// Собственный стиль клиента: текстовое описание (+ необязательный отпечаток своего референса).
export function buildCustomStyle({ description = '', fingerprint = null, base = 'clean' } = {}) {
  const b = getStyle(base);
  const style = {
    ...b, id: 'custom', name: 'Свой стиль', source: 'custom', status: 'custom',
    description: String(description).slice(0, 600) || b.description,
    palette: { ...b.palette },
  };
  if (fingerprint?.palette) style.palette = { ...style.palette, ...fingerprint.palette };
  if (fingerprint) style.reference = { cutsPerSec: fingerprint.cutsPerSec, motionEnergy: fingerprint.motionEnergy, durationSec: fingerprint.durationSec, suggestedDynamism: fingerprint.suggestedDynamism };
  return style;
}

// Краткое описание стиля для режиссёра.
export function styleBrief(style, { paletteMode = 'brand' } = {}) {
  const l = [`style "${style.name}" (${style.id}): ${style.description}`,
    paletteMode === 'style' ? `palette: ${Object.entries(style.palette).map(([k, v]) => `${k} ${v}`).join(', ')}; typography ${style.typography.family} ${style.typography.weight}` : `typography preference: ${style.typography.family} ${style.typography.weight}; the palette is the site's BRAND palette (given separately), not this style's`];
  if (style.source === 'reference' || style.reference) l.push('GRAMMAR ONLY: this style comes from a reference video. Take only its grammar (how type is set, layout logic, motion, pacing, graphic language). NEVER reuse the reference\'s subject matter, metaphor, characters, props or scenery, even if the description mentions them. The film\'s world must come from THIS product\'s facts.');
  for (const [k, label] of [['essence', 'essence'], ['material_and_look', 'material/look'], ['colour_logic', 'colour logic'], ['type_and_layout', 'type & layout'], ['motion_quality', 'motion quality'], ['camera_and_transitions', 'camera/transitions'], ['sound', 'sound'], ['story_shape', 'story shape']]) if (style[k]) l.push(`${label}: ${style[k]}`);
  if (style.cannot_render?.length) l.push(`our engine cannot render (do not try): ${style.cannot_render.join('; ')}`);
  if (style.reference) l.push(`reference fingerprint: ${style.reference.cutsPerSec?.toFixed?.(2)} cuts/s, motion energy ${style.reference.motionEnergy?.toFixed?.(3)}, ${style.reference.durationSec?.toFixed?.(1)} s; pacing hint: ${style.reference.suggestedDynamism}`);
  return l.join('\n');
}
