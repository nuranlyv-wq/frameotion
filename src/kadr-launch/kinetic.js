const clamp = value => Math.min(1, Math.max(0, value));
const lerp = (from, to, progress) => from + (to - from) * progress;
const smooth = value => value * value * (3 - 2 * value);
const turn = 2 * Math.PI;
const graphemes = new Intl.Segmenter(undefined, {granularity: 'grapheme'});
export const TOGGLE_SETTLE_FRAMES = 8;

// A damped oscillation that overshoots its target by about 7% and settles.
// The linear term closes the tiny residual so the curve lands exactly on 1.
const springRaw = t => 1 - Math.exp(-7 * t) * Math.cos(8.5 * t);
const SPRING_RESIDUAL = 1 - springRaw(1);
export const spring = value => {
  const t = clamp(value);
  return springRaw(t) + SPRING_RESIDUAL * t;
};
// Fast departure with a long, soft landing.
export const expoOut = value => {
  const t = clamp(value);
  return t === 1 ? 1 : (1 - 2 ** (-10 * t)) / (1 - 2 ** -10);
};
// Slow start, quick middle, slow landing: for camera moves and large surfaces.
const glide = t => t < .5 ? 8 * t ** 4 : 1 - (-2 * t + 2) ** 4 / 2;

export function motionProgress(value, easing) {
  const progress = clamp(value);
  if (easing === 'linear') return progress;
  if (easing === 'smooth') return smooth(progress);
  if (easing === 'fluid') return progress ** 3 * (10 - 15 * progress + 6 * progress ** 2);
  if (easing === 'snap') return 1 - (1 - progress) ** 4;
  if (easing === 'spring') return spring(progress);
  if (easing === 'glide') return glide(progress);
  if (easing === 'expo') return expoOut(progress);
  return 1 - (1 - progress) ** 3;
}

// A monotone tangent carries speed through a moving waypoint. Holds and
// reversals have zero tangent, so their authored timing stays intact.
function waypointSlope(before, at, after, leftFrames, rightFrames, fluid) {
  const left = (at - before) / leftFrames;
  const right = (after - at) / rightFrames;
  if (left * right <= 0) return 0;
  const leftWeight = 2 * rightFrames + leftFrames;
  const rightWeight = rightFrames + 2 * leftFrames;
  const slope = (leftWeight + rightWeight) / (leftWeight / left + rightWeight / right);
  // Bound the quintic's control points so a monotone move cannot overshoot.
  return fluid ? Math.sign(slope) * Math.min(Math.abs(slope), 1.25 * Math.min(Math.abs(left), Math.abs(right))) : slope;
}

export function motionTrackAt(keys, frame, fields, {read = key => key, defaultEase = 'linear'} = {}) {
  const index = Math.max(0, keys.findLastIndex(key => key.frame <= frame));
  const start = keys[index], end = keys[index + 1], from = read(start);
  if (!end || frame <= start.frame) return from;
  const to = read(end), duration = end.frame - start.frame;
  const t = clamp((frame - start.frame) / duration);
  const easing = end.ease ?? defaultEase;
  const progress = motionProgress(t, easing);
  const previousKey = keys[index - 1], nextKey = keys[index + 2];
  const fluid = easing === 'fluid';
  const carriesSpeed = fluid || easing === 'smooth';
  const before = carriesSpeed && previousKey && (start.ease ?? defaultEase) === easing ? read(previousKey) : null;
  const after = carriesSpeed && nextKey && (nextKey.ease ?? defaultEase) === easing ? read(nextKey) : null;
  // Fluid tracks also share zero acceleration at the key, including holds.
  const startTangent = fluid ? t * (1 - t) ** 3 * (1 + 3 * t) : t * (1 - t) ** 2;
  const endTangent = fluid ? t ** 3 * (1 - t) * (4 - 3 * t) : t ** 2 * (1 - t);
  return Object.fromEntries(fields.map(field => {
    const a = from[field], b = to[field];
    let value = lerp(a, b, progress);
    if (before) value += startTangent * duration * waypointSlope(before[field], a, b, start.frame - previousKey.frame, duration, fluid);
    if (after) value -= endTangent * duration * waypointSlope(a, b, after[field], duration, nextKey.frame - end.frame, fluid);
    // A spring may overshoot position and size; opacity stays a valid alpha.
    return [field, field === 'opacity' ? Math.min(100, Math.max(0, value)) : value];
  }));
}

const actorFields = ['x', 'y', 'scale', 'rotate', 'opacity'];
export function poseAt(keys, frame) {
  return motionTrackAt(keys, frame, actorFields);
}

const shapeFields = ['cx', 'cy', 'w', 'h', 'radius', 'rotate', 'opacity'];

export function shapeTrack(states) {
  let rotate = 0, opacity = 100;
  const key = (state, frame, ease) => {
    const {x, y, w, h, radius} = state.box;
    rotate = state.rotate ?? rotate;
    opacity = state.opacity ?? opacity;
    return {frame, ease, cx:x + w / 2, cy:y + h / 2, w, h, radius, rotate, opacity};
  };
  const keys = [key(states[0], 0, 'smooth')];
  for (const [index, state] of states.entries()) {
    if (!index) continue;
    const instant = state.duration === 0;
    if (keys.at(-1).frame < state.frame) {
      keys.push(key(states[index - 1], state.frame, instant ? 'linear' : state.ease === 'fluid' ? 'fluid' : 'smooth'));
    }
    // The first key at this frame holds the old pose up to the cut. The last key owns the frame itself.
    keys.push(key(state, state.frame + state.duration, instant ? 'linear' : state.ease ?? 'smooth'));
  }
  return keys;
}

export function shapePoseAt(track, frame) {
  const {cx, cy, w, h, radius, rotate, opacity} = motionTrackAt(track, frame, shapeFields);
  const width = Math.max(1,w), height = Math.max(1,h);
  return {box:{x:cx - width / 2, y:cy - height / 2, w:width, h:height, radius:Math.max(0,radius)},rotate,opacity};
}

export const shapeBoxAt = (track, frame) => shapePoseAt(track,frame).box;

export function rollEntrance(box, progress, direction = 'left') {
  const p = clamp(progress);
  if (p === 1) return {x:0,y:0,rotate:0,scale:1,opacity:1};
  const settle = 1 - smooth(p);
  const sign = direction === 'right' ? 1 : -1;
  const width = Math.min(box.w, 430);
  const vertical = direction === 'bottom';
  return {
    x: vertical ? 0 : sign * width * .72 * settle,
    y: (vertical ? Math.min(box.h * 1.4, 200) : Math.min(box.h * .64, 100)) * settle - 24 * Math.sin(Math.PI * p) ** 2,
    rotate: sign * (94 * settle - 11 * Math.sin(Math.PI * p) ** 3),
    scale: 1 - .22 * settle,
    opacity: smooth(p * 3.4),
  };
}

export function makeWordLift(context, element, layout) {
  const type = measureRows(context,element,layout);
  const words = type.rows.flatMap(row => [...row.text.matchAll(/\S+/gu)].map(match => {
    const x = row.left + context.measureText(row.text.slice(0,match.index)).width;
    const width = context.measureText(match[0]).width;
    return {text:match[0],x,y:row.y,width};
  }));
  return {...type,words};
}

export function paintWordLift(context, layout, element, frame, recordInk, wordFill) {
  const duration = element.enterFrames;
  const wordDuration = Math.max(4,duration * .58);
  const stagger = (duration - wordDuration) / Math.max(1,layout.words.length - 1);
  context.textAlign = 'left';
  context.textBaseline = 'alphabetic';
  for (const [index,word] of layout.words.entries()) {
    const progress = element.leadWord && index === 0 ? 1 :
      smooth(clamp((frame - element.start - index * stagger) / wordDuration));
    if (!progress) continue;
    const top = word.y - layout.size, height = layout.size * 1.3;
    const baseline = word.y + (1 - progress) * height;
    const stretch = element.enter === 'kinetic-stretch' ? 1 + .65 * (1 - progress) : 1;
    context.save();
    context.beginPath();
    context.rect(word.x - 3,top,word.width + 6,height);
    context.clip();
    if (wordFill) context.fillStyle = wordFill(index);
    if (stretch !== 1) {
      context.translate(0,baseline);
      context.scale(1,stretch);
      context.fillText(word.text,word.x,0);
    } else context.fillText(word.text,word.x,baseline);
    recordInk?.(word.text,word.x,baseline,top,top + height,stretch);
    context.restore();
  }
}
function measureRows(context, element, layout) {
  const {box, align = 'left'} = element;
  const {size, lines} = layout;
  const lineHeight = size * 1.2;
  const top = box.y + (box.h - lines.length * lineHeight) / 2;
  const x = box.x + (align === 'center' ? box.w / 2 : align === 'right' ? box.w : 0);
  const rows = lines.map((text, index) => {
    const width = context.measureText(text).width;
    return {text, x, y: top + size * .86 + index * lineHeight,
      left: x - (align === 'center' ? width / 2 : align === 'right' ? width : 0), width};
  });
  return {rows, size, align, bounds: {x: Math.min(...rows.map(row => row.left)), y: top,
    w: Math.max(...rows.map(row => row.width)), h: lines.length * lineHeight}};
}

export function makeSpiral(context, element, layout) {
  const {box} = element;
  const type = measureRows(context, element, layout);
  const {rows, size} = type;
  const letters = rows.flatMap(row => [...graphemes.segment(row.text)].flatMap(({segment, index}) => {
    if (!segment.trim()) return [];
    const left = context.measureText(row.text.slice(0, index)).width;
    const right = context.measureText(row.text.slice(0, index + segment.length)).width;
    return [{text: segment, x: row.left + (left + right) / 2, y: row.y - size * .33}];
  }));
  const radius = Math.min(box.w, box.h) * .43 - size * .26;
  const sweep = turn * Math.min(1.65, .78 + letters.length * .027);
  return {
    ...type, letters, radius, sweep,
    cx: box.x + box.w / 2, cy: box.y + box.h / 2,
    scale: Math.min(.68, radius * sweep * .55 / Math.max(size, size * letters.length)),
  };
}

export function paintSpiral(context, layout, element, frame) {
  const progress = clamp((frame - element.start) / element.enterFrames);
  context.textBaseline = 'alphabetic';
  if (progress === 1) {
    context.textAlign = layout.align;
    for (const row of layout.rows) context.fillText(row.text, row.x, row.y);
    return;
  }
  const direction = element.spiral?.direction === 'counterclockwise' ? -1 : 1;
  const rotations = element.spiral?.turns ?? 1;
  context.textAlign = 'center';
  for (const [index, letter] of layout.letters.entries()) {
    const position = index / Math.max(1, layout.letters.length - 1);
    const delay = .26 + position * .16;
    const settle = smooth(clamp((progress - delay) / (1 - delay)));
    const angle = -.75 * Math.PI + direction * (position * layout.sweep + progress * rotations * turn);
    const radius = layout.radius * (.24 + position * .76) * (1 - progress * .28);
    const x = lerp(layout.cx + Math.cos(angle) * radius, letter.x, settle);
    const y = lerp(layout.cy + Math.sin(angle) * radius, letter.y, settle);
    const scale = lerp(layout.scale, 1, settle);
    context.save();
    context.translate(x, y);
    context.rotate(direction * Math.sin(angle + .45) * 1.15 * (1 - settle));
    context.scale(scale, scale);
    context.fillText(letter.text, 0, layout.size * .33);
    context.restore();
  }
}

export function wordHighlightRange(text, phrase) {
  const words = text.trim().match(/\S+/gu) ?? [];
  const match = phrase.trim().match(/\S+/gu);
  if (!match) return null;
  const wordKey = word => word?.normalize('NFC').replace(/^[\p{P}\p{S}]+|[\p{P}\p{S}]+$/gu,'');
  const start = words.findIndex((_, index) => match.every((word, offset) =>
    word === words[index + offset] || Boolean(wordKey(word)) && wordKey(word) === wordKey(words[index + offset])));
  return start < 0 ? null : {start, end: start + match.length};
}

export function makeWordType(context, element, layout) {
  const type = measureRows(context, element, layout);
  const highlight = element.wordType?.highlight;
  const range = highlight && wordHighlightRange(element.text, highlight.text);
  const padding = type.size * .08;
  let left = type.bounds.x;
  let right = left + type.bounds.w;
  let words = 0;
  const rows = type.rows.map(row => {
    const matches = [...row.text.matchAll(/\S+/gu)];
    const stops = matches.map(match => match.index + match[0].length);
    const preceding = words;
    words += stops.length;
    const line = {...row, stops, preceding};
    if (range && stops.length && range.start < words && range.end > preceding) {
      const start = Math.max(0, range.start - preceding);
      const end = Math.min(stops.length, range.end - preceding);
      const x = row.left + context.measureText(row.text.slice(0, matches[start].index)).width;
      line.highlight = {start, end, x};
      left = Math.min(left, x - padding);
      right = Math.max(right, row.left + context.measureText(row.text.slice(0, stops[end - 1])).width + padding);
    }
    return line;
  });
  const lastRow = rows.findLast(row => row.stops.length);
  if (element.wordType?.caret === 'blink' && lastRow) {
    right = Math.max(right, lastRow.left + lastRow.width + type.size * .09 + Math.max(2, type.size * .045));
  }
  return {...type, rows, words, padding, bounds: {...type.bounds, x: left, w: right - left}};
}

export function paintWordType(context, layout, element, palette, frame, recordInk) {
  const elapsed = frame - element.start;
  const progress = clamp(elapsed / element.enterFrames);
  const visible = Math.min(layout.words, Math.floor(progress * layout.words) + 1);
  context.textAlign = 'left';
  context.textBaseline = 'alphabetic';
  let caret;
  for (const row of layout.rows) {
    if (!row.stops.length) continue;
    const count = Math.min(row.stops.length, visible - row.preceding);
    if (count <= 0) break;
    const text = row.text.slice(0, row.stops[count - 1]);
    const mark = row.highlight;
    if (mark && count > mark.start) {
      const end = row.stops[Math.min(count, mark.end) - 1];
      const right = row.left + context.measureText(row.text.slice(0, end)).width;
      context.beginPath();
      context.roundRect(mark.x - layout.padding, row.y - layout.size * .8,
        right - mark.x + layout.padding * 2, layout.size, layout.size * .14);
      context.fillStyle = palette[element.wordType.highlight.fill];
      context.fill();
    }
    context.fillStyle = palette[element.fill];
    context.fillText(text, row.left, row.y);
    recordInk?.(text, row.left, row.y);
    caret = {x: row.left + context.measureText(text).width, y: row.y};
  }
  const blinking = element.wordType?.caret === 'blink' && (elapsed - element.enterFrames) % 30 < 15;
  if (caret && (progress < 1 || blinking)) {
    context.fillRect(caret.x + layout.size * .09, caret.y - layout.size * .71,
      Math.max(2, layout.size * .045), layout.size * .78);
  }
}

export const fontFor = (element,size) => `${element.weight || 600} ${size}px ${element.font === 'display' ? 'KadrDisplay' : 'Inter'}`;

export function cubicPrefix(points,progress) {
  const between = (a,b) => ({x:lerp(a.x,b.x,progress),y:lerp(a.y,b.y,progress)});
  const [a,b,c,d] = points;
  const ab=between(a,b), bc=between(b,c), cd=between(c,d);
  const abc=between(ab,bc), bcd=between(bc,cd);
  return [a,ab,abc,between(abc,bcd)];
}
const alignedX = (box, width, align) => box.x + (align === 'center' ? (box.w - width) / 2 : align === 'right' ? box.w - width : 0);

export function makeTextRing(context, element) {
  const {box, textRing: ring} = element;
  const text = `${element.text.trim().replace(/\s+/g, ' ')}  ·  `;
  const letters = [...graphemes.segment(text)].map(({segment}) => segment);
  context.textAlign = 'center';
  context.textBaseline = 'alphabetic';

  function measure(size) {
    context.font = fontFor(element, size);
    const stroke = ring.style === 'outline' ? Math.max(1, size * .022) : 0;
    let advance = 0, padding = 0;
    const glyphs = [];
    for (const letter of letters) {
      const metrics = context.measureText(letter);
      if (letter.trim()) {
        const ascent = metrics.actualBoundingBoxAscent;
        const descent = metrics.actualBoundingBoxDescent;
        const halfWidth = Math.max(Math.abs(metrics.actualBoundingBoxLeft), Math.abs(metrics.actualBoundingBoxRight));
        padding = Math.max(padding, Math.hypot(halfWidth, (ascent + descent) / 2));
        glyphs.push({text: letter, distance: advance + metrics.width / 2, baseline: (ascent - descent) / 2});
      }
      advance += metrics.width + ring.tracking;
    }
    padding += stroke / 2 + 2;
    const rx = Math.max(1, box.w / 2 - padding), ry = Math.max(1, box.h / 2 - padding);
    const length = Math.PI * (3 * (rx + ry) - Math.sqrt((3 * rx + ry) * (rx + 3 * ry)));
    return {size, rx, ry, stroke, advance, glyphs, fits: ring.repeats * advance <= length * .988};
  }

  let layout = measure(element.fontSize);
  while (!layout.fits && layout.size > 20) layout = measure(layout.size - 1);

  // Equal advances along the ellipse keep the letters evenly spaced on the long and short sides.
  const segments = 256;
  const distances = [0];
  let previousX = 0, previousY = -layout.ry;
  for (let index = 1; index <= segments; index++) {
    const angle = -Math.PI / 2 + turn * index / segments;
    const x = layout.rx * Math.cos(angle), y = layout.ry * Math.sin(angle);
    distances.push(distances.at(-1) + Math.hypot(x - previousX, y - previousY));
    previousX = x;
    previousY = y;
  }
  return {...layout, distances, length: distances.at(-1), font: fontFor(element, layout.size),
    cx: box.x + box.w / 2, cy: box.y + box.h / 2};
}

function ringAngle(layout, distance) {
  const position = ((distance % layout.length) + layout.length) % layout.length;
  let left = 0, right = layout.distances.length - 1;
  while (right - left > 1) {
    const middle = Math.floor((left + right) / 2);
    if (layout.distances[middle] <= position) left = middle;
    else right = middle;
  }
  const progress = (position - layout.distances[left]) / (layout.distances[right] - layout.distances[left]);
  return -Math.PI / 2 + turn * (left + progress) / (layout.distances.length - 1);
}

export function paintTextRing(context, element, layout, color, frame, fps) {
  const {textRing: ring} = element;
  const direction = ring.direction === 'clockwise' ? 1 : -1;
  const offset = (ring.phase + direction * ring.speed * (frame - element.start) / fps) * layout.length / 360;
  const spacing = layout.length / ring.repeats;
  context.font = layout.font;
  context.textAlign = 'center';
  context.textBaseline = 'alphabetic';
  context.fillStyle = color;
  context.strokeStyle = color;
  if (layout.stroke) context.lineWidth = layout.stroke;
  context.lineJoin = 'round';
  for (let repeat = 0; repeat < ring.repeats; repeat++) {
    for (const glyph of layout.glyphs) {
      const angle = ringAngle(layout, offset + repeat * spacing + glyph.distance);
      const sin = Math.sin(angle), cos = Math.cos(angle);
      context.save();
      context.translate(layout.cx + layout.rx * cos, layout.cy + layout.ry * sin);
      context.rotate(Math.atan2(layout.ry * cos, -layout.rx * sin));
      if (layout.stroke) context.strokeText(glyph.text, 0, glyph.baseline);
      else context.fillText(glyph.text, 0, glyph.baseline);
      context.restore();
    }
  }
}

export function makeWordSwap(context, element, {fixedSuffix = false, minWordEm = 0} = {}) {
  const {box, align = 'left', wordSwap: swap, fontSize} = element;
  const stacked = swap.layout === 'stacked';
  const punctuation = !fixedSuffix && /^[\s\p{P}]+$/u.test(swap.after);
  const variants = swap.variants.map(variant => variant.text + (punctuation ? swap.after : ''));
  const prefix = stacked ? swap.before.trim() : swap.before;
  const suffix = punctuation ? '' : stacked ? swap.after.trim() : swap.after;

  function measure(size) {
    const wordFont = fontFor(element, size);
    context.font = wordFont;
    const widths = variants.map(word => context.measureText(word).width);
    const padding = swap.plate ? size * .17 : 0;
    const wordWidth = Math.max(size * minWordEm, ...widths) + padding * 2;
    const labelSize = stacked ? Math.round(size * .6) : size;
    const labelFont = fontFor(element, labelSize);
    context.font = labelFont;
    const prefixWidth = context.measureText(prefix).width;
    const suffixWidth = context.measureText(suffix).width;
    const wordHeight = size * 1.2 + padding;
    const labelHeight = stacked ? labelSize * 1.32 : 0;
    const width = stacked ? Math.max(wordWidth, prefixWidth, suffixWidth) : prefixWidth + wordWidth + suffixWidth;
    const height = wordHeight + (Number(Boolean(prefix)) + Number(Boolean(suffix))) * labelHeight;
    const x = alignedX(box, width, align), y = box.y + (box.h - height) / 2;
    const wordY = y + (prefix ? labelHeight : 0);
    const slot = {
      x: stacked ? alignedX(box, wordWidth, align) : x + prefixWidth, y: wordY,
      w: wordWidth, h: wordHeight, baseline: wordY + size * .88 + padding / 2, font: wordFont,
    };
    const labels = [
      {text: prefix, x: stacked ? alignedX(box, prefixWidth, align) : x, y: stacked ? y + labelSize * .88 : slot.baseline},
      {text: suffix, x: stacked ? alignedX(box, suffixWidth, align) : slot.x + wordWidth,
        y: stacked ? wordY + wordHeight + labelSize * .88 : slot.baseline},
    ];
    const inner = {x: slot.x + padding, w: wordWidth - 2 * padding};
    const wordX = widths.map(width => stacked ? alignedX(inner, width, align) : inner.x);
    return {size, slot, labels, labelFont, variants, wordX, widths, padding,
      fixedPlate: !stacked && Boolean(suffix), bounds: {x, y, w: width, h: height}};
  }

  let layout = measure(fontSize);
  while (layout.size > 20 && (layout.bounds.w > box.w || layout.bounds.h > box.h)) {
    layout = measure(layout.size - 1);
  }
  return layout;
}

export function paintWordSwap(context, element, layout, palette, frame) {
  const {wordSwap: swap} = element;
  const index = Math.max(0, swap.variants.findLastIndex(variant => variant.frame <= frame));
  const {slot} = layout;
  const progress = index && swap.transitionFrames ? clamp((frame - swap.variants[index].frame) / swap.transitionFrames) : 1;
  context.textAlign = 'left';
  context.textBaseline = 'alphabetic';
  context.font = layout.labelFont;
  context.fillStyle = palette[element.fill];
  for (const label of layout.labels) context.fillText(label.text, label.x, label.y);

  context.save();
  context.beginPath();
  if (swap.plate) {
    const previous = Math.max(0, index - 1), t = smooth(progress);
    const x = lerp(layout.wordX[previous], layout.wordX[index], t) - layout.padding;
    const width = lerp(layout.widths[previous], layout.widths[index], t) + layout.padding * 2;
    context.roundRect(layout.fixedPlate ? slot.x : x, slot.y, layout.fixedPlate ? slot.w : width, slot.h, layout.size * .16);
    context.fillStyle = palette[swap.plate];
    context.fill();
  } else context.rect(slot.x - 2, slot.y - 2, slot.w + 4, slot.h + 4);
  context.clip();
  context.font = slot.font;
  context.fillStyle = palette[swap.fill];
  const word = layout.variants[index];
  if (progress === 1) {
    context.fillText(word, layout.wordX[index], slot.baseline);
  } else if (swap.style === 'roll') {
    const travel = smooth(progress) * slot.h;
    context.fillText(layout.variants[index - 1], layout.wordX[index - 1], slot.baseline - travel);
    context.fillText(word, layout.wordX[index], slot.baseline + slot.h - travel);
  } else {
    const midpoint = slot.y + slot.h / 2;
    const visible = progress < .5 ? index - 1 : index;
    context.translate(layout.wordX[visible], midpoint);
    context.scale(1, Math.max(.03, Math.abs(Math.cos(Math.PI * progress))));
    context.fillText(layout.variants[visible], 0, slot.baseline - midpoint);
  }
  context.restore();
}
