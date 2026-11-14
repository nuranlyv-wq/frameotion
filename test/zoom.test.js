import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCanvas } from '@napi-rs/canvas';
import { compose } from '../src/render/transitions.js';
import { camAt, mapRect, hasZoom } from '../src/render/camera.js';
import { googlePlan } from './fixtures/google-plan.js';
import { validatePlan } from '../src/plan/validate.js';
import { PlanBuilder } from '../src/director/tools.js';
import { getStyle } from '../src/styles/presets.js';
import { COMPONENTS } from '../src/render/components/index.js';

const W = 200, H = 360;
const solid = (color, mark) => { const c = createCanvas(W, H), x = c.getContext('2d'); x.fillStyle = color; x.fillRect(0, 0, W, H); if (mark) { x.fillStyle = mark; x.fillRect(60, 150, 80, 60); } return c; };
const px = (c, x, y) => Array.from(c.getContext('2d').getImageData(x, y, 1, 1).data.slice(0, 3));
const near = (a, b, tol = 12) => a.every((v, i) => Math.abs(v - b[i]) <= tol);

for (const variant of ['portal', 'open', 'roll']) {
  test(`zoom_into/${variant}: в начале кадр = сцена A, в конце = сцена B`, () => {
    const A = solid('#cc2222', '#ffffff'), B = solid('#22aa33');
    const out = (p) => { const c = createCanvas(W, H), x = c.getContext('2d'); compose(x, 'zoom_into', p, A, B, W, H, 'left', { target: { x: 100, y: 180, w: 80, h: 60 }, variant, roll: 8 }); return c; };
    assert.ok(near(px(out(0), 10, 10), [204, 34, 34]), `p=0 угол: ${px(out(0), 10, 10)}`);
    for (const [x, y] of [[10, 10], [190, 350], [100, 180], [20, 300]]) assert.ok(near(px(out(1), x, y), [34, 170, 51]), `p=1 (${x},${y}): ${px(out(1), x, y)}`);
    const mid = px(out(0.5), 100, 180); assert.ok(mid.some((v) => v > 0), 'в середине есть изображение');
  });
}

test('камера сцены: состояние, удержание и проекция якоря', () => {
  const sc = { camera: [{ t0: 1, t1: 2, z0: 1, z1: 2, x: 0.5, y: 0.1, center: 0.5, ease: 'linear' }] };
  assert.equal(camAt(sc, 0.5, 1080, 1920).z, 1); assert.ok(Math.abs(camAt(sc, 1.5, 1080, 1920).z - 1.5) < 1e-9); assert.equal(camAt(sc, 5, 1080, 1920).z, 2);
  const st = camAt(sc, 5, 1080, 1920), r = mapRect({ x: 0.5, y: 0.1, w: 0.4, h: 0.05 }, st, 1080, 1920);
  assert.ok(Math.abs(r.w - 0.8) < 1e-9, 'размер умножается на масштаб'); assert.ok(r.y > 0.1 && r.y < 0.5, 'точка интереса смещена к центру');
  assert.ok(hasZoom(sc) && !hasZoom({ camera: [{ t0: 0, t1: 1, z0: 1, z1: 1.2 }] }));
});

test('якоря компонентов существуют и лежат в пределах холста', () => {
  const p = googlePlan('medium');
  for (const s of p.scenes) {
    const an = COMPONENTS[s.component].anchors?.({ ...s, props: s.props, events: s.events || [] }, { W: 1080, H: 1920, P: p._P, st: p.style, bpm: 104 });
    if (!an) continue;
    assert.ok(Object.keys(an).length > 0, s.component);
    for (const [k, r] of Object.entries(an)) assert.ok(r.x >= 0 && r.x <= 1 && r.y >= 0 && r.y <= 1 && r.w > 0 && r.h > 0, `${s.component}.${k} ${JSON.stringify(r)}`);
  }
});

test('валидатор: цель zoom_into должна быть якорем предыдущей сцены; камера проверяется', () => {
  const p = googlePlan('medium');
  p.scenes[2].transition_in = { type: 'zoom_into', duration: 0.8, target: 'nope', variant: 'portal' };
  let e = validatePlan(p).errors.map((x) => x.message).join(' | ');
  assert.match(e, /has no anchor "nope"/);
  p.scenes[2].transition_in = { type: 'zoom_into', duration: 0.8, target: 'pill', variant: 'flip' };
  e = validatePlan(p).errors.map((x) => x.message).join(' | '); assert.match(e, /variant must be portal\|open\|roll/);
  p.scenes[2].transition_in = { type: 'zoom_into', duration: 0.8, target: 'pill', variant: 'open' };
  p.scenes[1].camera = [{ t0: 3, t1: 2, z1: 9 }];
  e = validatePlan(p).errors.map((x) => x.message).join(' | '); assert.match(e, /segment needs numeric t0 < t1/); assert.match(e, /zoom must stay within/);
});

test('правила ремесла: нужное число приближений; ответ инструмента перечисляет якоря', async () => {
  const imp = { brand: 'T', title: 'T', description: '', headings: [], paragraphs: [], uiStrings: [], colors: [], textSample: '', identity: { colors: [], fonts: [], mode: 'light' }, facts: [] };
  const b = new PlanBuilder({ imp, style: getStyle('clean'), dynamism: 'medium', mode: 'silent', length: 'standard' });
  const r = JSON.parse((await b.exec('add_scene', { id: 'q', component: 'search_to_map', duration: 5.4, props: { brand: 'T', query: 'salam dünya', typing: { start: 0.4, cps: 10 }, dots: [{ t: 3.6, x: 0.3, y: 0.4 }], cards: [] } })).content);
  assert.ok(r.anchors.pill && r.anchors.dot0, JSON.stringify(Object.keys(r.anchors)));
  // число зумов больше не квота: план без единого наезда валиден по этой части
  const plan = googlePlan('medium'); plan.meta.craftRules = true; plan.meta.length = 'short';
  const m = validatePlan(plan).errors.map((x) => x.message).join(' | ');
  assert.doesNotMatch(m, /zoom_into transition|zoom move/);
});
