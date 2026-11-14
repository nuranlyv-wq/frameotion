import { checkSchema } from '../production/contracts.js';
import { ScoreSchema } from './score.js';

const actor = ScoreSchema.properties.elements.items.properties;
const state = ScoreSchema.properties.shapes.items.properties.states.items.properties;
const partial = properties => ({type: 'object', properties, required: [], additionalProperties: false});
const box = partial(actor.box.properties);
const pick = (object, keys) => Object.fromEntries(keys.map(key => [key, object[key]]));

const actorEdit = partial({id: actor.id, box, ...pick(actor, ['text', 'fontSize', 'font','curve','weight', 'fill', 'align', 'enter', 'enterFrames', 'start', 'end', 'textRing', 'wordType', 'motion', 'exit', 'activeColor','rollFrom','mesh','formTrack']),
  wordSwap: partial(pick(actor.wordSwap.properties, ['fill', 'layout', 'style', 'plate', 'transitionFrames'])),
});
actorEdit.required = ['id'];
const shapeEdit = partial({id: actor.id, frame: state.frame, startAt:state.frame, box,
  fill:state.fill,duration:state.duration,ease:state.ease,rotate:state.rotate,opacity:state.opacity,contour:state.contour});
shapeEdit.required = ['id', 'frame'];
const list = (items, maxItems) => ({type: 'array', items, minItems: 0, maxItems});
const actorAddition = partial({element: ScoreSchema.properties.elements.items, after: actor.id});
actorAddition.required = ['element'];
export const RevisionSchema = partial({
  actors: list(actorEdit, 8), shapeStates: list(shapeEdit, 16), removeActors: list(actor.id, 5),
  camera: ScoreSchema.properties.camera, addActors: list(actorAddition, 3),
});

export function applyRevision(previous, revision) {
  const issues = checkSchema(RevisionSchema, revision);
  if (issues.length) throw new Error(issues.slice(0, 12).join('\n'));
  const score = structuredClone(previous);
  const {actors = [], shapeStates = [], removeActors = [], addActors = [], camera} = revision;
  if (!actors.length && !shapeStates.length && !removeActors.length && !addActors.length && !camera) throw new Error('Return at least one correction');
  if (camera) score.camera = camera;
  const touched = new Set();
  for (const {id, box, wordSwap, ...fields} of actors) {
    const element = score.elements.find(item => item.id === id);
    if (!element || touched.has(id)) throw new Error(`Unknown or repeated actor ${id}`);
    touched.add(id);
    Object.assign(element, fields);
    if (fields.enter && fields.enter !== 'roll-in') delete element.rollFrom;
    if (box) Object.assign(element.box, box);
    if (wordSwap) {
      if (!element.wordSwap) throw new Error(`${id} has no wordSwap to correct`);
      Object.assign(element.wordSwap, wordSwap);
    }
  }
  for (const id of removeActors) {
    const index = score.elements.findIndex(item => item.id === id);
    if (index < 0 || touched.has(id)) throw new Error(`Cannot remove unknown or edited actor ${id}`);
    score.elements.splice(index, 1);
  }
  for (const {element, after} of addActors) {
    const index = after ? score.elements.findIndex(item => item.id === after) : score.elements.length - 1;
    if (after && index < 0) throw new Error(`Unknown paint order anchor ${after}`);
    if (previous.elements.some(item => item.id === element.id) || score.elements.some(item => item.id === element.id)) {
      throw new Error(`New actor needs a distinct ID: ${element.id}`);
    }
    score.elements.splice(index + 1, 0, structuredClone(element));
  }
  for (const {id, frame, startAt, box, ...fields} of shapeStates) {
    const original = previous.shapes.find(item => item.id === id);
    const index = original?.states.findIndex(item => item.frame === frame) ?? -1;
    const key = score.shapes.find(item => item.id === id)?.states[index];
    const label = `${id}@${frame}`;
    if (!key || touched.has(label)) throw new Error(`Unknown or repeated shape state ${label}`);
    touched.add(label);
    Object.assign(key, fields);
    if (startAt !== undefined) key.frame = startAt;
    if (box) Object.assign(key.box, box);
  }
  return score;
}

export function revisionContext(score, treatment, feedback) {
  const notes = feedback.join(' ');
  return {
    width: score.width, height: score.height, frames: score.frames,
    palette: score.palette, camera: score.camera, scenes: score.scenes.map(({id, start, end, flood}) => ({id, start, end, flood})),
    handoffs: treatment?.beats.map(({id, move, handoff}) => ({id, move, handoff})),
    actors: score.elements.map(el => notes.includes(el.id)
      ? pick(el, ['id', 'kind', 'box', 'start', 'end', 'text', 'fontSize','font','curve', 'weight', 'fill', 'align', 'enter', 'enterFrames', 'wordSwap', 'wordClick', 'textRing', 'wordType', 'motion', 'attachTo', 'space', 'exit','rollFrom','mesh','formTrack'])
      : pick(el, ['id', 'kind', 'start', 'end', 'box', 'fill', 'attachTo', 'space'])),
    shapes: score.shapes.map(shape => ({id: shape.id, keys: shape.states.map(key => [
      key.frame,key.duration,key.box.x,key.box.y,key.box.w,key.box.h,key.box.radius,key.fill,key.ease ?? 'smooth',key.rotate ?? null,key.opacity ?? null,
      ...(key.contour ? [key.contour] : []),
    ])})),
  };
}
