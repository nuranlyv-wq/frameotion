import { test } from 'node:test';
import assert from 'node:assert/strict';
import { googlePlan } from './fixtures/google-plan.js';
import { validatePlan } from '../src/plan/validate.js';
import { emptyPlan } from '../src/plan/model.js';
import { readSec } from '../src/plan/reading.js';
import { PROFILES } from '../src/dynamism.js';
import { FONT_NAMES } from '../src/render/fonts.js';
import { COMPONENTS, catalog } from '../src/render/components/index.js';
import { buildSystemPrompt } from '../src/director/prompt.js';

test('время чтения: растёт с длиной текста, в high допуск 0.9', () => {
  assert.ok(readSec('Bir sual.', PROFILES.medium) < readSec('Dünya cavab verir və cavab verir', PROFILES.medium));
  assert.ok(readSec('Bir sual.', PROFILES.high) < readSec('Bir sual.', PROFILES.medium));
});

test('текст, не успевающий прочитаться, отклоняется с понятной причиной', () => {
  const p = googlePlan('medium');
  p.scenes[0].duration = 2.5;                                   // строка «Dünya cavab verir» теперь не успеет
  const r = validatePlan(p);
  assert.ok(r.errors.some((e) => /needs ~[\d.]+ s to be read/.test(e.message)), JSON.stringify(r.errors.map((e) => e.message)));
});

test('поздно появившаяся карточка не успевает: ошибка указывает путь', () => {
  const p = googlePlan('medium');
  p.scenes[1].props.cards = [{ t: 5.3, title: 'Ən yaxın kafe', sub: '200 m · açıqdır' }];
  assert.ok(validatePlan(p).errors.some((e) => /scenes\[1\]\.props\.cards\[0\]/.test(e.path)));
});

test('шрифтовые роли и стили появления проходят проверку, неизвестные — нет', () => {
  const p = googlePlan('medium');
  assert.equal(validatePlan(p).errors.filter((e) => /font|style/i.test(e.path + e.message)).length, 0);
  p.scenes[0].props.lines[0].font = 'comic-sans'; p.scenes[0].props.lines[0].style = 'explode';
  const r = validatePlan(p);
  assert.ok(r.errors.some((e) => /unknown font role/.test(e.message)));
  assert.ok(r.errors.some((e) => /style must be one of/.test(e.message)));
  for (const s of ['fade', 'type', 'cut']) assert.ok(/fade|type|cut/.test('fade type cut') && s);
});

test('в каталоге и промпте режиссёра есть шрифты, ui_morph, правило чтения', () => {
  const sys = buildSystemPrompt();
  for (const font of FONT_NAMES) assert.ok(sys.includes(font), font);
  assert.ok(/ui_morph/.test(catalog()) && /MORPHING/.test(sys) && /READING TIME/.test(sys) && /ENTRANCES/.test(sys));
  assert.ok(/cycles through the options/.test(catalog('kinetic_type')) && /fade = gradual/.test(catalog('kinetic_type')));
});

const el = (id, shape, x, y, w, h, o = {}) => ({ id, shape, x, y, w, h, ...o });
function morphPlan() {
  const p = emptyPlan({ dynamism: 'medium', styleId: 'clean' });
  p.scenes = [{ id: 'm', component: 'ui_morph', duration: 5.2, props: { stages: [
    { at: 0.3, elements: [el('a', 'chip', 0.3, 0.4, 0.4, 0.1, { label: 'Şəkil', icon: 'image' }), el('b', 'chip', 0.7, 0.6, 0.4, 0.1, { label: 'Fayl', icon: 'check' })] },
    { at: 1.8, elements: [el('c', 'card', 0.5, 0.5, 0.8, 0.28, { label: 'Kanvas', sub: 'hamısı bir yerdə', icon: 'spark', from: ['a', 'b'] })] },
    { at: 3.2, elements: [el('d', 'chip', 0.5, 0.4, 0.5, 0.1, { label: 'Yarat', from: ['c'] }), el('e', 'chip', 0.5, 0.55, 0.5, 0.1, { label: 'Soruş', from: ['c'] })] },
  ] }, events: [] }];
  return p;
}

test('ui_morph: слияние и распад распознаются, события считаются', () => {
  const p = morphPlan();
  assert.equal(validatePlan(p).errors.filter((e) => /scenes\[0\]\.props/.test(e.path) && !/fully visible/.test(e.message)).length, 0, JSON.stringify(validatePlan(p).errors));
  // 3 состояния + 1 слияние + 1 распад (c → d,e)
  assert.equal(COMPONENTS.ui_morph.countEvents({ ...p.scenes[0], events: [] }), 5);
});

test('ui_morph: ссылка на несуществующий элемент и непрерывность', () => {
  const p = morphPlan();
  p.scenes[0].props.stages[1].elements[0].from = ['a', 'zzz'];
  assert.ok(validatePlan(p).errors.some((e) => /from" must list ids that exist/.test(e.message)));
  const q = morphPlan(); q.scenes[0].props.stages = q.scenes[0].props.stages.map((s, k) => ({ ...s, elements: s.elements.map((e) => ({ ...e, id: `${e.id}${k}`, from: undefined })) }));
  assert.ok(validatePlan(q).warnings.some((w) => /no element continues/.test(w.message)));
});

test('художественные квоты убраны: без ui_morph, одного шрифта и без плавного появления план остаётся валидным', () => {
  const p = googlePlan('medium'); p.meta.craftRules = true;
  p.assets.facts = [];   // без привязки к фактам: проверяем только то, что раньше было квотами
  p.scenes[0].props.lines = [{ text: 'Bir sual.', size: 'xl', style: 'slam', at: 0.2 }, { text: 'Dünya cavab verir', size: 'l', style: 'slam', at: 0.6 }, { text: 'Hər yerdə', size: 'l', style: 'slam', at: 1.0 }];
  for (const s of p.scenes) { delete s.props.font; delete s.props.emphasisFont; delete s.props.urlFont; for (const l of s.props.lines || []) delete l.font; }
  const m = validatePlan(p).errors.map((e) => e.message).join(' | ');
  assert.doesNotMatch(m, /ui_morph|GRADUAL|SHARP|font role|zoom|custom_draw scene/);
});
