import {MAX_READING_SECONDS, readingBudget} from './reading.js';
import {stageActionSpans} from './stage-contract.js';
import {stageTextActors} from './stage-player.js';
const changed = (a, b, fields) => fields.some(field => a[field] !== b[field]);

// Timeline evidence, not a pixel-level judgement. Count the time needed to land
// and read each new state before estimating the unused tail of a shot.
export function pacingAudit(score, treatment) {
  const fps = score.fps, threshold = score.staging === 'superdynamic' ? .7 : 1;
  const reading = text => readingBudget(text,{fps});
  const scenes = score.scenes.map((scene, index) => {
    const beat = treatment?.beats.find(item => item.id === (scene.sourceScene ?? scene.id));
    const tail = score.scenes[index + 1]?.transition;
    const end = scene.end - (tail && tail.kind !== 'portal' ? tail.frames : 0);
    let busyUntil = scene.start + (scene.transition?.revealFrames ?? (scene.transition?.kind === 'portal' ? scene.transition.frames : 0));
    let lastChange = busyUntil, hasCopy = false;
    const note = (frame, readingOnly = false) => {
      if (frame >= scene.start && frame <= end) {
        busyUntil = Math.max(busyUntil, frame);
        if (!readingOnly) lastChange = Math.max(lastChange, frame);
      }
    };
    for (const actor of score.elements) {
      if (actor.start >= scene.end || actor.end <= scene.start || /^mast-/.test(actor.id)) continue;
      if(actor.stage){
        for(const span of stageActionSpans(actor.stage)){
          const landed=actor.start+span.to*(actor.end-actor.start);
          note(landed);
          note(landed+reading(actor.stage.nodes.find(node=>node.id===span.id)?.text??''),true);
        }
        for(const copy of stageTextActors(actor,fps)){
          hasCopy=true;note(copy.start+copy.enterFrames);note(copy.start+copy.enterFrames+reading(copy.text),true);
        }
        continue;
      }
      const settled = actor.start + (actor.enter === 'none' ? 0 : actor.enterFrames);
      if (actor.start >= scene.start) note(settled);
      hasCopy ||= Boolean(actor.text || actor.card || actor.wordSwap);
      if (actor.text) note(settled + reading(actor.text),true);
      if (actor.card) note(settled + reading([actor.card.title,actor.card.subtitle,actor.card.badge].filter(Boolean).join(' ')),true);
      for (const variant of actor.wordSwap?.variants ?? []) {
        note(variant.frame + actor.wordSwap.transitionFrames);
        note(variant.frame + actor.wordSwap.transitionFrames + reading(variant.text),true);
      }
      if (actor.wordClick) {
        note(actor.wordClick.at + actor.wordClick.frames);
        note(actor.wordClick.at + actor.wordClick.frames + reading(actor.wordClick.replace ?? actor.wordClick.word),true);
      }
      if (actor.fold) note(actor.fold.at + actor.fold.frames + 15);
      for (const track of [actor.formTrack,actor.mesh]) for (const key of track?.keys ?? []) note(key.frame + 15);
      for (let i = 1; i < (actor.motion?.length ?? 0); i++) {
        const a = actor.motion[i - 1], b = actor.motion[i];
        if (Math.hypot(b.x - a.x, b.y - a.y) >= 8 || Math.abs(b.scale - a.scale) >= 5 || Math.abs(b.rotate - a.rotate) >= 5) {
          note(b.frame);
          note(b.frame + (actor.text ? reading(actor.text) : 8),true);
        }
      }
    }
    for (const shape of score.shapes) for (const state of shape.states) if (state.duration && state.opacity !== 0) note(state.frame + state.duration + 8);
    for (let i = 1; i < score.camera.length; i++) {
      const a = score.camera[i - 1], b = score.camera[i];
      if (changed(a,b,['target']) || Math.hypot(b.x-a.x,b.y-a.y) >= 8 || Math.abs(b.zoom-a.zoom) >= 4) note(b.frame + 8);
    }
    const idleFrames = Math.max(0, end - busyUntil), readingHoldFrames = hasCopy ? Math.max(0,end-lastChange) : 0;
    const intentional = Math.min(MAX_READING_SECONDS,beat?.visual?.holdSeconds ?? 0) * fps;
    return {id:scene.id,sourceScene:scene.sourceScene ?? scene.id,lastProgressFrame:busyUntil,idleFrames,
      idleSeconds:Number((idleFrames/fps).toFixed(2)),intentionalHoldSeconds:beat?.visual?.holdSeconds ?? 0,
      readingHoldSeconds:Number((readingHoldFrames/fps).toFixed(2)),
      readingHoldFrames,
      exceedsReadingLimit:readingHoldFrames > Math.floor(MAX_READING_SECONDS*fps),
      excessive:readingHoldFrames > Math.floor(MAX_READING_SECONDS*fps) || idleFrames > Math.max(threshold * fps,intentional)};
  });
  return {basis:'timeline estimate after action and reading budgets',maximumReadingSeconds:MAX_READING_SECONDS,thresholdSeconds:threshold,scenes,
    issues:scenes.filter(scene => scene.excessive).map(scene => ({code:scene.exceedsReadingLimit ? 'long_reading_hold' : 'long_idle_tail',scene:scene.sourceScene,
      from:scene.lastProgressFrame,idleSeconds:scene.idleSeconds,readingHoldSeconds:scene.readingHoldSeconds}))};
}
