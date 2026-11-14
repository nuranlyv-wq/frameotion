// Short moves with a common frame clock. Geometry and content come from the caller.
export const MOTION_CLIPS = [
  {
    id: 'badge-expand', title: 'Бейдж раскрывается в карточку', dimension: '2d', seconds: 2.4,
    purpose: 'A badge becomes a larger panel on the same surface. Use for an offer, result or status.',
    tags: ['badge', 'morph', 'expand', 'бейдж', 'превращение'],
    phases: [[0, 0], [.34, .14, { y: -42, rotate: -7 }], [.76, .86, { scale: 6 }], [1, 1]],
  },
  {
    id: 'shared-glide', title: 'Объект связывает два экрана', dimension: '2d', seconds: 2.2,
    purpose: 'Travel with one selected element as it changes size and moves into the next screen.',
    tags: ['handoff', 'shared', 'continuity', 'переход', 'перелёт'],
    phases: [[0, 0], [.36, .25, { y: -84, rotate: -9 }], [.74, .9, { y: -26, rotate: 3 }], [1, 1]],
  },
  {
    id: 'edge-reveal', title: 'Раскрытие из края', dimension: '2d', seconds: 1.9,
    purpose: 'Reveal content through a moving edge when a detail opens.',
    tags: ['mask', 'wipe', 'reveal', 'маска', 'раскрытие'],
    phases: [[0, 0, { reveal: -100 }], [.64, .9, { reveal: -10 }], [1, 1]],
  },
  {
    id: 'soft-snap', title: 'Мягкая фиксация', dimension: '2d', seconds: 1.7,
    purpose: 'A tiny recoil confirms a click, choice or state change without losing the object.',
    tags: ['click', 'snap', 'pop', 'клик', 'фиксация'],
    phases: [[0, 0], [.26, .26, { scale: -12 }], [.58, .82, { scale: 12 }], [.82, 1, { scale: -3 }], [1, 1]],
  },
  {
    id: 'hinge-panel', title: 'Панель на шарнире', dimension: '3d', seconds: 2.3,
    purpose: 'Unfold a panel around its attached edge so the previous object can hand off the action.',
    tags: ['hinge', 'panel', 'perspective', 'шарнир', 'панель'],
    phases: [[0, 0, { rotateY: -78 }], [.54, .76, { rotateY: 12 }], [.82, .98, { rotateY: -4 }], [1, 1]],
  },
  {
    id: 'solid-orbit', title: 'Объёмная карточка на орбите', dimension: '3d', seconds: 2.8,
    purpose: 'Show an object from two directions and settle front-on. Give the actor depth to expose its side faces.',
    tags: ['orbit', 'depth', 'geometry', 'объём', 'орбита'],
    phases: [[0, 0], [.28, .30, { x: -85, rotateY: -50, rotateX: 17, rotate: -7 }],
      [.67, .70, { x: 65, rotateY: 53, rotateX: -14, rotate: 6 }], [1, 1]],
  },
  {
    id: 'solid-turn', title: 'Разворот на другую грань', dimension: '3d', seconds: 2.7,
    purpose: 'Turn a solid around its vertical axis, briefly show its rear face, then settle.',
    tags: ['flip', 'turn', 'geometry', 'грань', 'разворот'],
    phases: [[0, 0], [.22, .24, { rotateY: -43, rotateX: 10 }], [.55, .64, { rotateY: -156, rotateX: 9 }],
      [.76, .88, { rotateY: -121, rotateX: -7 }], [1, 1]],
  },
  {
    id: 'depth-launch', title: 'Вылет с объёмным превращением', dimension: '3d', seconds: 2.8,
    purpose: 'Lift the original card out of a shelf, carry its attached content through the turn, then resize into a cart or result.',
    tags: ['launch', 'cart', 'morph', 'корзина', 'вылет'],
    phases: [[0, 0], [.24, .15, { x: 125, y: -64, rotateY: 32, rotate: -9, scale: 15, depth: 16 }, 0],
      [.55, .46, { x: -15, y: -94, rotateY: -23, rotate: 6, scale: 9, depth: 9 }, 0], [1, 1]],
  },
];

const defaults = { scale: 100, opacity: 100, reveal: 100, originX: 500, originY: 500 };

export function clipKeys(id, { start, end, from, to }, key = (at, pose, easing) => ({ at, easing, ...pose })) {
  const clip = MOTION_CLIPS.find(item => item.id === id);
  if (!clip) throw new Error('Unknown motion clip: ' + id);
  if (end <= start) throw new Error('Motion clip needs a positive interval');
  const keys = new Set([...Object.keys(from), ...Object.keys(to), ...clip.phases.flatMap(phase => Object.keys(phase[2] || {}))]);
  const buildPose = (mix, offsets, geometryMix) => Object.fromEntries([...keys].map(property => {
    const a = from[property] ?? to[property] ?? defaults[property] ?? 0;
    const b = to[property] ?? a;
    const p = property === 'w' || property === 'h' ? geometryMix : mix;
    return [property, Math.round(a + (b - a) * p + (offsets[property] || 0))];
  }));
  const timeline = new Map();
  for (const [time, mix, offsets = {}, geometryMix = mix] of clip.phases) {
    const result = key(start + (end - start) * time, buildPose(mix, offsets, geometryMix),
      time === 1 ? 'out-cubic' : 'in-out-cubic');
    timeline.set(result.at, result);
  }
  return [...timeline.values()];
}

export function motionClipSuggestions(query) {
  const terms = query.toLowerCase();
  const words = new Set(terms.match(/[\p{L}\p{N}]+/gu) || []);
  const dimensionHint = /3d|тр[её]хмер|объ[её]м/.test(terms) ? '3d' : /2d|плоск/.test(terms) ? '2d' : null;
  return MOTION_CLIPS.map(({ id, purpose, dimension, seconds, tags }) => ({
    id, purpose, dimension, seconds,
    score: tags.reduce((score, tag) => score + (words.has(tag) ? 2 : Number(terms.includes(tag))), 0) +
      (dimensionHint === dimension ? 3 : 0),
  })).sort((a, b) => b.score - a.score).slice(0, 5).map(({ score, ...clip }) => clip);
}
