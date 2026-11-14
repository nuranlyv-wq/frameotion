import {random} from './math.js';
import {applyVoxLook} from './look-prints.js';

export const INK = '#23211d', RED = '#a92c28', PAPER = '#f0eadd';
export async function loadPaperAssets() {
  const root = '/azerbaijan-startups-vox/assets/';
  const fonts = [
    ['Oswald', root + 'fonts/font-oswald/Oswald/Oswald[wght].ttf', {weight: '200 700'}],
    ['Playfair', root + 'fonts/font-playfair-display/Playfair Display/PlayfairDisplay-Italic[wght].ttf', {style: 'italic', weight: '400 900'}],
    ['Inter', root + 'style/vox/fonts/Inter-Variable.ttf', {}],
  ];
  await Promise.all(fonts.map(async ([name, url, options]) => document.fonts.add(await new FontFace(name, `url('${url}')`, options).load())));
  const grain = new Image(); grain.src = root + 'images/res-paper-cardboard/paper004.jpg';
  const photo = new Image(); photo.src = root + 'images/baku-photo.png';
  await Promise.all([grain.decode(), photo.decode(), document.fonts.ready]);
  return {grain, photo};
}
function canvas(width, height) {
  const cv = document.createElement('canvas'); cv.width = width; cv.height = height;
  return cv;
}
export function paperSurface({width = 1600, height = 900, seed = 11, grain, fill = PAPER} = {}) {
  const cv = canvas(width, height), c = cv.getContext('2d');
  c.fillStyle = fill; c.fillRect(0, 0, width, height);
  if (grain) { c.globalAlpha = .21; c.drawImage(grain, 0, 0, width, height); c.globalAlpha = 1; }
  for (let i = 0; i < width * height / 100; i++) {
    c.fillStyle = `rgba(53,40,21,${.015 + random(i + 2, seed) * .05})`;
    c.fillRect(random(i, seed) * width, random(i + 1, seed) * height, 1 + random(i + 8, seed) * 2, .7);
  }
  for (let i = 0; i < 9; i++) {
    const x = random(i + 42, seed) * width, y = random(i + 82, seed) * height, r = width * (.03 + random(i + 16, seed) * .1);
    const stain = c.createRadialGradient(x, y, 0, x, y, r);
    stain.addColorStop(0, 'rgba(125,83,31,.08)'); stain.addColorStop(1, 'rgba(125,83,31,0)');
    c.fillStyle = stain; c.fillRect(x - r, y - r, r * 2, r * 2);
  }
  for (const [x1, y1, x2, y2] of [[.58, 0, .43, 1], [0, .65, 1, .48]]) {
    c.beginPath(); c.moveTo(x1 * width, y1 * height); c.lineTo(x2 * width, y2 * height);
    c.lineWidth = 3; c.strokeStyle = 'rgba(85,60,24,.07)'; c.stroke();
    c.translate(1, 1); c.strokeStyle = 'rgba(255,255,245,.25)'; c.lineWidth = 1; c.stroke(); c.translate(-1, -1);
  }
  return cv;
}
function text(c, value, x, y, size = 108, {font = 'Oswald', weight = 700, color = INK, align = 'left', maxWidth = 1380, italic = false} = {}) {
  do { c.font = `${italic ? 'italic ' : ''}${weight} ${size}px '${font}'`; if (c.measureText(value).width <= maxWidth) break; size -= 1; } while (size > 16);
  c.fillStyle = color; c.textAlign = align; c.fillText(value, x, y);
  return {width:c.measureText(value).width, size};
}
const CONTENT = {
  'page-turn': ['У этой истории', 'ЕСТЬ ПРОДОЛЖЕНИЕ', 'Перевернём страницу.'],
  'calendar-tear': ['Время двигаться', 'ДАЛЬШЕ', 'Следующая мысль — под этим листом.'],
  crumple: ['Можно начать', 'ЗАНОВО', 'Форма меняется. Мысль остаётся.'],
  'half-fold': ['С другой стороны', 'ТОТ ЖЕ ЛИСТ', 'Один сгиб соединяет две половины.'],
  'gate-fold': ['Открываем', 'САМОЕ ВАЖНОЕ', 'Края листа становятся створками.'],
  accordion: ['Большая мысль', 'В КОМПАКТНОЙ ФОРМЕ', 'Каждый сгиб остаётся на своём месте.'],
  'map-fold': ['Собираем', 'ОБЩУЮ КАРТИНУ', 'Один сгиб продолжает другой.'],
  'corner-peel': ['За привычным', 'СКРЫТО БОЛЬШЕ', 'Стоит заглянуть под уголок.'],
  roll: ['У мысли есть', 'СВОЯ ФОРМА', 'Развернём её, когда понадобится.'],
  scroll: ['Сохраняем', 'ЦЕЛЫЙ ЛИСТ', 'Два края сходятся к середине.'],
  'tear-split': ['Отделяем', 'ЛИШНЕЕ', 'Под верхним слоем — новая мысль.'],
  'strip-tear': ['Оставляем', 'ГЛАВНОЕ', 'Меняется только часть страницы.'],
  'window-cut': ['Смотрим', 'ГЛУБЖЕ', 'Вырез открывает следующий слой.'],
  'hole-punch': ['В центре', 'ВНИМАНИЯ', 'Новая деталь появляется сквозь бумагу.'],
  'phrase-swap': ['Меняем слово', '', 'Вся остальная фраза остаётся на месте.'],
  'rising-scrap': ['У каждого факта', 'ЕСТЬ КОНТЕКСТ', 'Вырезка появляется на время своей мысли.'],
  collage: ['Из отдельных частей', 'СКЛАДЫВАЕТСЯ ИСТОРИЯ', 'Каждый фрагмент занимает своё место.'],
  'tape-peel': ['Сохраняем', 'СЛЕДЫ РАБОТЫ', 'Лента удерживает бумажную вырезку.'],
  'label-peel': ['За этикеткой', 'САМА ИСТОРИЯ', 'Поднимем край и откроем содержание.'],
  stamp: ['Мысль получила', 'ПОДТВЕРЖДЕНИЕ', 'Оттиск остаётся после прижима.'],
  marker: ['В длинной истории', 'ЕСТЬ ГЛАВНОЕ', 'Выделение следует за словом.'],
};
export function makePaperPrints(id, assets, seed = 11, lookId = 'paper') {
  const opts = {seed, grain: assets.grain};
  const before = paperSurface(opts), after = paperSurface({...opts, seed: seed + 1, fill: '#e4dbc6'}), back = paperSurface({...opts, fill: '#e7dfcd'});
  const c = before.getContext('2d'), a = after.getContext('2d'), b = back.getContext('2d');
  const [lead, headline, detail] = CONTENT[id];
  function header(ctx, value) {
    text(ctx, value, 110, 110, 25, {font: 'Inter', weight: 500});
    ctx.fillStyle = '#9b9180'; ctx.fillRect(110, 142, 1380, 1);
  }
  header(c, 'БУМАГА ОЖИВАЕТ'); header(a, 'ПРОДОЛЖЕНИЕ ИСТОРИИ');
  text(c, lead, 110, 315, 76, {font: 'Playfair', italic: true, weight: 500});
  const contextual = ['rising-scrap', 'collage', 'tape-peel'].includes(id);
  if (contextual) { c.clearRect(0, 0, 1600, 900); c.drawImage(paperSurface(opts), 0, 0); header(c, 'БУМАГА ОЖИВАЕТ'); text(c, lead, 110, 235, 70, {font:'Playfair', italic:true, weight:500}); }
  const headlineMetrics = text(c, headline, 110, contextual ? 380 : 515, contextual ? 120 : 142, {color: RED});
  if (id === 'phrase-swap') {
    text(c, 'Это', 110, 515, 118);
    text(c, 'шаг.', 1240, 515, 118);
  }
  if (!contextual) text(c, detail, 110, 775, 35, {font: 'Inter', weight: 400});
  text(a, 'Сохраняем', 110, 315, 76, {font: 'Playfair', italic: true, weight: 500});
  text(a, 'ГЛАВНОЕ', 800, 515, 160, {align: 'center', color: RED});
  text(a, 'И продолжаем мысль.', 110, 775, 42, {font: 'Inter', weight: 400});
  if (id === 'window-cut' || id === 'hole-punch') {
    c.clearRect(0, 0, 1600, 900); c.drawImage(paperSurface(opts), 0, 0); header(c, 'БУМАГА ОЖИВАЕТ');
    text(c, lead, 110, 240, 76, {font:'Playfair', italic:true, weight:500});
    text(c, id === 'hole-punch' ? 'ФАКТ' : 'ВНУТРИ', 800, 480, id === 'hole-punch' ? 72 : 110, {align:'center', color:RED});
    text(c, detail, 110, 775, 35, {font:'Inter', weight:400});
    c.strokeStyle = '#a59a83'; c.lineWidth = 1.5; c.setLineDash([7, 8]);
    if (id === 'hole-punch') { c.beginPath(); c.arc(800, 450, 139, 0, Math.PI * 2); c.stroke(); }
    else c.strokeRect(800 - 322, 450 - 172, 644, 344);
    c.setLineDash([]);
    a.clearRect(0, 0, 1600, 900); a.drawImage(paperSurface({...opts, seed:seed + 1, fill:'#e4dbc6'}), 0, 0);
    text(a, id === 'hole-punch' ? 'СУТЬ' : 'ГЛАВНОЕ', 800, 480, id === 'hole-punch' ? 72 : 110, {align:'center', color:RED});
  }
  if (id === 'label-peel') {
    c.clearRect(0, 0, 1600, 900); c.drawImage(paperSurface(opts), 0, 0); header(c, 'БУМАГА ОЖИВАЕТ');
    text(c, lead, 110, 280, 76, {font:'Playfair', italic:true, weight:500});
    text(c, headline, 800, 515, 110, {align:'center', color:RED, maxWidth:680});
    text(c, detail, 110, 775, 35, {font:'Inter', weight:400});
  }
  if (id === 'tape-peel') {
    c.fillStyle = '#e8dfcb'; c.fillRect(449, 441, 702, 300);
    c.drawImage(assets.photo, 464, 455, 672, 262);
  }
  text(b, 'У каждого листа', 110, 330, 82, {font: 'Playfair', italic: true, weight: 500});
  text(b, 'ЕСТЬ ОБОРОТ', 110, 500, 132, {color: '#514b40'});
  for (let i = 0; i < 7; i++) { b.fillStyle = 'rgba(65,58,46,.12)'; b.fillRect(110, 590 + i * 20, 800 + random(i, seed) * 450, 3); }

  const scrap = paperSurface({width: 800, height: 240, ...opts});
  const replacement = paperSurface({width: 800, height: 240, ...opts, fill: '#e4d6ad'});
  const sc = scrap.getContext('2d'), rc = replacement.getContext('2d');
  text(sc, id === 'phrase-swap' ? 'ПЕРВЫЙ' : 'СВЯЗЬ С КОНТЕКСТОМ', 400, 165, id === 'phrase-swap' ? 126 : 75, {align: 'center', color: RED, maxWidth: 730});
  text(rc, id === 'phrase-swap' ? 'НОВЫЙ' : 'ОБЩАЯ КАРТИНА', 400, 165, id === 'phrase-swap' ? 126 : 85, {align: 'center', color: RED, maxWidth: 730});
  if (id === 'rising-scrap' || id === 'collage') {
    sc.drawImage(assets.photo, 12, 12, 260, 216);
    sc.clearRect(285, 0, 515, 240);
    sc.fillStyle = PAPER; sc.fillRect(285, 0, 515, 240);
    text(sc, 'ЖИВОЙ КОНТЕКСТ', 535, 108, 56, {align: 'center', maxWidth: 480});
    text(sc, 'Иллюстрация', 535, 170, 30, {font: 'Inter', weight: 400, align: 'center', maxWidth: 480});
  }
  const tape = canvas(600, 150), tc = tape.getContext('2d');
  tc.fillStyle = 'rgba(189,161,96,.46)'; tc.fillRect(0, 0, 600, 150);
  for (let i = 0; i < 1800; i++) { tc.fillStyle = `rgba(105,79,22,${random(i, seed) * .12})`; tc.fillRect(random(i + 7, seed) * 600, random(i + 8, seed) * 150, 1, 5); }
  const stamp = canvas(800, 320), st = stamp.getContext('2d');
  st.strokeStyle = RED; st.lineWidth = 10; st.strokeRect(25, 25, 750, 270);
  text(st, 'ПРОВЕРЕНО', 400, 220, 135, {align: 'center', color: RED, maxWidth: 680});
  st.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < 3500; i++) { st.fillStyle = `rgba(0,0,0,${.2 + random(i, seed) * .8})`; st.fillRect(random(i + 8, seed) * 800, random(i + 4, seed) * 320, 1 + random(i + 2, seed) * 4, 1 + random(i + 6, seed) * 3); }
  return applyVoxLook({before, after, back, scrap, replacement, tape, stamp, headlineMetrics},lookId,assets,{technique:id});
}
