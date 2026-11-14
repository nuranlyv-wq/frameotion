import path from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';
import { load } from 'cheerio';
import { openBrowser } from '@remotion/renderer';
import { CONFIG } from '../config.js';
import { abortable } from '../production/control.js';
import { fetchPublic } from './public-fetch.js';

const CSP = [
  "default-src 'none'", "script-src 'none'", "style-src https: http: 'unsafe-inline'",
  "img-src https: http: data:", "font-src https: http: data:", "base-uri 'none'",
  "form-action 'none'", 'sandbox allow-same-origin',
].join('; ');
const resourceTypes = {
  Stylesheet: /^(text\/css)(;|$)/i,
  Image: /^image\//i,
  Font: /^(font\/|application\/(font|x-font|octet-stream|vnd\.ms-fontobject))/i,
};

// Run inside the capture browser. Selection is based on rendered DOM geometry.
function pickLayers(focus, nested, expanded) {
  const root = document.querySelector('main') || document.body;
  const bounds = element => {
    const { x, y, width, height } = element.getBoundingClientRect();
    return { x: x + scrollX, y: y + scrollY, width, height };
  };
  const visible = element => {
    const { width, height } = bounds(element);
    const style = getComputedStyle(element);
    return width >= 30 && height >= 16 && style.visibility === 'visible' && Number(style.opacity) > 0;
  };
  const copy = element => element.innerText?.replace(/\s+/g, ' ').trim().slice(0, 360) || element.alt || '';
  const heading = [...root.querySelectorAll('h1,h2')].find(visible);
  if (!heading) return null;
  const hero = heading.closest('section') || root;
  const buttons = [...hero.querySelectorAll('button,a[href]')].filter(el => visible(el) && copy(el));
  const cta = buttons.find(el => {
    const { width, height } = bounds(el);
    return height >= 30 && width < innerWidth * .95;
  });
  const candidates = [...root.querySelectorAll('article,figure,img,[class*="card" i]')].filter(el => {
    const { width, height, y } = bounds(el);
    return visible(el) && !el.contains(heading) && width >= 110 && width <= innerWidth * .95 &&
      height >= 65 && height <= innerHeight * .75 && y < innerHeight * 4 && (copy(el).length >= 16 || el.tagName === 'IMG');
  });
  const visual = candidates.filter(el => hero.contains(el) && bounds(el).y + bounds(el).height < innerHeight - 10);
  visual.sort((a, b) => Number(b.tagName !== 'IMG' && getComputedStyle(b).boxShadow !== 'none') -
    Number(a.tagName !== 'IMG' && getComputedStyle(a).boxShadow !== 'none') || copy(b).length - copy(a).length);
  let primary = visual[0] || (cta && bounds(cta).y + bounds(cta).height < innerHeight - 10 ? cta : heading);
  // Include decorative badges attached to a card, but keep its surrounding grid intact.
  if (visual[0] && primary.parentElement !== hero) {
    const parent = primary.parentElement;
    if (getComputedStyle(parent).position === 'relative' && bounds(parent).width <= bounds(primary).width + 12 &&
      [...parent.children].some(el => el !== primary && getComputedStyle(el).position === 'absolute')) primary = parent;
  }
  const terms = focus.toLowerCase().match(/[\p{L}\p{N}]{4,}/gu) || [];
  const relevance = el => terms.filter(term => copy(el).toLowerCase().includes(term)).length;
  const secondary = [];
  for (const el of [...candidates].sort((a, b) => relevance(b) - relevance(a))) {
    if (hero.contains(el) || el.contains(hero) || secondary.some(other => other.contains(el) || el.contains(other))) continue;
    if (/coming soon|in development|в разработке|уже в работе/i.test(copy(el))) continue;
    secondary.push(el);
    if (secondary.length === 2) break;
  }
  if (secondary.length < 2) {
    const sectionHeadings = [...root.querySelectorAll('h2,h3')].filter(el =>
      visible(el) && !hero.contains(el) && !secondary.some(other => other.contains(el)) &&
      bounds(el).y < innerHeight * 4 && !/coming soon|in development|в разработке|уже в работе/i.test(copy(el)));
    secondary.push(...sectionHeadings.slice(0, 2 - secondary.length));
  }
  if (secondary.length === 0) {
    const paragraph = [...hero.querySelectorAll('p')].find(el => visible(el) && !primary.contains(el) && copy(el).length >= 20);
    if (paragraph) secondary.push(paragraph);
  }
  const items = [['primary', primary], ...secondary.map((el, i) => ['detail' + (i + 1), el])];
  if (nested) {
    const normalize = el => copy(el).normalize('NFKC').toLowerCase();
    const badges = [...primary.querySelectorAll('span,div,small,strong,a,button')].filter(el => {
      if (!visible(el) || copy(el).length < 3 || copy(el).length > 70) return false;
      const { width, height } = bounds(el);
      const style = getComputedStyle(el);
      return width < bounds(primary).width * .85 && height <= 84 &&
        parseFloat(style.borderTopLeftRadius) >= Math.min(14, height / 4) &&
        style.backgroundColor !== 'rgba(0, 0, 0, 0)';
    });
    const used = new Set();
    for (const [index, detail] of secondary.entries()) {
      const labels = new Set([detail, ...detail.querySelectorAll('h2,h3,h4,div,span,p,strong')].filter(visible).map(normalize));
      const badge = badges.find(el => !used.has(el) && labels.has(normalize(el)));
      if (!badge) continue;
      used.add(badge);
      items.push(['badge' + (index + 1), badge, 'detail' + (index + 1)]);
    }
  }
  if (cta && cta !== primary && !primary.contains(cta)) items.push(['cta', cta]);
  const brand = [...document.querySelectorAll('header a[href],header img')].find(el =>
    visible(el) && (el.tagName === 'IMG' || el.querySelector('img,svg')) && bounds(el).width < innerWidth * .35);
  if (brand && !primary.contains(brand)) items.push(['brand', brand]);
  if (heading !== primary && !primary.contains(heading)) items.push(['headline', heading]);
  if (expanded) {
    let chapter = 0;
    for (const section of root.querySelectorAll('section')) {
      if (section === hero || section.contains(hero) || hero.contains(section)) continue;
      const title = section.querySelector('h2,h3');
      if (!title || !visible(title) || /coming soon|in development|в разработке|уже в работе/i.test(copy(title))) continue;
      const peers = new Map();
      for (const element of section.querySelectorAll('article,[class*="card" i],a[href]')) {
        const { width, height } = bounds(element);
        const text = copy(element);
        if (!visible(element) || element.contains(title) || secondary.includes(element) ||
          width < 110 || width > innerWidth || height < 65 || height > innerHeight * .65 ||
          text.length < 18 || text.length > 260) continue;
        const siblings = peers.get(element.parentElement) || [];
        siblings.push(element);
        peers.set(element.parentElement, siblings);
      }
      const cards = [...peers.values()].sort((a, b) => b.length - a.length)[0];
      if (!cards || cards.length < 2) continue;
      chapter++;
      items.push(['chapter' + chapter + '-title', title]);
      cards.slice(0, 3).forEach((card, i) => items.push(['chapter' + chapter + '-item' + (i + 1), card]));
      if (chapter === 3) break;
    }
  }
  const layers = items.map(([role, element, destination]) => {
    element.setAttribute('data-kadr-capture', role);
    let box = bounds(element);
    let text = copy(element);
    if (/^chapter\d+-title$/.test(role)) {
      const range = document.createRange();
      const textBounds = node => {
        range.selectNodeContents(node);
        const rect = range.getBoundingClientRect();
        return { x: rect.x + scrollX, y: rect.y + scrollY, width: rect.width, height: rect.height };
      };
      const titleBox = textBounds(element);
      if (titleBox.width && titleBox.height) box = titleBox;
      const eyebrow = element.previousElementSibling;
      const label = eyebrow && copy(eyebrow);
      if (label && label.length <= 45 && visible(eyebrow)) {
        const labelBox = textBounds(eyebrow);
        const x = Math.min(box.x, labelBox.x), y = Math.min(box.y, labelBox.y);
        box = { x, y, width: Math.max(box.x + box.width, labelBox.x + labelBox.width) - x,
          height: Math.max(box.y + box.height, labelBox.y + labelBox.height) - y };
        eyebrow.setAttribute('data-kadr-capture', role);
        text = label + ' · ' + text;
      }
    }
    const boxes = [box, ...[...element.children].filter(el => getComputedStyle(el).position === 'absolute').map(bounds)];
    const x = Math.max(0, Math.floor(Math.min(...boxes.map(b => b.x)) - 10));
    const y = Math.max(0, Math.floor(Math.min(...boxes.map(b => b.y)) - 10));
    const right = Math.min(innerWidth, Math.ceil(Math.max(...boxes.map(b => b.x + b.width)) + 10));
    const bottom = Math.ceil(Math.max(...boxes.map(b => b.y + b.height)) + 10);
    return { role, text, box: { x, y, width: right - x, height: bottom - y },
      ...(destination ? { destination, ink: box, background: getComputedStyle(element).backgroundColor } : {}) };
  });
  let background;
  for (let element = hero; element; element = element.parentElement) {
    const value = getComputedStyle(element).backgroundColor;
    if (value !== 'transparent' && value !== 'rgba(0, 0, 0, 0)') { background = value; break; }
  }
  return { heading: copy(heading), background,
    accent: cta && getComputedStyle(cta).backgroundColor,
    foreground: getComputedStyle(heading).color, layers };
}

// This sampler runs in the same restricted browser as layer capture. Sample paint
// on the page's first screen and ignore unused CSS and image pixels.
function pickAppearance() {
  const probe = document.createElement('canvas');
  probe.width = probe.height = 1;
  const ctx = probe.getContext('2d',{willReadFrequently:true});
  const color = css => {
    ctx.clearRect(0,0,1,1);
    ctx.fillStyle = 'transparent';
    ctx.fillStyle = css;
    ctx.fillRect(0,0,1,1);
    const [r,g,b,a] = ctx.getImageData(0,0,1,1).data;
    return a === 255 ? '#' + [r,g,b].map(value => value.toString(16).padStart(2,'0')).join('') : null;
  };
  const visible = element => {
    const {left,right,top,bottom,width,height} = element.getBoundingClientRect();
    return width >= 24 && height >= 16 && right > 0 && left < innerWidth && bottom > 0 && top < innerHeight &&
      element.checkVisibility({checkOpacity:true,checkVisibilityCSS:true});
  };
  const main = document.querySelector('main,[role="main"]') || document.body;
  const heading = [...main.querySelectorAll('h1,h2,[role="heading"]')].find(element =>
    !element.closest('header,nav,footer,[aria-hidden="true"]') && visible(element) && element.innerText.trim());
  const hero = heading?.closest('section,[role="region"]') || main;
  let background;
  for (let element = heading?.parentElement || hero; element; element = element.parentElement) {
    if (element.getBoundingClientRect().width < innerWidth * .55) continue;
    background = color(getComputedStyle(element).backgroundColor);
    if (background) break;
  }
  background ||= '#ffffff'; // Chromium's default canvas paint for a transparent page.
  const foreground = color(getComputedStyle(heading || main).color);
  const controls = [...document.querySelectorAll('button,a[href],input[type="submit"],[role="button"]')]
    .filter(element => visible(element) && !element.closest('footer,aside,[role="dialog"],[aria-hidden="true"]'))
    .map(element => {
      const style = getComputedStyle(element), fill = color(style.backgroundColor), ink = color(style.color);
      const label = (element.innerText || element.value || element.getAttribute('aria-label') || '').trim();
      const {width,height,top} = element.getBoundingClientRect();
      if (!fill || fill === background || !ink || !label || height < 28 || width < 56) return null;
      return {fill,ink,label:label.replace(/\s+/g,' ').slice(0,80),
        rank:(hero.contains(element) ? 120 : 0) + (element.matches('button,input,[role="button"]') ? 30 : 0) +
          Math.min(40,width * height / 750) - top / innerHeight * 30};
    }).filter(Boolean).sort((a,b) => b.rank - a.rank);
  return {background,foreground,heading:heading?.innerText.trim().replace(/\s+/g,' ').slice(0,120),
    controls:controls.slice(0,12).map(({rank,...control}) => control)};
}

function placeStreamedSections(html) {
  // React can put completed SSR content in a hidden S: fragment and move it with
  // $RC. Replay just that DOM relocation before removing all scripts.
  for (const script of html('script:not([src])').toArray()) {
    for (const [,slotId,sectionId] of html(script).text().matchAll(/\$RC\("(B:[a-z0-9]+)","(S:[a-z0-9]+)"\)/gi)) {
      const slot = html(`template[id="${slotId}"]`).first();
      const section = html(`div[hidden][id="${sectionId}"]`).first();
      if (!slot.length || !section.length || section.find(slot).length) continue;
      const fallback = [];
      let depth = 0, close;
      for (let node = slot[0].next; node; node = node.next) {
        if (node.type === 'comment' && /^\$[?!]?$/.test(node.data)) depth++;
        if (node.type === 'comment' && node.data === '/$') {
          if (!depth) { close = node; break; }
          depth--;
        }
        fallback.push(node);
      }
      if (!close) continue;
      slot.replaceWith(section.contents());
      for (const node of fallback) html(node).remove();
      section.remove();
    }
  }
}

export async function captureWebsite(url, { dir, width, height, focus = '', nested = false, expanded = false,
  appearanceOnly = false, signal }) {
  const document = await fetchPublic(url, { signal, contentType: /^text\/html\b/i });
  const navigationUrl = new URL(document.finalUrl);
  navigationUrl.hash = '';
  const html = load(document.body.toString('utf8'));
  placeStreamedSections(html);
  html('script,base,iframe,object,embed,meta[http-equiv="refresh" i],link:not([rel~="stylesheet"])').remove();
  if (appearanceOnly) html('img,source').removeAttr('src').removeAttr('srcset');
  document.body = Buffer.from(html.html());
  document.contentType = 'text/html; charset=utf-8';
  const deadline = AbortSignal.timeout(45000);
  const stop = signal ? AbortSignal.any([deadline, signal]) : deadline;
  const browser = await openBrowser('chrome', { browserExecutable: CONFIG.chromePath, logLevel: 'error' });
  try {
    const page = await browser.newPage({ context: () => null, logLevel: 'error', indent: false,
      pageIndex: 0, onBrowserLog: () => {}, onLog: () => {} });
    const client = page._client();
    await page.setViewport({ width, height, deviceScaleFactor: 1 });
    await client.send('Network.setBypassServiceWorker', { bypass: true });
    await client.send('Network.setCacheDisabled', { cacheDisabled: true });
    let remaining = 60;
    let remainingBytes = 18 * 1024 * 1024;
    let firstDocument = true;
    client.on('Fetch.requestPaused', async ({ requestId, request, resourceType }) => {
      try {
        const isDocument = firstDocument && resourceType === 'Document' && request.url === navigationUrl.href;
        const type = appearanceOnly && resourceType === 'Image' ? null : resourceTypes[resourceType];
        if (request.method !== 'GET' || (!isDocument && (!type || remaining-- <= 0))) throw new Error('Capture request blocked');
        if (isDocument) firstDocument = false;
        const resource = isDocument ? document : await fetchPublic(request.url, {
          signal: stop, maxBytes: 3 * 1024 * 1024, timeoutMs: 8000, contentType: type,
          headers: { accept: '*/*' },
        });
        if (!isDocument && (remainingBytes -= resource.body.length) < 0) throw new Error('Capture byte limit');
        const headers = [{ name: 'Content-Type', value: resource.contentType }];
        if (isDocument) headers.push({ name: 'Content-Security-Policy', value: CSP });
        if (!isDocument) headers.push({ name: 'Access-Control-Allow-Origin', value: '*' });
        await client.send('Fetch.fulfillRequest', { requestId, responseCode: 200, responseHeaders: headers,
          body: resource.body.toString('base64') });
      } catch {
        await client.send('Fetch.failRequest', { requestId, errorReason: 'BlockedByClient' }).catch(() => {});
      }
    });
    await client.send('Fetch.enable', { patterns: [{ urlPattern: '*' }] });
    await abortable(page.goto({ url: navigationUrl.href, timeout: 30000 }), stop);
    if (appearanceOnly) {
      const appearance = await abortable(page.evaluate(pickAppearance), stop);
      return {...appearance,url:document.finalUrl};
    }
    await abortable(page.evaluate(async () => {
      const css = window.document.createElement('style');
      css.textContent = '*{animation:none!important;transition:none!important;scroll-behavior:auto!important}';
      window.document.head.append(css);
      for (const img of window.document.images) img.loading = 'eager';
      await window.document.fonts.ready;
      await Promise.race([
        Promise.allSettled([...window.document.images].slice(0, 40).map(img => img.decode())),
        new Promise(resolve => setTimeout(resolve, 1800)),
      ]);
    }), stop);
    const selection = await abortable(page.evaluate(pickLayers, focus, nested, expanded), stop);
    if (!selection?.heading || !selection.layers.length) throw new Error('На странице не найден доступный заголовок и блок для анимации');
    await mkdir(dir, { recursive: true });
    const save = async (role, box) => {
      const file = path.join(dir, role + '.png');
      const { value: { data } } = await abortable(client.send('Page.captureScreenshot', {
        format: 'png', captureBeyondViewport: true, clip: { ...box, scale: 1 },
      }), stop);
      await writeFile(file, Buffer.from(data, 'base64'));
      return file;
    };
    const opening = { x: 0, y: 0, width, height };
    const primary = selection.layers[0];
    if (primary.box.y + primary.box.height > height) throw new Error('Главный блок выходит за пределы первого кадра сайта');
    await save('page', opening);
    await page.evaluate(() => {
      const style = window.document.createElement('style');
      style.id = 'kadr-capture-visibility';
      style.textContent = '[data-kadr-capture="primary"],[data-kadr-capture="primary"] *{visibility:hidden!important}';
      window.document.head.append(style);
    });
    const openingFile = await save('opening', opening);
    await client.send('Emulation.setDefaultBackgroundColorOverride', { color: { r: 0, g: 0, b: 0, a: 0 } });
    const layers = [{ role: 'opening', text: selection.heading, box: opening, file: openingFile }];
    for (const layer of selection.layers) {
      if (layer.box.width < 1 || layer.box.height < 1) continue;
      await abortable(page.evaluate(role => {
        window.document.querySelector('#kadr-capture-visibility').textContent =
          'html,body{background:transparent!important}body *{visibility:hidden!important}' +
          '[data-kadr-capture="' + role + '"],[data-kadr-capture="' + role + '"] *{visibility:visible!important}' +
          (role === 'primary' ? '[data-kadr-capture^="badge"],[data-kadr-capture^="badge"] *{visibility:hidden!important}' : '');
      }, layer.role), stop);
      layers.push({ ...layer, file: await save(layer.role, layer.box) });
    }
    return { ...selection, url: document.finalUrl, width, height, reference: 'website-layers/page.png', layers };
  } finally {
    await browser.close({ silent: true });
  }
}
