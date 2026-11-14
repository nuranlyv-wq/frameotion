export const COMPONENT_TARGET = 'component';

// Реестр содержит только встроенные и типизированные операции, доступные композиции.
const BUILTINS = [
  { id: 'fade-in', family: 'opacity', renderer: 'remotion', purpose: 'reveal hierarchy without changing layout', target: 'any', maxAmount: 100, provenance: 'KADR', status: 'built-in' },
  { id: 'slide-up', family: 'position', renderer: 'remotion', purpose: 'introduce a layer from its context below', target: 'any', maxAmount: 120, provenance: 'KADR', status: 'built-in' },
  { id: 'slide-left', family: 'position', renderer: 'remotion', purpose: 'move a cursor or object left into its final position', target: 'any', maxAmount: 120, provenance: 'KADR', status: 'built-in' },
  { id: 'reveal-lines', family: 'typography', renderer: 'remotion', purpose: 'reveal title lines through a mask for a typographic beat', target: 'headline', maxAmount: 60, provenance: 'KADR', status: 'built-in' },
  { id: 'progress-fill', family: 'interface', renderer: 'remotion', purpose: 'animate a progress bar towards the current state', target: 'progress', maxAmount: 0, provenance: 'KADR', status: 'built-in' },
  { id: 'panel-reveal', family: 'mask', purpose: 'open a panel from the chosen action', target: 'panel', maxAmount: 100 },
  { id: 'cursor-click', family: 'interaction', purpose: 'press a button with a cursor and show feedback', target: 'cursor', maxAmount: 30 },
  { id: 'focus-ring', family: 'emphasis', purpose: 'highlight the selected control before the result', target: 'any', maxAmount: 100 },
  { id: 'result-pop', family: 'scale', purpose: 'make the resulting object resolve into place', target: 'any', maxAmount: 25 },
  { id: 'number-count', family: 'data', purpose: 'animate a sourced number or illustrative count', target: 'number', maxAmount: 0 },
  { id: 'camera-drift', family: 'camera', purpose: 'soft camera push into a static interface', target: 'component', maxAmount: 6 },
];
export const MOTION_SKILLS = BUILTINS.map((skill) => ({
  renderer: 'remotion', provenance: 'KADR original implementation', status: 'built-in', ...skill,
  version: '1.1.0', license: 'LicenseRef-KADR-Project', source: 'src/production/motion.js',
  implementation: 'remotion/Production.jsx', frames: [6, 90], easing: ['linear', 'out-cubic', 'in-out-cubic'],
  parameters: { target: skill.target, from: 'scene-relative frame', frames: '6..90', amount: [0, skill.maxAmount] },
  example: `motion-catalog/${skill.id}.mp4`, test: 'test/motion-catalog.test.js',
}));
export const TRANSITION_SKILLS = [
  { id: 'morph', purpose: 'selected slot becomes a ticket; button becomes result card', requires: ['sourceTarget', 'target'], frames: [12, 45] },
  { id: 'zoom-through', purpose: 'zoom into a control and enter a new interface; object becomes a new screen', requires: ['sourceTarget', 'target'], frames: [18, 45] },
  { id: 'shared', purpose: 'reframe the same editable interface while preserving its state', requires: ['same component', 'target'], frames: [8, 32] },
  { id: 'match', purpose: 'carry a declared motif between different screen layouts', requires: ['continuity motif'], frames: [8, 32] },
].map((skill) => ({ ...skill, version: '1.1.0', license: 'LicenseRef-KADR-Project',
  source: 'remotion/Production.jsx', example: `motion-catalog/${skill.id}.mp4`, test: 'test/motion-catalog.test.js' }));

export function searchMotionSkills(query, hasProgress) {
  query += /курсор|клик|выбор/.test(query) ? ' cursor press highlight' : '';
  query += /панел|раскры/.test(query) ? ' open panel' : '';
  query += /результат|числ|прогресс/.test(query) ? ' result number progress' : '';
  const words = new Set(query.toLowerCase().match(/[\p{L}]+/gu) || []);
  const score = (skill) => skill.purpose.split(' ').filter((word) => words.has(word)).length;
  return MOTION_SKILLS.filter((skill) => skill.target !== 'progress' || hasProgress)
    .sort((a, b) => score(b) - score(a));
}

export function ease(name, n) {
  const t = Math.max(0, Math.min(1, n));
  if (name === 'out-cubic') return 1 - (1 - t) ** 3;
  if (name === 'in-out-cubic') return t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2;
  return t;
}

export function stateAt(component, scene, localFrame) {
  const cue = scene.states.findLast(({ at }) => at <= localFrame);
  return component.states.find(({ id }) => id === cue.id);
}

export function absoluteBounds(parent, child) {
  return {
    x: parent.x + parent.w * child.x / 1000,
    y: parent.y + parent.h * child.y / 1000,
    w: parent.w * child.w / 1000,
    h: parent.h * child.h / 1000,
  };
}

export function blendBounds(from, to, t) {
  return {
    x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t,
    w: from.w + (to.w - from.w) * t, h: from.h + (to.h - from.h) * t,
  };
}

export function poseAt(scene, target, frame) {
  let current = { x:0, y:0, scale:1, rotation:0, opacity:1 };
  for (const pose of (scene.poses || []).filter((p) => p.target === target)) {
    if (frame < pose.at) break;
    const next = { x:pose.x, y:pose.y, scale:pose.scale/100, rotation:pose.rotation, opacity:pose.opacity/100 };
    const p = ease(pose.easing, (frame-pose.at)/Math.max(1,pose.frames-1));
    current = Object.fromEntries(Object.keys(current).map((key)=>[key,current[key]+(next[key]-current[key])*p]));
    if (p < 1) break;
  }
  return current;
}

export function cameraAt(scene, component, frame) {
  let current = { x:500, y:500, scale:1, rotation:0 };
  for (const shot of scene.camera || []) {
    if (frame < shot.at) break;
    const element = component?.elements.find((e)=>e.id===shot.target);
    const area = shot.target === 'canvas' ? {x:0,y:0,w:1000,h:1000} : shot.target === COMPONENT_TARGET ? scene.bounds :
      shot.target === 'headline' || shot.target === 'copy' ? scene[shot.target] : absoluteBounds(scene.bounds, element.bounds);
    const pose = poseAt(scene,shot.target,frame);
    const next = { x:area.x+area.w/2+pose.x, y:area.y+area.h/2+pose.y, scale:shot.scale/100, rotation:shot.rotation };
    const p = ease(shot.easing,(frame-shot.at)/Math.max(1,shot.frames-1));
    current = Object.fromEntries(Object.keys(current).map((key)=>[key,current[key]+(next[key]-current[key])*p]));
    if(p<1) break;
  }
  return current;
}

export function visualAt(scene, target, localFrame) {
  const pose = poseAt(scene, target, localFrame);
  const effects = scene.effects.filter((effect) => effect.target === target);
  const progress = (effect) => ease(effect.easing, (localFrame - effect.from) / Math.max(1, effect.frames - 1));
  const fade = effects.find(({ skill }) => skill === 'fade-in');
  const slideY = effects.find(({ skill }) => skill === 'slide-up');
  const reveal = effects.find(({ skill }) => skill === 'panel-reveal');
  const pop = effects.find(({ skill }) => skill === 'result-pop');
  const click = effects.find(({ skill }) => skill === 'cursor-click');
  const focus = effects.find(({ skill }) => skill === 'focus-ring');
  const drift = effects.find(({ skill }) => skill === 'camera-drift');
  const pulse = (effect) => localFrame < effect.from || localFrame >= effect.from + effect.frames ? 0 : Math.sin(Math.PI * progress(effect));
  const slideX = effects.find(({ skill }) => skill === 'slide-left');
  return {
    scale: pose.scale * (pop ? 1 - pop.amount / 100 * (1 - progress(pop)) : 1) * (click ? 1 - click.amount / 100 * pulse(click) : 1) * (drift ? 1 + drift.amount / 100 * progress(drift) : 1),
    rotation: pose.rotation,
    reveal: reveal ? progress(reveal) : 1,
    focus: focus ? pulse(focus) * focus.amount / 100 : 0,
    opacity: pose.opacity * (fade ? 1 - fade.amount / 100 * (1 - progress(fade)) : 1),
    shiftY: pose.y + (slideY ? slideY.amount * (1 - progress(slideY)) : 0),
    shiftX: pose.x + (slideX ? slideX.amount * (1 - progress(slideX)) : 0),
  };
}

export function revealAt(effect, line, count, frame) {
  const stagger = count > 1 ? effect.amount / 100 * line / (count - 1) : 0;
  return ease(effect.easing, ((frame - effect.from) / Math.max(1, effect.frames - 1) - stagger) / (1 - stagger));
}

export function valueAt(component, scene, target, localFrame, state) {
  const value = state.props.find((prop) => prop.target === target).value;
  const effect = scene.effects.find((item) => item.target === target && ['progress-fill', 'number-count'].includes(item.skill));
  if (!effect) return value;
  const from = stateAt(component, scene, effect.from - 1).props.find((prop) => prop.target === target).value;
  const to = stateAt(component, scene, effect.from).props.find((prop) => prop.target === target).value;
  if (localFrame < effect.from || localFrame >= effect.from + effect.frames) return value;
  const t = ease(effect.easing, (localFrame - effect.from) / Math.max(1, effect.frames - 1));
  return from + (to - from) * t;
}

export function matchProgress(transition, localFrame) {
  return ease('in-out-cubic', localFrame / Math.max(1, transition.frames - 1));
}

// Exact endpoints keep the last outgoing frame and first incoming frame continuous.
export function bridgeAt(from, to, frame, frames, type = 'morph') {
  const progress = ease('in-out-cubic', frame / Math.max(1, frames - 1));
  const area = blendBounds(from, to, progress);
  return { area, progress, outgoing: 1 - Math.min(1, progress * 2), incoming: Math.max(0, progress * 2 - 1),
    camera: type === 'zoom-through' ? 1 + progress * Math.min(2, Math.max(0, Math.sqrt(to.w * to.h / (from.w * from.h)) - 1)) : 1 };
}
