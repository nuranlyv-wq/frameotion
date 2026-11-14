// Шрифты проекта. Все файлы лежат в assets/fonts/ (лицензия SIL OFL, см. NOTICE.md) и регистрируются в canvas
// при загрузке модуля, поэтому картинка не зависит от того, какие шрифты стоят на машине.
// Главное требование: в КАЖДОМ файле есть все азербайджанские буквы (Ə ə Ğ ğ İ ı Ş ş Ç ç Ö ö Ü ü) —
// это проверяет test/fonts.test.js по таблице символов. Системные шрифты (Helvetica Neue, Georgia, Optima, …)
// выкинуты: у них Ə/ə и другие буквы уходили в запасной шрифт и выглядели чужими.
// k — поправка визуального размера: приводит высоту заглавных разных гарнитур к одной (эталон — Inter).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { GlobalFonts } from '@napi-rs/canvas';
import { isHex } from '../util.js';
import { DEFAULT_TOKENS, SEMANTIC_FONTS } from './tokens.js';

export const FONTS_DIR = fileURLToPath(new URL('../../assets/fonts/', import.meta.url));
export const AZ_LETTERS = 'ƏəĞğİıŞşÇçÖöÜü';

// family, weight, italic, файл относительно assets/fonts
export const FONT_FILES = [
  ['Inter', 400, false, 'Inter/Inter_400Regular.ttf'],
  ['Inter', 500, false, 'Inter/Inter_500Medium.ttf'],
  ['Inter', 600, false, 'Inter/Inter_600SemiBold.ttf'],
  ['Inter', 700, false, 'Inter/Inter_700Bold.ttf'],
  ['Inter', 800, false, 'Inter/Inter_800ExtraBold.ttf'],
  ['Inter', 900, false, 'Inter/Inter_900Black.ttf'],
  ['Inter Tight', 800, false, 'InterTight/InterTight_800ExtraBold.ttf'],
  ['Montserrat', 700, false, 'Montserrat/Montserrat_700Bold.ttf'],
  ['Montserrat', 800, false, 'Montserrat/Montserrat_800ExtraBold.ttf'],
  ['Montserrat', 900, false, 'Montserrat/Montserrat_900Black.ttf'],
  ['Oswald', 500, false, 'Oswald/Oswald_500Medium.ttf'],
  ['Oswald', 600, false, 'Oswald/Oswald_600SemiBold.ttf'],
  ['Oswald', 700, false, 'Oswald/Oswald_700Bold.ttf'],
  ['Source Serif 4', 600, false, 'SourceSerif4/SourceSerif4_600SemiBold.ttf'],
  ['Source Serif 4', 700, false, 'SourceSerif4/SourceSerif4_700Bold.ttf'],
  ['Source Serif 4', 600, true, 'SourceSerif4/SourceSerif4_600SemiBold_Italic.ttf'],
  ['Source Serif 4', 700, true, 'SourceSerif4/SourceSerif4_700Bold_Italic.ttf'],
  ['Playfair Display', 700, false, 'PlayfairDisplay/PlayfairDisplay_700Bold.ttf'],
  ['Playfair Display', 800, false, 'PlayfairDisplay/PlayfairDisplay_800ExtraBold.ttf'],
  ['Fira Sans', 500, false, 'FiraSans/FiraSans_500Medium.ttf'],
  ['Fira Sans', 700, false, 'FiraSans/FiraSans_700Bold.ttf'],
  ['Roboto Slab', 700, false, 'RobotoSlab/RobotoSlab_700Bold.ttf'],
  ['Roboto Slab', 800, false, 'RobotoSlab/RobotoSlab_800ExtraBold.ttf'],
  ['IBM Plex Mono', 500, false, 'IBMPlexMono/IBMPlexMono_500Medium.ttf'],
  ['IBM Plex Mono', 600, false, 'IBMPlexMono/IBMPlexMono_600SemiBold.ttf'],
  ['IBM Plex Mono', 700, false, 'IBMPlexMono/IBMPlexMono_700Bold.ttf'],
  ['Space Mono', 700, false, 'SpaceMono/SpaceMono_700Bold.ttf'],
  ['Caveat', 700, false, 'Caveat/Caveat_700Bold.ttf'],
  ['Comfortaa', 700, false, 'Comfortaa/Comfortaa_700Bold.ttf'],
].map(([family, weight, italic, file]) => ({ family, weight, italic, file }));

export const BUNDLED_FAMILIES = [...new Set(FONT_FILES.map((f) => f.family))];
export const DEFAULT_FAMILY = 'Inter';

let state = null;
// Регистрация идемпотентна: повторный вызов ничего не делает и возвращает прежний отчёт.
export function registerFonts() {
  if (state) return state;
  const ok = [], missing = [];
  for (const f of FONT_FILES) {
    const p = path.join(FONTS_DIR, f.file);
    let done = false;
    try { done = fs.existsSync(p) && GlobalFonts.registerFromPath(p, f.family) !== false; } catch { done = false; }
    (done ? ok : missing).push(f.file);
  }
  state = { ok, missing };
  return state;
}
registerFonts();

// Старые названия (системные шрифты в пресетах, карточках стилей, плане) → встроенные гарнитуры.
const ALIAS = {
  'helvetica neue': 'Inter', helvetica: 'Inter', arial: 'Inter', 'sf pro': 'Inter', 'sf pro display': 'Inter', system: 'Inter',
  'avenir next': 'Montserrat', avenir: 'Montserrat', futura: 'Montserrat', 'arial black': 'Montserrat',
  'din condensed': 'Oswald', impact: 'Oswald', 'avenir next condensed': 'Oswald',
  georgia: 'Source Serif 4', times: 'Source Serif 4', 'times new roman': 'Source Serif 4',
  'bodoni 72': 'Playfair Display', didot: 'Playfair Display',
  optima: 'Fira Sans', gill: 'Fira Sans', 'gill sans': 'Fira Sans',
  rockwell: 'Roboto Slab', menlo: 'IBM Plex Mono', monaco: 'IBM Plex Mono', courier: 'IBM Plex Mono', 'courier new': 'IBM Plex Mono',
  'american typewriter': 'Space Mono', 'marker felt': 'Caveat',
};
export function resolveFamily(name) {
  if (!name) return DEFAULT_FAMILY;
  const hit = BUNDLED_FAMILIES.find((f) => f.toLowerCase() === String(name).toLowerCase());
  return hit || ALIAS[String(name).toLowerCase()] || DEFAULT_FAMILY;
}

export const FONT_ROLES = {
  display:        { family: 'Inter',            weight: 800, italic: false, k: 1.0,  note: 'default heavy grotesk (the style font)' },
  grotesk:        { family: 'Montserrat',       weight: 900, italic: false, k: 0.96, note: 'wide ultra-heavy geometric grotesk, loud posters' },
  tight:          { family: 'Inter Tight',      weight: 800, italic: false, k: 1.0,  note: 'compact heavy grotesk, dense headline stacks' },
  condensed:      { family: 'Oswald',           weight: 700, italic: false, k: 1.1,  note: 'tall condensed, headline stacks, sports/poster' },
  serif:          { family: 'Source Serif 4',   weight: 700, italic: false, k: 1.1,  note: 'editorial serif' },
  'serif-italic': { family: 'Source Serif 4',   weight: 700, italic: true,  k: 1.1,  note: 'italic serif — the classic accent word next to a grotesk' },
  didone:         { family: 'Playfair Display', weight: 800, italic: false, k: 1.03, note: 'high-contrast fashion/luxury serif' },
  humanist:       { family: 'Fira Sans',        weight: 700, italic: false, k: 1.04, note: 'calm humanist sans, premium and friendly' },
  slab:           { family: 'Roboto Slab',      weight: 800, italic: false, k: 1.0,  note: 'sturdy slab serif' },
  rounded:        { family: 'Comfortaa',        weight: 700, italic: false, k: 0.96, note: 'soft rounded geometric sans, friendly consumer apps' },
  mono:           { family: 'IBM Plex Mono',    weight: 600, italic: false, k: 0.92, note: 'monospace for data, urls, UI-code feel' },
  typewriter:     { family: 'Space Mono',       weight: 700, italic: false, k: 0.93, note: 'quirky typewriter-mono, human/notes feel' },
  hand:           { family: 'Caveat',           weight: 700, italic: false, k: 1.25, note: 'handwritten accent' },
};
export const FONT_NAMES = Object.keys(FONT_ROLES);

export const FONT_ROLE_NAMES = [...FONT_NAMES, ...SEMANTIC_FONTS];
// Семантическая роль (title/emphasis/label/data) → конкретная роль шрифта по токенам фильма (st.tk) или по умолчанию.
export const semanticFont = (name, tk) => (SEMANTIC_FONTS.includes(name) ? (tk?.type || DEFAULT_TOKENS.type)[name] : name);

// Роль → конкретный шрифт. 'display' (или пусто) — шрифт стиля. st.tk — токены фильма (их кладёт движок).
export function fontFor(role, st) {
  role = semanticFont(role, st?.tk);
  if (!role || role === 'display') return { family: resolveFamily(st?.family), weight: st?.weight || 800, italic: false, k: 1 };
  return FONT_ROLES[role] || { family: resolveFamily(st?.family), weight: st?.weight || 800, italic: false, k: 1 };
}

export function checkFont(errors, path, role) {
  if (role != null && !FONT_ROLE_NAMES.includes(role)) errors.push({ path, message: `unknown font role "${role}"`, hint: `use one of: ${FONT_ROLE_NAMES.join(', ')}` });
}

export const fontCatalog = () => Object.entries(FONT_ROLES).map(([k, f]) => `${k} (${f.family}${f.italic ? ' italic' : ''}): ${f.note}`).join('; ') + '. Semantic roles title|emphasis|label|data resolve to the film\'s typography_roles from the art direction'
export const _unused = isHex;
