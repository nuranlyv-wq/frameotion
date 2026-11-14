// Шрифты: в каждом встроенном файле есть все азербайджанские буквы, регистрация в canvas работает,
// а старые системные названия не просачиваются в рендер.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createCanvas, GlobalFonts } from '@napi-rs/canvas';
import * as fontkit from 'fontkit';
import { FONT_FILES, FONT_ROLES, FONT_NAMES, FONTS_DIR, AZ_LETTERS, BUNDLED_FAMILIES, DEFAULT_FAMILY, registerFonts, resolveFamily, fontFor } from '../src/render/fonts.js';
import { fontStr } from '../src/render/draw.js';

test('каждый встроенный шрифтовой файл содержит все 14 азербайджанских букв', () => {
  for (const f of FONT_FILES) {
    const font = fontkit.openSync(path.join(FONTS_DIR, f.file));
    const missing = [...AZ_LETTERS].filter((ch) => !font.hasGlyphForCodePoint(ch.codePointAt(0)));
    assert.deepEqual(missing, [], `${f.file}: нет глифов ${missing.join('')}`);
  }
});

test('все файлы на месте и зарегистрированы, повторная регистрация ничего не ломает', () => {
  const a = registerFonts(), b = registerFonts();
  assert.equal(a, b);
  assert.deepEqual(a.missing, []);
  assert.equal(a.ok.length, FONT_FILES.length);
  const fams = GlobalFonts.families.map((x) => x.family);
  for (const fam of BUNDLED_FAMILIES) assert.ok(fams.includes(fam), `семейство не зарегистрировано: ${fam}`);
});

test('роли указывают только на встроенные семейства; курсив есть там, где роль его просит', () => {
  for (const [name, r] of Object.entries(FONT_ROLES)) {
    assert.ok(BUNDLED_FAMILIES.includes(r.family), `${name}: ${r.family}`);
    assert.ok(FONT_FILES.some((f) => f.family === r.family && f.italic === r.italic && f.weight === r.weight), `${name}: нет файла ${r.family} ${r.weight}${r.italic ? ' italic' : ''}`);
    assert.ok(r.k > 0.8 && r.k < 1.4, `${name}: k=${r.k}`);
  }
  assert.ok(FONT_NAMES.includes('display') && FONT_NAMES.length >= 11);
});

test('старые системные названия превращаются во встроенные, неизвестные — в Inter', () => {
  assert.equal(resolveFamily('Helvetica Neue'), 'Inter');
  assert.equal(resolveFamily('Arial Black'), 'Montserrat');
  assert.equal(resolveFamily('Georgia'), 'Source Serif 4');
  assert.equal(resolveFamily('Menlo'), 'IBM Plex Mono');
  assert.equal(resolveFamily('oswald'), 'Oswald');
  assert.equal(resolveFamily('Comic Sans'), DEFAULT_FAMILY);
  assert.equal(resolveFamily(undefined), DEFAULT_FAMILY);
  assert.equal(fontFor('display', { family: 'Avenir Next', weight: 900 }).family, 'Montserrat');
  assert.ok(fontStr(800, 40, 'Helvetica Neue').includes('"Inter"'));
});

test('вес и курсив реально переключают начертание (ширина текста меняется)', () => {
  const ctx = createCanvas(10, 10).getContext('2d');
  const w = (font) => { ctx.font = font; return ctx.measureText('Axtarış Əlaqə İşıq').width; };
  assert.ok(w('900 80px "Inter"') > w('400 80px "Inter"') * 1.05, 'Inter 900 должен быть шире Inter 400');
  assert.ok(Math.abs(w('italic 700 80px "Source Serif 4"') - w('700 80px "Source Serif 4"')) > 1, 'курсив Source Serif 4 должен отличаться');
  assert.ok(w('700 80px "Oswald"') < w('700 80px "Montserrat"') * 0.8, 'Oswald уже Montserrat');
});

test('азербайджанские буквы рисуются тем же шрифтом, а не запасным: ширина ə совпадает с метрикой файла', () => {
  const ctx = createCanvas(10, 10).getContext('2d');
  for (const f of FONT_FILES.filter((x) => !x.italic)) {
    const font = fontkit.openSync(path.join(FONTS_DIR, f.file));
    const want = font.glyphForCodePoint(0x259).advanceWidth / font.unitsPerEm * 100;
    ctx.font = `${f.weight} 100px "${f.family}"`;
    const got = ctx.measureText('ə').width;
    assert.ok(Math.abs(got - want) < 1.5, `${f.family} ${f.weight}: ə ${got.toFixed(1)} против ${want.toFixed(1)} — возможно, использован запасной шрифт`);
  }
});

test('в коде нет зашитых системных шрифтов (кроме таблицы псевдонимов)', () => {
  const root = path.resolve(FONTS_DIR, '../../src');
  const bad = /Helvetica|Arial Black|Georgia|Menlo|Optima|Rockwell|Bodoni|DIN Condensed|Marker Felt|American Typewriter|Avenir/;
  const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : /\.(js|mjs|json)$/.test(e.name) ? [path.join(d, e.name)] : []));
  const hits = walk(root).filter((f) => !f.endsWith(path.join('render', 'fonts.js'))).filter((f) => bad.test(fs.readFileSync(f, 'utf8')));
  assert.deepEqual(hits.map((f) => path.relative(root, f)), []);
});
