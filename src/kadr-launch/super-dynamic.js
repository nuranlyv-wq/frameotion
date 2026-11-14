// Saved montage scores keep their original exposure contract. New films limit
// action durations while retaining continuous subjects and readable copy.
import {shapePoseAt, shapeTrack} from './kinetic.js';
import {stageActionSpans} from './stage-contract.js';
export {compileSuperDynamic} from './rapid-timeline.js';

export function auditSuperDynamic(score) {
  if (!Number.isInteger(score?.fps) || score.fps < 2) throw new Error('An integer score fps of at least 2 is required');
  const limit = Math.floor(score.fps / 2);
  const issues = [];
  const actionsOnly = score.timing === 'actions';
  const check = (kind, id, start, end) => {
    if (Number.isFinite(start) && Number.isFinite(end) && end - start > limit) {
      issues.push({kind, id, start, end, frames: end - start, limit});
    }
  };
  const changes = (a, b, fields) => fields.some(field => a[field] !== b[field]);
  const checkTrack = (kind, id, keys = [], fields) => {
    let from = null;
    for (let index = 1; index <= keys.length; index++) {
      const moving = index < keys.length && changes(keys[index - 1], keys[index], fields);
      if (moving && from === null) from = keys[index - 1].frame;
      if (!moving && from !== null) { check(kind, id, from, keys[index - 1].frame); from = null; }
      if (!actionsOnly && moving) { check(kind, id, keys[index - 1].frame, keys[index].frame); from = null; }
    }
  };
  for (const scene of score.scenes ?? []) {
    if (!actionsOnly) check('scene', scene.id, scene.start, scene.end);
    if (scene.transition) check('transition', scene.id, 0, scene.transition.frames + (scene.transition.revealFrames ?? 0));
    if (scene.flood) check('flood', scene.id, 0, scene.flood.frames + scene.flood.revealFrames);
  }
  for (const element of score.elements ?? []) {
    if(element.stage)for(const span of stageActionSpans(element.stage))check('stage-motion',element.id+'-'+span.id,element.start+span.from*(element.end-element.start),element.start+span.to*(element.end-element.start));
    if (!actionsOnly) check('element', element.id, element.start, element.end);
    check('entrance', element.id, 0, element.enterFrames);
    if (element.wordClick) check('wordClick', element.id, 0, element.wordClick.frames);
    if (element.fold) check('fold', element.id, 0, element.fold.frames);
    if (element.wordSwap) check('wordSwap', element.id, 0, element.wordSwap.transitionFrames);
    checkTrack('mesh', element.id, element.mesh?.keys, ['rx','ry']);
    checkTrack('motion', element.id, element.motion, ['x','y','scale','rotate','opacity']);
    checkTrack('formTrack', element.id, element.formTrack?.keys, ['form','rx','ry','fill','mark','assetId']);
  }
  for (const shape of score.shapes ?? []) {
    for (const state of shape.states) check('shape-motion', shape.id, state.frame, state.frame + state.duration);
    if (actionsOnly) continue;
    // Shapes can remain visible without an explicit end. Count each continuous visible interval.
    const track = shapeTrack(shape.states);
    let visibleFrom = null;
    for (let frame = 0; frame <= score.frames; frame++) {
      const visible = frame < score.frames && shapePoseAt(track, frame).opacity > 0;
      if (visible && visibleFrom === null) visibleFrom = frame;
      if (!visible && visibleFrom !== null) {
        check('shape', shape.id, visibleFrom, frame);
        visibleFrom = null;
      }
    }
  }
  checkTrack('camera', 'camera', score.camera, ['x','y','zoom','rotate','target']);
  return {ok: issues.length === 0, limitFrames: limit, limitSeconds: limit / score.fps, issues};
}
