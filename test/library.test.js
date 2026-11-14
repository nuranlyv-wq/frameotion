import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { search, read, LibrarySession, LIB_ROOT, loadIndex } from '../src/library/index.js';
import { PlanBuilder, TOOL_DEFS } from '../src/director/tools.js';
import { getStyle } from '../src/styles/presets.js';

test('библиотека проиндексирована: 4 источника, 66+ промптов стилей, лицензии и NOTICE на месте', () => {
  const idx = loadIndex();
  const src = new Set(idx.docs.map((d) => d.source));
  assert.deepEqual([...src].sort(), ['ffmpeg-skill', 'huashu', 'lemo', 'openfilm']);
  assert.ok(idx.docs.filter((d) => d.kind === 'style').length >= 66);
  assert.ok(idx.docs.filter((d) => d.kind === 'license').length >= 4);
  const notice = fs.readFileSync(path.join(LIB_ROOT, 'NOTICE.md'), 'utf8');
  for (const n of ['lemo-opuscar', 'openfilm', 'huashu-motion', 'ffmpeg-skill', 'CC BY 4.0']) assert.ok(notice.includes(n), n);
});

test('в vendor нет символических ссылок и файлов вне папки (безопасность распаковки)', () => {
  const stack = [path.join(LIB_ROOT, 'vendor')]; let n = 0;
  while (stack.length) { const d = stack.pop(); for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); const st = fs.lstatSync(p); assert.ok(!st.isSymbolicLink(), `symlink: ${p}`); if (st.isDirectory()) stack.push(p); else n++; } }
  assert.ok(n > 3000);
});

test('поиск находит нужные руководства; пустой запрос — каталог', () => {
  assert.ok(search('rhythm energy curve', { limit: 3 }).some((r) => /rhythm\.md$/.test(r.id)));
  assert.ok(search('kinetic typography', { limit: 4 }).some((r) => /kinetic-type\.md$/.test(r.id)));
  assert.ok(search('', { limit: 8 }).length >= 4);
  assert.ok(search('swiss', { source: 'lemo', kind: 'style' }).every((r) => r.id.startsWith('lemo:styles/')));
});

test('чтение: конверт «недоверенные данные», страницы по offset, неизвестный id и обход пути отклоняются', () => {
  const s = new LibrarySession();
  const a = s.read({ id: 'huashu:skills/huashu-motion/references/rhythm.md' });
  assert.match(a.note, /untrusted data/); assert.ok(a.text.length > 1000 && a.nextOffset);
  const b = s.read({ id: 'huashu:skills/huashu-motion/references/rhythm.md', offset: a.nextOffset });
  assert.notEqual(b.text.slice(0, 80), a.text.slice(0, 80));
  assert.throws(() => read('nope:x'), /unknown library id/);
  assert.throws(() => read('huashu:../../../../etc/passwd'), /unknown library id/);
});

test('лимиты на прогон и атрибуция CC BY при чтении промпта стиля', () => {
  const s = new LibrarySession({ maxReads: 2 });
  s.read({ id: 'huashu:README.md' });
  assert.deepEqual(s.credits(), []);
  const styleId = loadIndex().docs.find((d) => d.kind === 'style').id;
  s.read({ id: styleId });
  assert.match(s.credits()[0], /CC BY 4\.0/);
  assert.throws(() => s.read({ id: 'huashu:README.md' }), /read limit/);
  const small = new LibrarySession({ maxChars: 3000 }); small.read({ id: 'huashu:skills/huashu-motion/references/rhythm.md' });
  assert.throws(() => small.read({ id: 'huashu:README.md' }), /character budget/);
});

test('инструменты режиссёра: library_search / library_read доступны и пишут титры в план', async () => {
  assert.ok(['library_search', 'library_read'].every((n) => TOOL_DEFS.some((t) => t.name === n)));
  const imp = { brand: 'T', title: 'T', description: '', headings: [], paragraphs: [], uiStrings: [], colors: [], textSample: '', identity: { colors: [], fonts: [], mode: 'light' }, facts: [] };
  const b = new PlanBuilder({ imp, style: getStyle('clean'), dynamism: 'medium', mode: 'silent', length: 'short' });
  const r = JSON.parse((await b.exec('library_search', { query: 'swiss motion graphics', kind: 'style' })).content);
  assert.ok(r.results.length > 0 && r.sources.length === 4);
  const rd = JSON.parse((await b.exec('library_read', { id: r.results[0].id })).content);
  assert.ok(rd.text.length > 500 && /lemo/.test(rd.source));
  assert.match(b.plan.meta.credits[0], /CC BY 4\.0/);
  const bad = await b.exec('library_read', { id: 'huashu:../../x' }); assert.equal(bad.isError, true);
});
