// "Show" scenes: what the product does, staged with objects instead of stated in a line.
// The director picks the mechanic that matches what the product really moves, repeats or gathers,
// and names the props from the source. Each mechanic owns its layout, timing and camera.
//   journey — something travels from one place to another (delivery, sending, a ride, a transfer).
//   cycle   — something comes back on a schedule (subscription, reminders, recurring billing).
//   gather  — several things end up in one place (marketplace, aggregator, all-in-one app).
//   process — one thing passes through stages and changes at each (roasting, a studio's work from brief to launch).
//   spread  — one thing goes out to several places at once (a post to channels, one trigger to many actions).
// `layout` is the generation's variant: the same mechanic is laid out differently from one film to the next.
import {WORD_CLICK_MARKS} from './word-click.js';
import {readingBudget} from './reading.js';

export const SHOW_KINDS = ['journey', 'cycle', 'gather', 'process', 'spread', 'transform', 'fold', 'assemble','orbit','gallery'];
export const SHOW_ICONS = ['pin', 'home', 'courier', 'car', 'doc', 'mail', 'person', 'clock', 'cart', 'bag', 'card', 'star', 'phone', 'chat',
  'cup', 'bean', 'flame', 'screen', 'code', 'megaphone', 'chart', 'image', 'brush', 'coin'];
function showOpeningIcon(show) {
  if (['process','transform'].includes(show.kind)) return show.stages?.[0]?.icon ?? 'check';
  if (['gather','assemble'].includes(show.kind)) return show.parts?.[0]?.icon ?? 'box';
  return show.subject?.icon ?? (show.kind === 'spread' ? 'megaphone' : 'box');
}

export function clickIntoShow(click, show, link) {
  if (!click?.shape || click.mark || !show || link !== 'dive') return click;
  const mark = showOpeningIcon(show);
  return WORD_CLICK_MARKS.includes(mark) && mark !== click.mark ? {...click, mark} : click;
}
// Frames a show needs before spare time is shared out: its action, then the result landing and being read.
export const showMinimum = show => ({journey: 132, cycle: 136, gather: 102 + 16 * (show?.parts?.length ?? 4),
  process: 54 + 32 * ((show?.stages?.length ?? 4) - 1), spread: 92 + 8 * ((show?.parts?.length ?? 4) - 1),
  transform: 48 + 54 * (show?.stages?.length ?? 2), fold: 132,
  assemble: 120 + 12 * (show?.parts?.length ?? 2),
  orbit:152+8*(show?.parts?.length??4),gallery:100+12*(show?.parts?.length??3)}[show?.kind] ?? 136);

const keysForPrevious = (part, fill) => ({...(part.assetId && {assetId:part.assetId}),form:part.form ?? 'tile',mark:part.icon ?? 'check',fill,rx:part.form === 'box' ? -16 : 0,ry:part.form === 'box' ? 28 : 0});
const INTER = .55;
const words = text => text.trim().split(/\s+/u).length;
const box = (x, y, w, h, radius = 0) => ({x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h), radius: Math.round(radius)});
const actor = (id, kind, start, end, bounds, props) => ({
  id, kind, start, end, box: bounds, fill: 'foreground', enter: 'none', enterFrames: 1, sound: 'none', evidenceIds: [], ...props,
});
const pose = (frame, {x = 0, y = 0, ...fields} = {}) => ({
  frame: Math.round(frame), x: Math.round(x), y: Math.round(y), scale: 100, rotate: 0, opacity: 100, ease: 'smooth', ...fields,
});
const fitSize = (text, width, largest) => Math.max(24, Math.round(Math.min(largest, width / (Math.max(...text.split(/\s+/u).map(word => word.length), 1) * INTER))));
const smooth = value => value * value * (3 - 2 * value);
const cubic = ([a, b, c, d], t) => {
  const u = 1 - t;
  return {x: u ** 3 * a.x + 3 * u * u * t * b.x + 3 * u * t * t * c.x + t ** 3 * d.x,
    y: u ** 3 * a.y + 3 * u * u * t * b.y + 3 * u * t * t * c.y + t ** 3 * d.y};
};

export function showIssue(show) {
  if (!show) return 'a show scene needs visual.show';
  const {kind, subject, to, parts, whole} = show;
  if (kind === 'journey' && !(subject && to)) return 'a journey needs show.subject (what travels) and show.to (where it arrives)';
  if (kind === 'cycle' && !subject) return 'a cycle needs show.subject (what comes back)';
  if (['gather','assemble'].includes(kind) && !(parts && whole)) return `a ${kind} needs two to four show.parts and show.whole (where they end up)`;
  if (kind === 'process' && !(show.stages?.length >= 3)) return 'a process needs three or four show.stages in their real order';
  if (kind === 'spread' && !(subject && parts)) return 'a spread needs show.subject (what goes out) and two to four show.parts (where it lands)';
  if (kind === 'transform' && !show.stages) return 'a transform needs two to four named stages';
  if (kind === 'fold' && !(subject && whole)) return 'a fold needs subject and whole';
  if (kind === 'orbit' && !(parts && whole)) return 'an orbit needs named parts and a central whole';
  if (kind === 'gallery' && (!parts || parts.some(part=>!part.assetId))) return 'a gallery needs two to four supplied image assets';
  if (parts?.length>4 && kind!=='orbit') return 'use at most four parts outside an orbit';
  return null;
}

// Returns the actors and camera keys of one show scene. `stage` carries the frame, the palette roles in use and timing.
export function stageShow(stage) {
  const {beat, index, start, end, W, H, portrait, ground, ink, strong, strongInk, entering, motionFrames, evidenceIds, layout = 0, steady = false} = stage;
  // A headline may be the scene's own or the hero line carried over it.
  const titled = stage.titled ?? Boolean(beat.text);
  const {show} = beat.visual, edge = Math.min(W, H), m = Math.round(W * .0625);
  const elements = [], camera = [], attach = {evidenceIds};
  const node = Math.round(edge * .16), labelSize = edge * .05;
  const first = start + (entering?.kind === 'dive' ? 8 : 10);
  const focusX = portrait ? W/2 : ({left:W*.35,right:W*.65,split:W*.65})[beat.visual.layout] ?? W/2;
  // A token is a disc that keeps its identity while the symbol on it changes.
  const disc = (id, at, until, x, y, size, fill, props = {}) => actor(id, 'rect', at, until, box(x - size / 2, y - size / 2, size, size, size / 2),
    {fill, enter: 'pop', enterFrames: 12, elevation: 1, ...props});
  const symbol = (id, name, at, until, x, y, size, fill, props = {}) => {
    const image = props.assetId;
    const fields = {...props};if(!image)delete fields.assetId;
    return actor(id,image?'image':'icon',at,until,
      box(x-size*.28,y-size*.28,size*.56,size*.56),
      { ...(image ? {assetId:image,imageFit:'contain'} : {icon:name}),fill,enter:'pop',enterFrames:12,...fields});
  };
  const label = (id, text, at, until, x, y, width, props = {}) => actor(id, 'text', at, until,
    box(Math.max(8, Math.min(W - width - 8, x - width / 2)), Math.min(H - labelSize * 2.7 - 4, y), width, labelSize * 2.7), {
      text, fontSize: fitSize(text, width, labelSize), weight: 600, align: 'center', fill: ink, enter: 'rise', enterFrames: 10, ...attach, ...props});
  const result = (text, at, x, y) => {
    const size = Math.round(edge * .046), width = Math.min(W - 2 * m, text.length * size * .6 + size * 2.2), height = size * 2.1;
    return actor(`result-${index}`, 'pill', at, end, box(Math.max(m / 2, Math.min(W - width - m / 2, x - width / 2)), y, width, height, height / 2), {
      text, fontSize: size, weight: 650, fill: strong, enter: 'pop', enterFrames: 14, sound: 'ding', elevation: 1, ...attach});
  };
  const centred = {x: Math.round(W / 2), y: Math.round(H / 2), rotate: 0};
  // The camera never moves towards an empty spot: it waits on the usual framing until the subject appears
  // (`at`), closes in on it while it lands, and holds there.
  const closeUp = (x, y, zoom, hold, at = first) => {
    camera.push({frame: start, ...centred, zoom: 100});
    camera.push({frame: at, ...centred, zoom: 100});
    camera.push({frame: at + 12, x: Math.round(x), y: Math.round(y), rotate: 0, zoom, ease: 'glide'});
    if (hold > at + 12) camera.push({frame: hold, x: Math.round(x), y: Math.round(y), rotate: 0, zoom});
  };
  let settled, anchorId, anchorBox, anchorIcon;
  const disk = (x, y, size) => box(x - size / 2, y - size / 2, size, size, size / 2);

  if (show.kind === 'journey') {
    // Variant: the trip runs left to right or right to left, on an S-curve or a rising arc.
    const mirror = layout % 2 === 1, arc = Math.floor(layout / 2) % 2 === 1, flip = x => mirror ? W - x : x;
    const a = portrait ? {x: flip(W * .26), y: H * .76} : {x: flip(m + W * .12), y: H * .7};
    const b = portrait ? {x: flip(W * .72), y: H * .42} : {x: flip(W - m - W * .14), y: H * .46};
    // A few wide, faint streets are enough to read as a map without competing with the route.
    const road = edge * .028, dim = [35, 35];
    const streets = portrait ?
      [[0, H * .36, W, 0], [0, H * .6, W, 0], [0, H * .86, W, 0], [W * .2, H * .28, 0, H * .66], [W * .52, H * .28, 0, H * .66], [W * .84, H * .28, 0, H * .66]] :
      [[0, H * .38, W, 0], [0, H * .62, W, 0], [0, H * .86, W, 0], [W * .16, H * .3, 0, H * .68], [W * .4, H * .3, 0, H * .68], [W * .64, H * .3, 0, H * .68], [W * .86, H * .3, 0, H * .68]];
    // Streets belong to things that travel through a city. A document or a message crosses an empty field.
    const physical = ['courier', 'car'].includes(show.carrier) || ['home', 'pin'].includes(show.to.icon);
    for (const [street, [x, y, w, h]] of (physical ? streets : []).entries()) {
      const vertical = !w;
      elements.push(actor(`street-${index}-${street}`, 'stroke', start + street * 2, end,
        vertical ? box(x - road / 2, y, road, h) : box(x, y - road / 2, Math.max(1, w), road), {
          fill: 'surface', enter: 'draw', enterFrames: 14,
          curve: {width: Math.round(road), points: [0, 333, 667, 1000].map(step => vertical ? {x: 500, y: step} : {x: step, y: 500})},
          motion: [pose(start + street * 2, {opacity: dim[0]}), pose(end - 1, {opacity: dim[1]})],
        }));
    }
    const swapAt = first + 20, travelAt = show.carrier ? swapAt + 14 : first + 22, travel = Math.min(45, motionFrames(46)), arrive = travelAt + travel;
    const route = (arc ? [{x: 0, y: 1000}, {x: 160, y: 300}, {x: 600, y: 0}, {x: 1000, y: 0}] :
      [{x: 0, y: 1000}, {x: 520, y: 1000}, {x: 480, y: 0}, {x: 1000, y: 0}]).map(point => mirror ? {x: 1000 - point.x, y: point.y} : point);
    const span = box(Math.min(a.x, b.x), Math.min(a.y, b.y), Math.abs(b.x - a.x), Math.abs(b.y - a.y));
    elements.push(actor(`route-${index}`, 'stroke', travelAt, end, span, {
      fill: strong, enter: 'draw', enterFrames: travel, curve: {width: Math.max(4, Math.round(edge * .009)), points: route}}));
    // The token follows the same curve the route is drawn along, at the same moment.
    const along = Array.from({length: 8}, (_, step) => {
      const u = (step + 1) / 8, point = cubic(route, smooth(u));
      return pose(travelAt + travel * u, {x: (point.x - route[0].x) / 1000 * span.w, y: (point.y - 1000) / 1000 * span.h, ease: 'linear'});
    });
    const near = travelAt + Math.round(travel * .62);
    elements.push(disc(`place-${index}`, near, end, b.x, b.y, node, 'surface', {sound: 'none'}));
    elements.push(symbol(`place-icon-${index}`, show.to.icon ?? 'pin', near, Math.max(arrive + 8, near + 26), b.x, b.y, node, 'foreground',
      {assetId:show.to.assetId,motion: [pose(near), pose(arrive - 2), pose(arrive + 6, {scale: 40, opacity: 0})]}));
    elements.push(label(`place-label-${index}`, show.to.label, near + 4, end, b.x, b.y + node * .7, edge * .42));
    elements.push(disc(`token-${index}`, first, end, a.x, a.y, node, strong, {sound: 'pop', motion: [pose(first), pose(travelAt), ...along]}));
    if (show.carrier) {
      elements.push(symbol(`subject-${index}`, show.subject.icon ?? 'box', first, swapAt + 8, a.x, a.y, node, strongInk,
        {assetId:show.subject.assetId,motion: [pose(first), pose(swapAt), pose(swapAt + 7, {scale: 40, opacity: 0})]}));
      elements.push(symbol(`carrier-${index}`, show.carrier, swapAt + 3, end, a.x, a.y, node, strongInk,
        {sound: 'pop', ...(show.subject.assetId && {handoffFrom:`subject-${index}`}),
          motion: [pose(swapAt + 3), pose(travelAt), ...along]}));
    } else elements.push(symbol(`subject-${index}`, show.subject.icon ?? 'box', first, end, a.x, a.y, node, strongInk, {assetId:show.subject.assetId,motion: [pose(first), pose(travelAt), ...along]}));
    // The name of the subject stays only while it is at rest: once it rides, the camera leaves this spot.
    elements.push(label(`subject-label-${index}`, show.subject.label, first + 4, travelAt + 4, a.x, a.y + node * .7, edge * .36));
    if (show.result) elements.push(result(show.result, arrive + 2, b.x, b.y - node * .62 - edge * .046 * 2.1 - edge * .02));
    closeUp(a.x + (W / 2 - a.x) * .1, a.y, 150, travelAt - 4);
    // The camera rides with the token, a little wider, and ends on the arrival.
    const follow = {target: `token-${index}`, x: 0, y: Math.round(-node * .2), rotate: 0};
    camera.push({frame: travelAt + 10, ...follow, zoom: 126, ease: 'glide'});
    camera.push({frame: arrive, ...follow, zoom: 126});
    // Before a match the camera returns to the whole route, so the token sits where the next scene expects it.
    if (steady) camera.push({frame: Math.min(end - 2, arrive + 22), ...centred, zoom: 100, ease: 'glide'});
    else camera.push({frame: Math.min(end - 2, arrive + 24), ...follow, zoom: 134, ease: 'glide'});
    settled = arrive + (steady ? 30 : 16);
    anchorId = `token-${index}`;
    anchorBox = disk(b.x, b.y, node);
    anchorIcon = show.carrier ?? show.subject.icon ?? 'box';
  }

  if (show.kind === 'cycle') {
    // Without a headline the ring takes the middle of the frame and more of it.
    const c = {x: W / 2, y: H * (portrait ? .58 : titled ? .59 : .52)}, radius = edge * (portrait ? .2 : titled ? .22 : .27), k = .552;
    // The track: four quarter arcs drawn in turn, clockwise from the top.
    const quarters = [
      [c.x, c.y - radius, radius, radius, [{x: 0, y: 0}, {x: 552, y: 0}, {x: 1000, y: 448}, {x: 1000, y: 1000}]],
      [c.x, c.y, radius, radius, [{x: 1000, y: 0}, {x: 1000, y: 552}, {x: 552, y: 1000}, {x: 0, y: 1000}]],
      [c.x - radius, c.y, radius, radius, [{x: 1000, y: 1000}, {x: 448, y: 1000}, {x: 0, y: 552}, {x: 0, y: 0}]],
      [c.x - radius, c.y - radius, radius, radius, [{x: 0, y: 1000}, {x: 0, y: 448}, {x: 448, y: 0}, {x: 1000, y: 0}]],
    ];
    for (const [quarter, [x, y, w, h, points]] of quarters.entries()) {
      elements.push(actor(`track-${index}-${quarter}`, 'stroke', first + quarter * 5, end, box(x, y, w, h), {
        fill: 'muted', enter: 'draw', enterFrames: 8, curve: {width: Math.max(4, Math.round(edge * .007)), points},
        motion: [pose(first + quarter * 5, {opacity: 55}), pose(end - 1, {opacity: 55})],
      }));
    }
    const marks = show.marks ?? [null, null, null];
    const loopAt = first + 26, lap = motionFrames(60), count = marks.length;
    // Variant: the token goes round clockwise or the other way.
    const way = layout % 2 === 1 ? -1 : 1;
    const at = turn => ({x: c.x + way * radius * Math.sin(turn * 2 * Math.PI), y: c.y - radius * Math.cos(turn * 2 * Math.PI)});
    const top = at(0), small = node * .5, wide = loopAt + Math.round(lap * .12);
    for (const [mark, text] of marks.entries()) {
      // Stops are spread evenly and kept off the top, where the token starts and the headline sits.
      const turn = (mark + .5) / count, point = at(turn), reached = loopAt + Math.round(lap * turn);
      const out = {x: way * Math.sin(turn * 2 * Math.PI), y: -Math.cos(turn * 2 * Math.PI)};
      elements.push(disc(`stop-${index}-${mark}`, Math.min(reached - 1, wide + mark * 3), end, point.x, point.y, small, 'surface', {elevation: 0}));
      elements.push(disc(`lit-${index}-${mark}`, reached, end, point.x, point.y, small * 1.25, strong, {sound: 'pop', elevation: 0}));
      elements.push(symbol(`lit-icon-${index}-${mark}`, 'check', reached, end, point.x, point.y, small * 1.25, strongInk));
      if (!text) continue;
      // Labels sit outside the ring. Beside it they are set flush to the stop; above and below they are centred.
      const width = edge * (portrait ? .24 : .34), gap = node * .78, side = !portrait && Math.abs(out.x) > .5;
      const x = side ? point.x + Math.sign(out.x) * (gap + width / 2) : point.x + out.x * (gap + width / 2) * (portrait ? 1 : .6);
      const y = side ? point.y - labelSize * .7 : out.y < 0 ? point.y - gap - labelSize * 1.4 : point.y + gap * (portrait && Math.abs(out.x) > .5 ? -.2 : .75);
      const line = Math.min(H - labelSize * 1.6, Math.max(H * .26, y));
      elements.push(label(`stop-label-${index}-${mark}`, text, reached + 2, end, x, line, width, {
        box: box(Math.max(8, Math.min(W - width - 8, x - width / 2)), line, width, labelSize * 1.45),
        ...(side && {align: out.x > 0 ? 'left' : 'right'})}));
    }
    const ride = Array.from({length: 8}, (_, step) => {
      const u = (step + 1) / 8, point = at(u);
      return pose(loopAt + lap * u, {x: point.x - top.x, y: point.y - top.y});
    });
    elements.push(disc(`token-${index}`, first + 6, end, top.x, top.y, node, strong, {sound: 'pop', motion: [pose(first + 6), pose(loopAt), ...ride]}));
    elements.push(symbol(`subject-${index}`, show.subject.icon ?? 'box', first + 6, end, top.x, top.y, node, strongInk, {assetId:show.subject.assetId,motion: [pose(first + 6), pose(loopAt), ...ride]}));
    const inner = radius * 1.3;
    elements.push(actor(`subject-label-${index}`, 'text', loopAt - 14, show.result ? loopAt+lap+2 : end, box(c.x - inner / 2, c.y - labelSize * 1.9, inner, labelSize * 1.6), {
      text: show.subject.label, fontSize: fitSize(show.subject.label, inner, labelSize), weight: 500, align: 'center', fill: 'muted', enter: 'rise', enterFrames: 10, ...attach}));
    if (show.result) elements.push(actor(`result-${index}`, 'text', loopAt + lap + 2, end, box(c.x - inner / 2, c.y - labelSize * 1.8, inner, labelSize * 3.6), {
      text: show.result, fontSize: fitSize(show.result, inner, edge * .062), weight: 700, align: 'center', fill: ink, enter: 'mask-rise', enterFrames: 12, sound: 'ding', ...attach}));
    closeUp(top.x, top.y + radius * .35, 135, loopAt - 6, first + 6);
    // The whole ring, framed tightly: nothing else is in this scene.
    camera.push(steady ? {frame: wide, ...centred, zoom: 100, ease: 'glide'} :
      {frame: wide, x: Math.round(c.x), y: Math.round(c.y - (portrait || !titled ? 0 : edge * .065)), rotate: 0, zoom: portrait ? 100 : 108, ease: 'glide'});
    settled = loopAt + lap + 16;
    anchorId = `token-${index}`;
    anchorBox = disk(top.x, top.y, node);
    anchorIcon = show.subject.icon ?? 'box';
  }

  if (show.kind === 'gather') {
    // Without a headline the group takes the middle of the frame.
    const c = {x: W / 2, y: H * (titled ? (portrait ? .56 : .58) : .5)}, count = show.parts.length, big = node * 1.7;
    const reach = portrait ? {x: W * .3, y: H * .2} : {x: W * .34, y: H * .26};
    // Parts start on an oval around the place they will end up in.
    const spots = show.parts.map((_, part) => {
      // Variant: an arc above the centre, or a ring around it.
      const angle = (portrait || layout % 2 === 1 ? -135 + part * 360 / count : -150 + part * 120 / Math.max(1, count - 1)) * Math.PI / 180;
      return {x: c.x + reach.x * Math.cos(angle), y: c.y + reach.y * Math.sin(angle)};
    });
    const flyAt = first + count * 6 + 40, lastIn = flyAt + (count - 1) * 10 + 16;
    for (const [part, {icon = 'box', label: text,assetId}] of show.parts.entries()) {
      const spot = spots[part], at = first + part * 6, leave = flyAt + part * 10;
      const fly = [pose(at), pose(leave), pose(leave + 16, {x: c.x - spot.x, y: c.y - spot.y, scale: 45, opacity: 0, ease: 'glide'})];
      elements.push(disc(`part-${index}-${part}`, at, leave + 17, spot.x, spot.y, node, 'surface', {sound: 'pop', motion: fly}));
      elements.push(symbol(`part-icon-${index}-${part}`, icon, at, leave + 17, spot.x, spot.y, node, 'foreground', {assetId,motion: fly}));
      elements.push(label(`part-label-${index}-${part}`, text, at + 4, flyAt - 2, spot.x, spot.y + node * .66, edge * .32));
    }
    // The place grows a little with every part it takes in.
    const grown = flyAt + 12, pulse = [pose(grown, {scale: 70})];
    for (let part = 0; part < count && pulse.length < 9; part++) {
      const hit = flyAt + part * 10 + 15;
      if (hit > pulse.at(-1).frame) pulse.push(pose(hit, {scale: Math.round(74 + part * 26 / Math.max(1, count - 1)), ease: 'spring'}));
    }
    elements.push(disc(`token-${index}`, grown, end, c.x, c.y, big, strong, {sound: 'pop', motion: pulse}));
    elements.push(symbol(`whole-${index}`, show.whole.icon ?? 'phone', grown, end, c.x, c.y, big, strongInk, {assetId:show.whole.assetId,motion: pulse}));
    elements.push(label(`whole-label-${index}`, show.whole.label, lastIn + 2, end, c.x, c.y + big * .66, edge * .6, {fontSize: fitSize(show.whole.label, edge * .6, edge * .056), weight: 700}));
    if (show.result) elements.push(result(show.result, lastIn + 8, c.x, c.y - big * .58 - edge * .046 * 2.1 - edge * .02));
    camera.push({frame: start, ...centred, zoom: 100});
    camera.push({frame: flyAt, ...centred, zoom: 100});
    camera.push(steady ? {frame: lastIn, ...centred, zoom: 100} : {frame: lastIn, x: Math.round(c.x), y: Math.round(c.y), rotate: 0, zoom: 128, ease: 'glide'});
    settled = lastIn + 20;
    anchorId = `token-${index}`;
    anchorBox = disk(c.x, c.y, big);
    anchorIcon = show.whole.icon ?? 'phone';
  }

  if (show.kind === 'process') {
    const count = show.stages.length, small = node * .72;
    // Variant: the stages stand in a level row or climb like steps. They always read in order.
    const rise = layout % 2 === 1 && !portrait ? edge * .07 : 0;
    const row = H * (titled ? .56 : .5), stepX = (W - 2 * m) / count, stepY = H * .5 / (count - 1);
    const spot = stage => portrait ? {x: W * .2, y: H * .34 + stepY * stage} : {x: m + stepX * (stage + .5), y: row + ((count - 1) / 2 - stage) * rise};
    const dwell = 18, hop = Math.max(10, motionFrames(14)), landed = stage => first + stage * (dwell + hop), origin = spot(0);
    const hops = [pose(first)], under = [], onTop = [], names = [];
    for (const [stage, {icon = 'check', label: text,assetId}] of show.stages.entries()) {
      const here = spot(stage), land = landed(stage), leave = land + dwell, final = stage === count - 1;
      if (stage) {
        const from = spot(stage - 1), mid = {x: (from.x + here.x) / 2, y: (from.y + here.y) / 2}, lift = node * .7;
        // The token hops: it leaves the stage, rises off the line and lands on the next one.
        hops.push(pose(land - hop, {x: from.x - origin.x, y: from.y - origin.y}),
          pose(land - hop / 2, {x: mid.x - origin.x - (portrait ? lift : 0), y: mid.y - origin.y - (portrait ? 0 : lift), ease: 'glide'}),
          pose(land, {x: here.x - origin.x, y: here.y - origin.y, ease: 'spring'}));
        const climb = Math.max(4, from.y - here.y);
        const line = portrait ? box(from.x - 2, from.y, 4, here.y - from.y) : box(from.x, here.y - (rise ? 0 : 2), here.x - from.x, climb);
        under.push(actor(`link-${index}-${stage}`, 'stroke', land - hop, end, line, {fill: 'muted', enter: 'draw', enterFrames: hop,
          curve: {width: 4, points: [0, 333, 667, 1000].map(point => portrait ? {x: 500, y: point} : {x: point, y: rise ? 1000 - point : 500})}}));
      }
      // What the thing is at this stage rides on the token; once the token moves on, the stage keeps it.
      onTop.push(symbol(`stage-${index}-${stage}`, icon, land, final ? end : leave + 12, here.x, here.y, node, strongInk,
        final ? {assetId} : {assetId,motion: [pose(land), pose(leave), pose(leave + 6, {scale: 40, opacity: 0})]}));
      if (!final) {
        under.push(disc(`kept-${index}-${stage}`, leave + 2, end, here.x, here.y, small, 'surface', {elevation: 0}));
        under.push(symbol(`kept-icon-${index}-${stage}`, icon, leave + 2, end, here.x, here.y, small, 'foreground',{assetId}));
      }
      const width = portrait ? W * .6 : stepX * .9;
      names.push(label(`stage-label-${index}-${stage}`, text, land + 2, end, portrait ? here.x + node * .75 + width / 2 : here.x, portrait ? here.y - labelSize * .7 : here.y + node * .7, width,
        portrait && {align: 'left'}));
    }
    const last = spot(count - 1), done = landed(count - 1);
    elements.push(...under, disc(`token-${index}`, first, end, origin.x, origin.y, node, strong, {sound: 'pop', motion: hops}), ...onTop, ...names);
    if (show.result) elements.push(result(show.result, done + 6, portrait ? W / 2 : last.x, portrait ? H * .9 : last.y - node * .62 - edge * .046 * 2.1 - edge * .02));
    closeUp(origin.x + (W / 2 - origin.x) * .15, origin.y, 140, landed(0) + dwell - 4);
    camera.push({frame: landed(1), ...centred, zoom: 100, ease: 'glide'});
    settled = done + 20;
    anchorId = `token-${index}`;
    anchorBox = disk(last.x, last.y, node);
    anchorIcon = show.stages.at(-1).icon ?? 'check';
  }

  if (show.kind === 'spread') {
    const c = {x: W / 2, y: H * (titled ? (portrait ? .56 : .58) : .5)}, count = show.parts.length, big = node * 1.4;
    // Destinations stand to the sides (above and below in a tall frame), so the centre keeps its label and result.
    const angles = {2: [180, 0], 3: [208, 152, 0], 4: [208, 152, -28, 28]}[count].map(angle => angle + (layout % 2 === 1 ? 180 : 0));
    const reach = portrait ? H * .27 : W * .34;
    const spots = angles.map(angle => {
      const turn = angle * Math.PI / 180;
      return portrait ? {x: c.x + reach * Math.sin(turn) * .62, y: c.y - reach * Math.cos(turn)} : {x: c.x + reach * Math.cos(turn), y: c.y + reach * Math.sin(turn) * .62};
    });
    const burstAt = first + 26, landed = part => burstAt + part * 8 + 14;
    const rays = [], copies = [], places = [];
    for (const [part, {icon = 'person', label: text,assetId}] of show.parts.entries()) {
      const spot = spots[part], go = burstAt + part * 8, dx = spot.x - c.x, dy = spot.y - c.y;
      const span = box(Math.min(c.x, spot.x), Math.min(c.y, spot.y), Math.max(1, Math.abs(dx)), Math.max(1, Math.abs(dy)));
      const from = {x: dx >= 0 ? 0 : 1000, y: dy >= 0 ? 0 : 1000}, to = {x: 1000 - from.x, y: 1000 - from.y};
      const between = share => ({x: Math.round(from.x + (to.x - from.x) * share), y: Math.round(from.y + (to.y - from.y) * share)});
      rays.push(actor(`ray-${index}-${part}`, 'stroke', go, end, span, {fill: 'muted', enter: 'draw', enterFrames: 14,
        curve: {width: 4, points: [between(0), between(.333), between(.667), between(1)]},
        motion: [pose(go, {opacity: 55}), pose(end - 1, {opacity: 55})]}));
      // A copy of the subject flies out along the ray and becomes the place it lands on.
      copies.push(disc(`copy-${index}-${part}`, go, go + 28, c.x, c.y, node * .5, strong, {enter: 'none', enterFrames: 1, elevation: 0,
        motion: [pose(go, {scale: 60}), pose(go + 14, {x: dx, y: dy, ease: 'glide'}), pose(go + 20, {x: dx, y: dy, opacity: 0})]}));
      places.push(disc(`part-${index}-${part}`, landed(part), end, spot.x, spot.y, node, 'surface', {sound: 'pop'}));
      places.push(symbol(`part-icon-${index}-${part}`, icon, landed(part), end, spot.x, spot.y, node, 'foreground',
        {assetId,...(assetId && {handoffFrom:`copy-${index}-${part}`})}));
      places.push(label(`part-label-${index}-${part}`, text, landed(part) + 3, end, spot.x, spot.y + node * .66, edge * .3));
    }
    const lastIn = landed(count - 1);
    elements.push(...rays, ...copies, ...places,
      disc(`token-${index}`, first, end, c.x, c.y, big, strong, {sound: 'pop', motion: [pose(first), pose(burstAt - 4), pose(burstAt, {scale: 112, ease: 'snap'}), pose(burstAt + 10, {ease: 'spring'})]}),
      symbol(`subject-${index}`, show.subject.icon ?? 'megaphone', first, end, c.x, c.y, big, strongInk,{assetId:show.subject.assetId}),
      label(`subject-label-${index}`, show.subject.label, first + 4, end, c.x, c.y + big * .64, edge * .34, {weight: 700}));
    if (show.result) elements.push(result(show.result, lastIn + 6, c.x, c.y - big * .58 - edge * .046 * 2.1 - edge * .02));
    closeUp(c.x, c.y, 140, burstAt - 4);
    camera.push({frame: burstAt + 12, ...centred, zoom: 100, ease: 'glide'});
    settled = lastIn + 20;
    anchorId = `token-${index}`;
    anchorBox = disk(c.x, c.y, big);
    anchorIcon = show.subject.icon ?? 'megaphone';
  }

  if (show.kind === 'transform') {
    const size = Math.round(edge * .27), x = focusX, y = H * (titled ? .52 : .43);
    const interval = Math.max(46,motionFrames(54)), at = part => first + part * interval;
    const morph = Math.max(12,motionFrames(20));
    const keys = show.stages.flatMap((part, i) => {
      const key = {...(part.assetId && {assetId:part.assetId}),frame:at(i), form:part.form ?? 'tile', mark:part.icon ?? 'check', fill:strong,
        rx:part.form === 'box' ? -16 : 0, ry:part.form === 'box' ? 28 : 0};
      return i ? [{...keysForPrevious(show.stages[i - 1], strong), frame:at(i) - morph}, key] : [key];
    });
    const last = show.stages.length - 1, done = at(last);
    elements.push(actor(`token-${index}`, 'transform', first, end, disk(x, y, size), {
      fill:strong, enter:'pop', enterFrames:12, sound:'pop',
      formTrack:{depth:Math.round(size * .55), keys}, ...attach,
    }));
    show.stages.forEach((part, i) => {
      const until = i === last ? end : at(i + 1) - morph;
      elements.push(label(`stage-label-${index}-${i}`, part.label, at(i) + 3, until, x, y + size * .76, edge * .7));
    });
    if (show.result) elements.push(result(show.result, done + 16, x, y + size * .76 + labelSize * 3));
    camera.push({frame:start,...centred,zoom:100});
    settled = done + 30;
    anchorId = `token-${index}`;
    anchorBox = disk(x,y,size);
    anchorIcon = show.stages[last].icon ?? 'check';
  }

  if (show.kind === 'fold') {
    const size = Math.round(edge * .26), x = focusX, y = H * (titled ? .51 : .43);
    const at = first + 24, duration = motionFrames(42), done = at + duration;
    elements.push(actor(`token-${index}`, 'fold', first, end, box(x-size/2,y-size/2,size,size,8), {
      fill:strong, fold:{at,frames:duration,direction:show.direction ?? 'open', material:show.material ?? 'package',
        mark:show.whole.icon ?? 'box',...(show.whole.assetId && {assetId:show.whole.assetId})}, ...attach,
    }));
    elements.push(label(`subject-label-${index}`, show.subject.label, first + 2, at + 10, x, y + size * 1.15, edge * .72));
    elements.push(label(`whole-label-${index}`, show.whole.label, done, end, x, y + size * 1.15, edge * .72));
    if (show.result) elements.push(result(show.result, done + 12, x, y + size * 1.15 + labelSize * 3));
    camera.push({frame:start,...centred,zoom:100});
    settled = done + 28;
    anchorId = `token-${index}`;
    anchorBox = box(x-size/2,y-size/2,size,size,8);
    anchorIcon = show.whole.icon ?? 'box';
  }

  if (show.kind === 'assemble') {
    const size = Math.round(edge * .28), x = focusX, y = H * (titled ? .51 : .43);
    const count = show.parts.length, land = part => first + 64 + part * 12, done = land(count - 1);
    show.parts.forEach((part, i) => {
      const angle = (i * 360 / count - 90) * Math.PI / 180;
      const from = {x:x + Math.cos(angle)*edge*.31,y:y + Math.sin(angle)*edge*.26};
      const pw = size/(count === 4 ? 2 : count), ph = count === 4 ? size/2 : size;
      const piece = Math.min(pw,ph), to = count === 4
        ? {x:x + (i % 2 ? .25 : -.25)*size,y:y + (i < 2 ? -.25 : .25)*size}
        : {x:x-size/2+pw*(i+.5),y};
      const at = first + i * 5;
      elements.push(actor(`part-${index}-${i}`, 'rect', at, done, box(from.x-pw/2,from.y-ph/2,pw,ph,4), {
        fill:strong, enter:'pop',enterFrames:10,sound:'pop',...attach,
        motion:[pose(at),pose(land(i)-18),pose(land(i)-1,{x:to.x-from.x,y:to.y-from.y,rotate:0,ease:'glide'})],
      }));
      elements.push(symbol(`part-icon-${index}-${i}`, part.icon ?? 'check', at, land(i)-20, from.x,from.y,piece,strongInk,{assetId:part.assetId}));
      elements.push(label(`part-label-${index}-${i}`, part.label, at+2, land(i)-20, from.x,from.y+ph*.5+piece*.15,edge*.3));
    });
    elements.push(actor(`token-${index}`, 'transform', done, end, disk(x,y,size), {
      fill:strong, enter:'none',enterFrames:1,sound:'ding',...attach,
      formTrack:{depth:Math.round(size*.5),keys:[
        {frame:done,form:'tile',fill:strong},
        {...(show.whole.assetId && {assetId:show.whole.assetId}),frame:done+22,form:show.whole.form ?? 'box',mark:show.whole.icon ?? 'box',fill:strong,
          rx:!show.whole.form || show.whole.form === 'box' ? -16 : 0,ry:!show.whole.form || show.whole.form === 'box' ? 28 : 0},
      ]},
    }));
    elements.push(label(`whole-label-${index}`,show.whole.label,done+24,end,x,y+size*.8,edge*.7));
    if (show.result) elements.push(result(show.result,done+30,x,y+size*.8+labelSize*3));
    camera.push({frame:start,...centred,zoom:100});
    settled = done+48;
    anchorId = `token-${index}`;
    anchorBox = disk(x,y,size);
    anchorIcon = show.whole.icon ?? 'box';
  }

  // Adapted motion ideas: OpenMotion orbit + bento-grid + Ken Burns. The native
  // score owns time, layout, assets and audio. See THIRD_PARTY_NOTICES.md.
  if (show.kind === 'orbit') {
    const count=show.parts.length,cx=W/2,cy=H*(titled ? .55 : .5),size=edge*.18,big=edge*.21;
    const rx=W*.32,ry=portrait?H*.22:H*.28,spin=first+count*8+34,done=spin+motionFrames(54);
    const point=(i,turn=0)=>{const angle=(i/count+turn)*Math.PI*2-Math.PI/2;
      return {x:cx+Math.cos(angle)*rx,y:cy+Math.sin(angle)*ry};};
    show.parts.forEach((part,i)=>{
      const from=point(i),at=first+i*8;
      const track=[pose(at),pose(spin),...Array.from({length:8},(_,step)=>{
        const p=point(i,(step+1)/16);
        return pose(spin+(done-spin)*(step+1)/8,{x:p.x-from.x,y:p.y-from.y,ease:'linear'});
      }),pose(end-1,{x:point(i,.5).x-from.x,y:point(i,.5).y-from.y})];
      elements.push(disc(`orbit-disc-${index}-${i}`,at,end,from.x,from.y,size,'surface',{motion:track}));
      elements.push(symbol(`orbit-image-${index}-${i}`,part.icon??'bolt',at,end,from.x,from.y,size,'foreground',{assetId:part.assetId,motion:track}));
      elements.push(label(`orbit-label-${index}-${i}`,part.label,at+2,spin-2,from.x,from.y+size*.58,edge*.28,{fontSize:Math.round(edge*.04)}));
      const into=point(i,.5);
      elements.push(label(`orbit-land-label-${index}-${i}`,part.label,done+2,end,into.x,into.y+size*.58,edge*.28,{fontSize:Math.round(edge*.04)}));
    });
    elements.push(disc(`token-${index}`,first,end,cx,cy,big,'surface'));
    elements.push(symbol(`whole-${index}`,show.whole.icon??'bolt',first,end,cx,cy,big,'foreground',{assetId:show.whole.assetId}));
    const centreLabel=text=>box(cx-edge*.2,cy+big*.57,edge*.4,edge*.076);
    elements.push(actor(`whole-label-${index}`,'text',first+4,show.result?done:end,centreLabel(show.whole.label),{
      text:show.whole.label,fontSize:Math.round(edge*.043),align:'center',enter:'rise',enterFrames:10,fill:ink,...attach}));
    if(show.result)elements.push(actor(`result-${index}`,'text',done+2,end,centreLabel(show.result),{
      text:show.result,fontSize:Math.round(edge*.043),align:'center',enter:'rise',enterFrames:10,fill:ink,...attach}));
    camera.push({frame:start,...centred,zoom:100});settled=done+30;
    anchorId=`token-${index}`;anchorBox=disk(cx,cy,big);anchorIcon=show.whole.icon??'bolt';
  }

  if (show.kind === 'gallery') {
    const n=show.parts.length,gap=edge*.024,x=m,y=H*(titled ? .28 : .2),w=W-2*m,h=H*(portrait ? .61 : .58);
    const regions=n===2 ? (portrait
      ? [box(x,y,w,h*.54-gap/2,24),box(x,y+h*.54+gap/2,w,h*.46-gap/2,24)]
      : [box(x,y,w*.6-gap/2,h,24),box(x+w*.6+gap/2,y,w*.4-gap/2,h,24)])
      : n===3 ? (portrait
        ? [box(x,y,w,h*.56-gap/2,24),box(x,y+h*.56+gap/2,(w-gap)/2,h*.44-gap/2,24),box(x+(w+gap)/2,y+h*.56+gap/2,(w-gap)/2,h*.44-gap/2,24)]
        : [box(x,y,w*.61-gap/2,h,24),box(x+w*.61+gap/2,y,w*.39-gap/2,(h-gap)/2,24),box(x+w*.61+gap/2,y+(h+gap)/2,w*.39-gap/2,(h-gap)/2,24)])
      : Array.from({length:4},(_,i)=>box(x+(i%2)*(w+gap)/2,y+Math.floor(i/2)*(h+gap)/2,(w-gap)/2,(h-gap)/2,24));
    show.parts.forEach((part,i)=>{
      const b=regions[i],at=first+i*12,captionH=Math.round(edge*.072);
      const original=stage.sourceAssets?.find(asset=>asset.id===part.assetId);
      const fit=part.imageFit ?? beat.visual.imageFit ?? (original?.width/original?.height<.85 ? 'contain' : 'cover');
      elements.push(actor(`gallery-image-${index}-${i}`,'image',at,end,b,{
        assetId:part.assetId,imageFit:fit,imageReveal:i%2?'iris':'wipe',mediaMotion:beat.visual.mediaMotion??(i?'parallax':'ken-burns'),
        enter:'resolve',enterFrames:motionFrames(24),sound:'pop',...attach}));
      elements.push(actor(`gallery-shade-${index}-${i}`,'rect',at+18,end,box(b.x,b.y+b.h-captionH,b.w,captionH,0),{
        fill:'foreground',enter:'resolve',enterFrames:8}));
      elements.push(actor(`gallery-label-${index}-${i}`,'text',at+20,end,box(b.x+edge*.018,b.y+b.h-captionH,b.w-edge*.036,captionH,0),{
        text:part.label,fontSize:Math.round(edge*.038),fill:'background',enter:'resolve',enterFrames:8,...attach}));
    });
    if(show.result)elements.push(label(`result-${index}`,show.result,first+n*12+24,end,W/2,y+h+edge*.025,W-2*m,{weight:700}));
    camera.push({frame:start,...centred,zoom:100});settled=first+n*12+44;
    // A photograph is not a flat solid token: a deliberate cut or wipe is clearer.
    anchorId=`gallery-image-${index}-0`;anchorBox=regions[0];anchorIcon='image';
  }

  if (entering?.kind === 'match' && entering.anchor?.box && show.kind!=='gallery') {
    const token = elements.find(item => item.id === (['assemble','gather'].includes(show.kind) ? `part-${index}-0` : `token-${index}`));
    const from = entering.anchor.box, into = token.box;
    const oldStart = token.start;
    const firstPose = pose(start, {x:from.x+from.w/2-into.x-into.w/2,y:from.y+from.h/2-into.y-into.h/2,
      scale:Math.max(20,Math.min(250,Math.round(from.w/into.w*100)))});
    token.start = start;
    token.enter = 'none';
    token.motion = [firstPose,pose(oldStart),...(token.motion ?? []).filter(key => key.frame > oldStart)];
    if(show.kind==='orbit') {
      const fromForm=entering.anchor.form ?? {form:'tile',fill:entering.anchor.fill,mark:entering.anchor.icon??'check'};
      const intoForm={form:'tile',fill:token.fill,mark:show.whole.icon??'bolt',...(show.whole.assetId && {assetId:show.whole.assetId})};
      token.kind='transform';
      delete token.elevation;
      token.formTrack={depth:Math.round(into.w*.55),keys:[{...fromForm,frame:start},{...fromForm,frame:oldStart},
        {...intoForm,frame:oldStart+motionFrames(20)}]};
      const foreground=elements.findIndex(item=>item.id===`whole-${index}`);
      if(foreground>=0)elements.splice(foreground,1);
    }
    else if (token.formTrack) token.formTrack.keys.unshift({...entering.anchor.form ?? token.formTrack.keys[0],frame:start});
    if (!token.formTrack && !token.fold) token.fill = entering.anchor.fill;
  }
  if (beat.visual.camera === 'locked') {
    camera.splice(0,camera.length,{frame:start,...centred,zoom:100});
  } else if (['follow','detail'].includes(beat.visual.camera) && camera.every(key => key.zoom === 100)) {
    const focus = elements.find(item => [anchorId, `part-${index}-0`].includes(item.id) && item.space !== 'screen' && item.start <= first + 18 && item.end > first + 18);
    camera.push({frame:first,...centred,zoom:100},
      {frame:first+18,...(focus ? {target:focus.id,x:0,y:0,rotate:0} : centred),zoom:beat.visual.camera === 'detail' ? 124 : 112,ease:'glide'},
      {frame:Math.min(end-2,settled),...centred,zoom:100,ease:'glide'});
  }

  camera.push({...camera.at(-1), frame: end - 1, ease: 'linear'});
  // Every label must have time to be read after it lands.
  for (const item of elements) {
    if (!['text', 'pill'].includes(item.kind)) continue;
    const need = item.enterFrames + readingBudget(item.text) + (item.end === end ? 0 : 7);
    if (item.end - item.start < need) item.start = Math.max(start, item.end - need);
  }
  const anchorForm = elements.find(item=>item.id===anchorId)?.formTrack?.keys.at(-1);
  return {elements, camera, settled, anchorId, anchorBox, anchorIcon, anchorForm};
}
