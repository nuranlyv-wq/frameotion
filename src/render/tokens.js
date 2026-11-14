// Визуальные токены фильма: общая «грамматика» для каталожных компонентов и для кода custom_draw.
// Значения по умолчанию равны числам, которые раньше были зашиты в компонентах, поэтому без спецификации
// арт-дирекции картинка не меняется. Спецификация (plan.meta.artDirection) переопределяет их для всего фильма.
export const EASE_NAMES = ['linear', 'out3', 'inOut3', 'outExpo', 'outBack', 'outElastic', 'inQuad'];
// Семантические роли шрифта: сцена просит «title», а какой это шрифт, решает спецификация один раз для всего фильма.
export const SEMANTIC_FONTS = ['title', 'emphasis', 'label', 'data'];

export const DEFAULT_TOKENS = {
  stroke: { hair: 2, base: 4, heavy: 8 },                              // px: контур карточки / линия / жирная линия
  radius: { xs: 10, chip: 20, panel: 36, card: 44, pill: 999 },        // px; pill = полностью скруглённый
  space: { margin: 72 },                                                // px: поле, внутри которого живёт текст
  type: { title: 'display', emphasis: 'serif-italic', label: 'humanist', data: 'mono' },
  ease: { enter: 'out3', exit: 'inOut3', ui: 'inOut3', emphasis: 'outBack' },
};

const num = (v, d, lo = 0.5, hi = 400) => (typeof v === 'number' && isFinite(v) && v >= lo && v <= hi ? v : d);
const pick = (v, list, d) => (list.includes(v) ? v : d);

// Токены из спецификации арт-дирекции (любые поля могут отсутствовать).
export function resolveTokens(ad) {
  const D = DEFAULT_TOKENS, sw = ad?.stroke_weights || {}, cr = ad?.corner_radii || {}, ty = ad?.typography_roles || {}, ez = ad?.motion_language?.easing || {};
  return {
    stroke: { hair: num(sw.hair, D.stroke.hair), base: num(sw.base, D.stroke.base), heavy: num(sw.heavy, D.stroke.heavy) },
    radius: { xs: num(cr.xs, D.radius.xs, 0), chip: num(cr.chip, D.radius.chip, 0), panel: num(cr.panel, D.radius.panel, 0), card: num(cr.card, D.radius.card, 0), pill: 999 },
    space: { margin: num(ad?.composition?.margin_px, D.space.margin, 0, 200) },
    type: { title: ty.title || D.type.title, emphasis: ty.emphasis || D.type.emphasis, label: ty.label || D.type.label, data: ty.data || D.type.data },
    ease: { enter: pick(ez.enter, EASE_NAMES, D.ease.enter), exit: pick(ez.exit, EASE_NAMES, D.ease.exit), ui: pick(ez.ui, EASE_NAMES, D.ease.ui), emphasis: pick(ez.emphasis, EASE_NAMES, D.ease.emphasis) },
  };
}

// Кэш по объекту спецификации: движок спрашивает токены на каждый кадр.
const cache = new WeakMap(), DEFAULT_KEY = {};
export function tokensFor(plan) {
  const key = plan?.meta?.artDirection || DEFAULT_KEY;
  let t = cache.get(key);
  if (!t) { t = resolveTokens(plan?.meta?.artDirection); cache.set(key, t); }
  return t;
}

// Допуск при сравнении значений кода модели с токенами.
export const TOKEN_TOLERANCE = 0.6;
export const tokenValues = (tk, group) => Object.values(tk[group]).filter((v) => v < 900);
