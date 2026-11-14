// ======= KADR KIT — выполняется ВНУТРИ песочницы перед кодом модели. Только Math и данные. =======
var clamp = function (v, a, b) { a = a === undefined ? 0 : a; b = b === undefined ? 1 : b; return Math.min(b, Math.max(a, v)); };
var lerp = function (a, b, t) { return a + (b - a) * t; };
var smooth = function (t) { t = clamp(t); return t * t * (3 - 2 * t); };
var ease = {
  linear: function (t) { return clamp(t); },
  out3: function (t) { t = clamp(t); return 1 - Math.pow(1 - t, 3); },
  inOut3: function (t) { t = clamp(t); return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; },
  outExpo: function (t) { t = clamp(t); return t >= 1 ? 1 : 1 - Math.pow(2, -10 * t); },
  inQuad: function (t) { t = clamp(t); return t * t; },
  outBack: function (t) { t = clamp(t); var s = 1.70158; return 1 + (s + 1) * Math.pow(t - 1, 3) + s * Math.pow(t - 1, 2); },
  outElastic: function (t) { t = clamp(t); if (t === 0 || t === 1) return t; return Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * 2.0944) + 1; }
};
// прогресс анимации: начало t0, длительность d, easing fn
var seg = function (t, t0, d, fn) { return (fn || ease.out3)(clamp((t - t0) / d)); };
var rnd = function (seed) { var a = seed | 0; return function () { a = (a + 0x6d2b79f5) | 0; var t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };
var noise = function (x, seed) { var i = Math.floor(x), f = x - i; var h = function (n) { var s = Math.sin(n * 127.1 + (seed || 1) * 311.7) * 43758.5453; return s - Math.floor(s); }; return lerp(h(i), h(i + 1), smooth(f)) * 2 - 1; };
var hexrgb = function (h) { h = String(h).replace('#', ''); if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2]; var n = parseInt(h.slice(0, 6), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
var mixc = function (a, b, t) { var A = hexrgb(PAL[a] || a), B = hexrgb(PAL[b] || b); var c = [0, 1, 2].map(function (i) { return Math.round(A[i] + (B[i] - A[i]) * t); }); return '#' + c.map(function (v) { return ('0' + v.toString(16)).slice(-2); }).join(''); };
var rgba = function (c, a) { var r = hexrgb(PAL[c] || c); return 'rgba(' + r[0] + ',' + r[1] + ',' + r[2] + ',' + clamp(a) + ')'; };

// ---- конструкторы примитивов ----
// Токены: lw:'hair'|'base'|'heavy', r:'xs'|'chip'|'panel'|'card'|'pill', font:'title'|'emphasis'|'label'|'data' разворачиваются в числа и роли шрифта.
var TKR = function (p) {
  if (typeof p.lw === 'string') p.lw = TK.stroke[p.lw] || TK.stroke.base;
  if (typeof p.r === 'string') p.r = TK.radius[p.r] !== undefined ? TK.radius[p.r] : TK.radius.card;
  if (p.k === 'text' && TK.type[p.font]) p.font = TK.type[p.font];
  return p;
};
var R = function (x, y, w, h, o) { return TKR(Object.assign({ k: 'rect', x: x, y: y, w: w, h: h }, o || {})); };
var C = function (x, y, r, o) { return TKR(Object.assign({ k: 'circle', x: x, y: y, r: r }, o || {})); };
var EL = function (x, y, rx, ry, o) { return TKR(Object.assign({ k: 'ellipse', x: x, y: y, rx: rx, ry: ry }, o || {})); };
var L = function (x1, y1, x2, y2, o) { return TKR(Object.assign({ k: 'line', x1: x1, y1: y1, x2: x2, y2: y2 }, o || {})); };
var T = function (s, x, y, o) { return TKR(Object.assign({ k: 'text', s: s, x: x, y: y }, o || {})); };
var PATH = function (pts, o) { return TKR(Object.assign({ k: 'path', pts: pts }, o || {})); };
var POLY = function (x, y, r, n, o) { return TKR(Object.assign({ k: 'poly', x: x, y: y, r: r, n: n }, o || {})); };
var STAR = function (x, y, r, n, o) { return TKR(Object.assign({ k: 'star', x: x, y: y, r: r, n: n }, o || {})); };
var ARC = function (x, y, r, a0, a1, o) { return TKR(Object.assign({ k: 'arc', x: x, y: y, r: r, a0: a0, a1: a1 }, o || {})); };
var G = function (items, o) { return TKR(Object.assign({ k: 'g', items: items }, o || {})); };
var lin = function (x0, y0, x1, y1, stops) { return { g: 'lin', x0: x0, y0: y0, x1: x1, y1: y1, stops: stops }; };
var rad = function (x, y, r0, r1, stops) { return { g: 'rad', x0: x, y0: y, r0: r0, x1: x, y1: y, r1: r1, stops: stops }; };

// ---- иллюстративные помощники ----
var typeOn = function (str, t, t0, cps) { var n = Math.floor(Math.max(0, t - t0) * (cps || 16)); return str.slice(0, Math.min(str.length, n)); };

var stars = function (t, n, seed, o) { o = o || {}; var r = rnd(seed || 3), out = []; for (var i = 0; i < n; i++) { var x = r() * W, y = r() * (o.h || H * 0.5), s = 1 + r() * 2.2; out.push(C(x, y, s, { fill: o.color || '#ffffff', a: 0.25 + 0.55 * (0.5 + 0.5 * Math.sin(t * (1 + r() * 2) + i)) })); } return out; };

// слои городского силуэта с параллаксом и мерцающими окнами
var skyline = function (t, o) {
  o = o || {}; var y0 = o.y === undefined ? H * 0.62 : o.y, layers = o.layers || 3, seed = o.seed || 7, out = [];
  var cols = o.colors || [mixc('bg', 'accent', 0.1), mixc('bg', '#ffffff', 0.09), mixc('bg', '#ffffff', 0.17)];
  for (var l = 0; l < layers; l++) {
    var R_ = rnd(seed + l * 101), period = W * 2, speed = (o.scroll === undefined ? 40 : o.scroll) * (0.4 + 0.6 * l / Math.max(1, layers - 1));
    var x = 0, items = [], off = -((t * speed) % period);
    while (x < period) {
      var bw = (70 + R_() * 110) * (1 + l * 0.35), bh = (160 + R_() * 340) * (1 + l * 0.3) * (o.height || 1), gap = R_() * 24, wseed = Math.floor(x);
      for (var rep = 0; rep < 2; rep++) {
        var bx = x + off + rep * period; if (bx > W || bx + bw < 0) continue;
        items.push(R(bx, y0 - bh, bw, bh, { fill: cols[Math.min(l, cols.length - 1)] }));
        if (l >= 1) {
          var wc = Math.min(5, Math.max(2, Math.floor(bw / 34))), wr = Math.min(5, Math.floor(bh / 70));
          for (var cx_ = 0; cx_ < wc; cx_++) for (var cy_ = 0; cy_ < wr; cy_++) {
            var hsh = (cx_ * 7 + cy_ * 13 + wseed) % 11; if (hsh > 4) continue;
            items.push(R(bx + 14 + cx_ * 30, y0 - bh + 24 + cy_ * 56, 12, 18, { fill: o.windows || 'accent2', a: 0.25 + 0.4 * (0.5 + 0.5 * Math.sin(t * 1.6 + hsh * 3 + wseed)) }));
          }
        }
      }
      x += bw + gap;
    }
    out.push(G(items, {}));
  }
  return out;
};

// дорога с бегущей разметкой
var road = function (t, o) {
  o = o || {}; var y = o.y === undefined ? H * 0.62 : o.y, h = o.h || 200, speed = o.speed === undefined ? 420 : o.speed, items = [];
  items.push(R(0, y, W, h, { fill: o.color || mixc('bg', '#000000', 0.35) }));
  items.push(R(0, y, W, 6, { fill: o.edge || 'accent', a: 0.9 }));
  var seglen = 110, gap = 90, per = seglen + gap, off = (t * speed) % per;
  for (var x = -per + off; x < W + per; x += per) items.push(R(x, y + h * 0.55, seglen, 8, { fill: o.stripe || 'accent2', r: 3 }));
  return items;
};

// автомобиль сбоку; x,y — точка на земле под центром; s — масштаб; o.spin — вращение колёс (рад)
var car = function (x, y, s, o) {
  o = o || {}; var body = o.body || '#f4f4f4', acc = o.accent || 'accent', spin = o.spin || 0, items = [];
  if (o.beam !== false) items.push(PATH([[150, -42], [520, -110], [520, 20]], { fill: lin(150, -42, 520, -42, [[0, rgba(acc, 0.55)], [1, rgba(acc, 0)]]), blend: 'lighter' }));
  items.push(PATH([[-152, -30], [-142, -54], [-92, -60], [-62, -94], [42, -96], [88, -60], [142, -54], [154, -30], [150, -12], [-150, -12]], { close: true, smooth: false, fill: body }));
  items.push(PATH([[-54, -86], [-28, -86], [-28, -62], [-76, -62]], { close: true, fill: mixc('bg', '#ffffff', 0.25) }));
  items.push(PATH([[-18, -86], [36, -86], [74, -62], [-18, -62]], { close: true, fill: mixc('bg', '#ffffff', 0.25) }));
  items.push(R(-150, -26, 304, 8, { fill: acc, a: 0.9 }));
  items.push(R(140, -44, 14, 10, { fill: '#fff7c8', glow: acc, glowR: 22 }));
  items.push(R(-154, -42, 8, 10, { fill: '#ff4d4d' }));
  [-92, 98].forEach(function (wx) {
    items.push(C(wx, -8, 25, { fill: '#15161a' }));
    for (var k = 0; k < 5; k++) { var a = spin + k * 1.2566; items.push(L(wx, -8, wx + Math.cos(a) * 20, -8 + Math.sin(a) * 20, { stroke: '#8a8f99', lw: 3 })); }
    items.push(C(wx, -8, 6, { fill: '#c9ccd4' }));
  });
  return G(items, { x: x, y: y, sx: s, sy: s });
};

// веер лучей (аддитивное смешивание)
var rays = function (cx, cy, n, r0, r1, rot, o) {
  o = o || {}; var items = [], w = Math.PI / n * (o.width || 0.5);
  for (var i = 0; i < n; i++) {
    var a = rot + i * 2 * Math.PI / n;
    items.push(PATH([[cx + Math.cos(a - w) * r0, cy + Math.sin(a - w) * r0], [cx + Math.cos(a - w) * r1, cy + Math.sin(a - w) * r1], [cx + Math.cos(a + w) * r1, cy + Math.sin(a + w) * r1], [cx + Math.cos(a + w) * r0, cy + Math.sin(a + w) * r0]], { close: true, fill: rad(cx, cy, r0, r1, [[0, rgba(o.color || 'accent', o.alpha === undefined ? 0.5 : o.alpha)], [1, rgba(o.color || 'accent', 0)]]), blend: 'lighter' }));
  }
  return items;
};

// перспективная сетка пола (synthwave)
var grid3d = function (t, o) {
  o = o || {}; var hy = o.horizon === undefined ? H * 0.55 : o.horizon, n = o.cols || 14, items = [], col = o.color || 'accent';
  for (var i = -n; i <= n; i++) items.push(L(W / 2, hy, W / 2 + i * (W * 0.16), H, { stroke: col, lw: 2, a: 0.5 * (1 - Math.abs(i) / (n + 1)) }));
  var rows = o.rows || 12, sp = (t * (o.speed === undefined ? 0.6 : o.speed)) % 1;
  for (var j = 0; j < rows; j++) { var u = (j + sp) / rows, y = hy + (H - hy) * u * u; items.push(L(0, y, W, y, { stroke: col, lw: 1 + 3 * u, a: 0.15 + 0.6 * u })); }
  return items;
};

// пиксель-арт: rows — строки из символов, colors — {символ: цвет}; px — размер пикселя
var SPRITES = {
  invader: ['..x.....x..', '...x...x...', '..xxxxxxx..', '.xx.xxx.xx.', 'xxxxxxxxxxx', 'x.xxxxxxx.x', 'x.x.....x.x', '...xx.xx...'],
  heart: ['.xx.xx.', 'xxxxxxx', 'xxxxxxx', '.xxxxx.', '..xxx..', '...x...'],
  robot: ['..xxxx..', '.xxxxxx.', 'xx.xx.xx', 'xxxxxxxx', '.x.xx.x.', '.xxxxxx.', 'x.x..x.x', 'xx....xx']
};
var pixel = function (rows, x, y, px, color, o) {
  o = o || {}; var items = [];
  for (var j = 0; j < rows.length; j++) for (var i = 0; i < rows[j].length; i++) { var ch = rows[j][i]; if (ch === '.') continue; items.push(R(i * px, j * px, px + 0.5, px + 0.5, { fill: (o.map && o.map[ch]) || color })); }
  return G(items, { x: x, y: y, sx: o.sx === undefined ? 1 : o.sx, sy: o.sy === undefined ? 1 : o.sy, rot: o.rot || 0, a: o.a === undefined ? 1 : o.a });
};

// HUD-рамка: уголки + подпись
var hud = function (x, y, w, h, o) {
  o = o || {}; var c = o.color || 'accent', l = o.len || 30, lw = o.lw || 3, items = [];
  items.push(PATH([[x, y + l], [x, y], [x + l, y]], { stroke: c, lw: lw }), PATH([[x + w - l, y], [x + w, y], [x + w, y + l]], { stroke: c, lw: lw }), PATH([[x, y + h - l], [x, y + h], [x + l, y + h]], { stroke: c, lw: lw }), PATH([[x + w - l, y + h], [x + w, y + h], [x + w, y + h - l]], { stroke: c, lw: lw }));
  if (o.label) items.push(T(o.label, x + 6, y - 10, { size: o.size || 20, font: 'mono', fill: c, a: 0.9 }));
  return G(items, { a: o.a === undefined ? 1 : o.a });
};

var card = function (x, y, w, h, o) { o = o || {}; return G([R(x, y, w, h, { r: o.r === undefined ? 28 : o.r, fill: o.fill || mixc('bg', '#ffffff', 0.1), glow: o.glow, glowR: o.glowR || 30 }), R(x, y, w, h, { r: o.r === undefined ? 28 : o.r, stroke: o.stroke || rgba('fg', 0.18), lw: 2 })], { a: o.a === undefined ? 1 : o.a }); };

// маркер, «выезжающий» под словом: p — прогресс 0..1
var highlight = function (x, y, w, h, p, o) { o = o || {}; return R(x, y, Math.max(0, w * clamp(p)), h, { fill: o.color || 'accent', r: o.r === undefined ? 8 : o.r, a: o.a === undefined ? 1 : o.a }); };

// взрыв частиц: p — прогресс 0..1
var burst = function (cx, cy, p, n, o) {
  o = o || {}; var r = rnd(o.seed || 9), out = [];
  for (var i = 0; i < n; i++) { var a = r() * 6.2832, d = ease.out3(p) * (o.radius || 260) * (0.4 + r() * 0.8); out.push(C(cx + Math.cos(a) * d, cy + Math.sin(a) * d + p * p * 60, (o.size || 8) * (1 - p) * (0.5 + r()), { fill: r() > 0.5 ? (o.a1 || 'accent') : (o.a2 || 'accent2'), a: 1 - p })); }
  return out;
};

// кольцо прогресса: p — 0..1
var ring = function (cx, cy, r, p, o) { o = o || {}; return [ARC(cx, cy, r, 0, 6.2832, { stroke: o.track || rgba('fg', 0.14), lw: o.lw || 16 }), ARC(cx, cy, r, -1.5708, -1.5708 + 6.2832 * clamp(p), { stroke: o.color || 'accent', lw: o.lw || 16, cap: 'round' })]; };

// синусоида / звуковая дорожка
var wave = function (x, y, w, amp, t, o) { o = o || {}; var pts = [], n = o.n || 48; for (var i = 0; i <= n; i++) { var u = i / n; pts.push([x + u * w, y + Math.sin(u * (o.freq || 9) + t * (o.speed || 4)) * amp * (0.6 + 0.4 * Math.sin(u * 3 + t))]); } return PATH(pts, { smooth: true, stroke: o.color || 'accent', lw: o.lw || 4 }); };

// камера вокруг центра: zoom, pan, shake применяются ко всему содержимому items
var cam = function (items, o) {
  o = o || {}; var z = o.zoom === undefined ? 1 : o.zoom;
  return G([G(items, { x: -W / 2, y: -H / 2 })], { x: W / 2 + (o.px || 0) + (o.sx || 0), y: H / 2 + (o.py || 0) + (o.sy || 0), sx: z, sy: z, rot: o.rot || 0 });
};

// ---- помощники «интерфейс платформы» (из разборов референсов) ----
// текст по кольцу: символы расставлены по окружности и повёрнуты; rot — вращение всего кольца
var ringText = function (str, cx, cy, r, rot, o) {
  o = o || {}; var size = o.size || 44, step = (size * 0.62) / r, out = [], chars = str.split(''), a0 = (rot || 0) - (chars.length - 1) * step / 2;
  for (var i = 0; i < chars.length; i++) { var a = a0 + i * step; out.push(G([T(chars[i], 0, 0, { size: size, font: o.font || 'mono', fill: o.fill || 'fg', align: 'center' })], { x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r, rot: a + Math.PI / 2 })); }
  return out;
};
// локатор: концентрические круги сужаются к центру; p — фаза 0..1 (зацикливается)
var radar = function (cx, cy, p, o) {
  o = o || {}; var r0 = o.r || 420, n = o.n || 5, out = [];
  for (var i = 0; i < n; i++) { var u = (p + i / n) % 1; out.push(C(cx, cy, r0 * (1 - u), { stroke: o.color || 'accent', lw: o.lw || 3, a: 0.15 + 0.7 * u })); }
  out.push(C(cx, cy, o.core || 26, { fill: o.color || 'accent', glow: o.glow ? (o.color || 'accent') : undefined, glowR: 24 }));
  return out;
};
// пузырь сообщения; side 'right' — исходящий (accent), 'left' — входящий (серый)
var bubble = function (x, y, w, str, o) {
  o = o || {}; var size = o.size || 38, h = size * 2 + 6, right = o.side !== 'left', fill = o.fill || (right ? 'accent' : mixc('bg', 'fg', 0.14));
  var tail = right ? [[x + w - 18, y + h - 10], [x + w + 8, y + h + 4], [x + w - 34, y + h - 2]] : [[x + 18, y + h - 10], [x - 8, y + h + 4], [x + 34, y + h - 2]];
  return G([R(x, y, w, h, { r: h / 2, fill: fill }), PATH(tail, { close: true, fill: fill }), T(str, x + 26, y + h / 2 + size * 0.34, { size: size, font: o.font || 'display', weight: 500, fill: right ? (o.text || '#ffffff') : 'fg' })], { a: o.a === undefined ? 1 : o.a });
};
// контекстное меню ОС; items — строки; hl — индекс подсвеченного
var menu = function (x, y, w, items, hl, o) {
  o = o || {}; var rowH = o.row || 78, out = [R(x, y, w, rowH * items.length + 16, { r: 26, fill: o.fill || mixc('bg', 'fg', 0.1), glow: '#000000', glowR: 30 })];
  for (var i = 0; i < items.length; i++) {
    if (i === hl) out.push(R(x + 8, y + 8 + i * rowH, w - 16, rowH, { r: 18, fill: 'accent' }));
    out.push(T(items[i], x + 34, y + 8 + i * rowH + rowH * 0.64, { size: o.size || 34, font: 'display', weight: 500, fill: i === hl ? '#ffffff' : 'fg' }));
    if (i < items.length - 1) out.push(L(x + 24, y + 8 + (i + 1) * rowH, x + w - 24, y + 8 + (i + 1) * rowH, { stroke: rgba('fg', 0.14), lw: 2 }));
  }
  return G(out, {});
};
// доля ломаной: возвращает точки пути, пройденные на долю p (для рукописного ввода и рисования линий)
var reveal = function (pts, p) {
  var tot = 0, i, seglen = []; for (i = 1; i < pts.length; i++) { var d = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); seglen.push(d); tot += d; }
  var want = tot * clamp(p), acc = 0, out = [pts[0]];
  for (i = 1; i < pts.length; i++) { if (acc + seglen[i - 1] <= want) { out.push(pts[i]); acc += seglen[i - 1]; } else { var f = (want - acc) / (seglen[i - 1] || 1); out.push([lerp(pts[i - 1][0], pts[i][0], f), lerp(pts[i - 1][1], pts[i][1], f)]); break; } }
  return out;
};
// гладкая связь между двумя точками (горизонтальные касательные), как в редакторах узлов
var curve = function (x1, y1, x2, y2, o) { o = o || {}; var dx = Math.max(60, Math.abs(x2 - x1) * 0.5); return { k: 'path', d: [['M', x1, y1], ['C', x1 + dx, y1, x2 - dx, y2, x2, y2]], stroke: o.color || 'accent', lw: o.lw || 3, a: o.a === undefined ? 1 : o.a, dash: o.dash }; };
// сканер: рамка с бегущей линией и метками; p — 0..1
var scan = function (x, y, w, h, p, o) {
  o = o || {}; var c = o.color || 'accent', yy = y + h * clamp(p), out = [hud(x, y, w, h, { color: c, label: o.label })];
  out.push(L(x, yy, x + w, yy, { stroke: c, lw: 3, glow: c, glowR: 18 }));
  for (var i = 0; i < 6; i++) out.push(C(x + (w * (i + 1)) / 7, yy, 5, { fill: c }));
  return out;
};
// ======= конец KIT =======
