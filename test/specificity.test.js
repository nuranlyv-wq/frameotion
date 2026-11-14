import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { rankLinks, buildFacts, brandIdentity, fontFamilies, sameBrandHost } from '../src/import/deep.js';
import { brandPalette } from '../src/styles/brand.js';
import { contrast } from '../src/util.js';
import { styleBrief, getStyle } from '../src/styles/presets.js';
import { PlanBuilder } from '../src/director/tools.js';
import { validatePlan } from '../src/plan/validate.js';
import { buildSystemPrompt } from '../src/director/prompt.js';
import { ANGLES, pickAngle, recordRun, avoidBrief } from '../src/director/angles.js';

test('выбор страниц: про продукт и возможности — да; вход, политика, контакты — нет; чужие домены — нет', () => {
  const links = [
    { href: '/features', text: 'Features' }, { href: '/pricing', text: 'Pricing' }, { href: '/login', text: 'Log in' }, { href: '/privacy', text: 'Privacy' },
    { href: 'https://evil.example.org/about', text: 'About' }, { href: 'https://about.shop.com/product/x', text: 'Product' }, { href: '/contact', text: 'Contact' }, { href: '/file.pdf', text: 'Brochure' },
    { href: '/haqqimizda-xidmetler', text: 'Xidmətlər' },
  ];
  const r = rankLinks(links, 'https://www.shop.com/', 6).map((x) => new URL(x.href).pathname + '|' + new URL(x.href).hostname);
  assert.ok(r.includes('/features|www.shop.com') && r.includes('/pricing|www.shop.com') && r.includes('/product/x|about.shop.com'), r.join(','));
  assert.ok(!r.some((x) => /login|privacy|contact|\.pdf|evil/.test(x)), r.join(','));
  assert.ok(sameBrandHost('about.google', 'www.google.com') && !sameBrandHost('evil.example.org', 'www.shop.com'));
});

test('факты: id, источники, числа раньше абзацев, шум отбрасывается', () => {
  const f = buildFacts([{ url: 'https://a.az/', description: 'Servis kiçik bizneslərə hesab-fakturaları avtomatlaşdırmağa kömək edir.', headings: ['Footer links', 'Hesab-fakturalar 3 dəqiqəyə', 'Menu'], paragraphs: ['Platforma 40 ölkədə işləyir və 12 dili dəstəkləyir. Qurulma tələb olunmur.'], lists: ['Avtomatik xatırlatmalar və ödəniş linkləri'] }]);
  assert.ok(f.every((x, i) => x.id === `F${i + 1}` && x.url));
  assert.ok(!f.some((x) => /footer links|^menu$/i.test(x.text)));
  assert.equal(f[0].kind, 'number', 'числовые факты идут первыми');
});

test('source import retains availability and conditions when headings compete for the evidence budget',()=>{
 const availability='Coming soon: the mobile application is in development. The website store is available now.';
 const condition='Delivery is free with a food subscription; other orders show delivery charges in the cart.';
 const facts=buildFacts([{url:'https://example.com/',contexts:[availability],paragraphs:[condition],headings:Array.from({length:8},(_,i)=>'Feature headline '+i)}],3);
 assert.ok(facts.some(f=>f.text===availability));assert.ok(facts.some(f=>f.text===condition));
});

test('палитра бренда: тема и акценты берутся у сайта, контраст соблюдён; шрифтовой мусор отброшен', () => {
  const light = brandPalette(brandIdentity({ colors: ['#4285f4', '#ea4335', '#fbbc05'], fonts: ['Google Sans'], bg: '#ffffff' }), getStyle('clean'));
  assert.equal(light.mode, 'light'); assert.equal(light.source, 'brand');
  assert.ok(contrast(light.accent, light.bg) >= 3 - 0.01, `контраст ${contrast(light.accent, light.bg)}`);
  const dark = brandPalette(brandIdentity({ colors: ['#c8ff2e'], bg: '#0b0c0f' }), getStyle('clean'));
  assert.equal(dark.mode, 'dark');
  assert.deepEqual(fontFamilies('a{font-family: var(--x), "Inter", sans-serif} b{font-family: Inter, Arial}'), ['Inter']);
});

test('стили-референсы дают только грамматику, а палитра берётся у бренда', () => {
  const b = styleBrief({ ...getStyle('clipsa-1') }, { paletteMode: 'brand' });
  assert.match(b, /GRAMMAR ONLY/); assert.match(b, /BRAND palette/); assert.doesNotMatch(b, /\bbg #/);
  assert.doesNotMatch(JSON.stringify(getStyle('clipsa-1')), /\b(car|city|skyline|road)\b/i, 'сюжет референса вычищен из пресета');
  assert.match(styleBrief(getStyle('clean'), { paletteMode: 'style' }), /palette: bg #/);
});

test('промпт не содержит конкретных метафор-образцов (прайминг) и требует конкретности', () => {
  const s = buildSystemPrompt(), beforeKit = s.slice(0, s.indexOf('SANDBOX KIT AND PRIMITIVES'));   // справочник помощников честно называет, что они умеют
  assert.doesNotMatch(beforeKit, /headlight|night road|night city|conveyor|mascot|neon lime/i);
  assert.match(s, /could it sit in a video about a different product/i); assert.match(s, /generic AI-video tics/i);
});

function builder() {
  const imp = { brand: 'T', title: 'T', description: '', headings: [], paragraphs: [], uiStrings: [], colors: [], textSample: '', identity: { colors: ['#2a6df4'], fonts: [], mode: 'light' }, facts: [1, 2, 3, 4, 5].map((n) => ({ id: `F${n}`, text: `fakt ${n}`, url: 'https://a.az' })) };
  const b = new PlanBuilder({ imp, style: getStyle('clean'), dynamism: 'medium', mode: 'silent', length: 'short' });
  return b;
}
test('каждая сцена обязана ссылаться на факты; разнообразие фактов проверяется', async () => {
  const b = builder(); assert.equal(b.plan.meta.paletteSource, 'brand'); assert.equal(b.plan.assets.facts.length, 5);
  const scene = (id, facts) => ({ id, component: 'cta_end', duration: 3, props: { headline: 'Salam dünya', button: 'Başla', url: 'a.az' }, ...(facts ? { facts } : {}) });
  for (const [id, f] of [['a', ['F1']], ['b', null], ['c', ['F9']], ['d', ['F1']]]) await b.exec('add_scene', scene(id, f));
  const e = validatePlan(b.plan).errors.map((x) => x.path + ': ' + x.message).join(' | ');
  assert.match(e, /scenes\[1\]\.facts: every scene must be grounded in at least one fact/);
  assert.match(e, /scenes\[2\]\.facts: unknown fact ids: F9/);
  // привязка каждой сцены к факту остаётся ошибкой (это заземление), а «сколько разных фактов» — только рекомендация
  assert.doesNotMatch(e, /distinct fact/);
  assert.ok(validatePlan(b.plan).layers.artistic.recommendations.some((x) => /distinct fact/.test(x.message)));
});

test('ракурсы: выбор не повторяет недавние, история по сайту накапливается', () => {
  const host = `test-${Date.now()}.example`;
  const seen = new Set();
  for (let i = 0; i < 4; i++) { const a = pickAngle(host); assert.ok(!seen.has(a.id), `повтор ${a.id}`); seen.add(a.id); recordRun(host, { angle: a.id, concept: `idea ${i}`, openers: [`opener ${i}`] }); }
  const av = avoidBrief(host); assert.equal(av.angles.length, 4); assert.ok(av.concepts.includes('idea 3'));
  assert.equal(pickAngle(host, { preferred: 'numbers' }).id, 'numbers'); assert.ok(ANGLES.length >= 10);
});
