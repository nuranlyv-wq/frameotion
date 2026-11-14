// Чистые функции глубокого импорта: какие страницы сайта читать, как собрать из них ФАКТЫ с источниками
// и как определить фирменную идентичность (цвета, шрифты, светлая/тёмная тема). Сеть здесь не используется.
import { hexToRgb, luminance } from '../util.js';

const GENERIC_TOKENS = new Set(['www', 'com', 'net', 'org', 'co', 'io', 'app', 'dev', 'en', 'az', 'ru', 'tr', 'uk', 'us', 'eu', 'de', 'fr', 'gov', 'edu', 'info', 'biz', 'me']);
const tokens = (host) => host.toLowerCase().split('.').filter((t) => t && !GENERIC_TOKENS.has(t));
export const sameBrandHost = (a, b) => { const A = new Set(tokens(a)); return tokens(b).some((t) => A.has(t)); };

const KEYS = /(about|product|features?|how[-_]?|pricing|plans?|solutions?|services?|platform|why|overview|what[-_]is|learn|tour|business|apps?|download|haqq|xidm|m[əe]hsul|qiym|imkan|[öo]z[əe]llik|proqram|услуг|продукт|о-нас|о-компании|возможност|works)/i;
const SKIP = /(login|signin|sign-in|signup|sign-up|register|privacy|terms|cookie|legal|polic|career|jobs|press|contact|support|help|faq|cart|checkout|account|settings|mailto:|tel:|javascript:|logout|\.(pdf|zip|png|jpe?g|svg|mp4|webp|gif)(\?|$))/i;

// Выбор страниц для чтения. links: [{href, text}] с главной; возвращает до max адресов по убыванию полезности.
export function rankLinks(links, baseUrl, max = 6) {
  const base = new URL(baseUrl), seen = new Set([base.origin + base.pathname.replace(/\/$/, '')]), scored = [];
  for (const l of links) {
    let u; try { u = new URL(l.href, baseUrl); } catch { continue; }
    if (!/^https?:$/.test(u.protocol)) continue;
    const key = u.origin + u.pathname.replace(/\/$/, ''); if (seen.has(key)) continue;
    const hay = `${u.pathname} ${l.text || ''}`;
    if (SKIP.test(hay) || SKIP.test(u.href)) continue;
    const same = u.hostname === base.hostname, brand = same || sameBrandHost(u.hostname, base.hostname);
    if (!brand) continue;
    let score = (KEYS.test(hay) ? 3 : 0) + (same ? 1 : 0) + (u.pathname.split('/').filter(Boolean).length <= 2 ? 1 : 0) - (u.search ? 1 : 0);
    if (score <= 0) continue;
    seen.add(key); scored.push({ href: u.toString(), score, text: l.text });
  }
  return scored.sort((a, b) => b.score - a.score).slice(0, max);
}

const NUM = /(\d[\d\s.,]*)\s?(%|\+|[kKmMbB]\b|million|billion|milyon|milyard|min|dəq|saniy|ms\b|ölkə|dil|dilləri|istifadəçi|users|countries|languages|years|il\b|gün|manat|₼|\$|€)/;
const sentences = (t) => String(t).split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter((s) => s.length >= 24 && s.length <= 190);

// Факты из страниц. pages: [{url, title, description, headings, paragraphs, lists}] — главная первой.
export function buildFacts(pages, cap = 36) {
  const facts = [], seen = new Set();
  const add = (text, url, kind) => {
    const t = String(text).replace(/\s+/g, ' ').trim().slice(0, kind==='availability'?1400:320);
    const k = t.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
    if (t.length < 12 || seen.has(k) || /[{}]|function\s*\(/.test(t) || /^(footer links|menu|skip to|cookie|accept|sign in|log in|search|share|follow|want to create|subscribe|get the latest news)/i.test(t)) return;
    seen.add(k); facts.push({ text: t, url, kind });
  };
  pages.forEach((p) => {
    (p.contexts||[]).forEach(t=>add(t,p.url,'availability'));
    if (p.description) add(p.description, p.url, 'description');
    (p.headings || []).slice(0, 6).forEach((h) => add(h, p.url, 'heading'));
    for (const para of (p.paragraphs || []).slice(0, 8)) { for (const s of sentences(para).filter((x) => NUM.test(x)).slice(0, 2)) add(s, p.url, 'number'); }
    (p.paragraphs || []).slice(0, 12).forEach((x) => add(x, p.url, 'text'));
    (p.lists || []).slice(0, 8).forEach((x) => add(x, p.url, 'list'));
  });
  // Availability and qualifying sentences must not be crowded out by bare headings.
  const rank = { availability:-1, number:0, text:1, description:2, list:3, heading:4 };
  facts.sort((a, b) => rank[a.kind] - rank[b.kind]);
  return facts.slice(0, cap).map((f, i) => ({ id: `F${i + 1}`, ...f }));
}

const GENERIC_FONTS = /^(sans-serif|serif|monospace|cursive|fantasy|system-ui|ui-[a-z-]+|inherit|initial|unset|-apple-system|blinkmacsystemfont|segoe ui|roboto|helvetica|helvetica neue|arial|apple color emoji|noto color emoji|segoe ui emoji)$/i;
export function fontFamilies(css) {
  const counts = {};
  for (const m of String(css).matchAll(/font-family\s*:\s*([^;}{]+)/gi)) for (const raw of m[1].split(',').slice(0, 2)) { let f = raw.replace(/["']/g, '').replace(/!important/i, '').trim(); const hm = f.match(/^__(.+?)_[0-9a-f]{6}$/); if (hm) f = hm[1].replace(/_/g, ' '); if (f && !GENERIC_FONTS.test(f) && f.length < 40 && !/var\(|--/.test(f)) counts[f] = (counts[f] || 0) + 1; }
  return Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([f]) => f);
}

export function pageBackground(css) {
  const m = String(css).match(/(?:body|html)\s*[^{}]*\{[^}]*background(?:-color)?\s*:\s*(#[0-9a-fA-F]{3,6})\b/);
  return m ? m[1] : null;
}

// Фирменная идентичность: цвета, шрифты, тема. bg — цвет страницы, если найден.
export function brandIdentity({ colors = [], fonts = [], bg = null, themeColor = null }) {
  let mode = 'light';
  const probe = bg || (themeColor && /^#/.test(themeColor) ? themeColor : null);
  if (probe) { const [r, g, b] = hexToRgb(probe); mode = luminance(probe) < 0.25 || (r + g + b) / 3 < 90 ? 'dark' : 'light'; }
  return { colors: colors.slice(0, 5), fonts: fonts.slice(0, 3), mode, pageBg: bg || null };
}
