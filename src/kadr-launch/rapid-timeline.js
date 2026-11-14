// A rapid film keeps the director's actual staging, copy and shared subjects.
// Time is remapped once; actions settle early within their allocated intervals.
// Holds retain the original event order, so a response cannot precede its click.
import {readingBudget} from './reading.js';
export function compileSuperDynamic(base) {
  if (!Number.isInteger(base?.fps) || base.fps < 2 || !Number.isInteger(base.frames) || base.frames < 1 ||
      !base.scenes?.length || base.scenes.some(scene => !Number.isFinite(scene.start) || !Number.isFinite(scene.end) || scene.end <= scene.start)) {
    throw new Error('Super-dynamic staging requires a finite frame timeline and composed scenes');
  }
  const score = structuredClone(base), limit = Math.max(1, Math.floor(base.fps / 2));
  const action = Math.min(limit, Math.max(1, Math.round(base.fps * .3)));
  const sourceFrames = base.scenes.at(-1).end;
  const at = frame => Math.min(base.frames, Math.max(0, Math.round(frame * base.frames / sourceFrames)));
  const duration = (frame, frames, max = action) => Math.max(1, Math.min(max, at(frame + frames) - at(frame)));
  const unique = keys => [...new Map(keys.map(key => [key.frame, key])).values()].sort((a, b) => a.frame - b.frame);
  const fieldsChange = (a, b, fields) => fields.some(field => a[field] !== b[field]);
  function track(keys, fields, last = base.frames - 1) {
    if (!keys?.length) return keys;
    const mapped = unique(keys.map(key => ({...key, frame: Math.min(last, at(key.frame))})));
    // A long optical drift is not the next semantic move. Removing its tiny
    // scale change keeps a held headline from joining the following handoff.
    if (fields.includes('scale')) for (let index = 1; index < mapped.length; index++) {
      const from = mapped[index - 1], to = mapped[index];
      if (to.ease === 'linear' && to.frame - from.frame > action && Math.abs(to.scale - from.scale) <= 5 &&
          !fieldsChange(from, to, fields.filter(field => field !== 'scale'))) to.scale = from.scale;
    }
    const result = [mapped[0]];
    for (let index = 1; index < mapped.length;) {
      const from = mapped[index - 1];
      if (!fieldsChange(from, mapped[index], fields)) { result.push(mapped[index++]); continue; }
      let end = index;
      while (end + 1 < mapped.length && fieldsChange(mapped[end], mapped[end + 1], fields)) end++;
      const span = mapped[end].frame - from.frame;
      for (let cursor = index; cursor <= end; cursor++) {
        const key = mapped[cursor];
        result.push({...key, frame: from.frame + Math.round((key.frame - from.frame) * Math.min(1, action / span))});
      }
      if (span > action) result.push(mapped[end]);
      index = end + 1;
    }
    return unique(result);
  }
  for (const scene of score.scenes) {
    scene.sourceScene = scene.id;
    scene.start = at(scene.start); scene.end = at(scene.end);
    if (scene.end <= scene.start) throw new Error('Too many story beats for the super-dynamic duration');
    if (scene.transition) {
      const t = scene.transition;
      const half = Math.floor((scene.end - scene.start) / 2);
      if (t.kind === 'dive') {
        t.frames = Math.min(9, half); t.revealFrames = 6;
      } else {
        t.frames = Math.min(6, half);
        if (t.revealFrames) t.revealFrames = Math.min(6, half);
      }
    }
    if (scene.flood) {
      scene.flood.frames = 9; scene.flood.revealFrames = 6;
    }
  }
  for (const shape of score.shapes) {
    shape.states = unique(shape.states.map(state => ({...state, frame: Math.min(base.frames - 1, at(state.frame)),
      duration: state.duration === 0 ? 0 : duration(state.frame, state.duration)})));
    shape.states.forEach((state, index, states) => {
      state.duration = Math.min(state.duration, (states[index + 1]?.frame ?? base.frames - 1) - state.frame);
    });
  }
  for (const element of score.elements) {
    const oldStart = element.start;
    element.start = Math.min(base.frames - 1, at(element.start));
    element.end = Math.max(element.start + 1, at(element.end));
    element.enterFrames = Math.min(element.end - element.start, duration(oldStart, element.enterFrames));
    if (element.motion) {
      element.motion = track(element.motion, ['x','y','scale','rotate','opacity'], element.end - 1);
      if (element.motion.length < 2) delete element.motion;
    }
    if (element.enter === 'roll-in') {
      const sign = element.rollFrom === 'right' ? 1 : -1;
      const first = element.motion?.[0] ?? {frame: element.start, x: 0, y: 0, scale: 100, rotate: 0, opacity: 100, ease: 'fluid'};
      const landed = Math.min(element.end - 1, element.start + action);
      element.motion = unique([{...first, x: first.x + Math.round(sign * element.box.w * .6),
        y: first.y + Math.round(element.box.h * .2), rotate: sign * 85, scale: 78, opacity: 100},
      {...first, frame: landed, ease: 'fluid'}, ...(element.motion ?? []).filter(key => key.frame > landed)]);
      element.enter = 'none'; element.enterFrames = 1; delete element.rollFrom;
      if (element.motion.length < 2) delete element.motion;
    }
    for (const property of ['clickAt', 'changeAt']) if (element[property] !== undefined) element[property] = at(element[property]);
    if (element.wordClick) {
      const click = element.wordClick;
      click.frames = Math.min(limit, duration(click.at, click.frames)); click.at = at(click.at);
    }
    if (element.wordSwap) {
      element.wordSwap.variants = element.wordSwap.variants.map(variant => ({...variant, frame: at(variant.frame)}));
      element.wordSwap.transitionFrames = Math.min(6, element.wordSwap.transitionFrames);
    }
    if (element.fold) {
      element.fold.frames = duration(element.fold.at, element.fold.frames); element.fold.at = at(element.fold.at);
    }
    if (element.mesh) element.mesh.keys = track(element.mesh.keys, ['rx','ry'], element.end - 1);
    if (element.formTrack) element.formTrack.keys = track(element.formTrack.keys, ['form','rx','ry','fill','mark','assetId'], element.end - 1);
  }
  score.camera = track(score.camera, ['x','y','zoom','rotate','target'], base.frames);
  // Text belonging to a named subject is released from that subject's edge.
  // Keep complex typography, attached copy and camera-space titles as authored.
  for (const element of score.elements) {
    if (element.kind !== 'text' || element.attachTo || element.space || element.wordClick || element.wordSwap || element.textRing) continue;
    const pairId = element.id.replace(/^step-title-/, 'step-icon-').replace(/^item-name-/, 'item-icon-')
      .replace(/^subject-label-/, 'subject-').replace(/^place-label-/, 'place-icon-')
      .replace(/^stage-label-/, 'stage-').replace(/^part-label-/, 'part-icon-').replace(/^whole-label-/, 'whole-icon-');
    if (pairId === element.id) continue;
    const surfaceId = element.id.replace(/^step-title-/, 'node-').replace(/^subject-label-/, 'token-')
      .replace(/^place-label-/, 'place-').replace(/^whole-label-/, 'token-').replace(/^part-label-/, 'part-')
      .replace(/^stage-label-(\d+)-\d+$/, 'token-$1');
    const originId = surfaceId !== element.id && score.elements.some(actor => actor.id === surfaceId) ? surfaceId : pairId;
    const target = score.elements.find(actor => actor.id === originId && ['rect','icon','image','logo','transform'].includes(actor.kind) &&
      !actor.attachTo && !actor.space && actor.start <= element.start && actor.end >= element.start + element.enterFrames &&
      !actor.motion?.some(key => key.rotate));
    if (!target) continue;
    const dx = element.box.x + element.box.w / 2 - target.box.x - target.box.w / 2;
    const dy = element.box.y + element.box.h / 2 - target.box.y - target.box.h / 2;
    const direction = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up');
    element.enter = 'object-reveal'; element.objectReveal = {target: target.id, direction}; delete element.motion;
    element.enterFrames = Math.min(element.enterFrames, Math.max(1, Math.round(base.fps * .16)));
  }
  // A travelling subject needs a readable name before the camera departs. Insert
  // a real hold in the shared timeline, rather than slowing its path or letting
  // the label fade while the opening close-up is still settling.
  for (const scene of score.scenes) {
    let holdAt = Infinity, extra = 0;
    for (const label of score.elements.filter(item => item.objectReveal && item.start >= scene.start && item.start < scene.end)) {
      const target = score.elements.find(item => item.id === label.objectReveal.target);
      const movement = target.motion?.findIndex((key, index, keys) => index && fieldsChange(keys[index - 1], key, ['x','y']));
      if (!(movement > 0)) continue;
      let ready = Math.max(label.start + label.enterFrames, target.start + target.enterFrames);
      for (let index = 1; index < score.camera.length; index++) {
        const from = score.camera[index - 1], to = score.camera[index];
        if (from.frame <= ready && to.frame > ready && to.frame <= label.start + limit &&
            fieldsChange(from, to, ['x','y','zoom','target'])) ready = to.frame;
      }
      const departing = score.camera.find((key, index, keys) => index && keys[index - 1].frame >= ready &&
        key.frame < scene.end && fieldsChange(keys[index - 1], key, ['x','y','zoom','target']));
      const cameraStart = departing ? score.camera[score.camera.indexOf(departing) - 1].frame : Infinity;
      const until = Math.min(label.end - (label.exit === 'cut' ? 0 : 7), target.motion[movement - 1].frame, cameraStart);
      const missing = Math.ceil(readingBudget(label.text,{fps:score.fps}) - (until - ready));
      if (missing > 0 && missing <= limit) { holdAt = Math.min(holdAt, until); extra = Math.max(extra, missing); }
    }
    if (!extra) continue;
    const shift = frame => frame >= holdAt && frame < scene.end ? Math.min(scene.end - 1, frame + extra) : frame;
    for (const element of score.elements) {
      element.start = shift(element.start); element.end = shift(element.end);
      if (element.motion) element.motion = unique(element.motion.map(key => ({...key, frame: shift(key.frame)})));
      for (const key of ['clickAt','changeAt']) if (element[key] !== undefined) element[key] = shift(element[key]);
      if (element.wordClick) element.wordClick.at = shift(element.wordClick.at);
      if (element.fold) element.fold.at = shift(element.fold.at);
      if (element.wordSwap) for (const key of element.wordSwap.variants) key.frame = shift(key.frame);
      for (const track of [element.mesh, element.formTrack]) if (track) track.keys = unique(track.keys.map(key => ({...key, frame: shift(key.frame)})));
    }
    for (const shape of score.shapes) for (const state of shape.states) state.frame = shift(state.frame);
    score.camera = unique(score.camera.map(key => ({...key, frame: shift(key.frame)})));
  }
  return {...score, staging: 'superdynamic', timing: 'actions'};
}
