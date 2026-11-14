export function minimumMotionBeats(frames) {
  return frames < 540 ? 4 : frames < 960 ? 5 : 6;
}

// A composed action can play for several seconds by itself. Short films need room for its payoff.
export const minimumSceneBeats = () => 2;

const visibleObject = (box,shortEdge) => Math.min(box.w,box.h) >= shortEdge * .045;

function visualHandoffs(score,events) {
  const shortEdge = Math.min(score.width,score.height);
  return score.scenes.slice(1).filter((scene,index) => {
    if (scene.flood) return true;
    const previous = score.scenes[index];
    if ((previous.ground ?? 'background') !== (scene.ground ?? 'background')) return true;
    const nearCut = frame => Math.abs(frame-scene.start) <= 24;
    if (events.some(event => nearCut(event.frame))) return true;
    if (score.elements.some(element => element.kind !== 'icon' && visibleObject(element.box,shortEdge) &&
        (nearCut(element.start) || nearCut(element.end)))) return true;
    return score.camera.some((key,index) => {
      const previous = score.camera[index-1];
      return previous && (nearCut(key.frame) || nearCut(previous.frame) ||
        (previous.frame < scene.start && key.frame > scene.start)) &&
        (key.target !== previous.target || Math.abs(key.zoom-previous.zoom) >= 8 ||
          Math.hypot(key.x-previous.x,key.y-previous.y) >= shortEdge*.08);
    });
  }).length;
}

export function motionEvents(score) {
  const shortEdge = Math.min(score.width,score.height);
  const events = [];
  for (const shape of score.shapes) {
    let angle = shape.states[0].rotate ?? 0, opacity = shape.states[0].opacity ?? 100;
    for (const [index,state] of shape.states.entries()) {
      if (!index) continue;
      const before = shape.states[index-1].box, after = state.box;
      const nextAngle = state.rotate ?? angle, nextOpacity = state.opacity ?? opacity;
      if (state.duration >= 8 && Math.min(opacity,nextOpacity) >= 30 &&
          visibleObject(before,shortEdge) && visibleObject(after,shortEdge)) {
        const frame = state.frame + state.duration / 2;
        if (Math.abs(nextAngle-angle) >= 35) events.push({kind:'roll',frame,id:shape.id});
        if ((state.contour ?? 'roundRect') !== (shape.states[index - 1].contour ?? 'roundRect') ||
            Math.max(after.w/before.w,before.w/after.w,after.h/before.h,before.h/after.h) >= 1.28) {
          events.push({kind:'morph',frame,id:shape.id});
        }
      }
      angle = nextAngle;
      opacity = nextOpacity;
    }
  }
  for (const element of score.elements) {
    if (element.fold) events.push({kind:'morph',frame:element.fold.at+element.fold.frames/2,id:element.id});
    for (const [index, key] of (element.formTrack?.keys ?? []).entries()) {
      const previous = element.formTrack.keys[index-1];
      if (previous && (previous.form !== key.form || previous.mark !== key.mark) && key.frame - previous.frame >= 8) {
        events.push({kind:'morph',frame:(key.frame+previous.frame)/2,id:element.id});
      }
    }
    if (element.wordClick?.shape && visibleObject(element.box,shortEdge)) {
      events.push({kind:'morph',frame:element.wordClick.at+element.wordClick.frames/2,id:element.id});
    }
    if (['text','stroke'].includes(element.kind) || !visibleObject(element.box,shortEdge)) continue;
    if (element.enter === 'roll-in') {
      events.push({kind:'roll',frame:element.start + element.enterFrames / 2,id:element.id});
    }
    for (const [index,key] of (element.motion ?? []).entries()) {
      const before = element.motion[index-1];
      if (before && key.frame-before.frame >= 7 && Math.min(key.opacity,before.opacity) >= 30 &&
          Math.abs(key.rotate-before.rotate) >= 35 &&
          Math.hypot(key.x-before.x,key.y-before.y) >= shortEdge * .022) {
        events.push({kind:'roll',frame:(before.frame+key.frame)/2,id:element.id});
      }
    }
  }
  return events;
}

export function motionProfileIssues(score,settings,source) {
  if (settings.pace !== 'dynamic' || source?.productFlow || score.staging === 'connected') return [];
  const issues = [];
  const required = (score.staging === 'scenes' ? minimumSceneBeats : minimumMotionBeats)(score.frames);
  if (score.scenes.length < required) issues.push(`Dynamic pace needs at least ${required} distinct scenes`);
  if (score.staging === 'scenes') return issues;
  const events = motionEvents(score);
  const sceneAt = frame => score.scenes.find(scene => scene.start <= frame && frame < scene.end)?.id;
  const distinct = kind => new Set(events.filter(event => event.kind === kind).map(event => `${sceneAt(event.frame)}:${event.id}`)).size;
  if (distinct('morph') < 2) issues.push('Dynamic pace needs two visible morphs across distinct scenes or objects: keep the object ID and change its contour or resize it by at least 28% over 8+ frames');
  if (distinct('roll') < 2) issues.push('Dynamic pace needs two visible object rolls across distinct scenes or objects: use enter=roll-in, or rotate a visible persistent shape by at least 35 degrees');
  const activeScenes = new Set(events.map(event => sceneAt(event.frame)).filter(Boolean));
  if (activeScenes.size < 2) issues.push('Put object movement in at least two distinct scenes so the film has a setup and a different payoff');
  if (visualHandoffs(score,events) < required-2) {
    issues.push(`Stage at least ${required-2} visible scene handoffs near scene boundaries with a morph, new composition, ground cut or purposeful reframing`);
  }
  const textMoves = new Set();
  for (const element of score.elements) {
    if (element.kind !== 'text' || element.fontSize < Math.min(score.width,score.height)*.028) continue;
    if (element.wordSwap?.style === 'roll' || element.wordSwap?.style === 'flip') textMoves.add(element.wordSwap.style);
    if (element.wordClick) textMoves.add('wordClick');
    if (element.textRing) textMoves.add('ring');
    if (['word-lift','kinetic-stretch','word-type','mask-rise','spiral','word-blur','hero-rise'].includes(element.enter)) textMoves.add(element.enter);
  }
  if (textMoves.size < 2) issues.push('Use at least two readable text treatments, such as word-lift for the opener and a wordSwap roll or mask-rise for the result');
  return issues;
}
