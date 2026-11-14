// Импорт публичной страницы: сначала обычный fetch, при «тонкой»/JS-странице — резервный
// браузерный захват (headless Chrome: DOM после выполнения скриптов + скриншот для палитры).
import fs from 'node:fs';
import path from 'node:path';
import { fetchPublic, resolvePublicUrl } from './public-fetch.js';
import crypto from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import * as cheerio from 'cheerio';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { CONFIG } from '../config.js';
import { hexToRgb } from '../util.js';
import { rankLinks, buildFacts, fontFamilies, pageBackground, brandIdentity } from './deep.js';
import {imageCandidates,importSourceImages} from './visual-assets.js';

const execFileP = promisify(execFile);
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';
const MAX_BYTES = 3 * 1024 * 1024;

// DNS is pinned to the checked addresses for every redirect and resource.
export async function assertPublicUrl(u) { return (await resolvePublicUrl(u)).url; }
async function fetchHtml(startUrl, lang, signal) {
  const { body, finalUrl } = await fetchPublic(startUrl, { signal, headers: { 'accept-language': `${lang},en;q=0.5` } });
  return { html: body.toString('utf8'), finalUrl };
}

const clean = (s) => String(s || '').replace(/\s+/g, ' ').trim();
const looksLikeCss = (s) => /[{};]|var\(--|function\s*\(|=>/.test(s);

function extract(html, baseUrl) {
  const $ = cheerio.load(html);
  const css = $('style').map((i, e) => $(e).text()).get().join('\n') + ' ' + $('[style]').map((i, e) => $(e).attr('style')).get().join(' ');
  const meta = (sel, attr = 'content') => clean($(sel).attr(attr));
  const out = {
    lang: clean($('html').attr('lang') || meta('meta[property="og:locale"]')).slice(0, 12) || null,
    imageCandidates:imageCandidates(html,baseUrl),
    title: clean($('title').first().text()),
    description: meta('meta[name="description"]') || meta('meta[property="og:description"]'),
    ogTitle: meta('meta[property="og:title"]'), siteName: meta('meta[property="og:site_name"]'),
    themeColor: meta('meta[name="theme-color"]'),
    icons: $('link[rel*="icon"]').map((i, e) => $(e).attr('href')).get().filter(Boolean).map((h) => { try { return new URL(h, baseUrl).toString(); } catch { return null; } }).filter(Boolean),
    logos: $('header img[src], nav img[src], [role="banner"] img[src]')
      .filter((i,e)=>/logo|логотип/i.test(($(e).attr('src')||'')+' '+($(e).attr('alt')||'')))
      .map((i,e)=>$(e).attr('src')).get().map(h=>{try{return new URL(h,baseUrl).toString();}catch{return null;}}).filter(Boolean),
    ogImage: (() => { const v = meta('meta[property="og:image"]'); try { return v ? new URL(v, baseUrl).toString() : null; } catch { return null; } })(),
    headings: $('h1,h2,h3').map((i, e) => clean($(e).text())).get().filter((t) => t && t.length < 120 && !looksLikeCss(t)).slice(0, 12),
  };
  out.links = $('a[href]').map((i, e) => ({ href: $(e).attr('href'), text: clean($(e).text()).slice(0, 60) })).get().filter((l) => l.href && !l.href.startsWith('#') && l.text.length >= 2).slice(0, 200);
  out.lists = $('li').map((i, e) => clean($(e).text())).get().filter((t) => t.length >= 24 && t.length <= 150 && !looksLikeCss(t)).slice(0, 14);
  out.fonts = fontFamilies(css); out.pageBg = pageBackground(css); out.css = css;
  out.sheets = $('link[rel="stylesheet"]').map((i, e) => $(e).attr('href')).get().filter(Boolean).map((h) => { try { return new URL(h, baseUrl).toString(); } catch { return null; } }).filter(Boolean);
  const ui = new Set();
  $('button,input[type=submit],input[type=button]').each((i, e) => { const t = clean($(e).text() || $(e).attr('value') || $(e).attr('aria-label')); if (t && t.length <= 40 && !looksLikeCss(t)) ui.add(t); });
  $('input,textarea').each((i, e) => { for (const a of ['placeholder', 'aria-label', 'title']) { const t = clean($(e).attr(a)); if (t && t.length <= 40 && !looksLikeCss(t)) ui.add(t); } });
  $('a').each((i, e) => { const t = clean($(e).text()); if (t && t.length >= 2 && t.length <= 28 && !looksLikeCss(t)) ui.add(t); });
  out.uiStrings = [...ui].slice(0, 30);
  out.contexts = $('section').map((i,e)=>clean($(e).text())).get().filter(t=>/coming soon|in development|under development|скоро|в разработке|уже в работе/i.test(t)).map(t=>t.slice(0,1400)).slice(0,3);
  $('script,style,noscript,svg').remove();
  const body = clean($('body').text());
  out.textLen = body.length;
  out.textSample = body.slice(0, 900);
  out.paragraphs = $('p').map((i, e) => clean($(e).text())).get().filter((t) => t.length > 30 && t.length < 320).slice(0, 16);
  out.cssColors = colorsFromCss(css);
  return out;
}

// цвета из CSS: частота × насыщенность, серые отбрасываем
function colorsFromCss(css) {
  const counts = {};
  for (const m of css.matchAll(/#([0-9a-fA-F]{6}|[0-9a-fA-F]{3})\b/g)) { const h = '#' + (m[1].length === 3 ? m[1].split('').map((c) => c + c).join('') : m[1]).toLowerCase(); counts[h] = (counts[h] || 0) + 1; }
  for (const m of css.matchAll(/rgba?\(\s*(\d{1,3})[\s,]+(\d{1,3})[\s,]+(\d{1,3})/g)) { const v = [m[1], m[2], m[3]].map(Number); if (v.some((n) => n > 255)) continue; const h = '#' + v.map((n) => n.toString(16).padStart(2, '0')).join(''); counts[h] = (counts[h] || 0) + 1; }
  return rankColors(counts);
}

// Подключаемые таблицы стилей (до 3, не больше 400 КБ каждая): там живёт настоящая фирменная палитра и шрифты.
async function fetchSheets(urls) {
  let css = '';
  for (const u of (urls || []).slice(0, 3)) {
    try { const { body } = await fetchPublic(u, { maxBytes: 400000, timeoutMs: 7000, contentType: /css|text/i }); css += '\n' + body.toString('utf8'); } catch { /* optional stylesheet */ }
  }
  return css;
}

function sat(hex) { const [r, g, b] = hexToRgb(hex).map((v) => v / 255); const mx = Math.max(r, g, b), mn = Math.min(r, g, b); return mx === 0 ? 0 : (mx - mn) / mx; }
function rankColors(counts) {
  return Object.entries(counts).map(([hex, n]) => ({ hex, n, s: sat(hex) })).filter((c) => c.s > 0.25 && Math.max(...hexToRgb(c.hex)) > 60)
    .sort((a, b) => b.n * Math.pow(0.15 + b.s, 2.4) - a.n * Math.pow(0.15 + a.s, 2.4)).slice(0, 6).map((c) => c.hex);   // насыщенные бренд-цвета важнее серо-голубых фонов
}

// Палитра по скриншоту (грубое квантование в 4 бита на канал).
export async function paletteFromImage(file) {
  const img = await loadImage(file);
  const w = 96, h = Math.max(1, Math.round((img.height / img.width) * 96));
  const c = createCanvas(w, h), x = c.getContext('2d'); x.drawImage(img, 0, 0, w, h);
  const d = x.getImageData(0, 0, w, h).data, counts = {};
  for (let i = 0; i < d.length; i += 4) { const q = [d[i], d[i + 1], d[i + 2]].map((v) => (v >> 4) * 16 + 8); const hex = '#' + q.map((v) => v.toString(16).padStart(2, '0')).join(''); counts[hex] = (counts[hex] || 0) + 1; }
  return rankColors(counts);
}

async function browserCapture(url, lang, workDir) {
  fs.mkdirSync(workDir, { recursive: true });
  const profile = fs.mkdtempSync(path.join(workDir, 'chrome-'));
  const shot = path.join(workDir, 'capture.png');
  const common = ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run', '--no-default-browser-check', `--user-data-dir=${profile}`, `--lang=${lang}`, `--accept-lang=${lang}`, `--user-agent=${UA}`, '--window-size=1280,2000', '--virtual-time-budget=9000'];
  try {
    const { stdout } = await execFileP(CONFIG.chromePath, [...common, '--dump-dom', url], { timeout: 45000, maxBuffer: 12 * 1024 * 1024 });
    await execFileP(CONFIG.chromePath, [...common, `--screenshot=${shot}`, url], { timeout: 45000, maxBuffer: 4 * 1024 * 1024 }).catch(() => {});
    return { html: stdout, screenshot: fs.existsSync(shot) ? shot : null };
  } finally { fs.rmSync(profile, { recursive: true, force: true }); }
}

async function fetchLogo(urls, dir) {
  fs.mkdirSync(dir, { recursive: true });
  for (const u of urls.slice(0, 4)) {
    try {
      const { body: buf } = await fetchPublic(u, { maxBytes: 2 * 1024 * 1024, timeoutMs: 8000, contentType: /image/i });
      if (buf.length < 100 || buf.length > 2 * 1024 * 1024) continue;
      const file = path.join(dir, 'logo' + (path.extname(new URL(u).pathname) || '.img'));
      fs.writeFileSync(file, buf);
      await loadImage(file); // проверка, что canvas умеет декодировать
      return { url: u, path: file };
    } catch { /* пробуем следующий */ }
  }
  return null;
}

function brandFrom(x, finalUrl) {
  if (x.siteName) return x.siteName;
  const t = x.ogTitle || x.title;
  if (t) { const first = t.split(/\s[-–—|·:]\s/)[0].trim(); if (first && first.length <= 30) return first; }
  return new URL(finalUrl).hostname.replace(/^www\./, '').split('.')[0];
}

const isThin = (x) => x.textLen < 160 && x.headings.length < 2 && x.uiStrings.length < 4;

// Главная функция импорта.
export async function importSite(urlIn, { lang = 'az', forceBrowser = false, workDir, deep = true, staticOnly = false, maxPages = 6, signal, log = () => {} } = {}) {
  const t0 = Date.now();
  const id = crypto.createHash('sha1').update(urlIn).digest('hex').slice(0, 10);
  const dir = workDir || path.join(CONFIG.cacheDir, `import-${id}`);
  fs.mkdirSync(dir, { recursive: true });
  const warnings = [];
  let via = 'fetch', x = null, finalUrl = null, screenshot = null;

  if (!forceBrowser || staticOnly) {
    try {
      const r = await fetchHtml(urlIn, lang, signal); finalUrl = r.finalUrl;
      x = extract(r.html, finalUrl);
      if (!staticOnly && isThin(x)) { warnings.push('Страница почти без текста в HTML — включён браузерный захват'); x = null; }
    } catch (e) { if (staticOnly) throw e; warnings.push(`fetch не удался (${e.message}) — включён браузерный захват`); }
  }
  if (!x) {
    via = 'browser';
    const u = await assertPublicUrl(finalUrl || urlIn);
    const cap = await browserCapture(u.toString(), lang, dir);
    finalUrl = finalUrl || u.toString(); screenshot = cap.screenshot;
    x = extract(cap.html, finalUrl);
    log(`browser capture: ${x.textLen} chars`);
  }
  if (deep && x.sheets?.length) { const extra = await fetchSheets(x.sheets); if (extra) { x.cssColors = [...new Set([...x.cssColors, ...colorsFromCss(extra)])].slice(0, 6); x.fonts = [...new Set([...x.fonts, ...fontFamilies(extra)])].slice(0, 3); x.pageBg = x.pageBg || pageBackground(extra); } }
  const colors = [...new Set([x.themeColor && /^#/.test(x.themeColor) ? x.themeColor.toLowerCase() : null, ...x.cssColors].filter(Boolean))];
  // цветов в разметке и таблицах нет (стили в JS) — берём палитру со скриншота страницы
  if (deep && !staticOnly && !colors.length && !screenshot) { try { const cap = await browserCapture((await assertPublicUrl(finalUrl)).toString(), lang, dir); screenshot = cap.screenshot; } catch { /* без скриншота — палитра из стиля */ } }
  if (screenshot) for (const c of await paletteFromImage(screenshot).catch(() => [])) if (!colors.includes(c)) colors.push(c);
  const logo = await fetchLogo([...x.logos, ...x.icons].filter(Boolean), dir);
  const images = await importSourceImages(x.imageCandidates,path.join(dir,'images'),{signal});
  const brand = brandFrom(x, finalUrl);
  // ── глубокий импорт: несколько страниц сервиса → факты с источниками ──
  const pages = [{ url: finalUrl, title: x.title, description: x.description, headings: x.headings, paragraphs: x.paragraphs, lists: x.lists, contexts:x.contexts }];
  const fontsAll = [...x.fonts];
  if (deep) {
    const picks = rankLinks(x.links || [], finalUrl, maxPages);
    const got = await Promise.allSettled(picks.map((p) => fetchHtml(p.href, lang, signal).then((r) => ({ r, p }))));
    for (const g of got) {
      if (g.status !== 'fulfilled') continue;
      try { if (/(signin|sign-in|login|ServiceLogin|accounts\.)/i.test(g.value.r.finalUrl)) continue; const pg = extract(g.value.r.html, g.value.r.finalUrl); if (pg.textLen < 120) continue; pages.push({ url: g.value.r.finalUrl, title: pg.title, description: pg.description, headings: pg.headings, paragraphs: pg.paragraphs, lists: pg.lists }); for (const f of pg.fonts) if (!fontsAll.includes(f)) fontsAll.push(f); } catch { /* страница не разобралась — пропускаем */ }
    }
    if (pages.length < 2) warnings.push('глубокий обход: дополнительные страницы не прочитались (JS-сайт или закрытые разделы) — фактов меньше');
  }
  const facts = buildFacts(pages);
  const identity = brandIdentity({ colors: colors.slice(0, 5), fonts: fontsAll, bg: x.pageBg, themeColor: x.themeColor });
  const host = new URL(finalUrl).hostname.replace(/^www\./, '');
  const result = {
    ok: true, via, url: urlIn, finalUrl, host, lang: (x.lang || lang).slice(0, 5), brand, title: x.title,images,
    description: x.description || x.paragraphs[0] || '', headings: x.headings, paragraphs: x.paragraphs, uiStrings: x.uiStrings,
    colors: colors.slice(0, 6), logo: logo ? { url: logo.url, path: logo.path } : null, screenshot, textSample: x.textSample, textLen: x.textLen,
    facts, pages: pages.map((p) => ({ url: p.url, title: p.title })), identity,
    warnings, ms: Date.now() - t0,
  };
  fs.writeFileSync(path.join(dir, 'import.json'), JSON.stringify(result, null, 2));
  return result;
}

// Компактная сводка для режиссёра (токены = деньги).
export function summarizeImport(imp) {
  return {
    url: imp.finalUrl, host: imp.host, brand: imp.brand, page_lang: imp.lang, title: imp.title,
    description: (imp.description || '').slice(0, 220),
    headings: imp.headings.slice(0, 6), ui_strings: imp.uiStrings.slice(0, 18),
    brand_colors: imp.colors.slice(0, 4), has_logo: Boolean(imp.logo), text_sample: imp.textSample.slice(0, 380),
    import_via: imp.via,
    facts: (imp.facts || []).map((f) => `${f.id}: ${f.text}`),
    pages_read: (imp.pages || []).map((p) => p.url),
    brand_identity: imp.identity || null,
  };
}
