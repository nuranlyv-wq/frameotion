// Фаза 4: визуальные токены — общая грамматика для каталожных компонентов и кода custom_draw.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { DEFAULT_TOKENS, resolveTokens, tokensFor, EASE_NAMES } from '../src/render/tokens.js';
import { fontFor, checkFont } from '../src/render/fonts.js';
import { runSandbox } from '../src/sandbox/index.js';
import { renderPlan } from '../src/render/engine.js';
import { normalizePlan } from '../src/plan/model.js';
import { googlePlan } from './fixtures/google-plan.js';

test('токены по умолчанию равны числам, которые раньше были зашиты в компонентах', () => {
  assert.deepEqual(DEFAULT_TOKENS.radius, { xs: 10, chip: 20, panel: 36, card: 44, pill: 999 });
  assert.deepEqual(DEFAULT_TOKENS.stroke, { hair: 2, base: 4, heavy: 8 });
  assert.deepEqual(resolveTokens(undefined), resolveTokens({}));
});

test('спецификация переопределяет токены; мусор отбрасывается', () => {
  const tk = resolveTokens({ stroke_weights: { hair: 3, base: 6, heavy: -1 }, corner_radii: { card: 12, panel: 'big' }, typography_roles: { title: 'grotesk' }, motion_language: { easing: { enter: 'outExpo', ui: 'bounce' } }, composition: { margin_px: 96 } });
  assert.equal(tk.stroke.hair, 3); assert.equal(tk.stroke.base, 6); assert.equal(tk.stroke.heavy, DEFAULT_TOKENS.stroke.heavy);
  assert.equal(tk.radius.card, 12); assert.equal(tk.radius.panel, DEFAULT_TOKENS.radius.panel); assert.equal(tk.radius.pill, 999);
  assert.equal(tk.type.title, 'grotesk'); assert.equal(tk.type.label, DEFAULT_TOKENS.type.label);
  assert.equal(tk.ease.enter, 'outExpo'); assert.equal(tk.ease.ui, DEFAULT_TOKENS.ease.ui); assert.ok(EASE_NAMES.includes(tk.ease.emphasis));
  assert.equal(tk.space.margin, 96);
  const plan = { meta: { artDirection: { corner_radii: { card: 12 } } } };
  assert.equal(tokensFor(plan), tokensFor(plan), 'токены кэшируются по объекту спецификации');
});

test('семантические роли шрифта разворачиваются через токены фильма', () => {
  const st = { family: 'Inter', weight: 800, tk: resolveTokens({ typography_roles: { title: 'condensed', emphasis: 'didone', data: 'typewriter' } }) };
  assert.equal(fontFor('title', st).family, 'Oswald');
  assert.equal(fontFor('emphasis', st).family, 'Playfair Display');
  assert.equal(fontFor('data', st).family, 'Space Mono');
  assert.equal(fontFor('label', { family: 'Inter', weight: 800 }).family, 'Fira Sans', 'без токенов — значения по умолчанию');
  const errs = []; checkFont(errs, 'p', 'title'); checkFont(errs, 'p', 'nope'); assert.equal(errs.length, 1);
});

test('песочница: токены в коде модели разворачиваются в числа и роли шрифта', async () => {
  const tk = resolveTokens({ stroke_weights: { hair: 3, base: 5, heavy: 9 }, corner_radii: { card: 14 }, typography_roles: { title: 'serif' } });
  const code = "function frame(t){ return [R(10,10,100,60,{r:'card',lw:'heavy',stroke:'fg'}), L(0,0,50,50,{lw:'hair'}), T('Salam',20,20,{font:'title',size:40}), C(5,5,3,{lw:TK.stroke.base})]; }";
  const r = await runSandbox({ code, duration: 0.1, tokens: tk });
  assert.ok(r.ok, r.error);
  const [rect, line, text, circ] = r.frames[0];
  assert.equal(rect.r, 14); assert.equal(rect.lw, 9); assert.equal(line.lw, 3); assert.equal(text.font, 'serif'); assert.equal(circ.lw, 5);
  // без токенов в запросе используются значения по умолчанию
  const d = await runSandbox({ code, duration: 0.1 });
  assert.equal(d.frames[0][0].r, 44); assert.equal(d.frames[0][0].lw, 8);
});

test('движок: токены меняют картинку каталожных сцен (радиус карточек)', async () => {
  const frame = async (ad) => {
    const p = googlePlan('medium'); if (ad) p.meta.artDirection = ad;
    const n = normalizePlan(p), sc = n.scenes.find((s) => s.component === 'search_to_map'), t = sc.start + sc.duration * 0.92;
    const r = await renderPlan(p, { stills: [Number(t.toFixed(2))], stillsDir: '/private/tmp/kadr-tk-test', stillsOnly: true, scale: 0.3 });
    return fs.readFileSync(r.stills[0]);
  };
  const base = await frame(null), same = await frame(null), sharp = await frame({ corner_radii: { panel: 2, card: 2, chip: 2 } });
  assert.ok(base.equals(same));
  assert.ok(!base.equals(sharp), 'другие радиусы — другая картинка');
});
