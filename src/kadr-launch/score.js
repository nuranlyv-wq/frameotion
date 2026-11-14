// KADR's own data contract. No executable model output enters the renderer.
import { checkSchema } from '../production/contracts.js';
import { TOGGLE_SETTLE_FRAMES, poseAt, shapePoseAt, shapeTrack, wordHighlightRange } from './kinetic.js';
import { PRODUCT_FLOW_IDS, productFlowIssues, productFlowMilestones } from './product-flow.js';
import {motionProfileIssues} from './motion-profile.js';
import {CONTOURS, VOLUMES, TRANSFORM_FORMS, floodCoverage} from './spatial.js';
import {usesConnectedStory} from './motion-recipe.js';
import {wordClickIssue,wordClickProperties,wordClickRead} from './word-click.js';
import {LINK_KINDS} from './techniques.js';
import {isVisualAsset,imageAssetIds} from './media.js';
import {auditSuperDynamic} from './super-dynamic.js';
import {CompiledStageSchema,stageIssues} from './stage-contract.js';
import {auditStageContinuity} from './stage-continuity.js';
const obj=(properties,optional={})=>({type:'object',properties:{...properties,...optional},required:Object.keys(properties),additionalProperties:false});
const str=(maxLength,minLength=1)=>({type:'string',minLength,maxLength});
const num=(minimum,maximum)=>({type:'integer',minimum,maximum});
const list=(items,minItems,maxItems)=>({type:'array',items,minItems,maxItems});
const choice=(...values)=>({type:'string',enum:values});
const id={type:'string',pattern:'^[a-zA-Z][a-zA-Z0-9_-]{0,47}$'};
const color={type:'string',pattern:'^#[0-9a-fA-F]{6}$'};
const faceMark = choice(...wordClickProperties.mark.enum);
export const ROLES=['background','foreground','surface','muted','accent','onAccent'];
export const LAUNCH_STYLES = ['saas-launch', 'product-demo'];
const easing = choice('linear', 'smooth', 'snap', 'spring', 'glide', 'expo', 'fluid');
const box=obj({x:num(0,1920),y:num(0,1920),w:num(1,1920),h:num(1,1920),radius:num(0,960)});
const motionKey = obj({
  frame: num(0, 1799), x: num(-1920, 1920), y: num(-1920, 1920),
  scale: num(20, 250), rotate: num(-360, 360), opacity: num(0, 100),
  ease: easing,
});
const wordSwap = obj({
  before: str(100, 0), after: str(100, 0), fill: choice(...ROLES),
  layout: choice('inline', 'stacked'), style: choice('roll', 'flip', 'cut'), transitionFrames: num(0, 18),
  variants: list(obj({frame: num(0, 1799), text: str(48)}), 2, 6),
}, {plate: choice(...ROLES)});
const {word:clickWord,...clickOutcome} = wordClickProperties;
export const ScoreSchema=obj({
  version:choice(1), style:choice(...LAUNCH_STYLES), concept:str(400),
  brand:str(64), width:num(320,1920),height:num(320,1920),fps:choice(24,30),frames:num(360,1800),
  palette:obj(Object.fromEntries(ROLES.map(r=>[r,color]))),
  scenes:list(obj({id,start:num(0,1799),end:num(1,1800),purpose:str(200)}, {
    ground:choice(...ROLES),groundStyle:choice('flat','halo','aurora','grid'),sourceScene:id,
    flood:obj({target:id,frames:num(1,48),revealFrames:num(1,28)},{land:{type:'boolean'},mark:faceMark}),
    // How this scene replaces the previous one. wipe: a plane crosses the frame and the cut hides under it.
    // whip: the camera accelerates out of one scene and brakes into the next. portal: the scene opens
    // through a growing circle centred on x/y while the previous scene holds. dive: the camera pushes into
    // the target actor of the previous scene until its fill covers the frame; this scene, set on that fill,
    // settles out of it.
    transition:obj({kind:choice('wipe','whip','portal','dive'),frames:num(6,40)},{
      revealFrames:num(0,30),direction:choice('left','right','up','down'),fill:choice(...ROLES),
      x:num(0,1920),y:num(0,1920),target:id,
    }),
    // The director's reason for the join into this scene. It records the decision; the renderer reads
    // transition, flood and the actors themselves.
    link:obj({kind:choice(...LINK_KINDS),why:str(320)},{asked:choice(...LINK_KINDS),anchor:id}),
  }),2,120),
  shapes:list(obj({id,states:list(obj({frame:num(0,1799),duration:num(0,60),box,fill:choice(...ROLES)}, {
    ease:easing,rotate:num(-360,360),opacity:num(0,100),contour:choice(...CONTOURS),
  }),2,40)},{elevation:num(0,3)}),0,5),
  elements:list(obj({id,kind:choice('text','rect','pill','icon','toggle','logo','image','stroke','card','volume','transform','fold','stage'),start:num(0,1799),end:num(1,1800),
    box,fill:choice(...ROLES),enter:choice('hero-rise','word-blur','rise','pop','resolve','spiral','word-type','word-lift','kinetic-stretch','mask-rise','object-reveal','roll-in','draw','none'),enterFrames:num(1,45),
    sound:choice('none','click','pop','whoosh','ding'),evidenceIds:list(str(48),0,8)}, {
    stage:CompiledStageSchema,text:str(160,0),fontSize:num(24,480),weight:num(400,800),align:choice('left','center','right'),font:choice('display'),
    leadWord:{type:'boolean'},
    curve:obj({points:list(obj({x:num(0,1000),y:num(0,1000)}),4,4),width:num(1,64)},{head:num(2,40)}),
    icon:choice('check','circle-check','arrow','lock','calendar','pause','plus','paw','box','bolt','heart','search','cursor','pin','home','courier','car','doc','mail','person','clock','cart','bag','card','star','phone','chat','cup','bean','flame','screen','code','megaphone','chart','image','brush','coin'),
    clickAt:num(0,1799),
    changeAt:num(0,1799),on:{type:'boolean'},activeColor:color,
    elevation:num(0,3), emphasis:obj({text:str(80),fill:choice(...ROLES)}),
    card:obj({title:str(60)},{subtitle:str(80),badge:str(24),avatar:str(3),stacked:{type:'boolean'},
      icon:choice('check','arrow','lock','calendar','pause','plus','paw','box','bolt','heart','search','pin','home','courier','car','doc','mail','person','clock','cart','bag','card','star','phone','chat','cup','bean','flame','screen','code','megaphone','chart','image','brush','coin')}),
    assetId: {type:'string',pattern:'^brand-[a-f0-9]{20}$'},
    imageFit:choice('contain','cover'),imageReveal:choice('none','wipe','iris'),mediaMotion:choice('none','ken-burns','parallax'),
    attachTo:id,space:choice('screen'),exit:choice('cut'),rollFrom:choice('left','right','bottom'),handoffFrom:id,
    wordSwap, wordClick:obj({word:clickWord,at:num(0,1799),frames:num(1,36)},clickOutcome),
    spiral: obj({turns: num(1, 2), direction: choice('clockwise', 'counterclockwise')}),
    wordType: obj({}, {
      highlight: obj({text: str(80), fill: choice(...ROLES)}),
      caret: choice('entry', 'blink'),
    }),
    textRing: obj({
      direction: choice('clockwise', 'counterclockwise'), speed: num(4, 90), phase: num(-360, 360),
      repeats: num(1, 4), style: choice('solid', 'outline'), tracking: num(0, 20),
    }),
    motion: list(motionKey, 2, 24),
    objectReveal: obj({target: id, direction: choice('up','down','left','right')}),
    fold: obj({at:num(0,1799),frames:num(1,120),direction:choice('open','close'),material:choice('paper','package')},
      {mark:faceMark,assetId:{type:'string',pattern:'^brand-[a-f0-9]{20}$'}}),
    mesh: obj({form:choice(...VOLUMES),depth:num(8,1200),
      keys:list(obj({frame:num(0,1799),rx:num(-720,720),ry:num(-720,720)},{ease:easing}),1,12)},
    {mark:faceMark,assetId:{type:'string',pattern:'^brand-[a-f0-9]{20}$'}}),
    formTrack:obj({depth:num(8,1200),keys:list(obj({frame:num(0,1799),form:choice(...TRANSFORM_FORMS)},
      {rx:num(-80,80),ry:num(-80,80),fill:choice(...ROLES),mark:faceMark,ease:easing,
        assetId:{type:'string',pattern:'^brand-[a-f0-9]{20}$'}}),2,12)}),
  }),1,360),
  camera:list(obj({frame:num(0,1800),x:num(-1920,3840),y:num(-1920,3840),zoom:num(90,220),rotate:num(-3,3)},
    {target: id, ease: easing}),2,241),
});
// Number enums use the same strict integer checker as the other service contracts.
ScoreSchema.properties.version.type='integer';
// Set by the scene compiler. Its films are staged from composed scenes, so the per-move quotas do not apply.
ScoreSchema.properties.staging=choice('scenes','connected','superdynamic');
ScoreSchema.properties.timing=choice('actions');
ScoreSchema.properties.music=choice('impact'); // Legacy scores used this flag to enable shape cues.
ScoreSchema.properties.shapeSounds={type:'boolean'};
ScoreSchema.properties.fps.type='integer';

const wordCount = text => text.trim().split(/\s+/).length;
const exitFrames = (el, frames) => el.end === frames ? 0 : 7;

function checkWordSwap(el, totalFrames, issues) {
  const swap = el.wordSwap;
  if (el.kind !== 'text' || el.text !== undefined || ['spiral', 'word-type'].includes(el.enter)) {
    issues.push(`${el.id}: wordSwap requires a text element without text, spiral or word-type entry`);
  }
  if (swap.style === 'cut' ? swap.transitionFrames !== 0 : swap.transitionFrames < 4) {
    issues.push(`${el.id}: cut needs 0 transitionFrames; roll and flip need 4–18`);
  }
  if (swap.variants[0].frame !== el.start) issues.push(`${el.id}: first wordSwap variant must start at element start`);
  if (new Set(swap.variants.map(v => v.text.trim().normalize('NFC'))).size !== swap.variants.length) {
    issues.push(`${el.id}: wordSwap variants must be distinct`);
  }
  for (const [index, variant] of swap.variants.entries()) {
    const nextFrame = swap.variants[index + 1]?.frame ?? el.end - exitFrames(el, totalFrames);
    const settled = variant.frame + (index ? swap.transitionFrames : el.enterFrames);
    const readingFrames = index ? Math.max(12, wordCount(variant.text) * 6) :
      Math.max(18, wordCount(swap.before + variant.text + swap.after) * 6);
    if (variant.frame < el.start || nextFrame > el.end || nextFrame - settled < readingFrames) {
      issues.push(`${el.id}: wordSwap variant ${index + 1} needs ${readingFrames} readable frames after settling at ${settled}`);
    }
  }
}

export function validateScore(score,settings,source){
  const issues=checkSchema(ScoreSchema,score);
  if(issues.length)throw new Error(issues.slice(0,16).join('\n'));
  const superdynamic = score.staging === 'superdynamic';
  if (score.timing && !superdynamic) issues.push('Action timing requires superdynamic staging');
  if (!superdynamic && (score.scenes.length > 12 || score.elements.length > 90)) issues.push('Ordinary scores support at most 12 scenes and 90 elements');
  if (!superdynamic && score.camera.length > 30) issues.push('Ordinary scores support at most 30 camera keys');
  if (superdynamic !== (settings.pace === 'superdynamic')) issues.push('Super-dynamic staging requires superdynamic pace');
  if (superdynamic) {
    const audit = auditSuperDynamic(score);
    if (!audit.ok) issues.push(`Super-dynamic: ${audit.issues[0].kind} ${audit.issues[0].id} exceeds ${audit.limitFrames} frames`);
  }
  if (settings.style && score.style !== settings.style) issues.push(`style must be ${settings.style}`);
  if ((score.staging === 'connected') !== usesConnectedStory(settings.motionRecipe)) {
    issues.push('Connected score staging requires the connected-story or continuous-morph recipe');
  }
  for(const k of ['width','height','fps','frames'])if(score[k]!==settings[k])issues.push(`${k} must be ${settings[k]}`);
  const evidence=new Set(source?.evidence?.map(e=>e.id)||[]),ids=new Set();
  const images = new Set((source?.assets ?? []).filter(isVisualAsset).map(asset => asset.id));
  for (const assetId of imageAssetIds(score)) if (!images.has(assetId)) issues.push(`Image ${assetId} must belong to this film's source`);
  const shapes = new Map(score.shapes.map(shape => [shape.id, shape]));
  const elements = new Map(score.elements.map(element => [element.id, element]));
  const identify=id=>{if(ids.has(id))issues.push(`Duplicate id ${id}`);ids.add(id);};
  if (new Set(score.scenes.map(scene => scene.id)).size !== score.scenes.length) issues.push('Duplicate scene IDs');
  score.scenes.forEach((s,i)=>{
    if(s.start!==(score.scenes[i-1]?.end??0)||s.end<=s.start||(!superdynamic && s.end-s.start<45))issues.push(`Scene ${s.id}: contiguous scenes need at least ${superdynamic ? 1 : 45} frames`);
    if (s.flood) {
      if (!superdynamic && (s.flood.frames < 12 || s.flood.revealFrames < 8)) issues.push(`${s.id}: ordinary floods need 12 push and 8 reveal frames`);
      const previous = score.scenes[i - 1];
      const start = s.start - s.flood.frames;
      const states = shapes.get(s.flood.target)?.states;
      const index = states?.findLastIndex(state => state.frame <= start) ?? -1;
      const state = states?.[index];
      if (!previous || start < previous.start + (previous.flood?.revealFrames ?? 0) ||
          s.start + s.flood.revealFrames > s.end) {
        issues.push(`${s.id}: fit the flood push and reveal inside consecutive scenes without overlap`);
      }
      const settled = state && (!index || state.frame + state.duration <= start) &&
        (states[index + 1]?.frame ?? s.start) >= s.start;
      const through = settled && states.slice(0,index + 1);
      if (!settled || state.contour === 'burst' || (through.findLast(key => key.opacity !== undefined)?.opacity ?? 100) !== 100 ||
          (through.findLast(key => key.rotate !== undefined)?.rotate ?? 0) % 360 !== 0 ||
          floodCoverage(state.box,score.width,score.height) > 18) {
        issues.push(`${s.id}: flood needs a settled, opaque, upright shape large enough to cover the frame`);
      }
      if (s.flood.land) {
        const landing = states?.findLast(state => state.frame < s.start + s.flood.revealFrames);
        const lastOpacity = states?.findLast(state => state.frame <= (landing?.frame ?? 0) && state.opacity !== undefined)?.opacity ?? 100;
        if (!landing || landing.frame < s.start || landing.frame + landing.duration > s.start + s.flood.revealFrames ||
            lastOpacity !== 100 || landing.fill !== state?.fill) {
          issues.push(`${s.id}: a matched flood needs an opaque target landing in the incoming scene with the same fill`);
        }
      }
      if (s.flood.mark && !s.flood.land) issues.push(`${s.id}: a flood mark needs a matched landing`);
      if (source?.productFlow) issues.push(`${s.id}: flood would obscure the required continuous product layers`);
    }
    if (s.transition) {
      const previous = score.scenes[i - 1];
      const {kind, frames, revealFrames = 0, x, y, target, fill} = s.transition;
      const lead = kind === 'portal' ? 0 : frames, tail = kind === 'portal' ? frames : revealFrames;
      if (!previous || s.flood || lead > (previous.end - previous.start) / 2 || tail > (s.end - s.start) / 2) {
        issues.push(`${s.id}: a transition joins two scenes, takes at most half of each and cannot combine with a flood`);
      }
      if (kind === 'portal' ? x === undefined || y === undefined || x > score.width || y > score.height : x !== undefined || y !== undefined) {
        issues.push(`${s.id}: a portal needs its centre x/y inside the frame; wipe and whip take a direction instead`);
      }
      if (kind === 'whip' && !revealFrames) issues.push(`${s.id}: a whip needs revealFrames to brake into the scene`);
      if (kind === 'dive') {
        const actor = elements.get(target), last = s.start - 1;
        const visible = actor ? actor.start <= last && actor.end > last && actor.start + actor.enterFrames <= last : shapes.has(target);
        if (!visible || !fill || (s.ground ?? 'background') !== fill || revealFrames < 6 || frames < (superdynamic ? 9 : 12)) {
          issues.push(`${s.id}: a dive needs a target that is settled when the previous scene ends, 12 or more frames, 6 or more revealFrames and a fill equal to this scene's ground`);
        }
        // Check the whole push, not just whether an ID exists at the cut. An invisible target (or an
        // invisible parent surface) makes the camera dive into empty space. Limit the additional rule
        // to scene films so older detailed scores keep their existing contract.
        if (visible && score.staging === 'scenes') {
          const shape = actor ? shapes.get(actor.attachTo) : shapes.get(target);
          const track = shape && shapeTrack(shape.states);
          const first = s.start - frames;
          const samples = [first, last, ...(actor?.motion ?? []).map(key => key.frame),
            ...(shape?.states ?? []).flatMap(state => [state.frame, state.frame + state.duration])]
            .filter(frame => frame >= first && frame <= last);
          const readable = samples.every(frame => {
            const opacity = actor?.motion ? poseAt(actor.motion, frame).opacity : 100;
            const parentOpacity = track ? shapePoseAt(track, frame).opacity : 100;
            const wordReady = !actor?.wordClick || (actor.wordClick.shape && frame >= actor.wordClick.at + actor.wordClick.frames);
            return (!actor || (actor.start + actor.enterFrames <= frame && opacity >= 20 && wordReady)) && parentOpacity >= 20;
          });
          if (!readable) issues.push(`${s.id}: the dive target must be visible throughout the camera push`);
        }
      } else if (target !== undefined) issues.push(`${s.id}: only a dive takes a target`);
      if (source?.productFlow) issues.push(`${s.id}: a transition would hide the required continuous product layers`);
    }
  });
  if(score.scenes.at(-1).end!==score.frames)issues.push('Scenes must cover the whole film');
  const bounds=(b,name)=>{if(b.x+b.w>score.width||b.y+b.h>score.height)issues.push(`${name}: box outside canvas`);};
  let shared=false;
  for(const shape of score.shapes){
    identify(shape.id);
    if(shape.states[0].frame!==0)issues.push(`${shape.id}: first shape state must be at frame 0`);
    shape.states.forEach((s,i)=>{
      bounds(s.box,shape.id);
      if(i&&(s.frame<=shape.states[i-1].frame||s.frame<shape.states[i-1].frame+shape.states[i-1].duration))issues.push(`${shape.id}: shape changes overlap or are unsorted`);
      if(s.frame+s.duration>=score.frames)issues.push(`${shape.id}: shape does not settle before the end`);
      if(i&&score.scenes.some(sc=>sc.start===s.frame))shared=true;
    });
  }
  if(!shared && !score.elements.some(el => el.stage || ['spiral', 'word-type'].includes(el.enter) || el.wordSwap || el.wordClick || el.textRing || el.motion)) {
    issues.push('Use a shape that carries across a scene boundary or typography/actor motion that supports the concept');
  }
  for(const el of score.elements){
    if((el.kind==='stage')!==Boolean(el.stage))issues.push(`${el.id}: kind=stage requires stage data`);
    if(el.stage)issues.push(...stageIssues(el.stage,source).map(issue=>`${el.id}: ${issue}`));
    identify(el.id);bounds(el.box,el.id);
    if (el.handoffFrom) {
      const from = elements.get(el.handoffFrom), finish = from?.motion?.at(-1);
      let matched = false;
      if (from && finish) {
        const a = poseAt(from.motion, el.start), b = el.motion ? poseAt(el.motion, el.start) : {x:0,y:0};
        matched = Math.hypot(from.box.x + from.box.w / 2 + a.x - el.box.x - el.box.w / 2 - b.x,
          from.box.y + from.box.h / 2 + a.y - el.box.y - el.box.h / 2 - b.y) <= 3;
      }
      if (!from || from === el || !['rect','image','icon'].includes(from.kind) || !['image','icon'].includes(el.kind) ||
          from.attachTo !== el.attachTo || from.space !== el.space || from.start >= el.start || from.end <= el.start ||
          from.end - el.start > Math.floor(score.fps / 2) || finish?.opacity !== 0 || finish.frame < el.start ||
          finish.frame >= from.end || !matched) {
        issues.push(`${el.id}: handoffFrom needs a co-located outgoing subject that fades out within half a second`);
      }
    }
    if (el.kind === 'image' ? !images.has(el.assetId) : el.assetId !== undefined) {
      issues.push(`${el.id}: assetId must identify a captured source image or imported illustration and may only be used on an image`);
    }
    if ((el.kind === 'stroke') !== Boolean(el.curve)) issues.push(`${el.id}: stroke requires a cubic curve`);
    if (el.enter === 'draw' && el.kind !== 'stroke' && !(el.kind === 'icon' && el.icon === 'circle-check')) {
      issues.push(`${el.id}: draw applies to strokes and circle-check icons`);
    }
    if ((el.kind === 'volume') !== Boolean(el.mesh)) {
      issues.push(`${el.id}: kind=volume requires mesh geometry`);
    }
    if (el.mesh?.mark && el.mesh.form !== 'box') issues.push(`${el.id}: a face mark requires box geometry`);
    if (el.mesh && (el.mesh.keys[0].frame !== el.start || el.mesh.keys.some((key,index,keys) =>
      key.frame >= el.end || (index && key.frame <= keys[index - 1].frame)))) {
      issues.push(`${el.id}: mesh keys must start at actor entry and increase within its lifetime`);
    }
    if ((el.kind === 'transform') !== Boolean(el.formTrack)) issues.push(`${el.id}: kind=transform requires a formTrack`);
    if ((el.kind === 'fold') !== Boolean(el.fold)) issues.push(`${el.id}: kind=fold requires hinged geometry`);
    if (el.fold && (el.fold.at < el.start || el.fold.at + el.fold.frames + 15 >= el.end)) {
      issues.push(`${el.id}: leave 15 settled frames after the fold`);
    }
    if (!superdynamic && el.fold?.frames < 12) issues.push(`${el.id}: ordinary folds need at least 12 frames`);
    if (el.formTrack) {
      const {keys} = el.formTrack;
      if (keys[0].frame !== el.start || keys.some((key,index) => key.frame >= el.end ||
          (index > 0 && key.frame <= keys[index-1].frame))) {
        issues.push(`${el.id}: form keys must start at actor entry and increase within its lifetime`);
      }
      if (new Set(keys.map(key => `${key.form}:${key.mark ?? ''}:${key.assetId ?? ''}`)).size < 2) issues.push(`${el.id}: give the shared object at least two different forms, marks or images`);
      if (keys.some(key => key.form !== 'box' && (key.rx || key.ry))) issues.push(`${el.id}: tile and logo keys must be front facing`);
      if (keys.some(key => key.form === 'logo') && el.box.w !== el.box.h) issues.push(`${el.id}: a logo landing needs a square base box`);
    }
    if (el.font && !['text','pill'].includes(el.kind)) issues.push(`${el.id}: font applies to text or pill`);
    if ((el.enter === 'object-reveal') !== Boolean(el.objectReveal)) issues.push(`${el.id}: object-reveal requires an objectReveal origin`);
    if (el.objectReveal) {
      const target = elements.get(el.objectReveal.target);
      if (el.kind !== 'text' || el.wordSwap || el.wordClick || el.textRing || el.attachTo || el.motion ||
          !target || target === el || !['rect','icon','image','logo','transform'].includes(target.kind) ||
          target.attachTo || target.space !== el.space || target.start > el.start || target.end < el.start + el.enterFrames ||
          target.motion?.some(key => key.rotate)) {
        issues.push(`${el.id}: object-reveal needs plain text and a visible unrotated object in the same coordinate space`);
      }
    }
    if (el.attachTo && (!shapes.has(el.attachTo) || el.space === 'screen')) {
      issues.push(`${el.id}: attachTo requires a persistent shape in world space`);
    }
    if (['mask-rise','word-lift','kinetic-stretch'].includes(el.enter) && (el.kind !== 'text' || el.wordSwap || el.textRing)) {
      issues.push(`${el.id}: ${el.enter} requires ordinary text`);
    }
    if (['word-lift','kinetic-stretch'].includes(el.enter) && el.enterFrames < (superdynamic ? 1 : 12)) {
      issues.push(`${el.id}: ${el.enter} needs at least 12 entry frames`);
    }
    if (el.leadWord && !['word-lift','kinetic-stretch'].includes(el.enter)) issues.push(`${el.id}: leadWord needs a masked word entrance`);
    if (el.enter === 'roll-in' && (el.kind === 'text' || el.enterFrames < 16)) issues.push(`${el.id}: roll-in needs an object and 16–45 frames`);
    if (el.rollFrom && el.enter !== 'roll-in') issues.push(`${el.id}: rollFrom requires roll-in`);
    if(el.end>score.frames||el.end-el.start<el.enterFrames+(superdynamic ? 0 : 12))issues.push(`${el.id}: too little time to settle`);
    if(['text','pill'].includes(el.kind)){
      if((!el.text?.trim()&&!el.wordSwap)||!el.fontSize)issues.push(`${el.id}: text or wordSwap and fontSize required`);
      const words=wordCount(el.text||'');
      if(!superdynamic && !el.wordSwap && el.end-el.start-el.enterFrames<Math.max(22,words*6))issues.push(`${el.id}: insufficient reading time`);
    }
    if (el.wordSwap) checkWordSwap(el, score.frames, issues);
    if (el.wordClick) {
      const {at,frames} = el.wordClick;
      if (!superdynamic && frames < 8) issues.push(`${el.id}: ordinary word clicks need at least 8 frames`);
      const issue=wordClickIssue(el.text,el.wordClick);
      if (issue) issues.push(`${el.id}: ${issue}`);
      if (el.kind !== 'text' || el.wordSwap || el.textRing || el.emphasis ||
          !['none','resolve','rise'].includes(el.enter)) {
        issues.push(`${el.id}: wordClick needs plain text with none, resolve or rise entry`);
      }
      const exit=el.exit === 'cut' ? 0 : exitFrames(el,score.frames);
      if (at < el.start + el.enterFrames + wordClickRead(el.text ?? '') || at+frames+15+exit > el.end) {
        issues.push(`${el.id}: leave a readable hold before wordClick and 15 settled frames after it`);
      }
    }
    if (el.enter === 'spiral') {
      if (el.kind !== 'text' || !el.text?.trim() || el.wordSwap || el.enterFrames < (superdynamic ? 1 : 20)) {
        issues.push(`${el.id}: spiral needs ordinary text and 20–45 entry frames`);
      }
      if (Math.min(el.box.w, el.box.h) < (el.fontSize || 24) * 2.5) {
        issues.push(`${el.id}: leave at least 2.5 × fontSize on both axes of the spiral box`);
      }
    } else if (el.spiral) issues.push(`${el.id}: spiral settings require spiral entry`);
    if (el.enter === 'word-type' && (el.kind !== 'text' || !el.text?.trim() || el.enterFrames < (superdynamic ? 1 : 10))) {
      issues.push(`${el.id}: word-type needs ordinary text and 10–45 entry frames`);
    }
    if (el.wordType && el.enter !== 'word-type') issues.push(`${el.id}: wordType requires word-type entry`);
    if (el.wordType?.highlight && !wordHighlightRange(el.text ?? '', el.wordType.highlight.text)) {
      issues.push(`${el.id}: wordType.highlight.text must match consecutive whole words in text`);
    }
    if (el.textRing) {
      if (el.kind !== 'text' || !el.text?.trim() || el.wordSwap || ['spiral', 'word-type'].includes(el.enter)) {
        issues.push(`${el.id}: textRing needs ordinary text and cannot combine with a word swap, spiral or typing`);
      }
      if (Math.min(el.box.w, el.box.h) < (el.fontSize || 24) * 3) {
        issues.push(`${el.id}: leave at least 3 × fontSize on both axes of the text ring box`);
      }
    }
    if (el.motion) {
      if (el.motion[0].frame !== el.start) issues.push(`${el.id}: first motion key must start at element start`);
      for (const [index, key] of el.motion.entries()) {
        if (key.frame >= el.end || (index && key.frame <= el.motion[index - 1].frame)) {
          issues.push(`${el.id}: motion keys must increase within element lifetime`);
          break;
        }
      }
    }
    if(el.kind==='icon'&&!el.icon)issues.push(`${el.id}: icon required`);
    if (el.clickAt !== undefined && (el.kind !== 'icon' || el.icon !== 'cursor' || el.clickAt < el.start + el.enterFrames || el.clickAt >= el.end)) {
      issues.push(`${el.id}: clickAt requires a cursor and must occur after entry and before exit`);
    }
    if ((el.kind === 'card') !== Boolean(el.card)) issues.push(`${el.id}: kind=card requires card content, and card content requires kind=card`);
    if (el.card) {
      if (el.card.avatar && el.card.icon) issues.push(`${el.id}: a card takes an avatar or an icon, not both`);
      if (el.box.h < Math.min(score.width, score.height) * .09 || el.box.w < el.box.h * 2.5) {
        issues.push(`${el.id}: a card needs a height of at least 9% of the short edge and a width of at least 2.5 × its height`);
      }
      const words = wordCount(`${el.card.title} ${el.card.subtitle ?? ''} ${el.card.badge ?? ''}`);
      if (el.end - el.start - el.enterFrames < Math.max(22, words * 5)) issues.push(`${el.id}: insufficient reading time for the card`);
    }
    if (el.elevation !== undefined && !['rect','pill','card'].includes(el.kind)) issues.push(`${el.id}: elevation applies to rect, pill or card`);
    if (el.emphasis) {
      if (el.kind !== 'text' || !el.text?.trim() || el.wordSwap || el.textRing || ['spiral','word-type'].includes(el.enter)) {
        issues.push(`${el.id}: emphasis needs ordinary text without a word swap, text ring, spiral or typing`);
      } else if (!wordHighlightRange(el.text, el.emphasis.text)) {
        issues.push(`${el.id}: emphasis.text must match consecutive whole words in text`);
      }
    }
    if (el.activeColor && el.kind !== 'toggle') issues.push(`${el.id}: activeColor requires a toggle`);
    if(el.kind==='toggle'&&(el.changeAt===undefined||el.changeAt<el.start+el.enterFrames||el.changeAt+TOGGLE_SETTLE_FRAMES>el.end))issues.push(`${el.id}: toggle changeAt must occur after entry and before exit`);
    if(source)for(const ref of el.evidenceIds)if(!evidence.has(ref))issues.push(`${el.id}: unknown evidence ${ref}`);
  }
  if(score.camera[0].frame!==0)issues.push('Camera must begin at 0');
  if (score.style === 'product-demo') {
    if (!score.camera.some(key => key.target)) issues.push('Product Demo requires a camera target on the main action');
    const captures = new Set((source?.assets ?? []).filter(asset=>asset.kind==='screenshot').map(asset=>asset.id));
    if (captures.size && !score.elements.some(element => element.kind === 'image' && captures.has(element.assetId))) {
      issues.push('Product Demo must show at least one captured source image when available');
    }
    if (source?.productFlow) {
      issues.push(...productFlowIssues(score, source.productFlow, shapes, elements));
      const card = shapes.get(PRODUCT_FLOW_IDS.card);
      if (card?.states.some(state => (state.opacity ?? 100) !== 100 || (state.rotate ?? 0) !== 0)) {
        issues.push(`${card.id}: keep the captured card opaque and upright`);
      }
    }
  }
  for(let i=0;i<score.camera.length;i++){
    const k=score.camera[i];
    if(k.frame>score.frames||(i&&k.frame<=score.camera[i-1].frame))issues.push('Camera frames must be sorted and inside film');
    if (k.target && !shapes.has(k.target)) {
      const target = elements.get(k.target);
      const frame = Math.min(k.frame, score.frames - 1);
      if (!target || target.space === 'screen' || frame < target.start || frame >= target.end) {
        issues.push(`Camera key ${k.frame}: target ${k.target} must be a visible world actor at that frame`);
      }
    }
  }
  issues.push(...motionProfileIssues(score,settings,source));
  for(const seam of auditStageContinuity(score).samples.filter(s=>!s.ok))issues.push(`${seam.to}/${seam.toNode}: ${seam.reason??'projected handoff jump'}${seam.errorPixels!==undefined?' ('+seam.errorPixels.toFixed(2)+' px)':''}`);
  if(issues.length)throw new Error(issues.slice(0,20).join('\n'));
  return score;
}

export function scoreCues(score){
  const cues=[];
  if (score.staging !== 'connected' || score.shapeSounds || score.music === 'impact') for(const shape of score.shapes)for(let i=1;i<shape.states.length;i++){
    const [previous,s,next]=[shape.states[i-1],shape.states[i],shape.states[i+1]];
    if(s.fill===previous.fill&&(s.contour??'roundRect')===(previous.contour??'roundRect')&&Object.keys(s.box).every(key=>s.box[key]===previous.box[key])&&
      (s.rotate===undefined||s.rotate===previous.rotate))continue;
    const ease = s.ease ?? 'smooth';
    if(next?.frame===s.frame+s.duration&&['smooth','fluid'].includes(ease)&&(next.ease??'smooth')===ease&&
      (next.fill!==s.fill||(next.contour??'roundRect')!==(s.contour??'roundRect')||Object.keys(next.box).some(key=>next.box[key]!==s.box[key])))continue;
    cues.push({frame:s.frame+s.duration,kind:'whoosh',gain:38,sync:'peak',actor:shape.id});
  }
  for(const el of score.elements){
    for(const event of el.stage?.events??[])cues.push({frame:el.start+event.t*(el.end-el.start),kind:event.kind,gain:event.kind==='click'?42:30,sync:event.kind==='whoosh'?'peak':'start',actor:el.id+'-'+event.actor});
    for (const [index, key] of (el.formTrack?.keys ?? []).entries()) {
      if (index && key.form !== el.formTrack.keys[index-1].form) cues.push({frame:key.frame,kind:'whoosh',gain:28,sync:'peak',actor:el.id});
    }
    if (el.wordClick) cues.push({frame:el.wordClick.at,kind:'click',gain:42,actor:el.id});
    if (el.clickAt !== undefined) cues.push({frame:el.clickAt,kind:'click',gain:42,actor:el.id});
    if (el.fold) cues.push({frame:el.fold.at+el.fold.frames,kind:'whoosh',gain:32,sync:'peak',actor:el.id});
    if(el.sound!=='none') {
      const landing = ['spiral', 'mask-rise'].includes(el.enter) ? el.enterFrames : Math.round(el.enterFrames * .7);
      cues.push({frame:el.start+landing,kind:el.sound,gain:el.kind==='text'?18:42,actor:el.id});
      for (const variant of el.wordSwap?.variants.slice(1) ?? []) {
        cues.push({frame: variant.frame + el.wordSwap.transitionFrames, kind: 'click', gain: 26, actor: el.id});
      }
    }
    if(el.kind==='toggle')cues.push({frame:el.changeAt+TOGGLE_SETTLE_FRAMES,kind:'click',gain:48,actor:el.id});
  }
  for (const scene of score.scenes ?? []) {
    if (scene.flood) cues.push({frame:scene.start,kind:'whoosh',gain:46,sync:'peak',actor:scene.flood.target});
    if (scene.transition) cues.push({frame:scene.start,kind:'whoosh',gain:['whip','dive'].includes(scene.transition.kind)?46:36,sync:'peak',actor:scene.id});
  }
  return cues.filter(c=>c.frame<score.frames).sort((a,b)=>a.frame-b.frame);
}

// Include both an in-progress action and a settled result. A midpoint alone can
// accidentally show a blank button just before its label or a half-switched toggle.
export function scoreSamples(score,{includeTransitions=false}={}){
  if (score.staging === 'superdynamic' && score.timing !== 'actions') {
    // Sample across the whole film without allocating two images for every half-second shot.
    const count = Math.min(32, score.scenes.length);
    return Array.from({length: count}, (_, index) => {
      const scene = score.scenes[count === 1 ? 0 : Math.round(index * (score.scenes.length - 1) / (count - 1))];
      return {id: scene.id + '-result', scene: scene.id, phase: 'short shot', frame: Math.floor((scene.start + scene.end - 1) / 2)};
    });
  }
  const samples = score.scenes.flatMap(scene=>{
    const local=score.elements.filter(el=>el.start>=scene.start&&el.start<scene.end);
    const last=Math.max(scene.start,...local.map(el=>Math.max(el.start+el.enterFrames+12,(el.changeAt??0)+14,
      el.wordSwap ? el.wordSwap.variants.at(-1).frame + el.wordSwap.transitionFrames + 3 : 0)));
    return [
      {id:scene.id+'-action',scene:scene.id,phase:'action',frame:Math.floor(scene.start+(scene.end-scene.start)*.4)},
      {id:scene.id+'-result',scene:scene.id,phase:'result',frame:Math.min(scene.end-8,Math.max(last,Math.floor(scene.start+(scene.end-scene.start)*.8)))},
    ];
  });
  const frames = new Set(samples.map(sample => sample.frame));
  function add(index, phase, frame) {
    if (samples.length >= (includeTransitions ? 64 : 32) || frames.has(frame)) return;
    const scene = score.scenes.find(s => frame >= s.start && frame < s.end);
    if (!scene) return;
    samples.push({id: `motion-${index}-${frame}`, scene: scene.id, phase, frame});
    frames.add(frame);
  }
  for(const [index,element]of score.elements.entries())if(element.stage){
    const ticks=[...new Set([...(element.stage.camera??[]),...element.stage.nodes.flatMap(node=>node.track??[])].map(key=>key.t))].sort((a,b)=>a-b);
    for(const [i,t]of ticks.entries()){
      const frame=Math.round(element.start+t*(element.end-element.start));
      add(index,'authored state',Math.min(element.end-1,frame));
      if(i)add(index,'authored motion',Math.floor(element.start+(t+ticks[i-1])/2*(element.end-element.start)));
    }
  }
  const flow = productFlowMilestones(score);
  if (flow) {
    const index = score.elements.length + score.scenes.length + score.shapes.length;
    add(index, 'before switch', flow.actionFrame - 1);
    add(index, 'before status', flow.statusFrame - 1);
    add(index, 'status settles', flow.statusSettledFrame);
    add(index, 'same card in transit', Math.round((flow.handoffFrame + flow.cartLandingFrame) / 2));
    add(index, 'cart row and heading', flow.cartTitleSettledFrame);
  }
  for (const scene of score.scenes) {
    if (scene.link?.kind === 'match') {
      add('match-before-'+scene.id,'detail before the cut',scene.start - 1);
      add('match-after-'+scene.id,'same detail after the cut',scene.start);
      add('match-grow-'+scene.id,'detail grows into the surface',scene.start + 18);
    }
    if (scene.link?.kind === 'carry') {
      add('carry-before-'+scene.id,'surface before the handoff',scene.start - 1);
      add('carry-travel-'+scene.id,'surface travels into its new role',scene.start + 11);
      add('carry-land-'+scene.id,'surface lands',scene.start + 24);
    }
    if (scene.link?.kind === 'type') {
      add('type-before-'+scene.id,'hero line before the cut',scene.start - 2);
      add('type-move-'+scene.id,'line becomes the headline',scene.start + 11);
      add('type-landed-'+scene.id,'interface arrives under the line',scene.start + 30);
    }
    if (scene.transition) {
      const {kind,frames,revealFrames = 0} = scene.transition;
      if (kind === 'portal') add('portal-'+scene.id,'portal opens',scene.start + Math.round(frames * .5));
      else if (kind === 'dive') {
        add('dive-start-'+scene.id,'before the dive',scene.start - frames - 1);
        add('dive-aim-'+scene.id,'camera centers the detail',scene.start - Math.round(frames * .55));
        add('dive-in-'+scene.id,'camera dives into the detail',scene.start - Math.round(frames * .3));
        add('dive-cover-'+scene.id,'detail fills the frame',scene.start - 1);
        add('dive-out-'+scene.id,'next scene opens inside it',scene.start + Math.round(revealFrames * .4));
        add('dive-landed-'+scene.id,'next scene settled',scene.start + revealFrames + 2);
      } else {
        add(kind+'-out-'+scene.id,kind === 'wipe' ? 'plane crosses' : 'camera whips out',scene.start - Math.round(frames * .4));
        if (revealFrames) add(kind+'-in-'+scene.id,kind === 'wipe' ? 'plane clears' : 'camera brakes',scene.start + Math.round(revealFrames * .4));
      }
    }
    if (!scene.flood) continue;
    add('flood-push','camera floods the frame',scene.start - Math.ceil(scene.flood.frames / 2));
    add('flood-cover','shape covers the frame',scene.start);
    if (scene.flood.land) {
      add('flood-travel','same marker travels to the first result',scene.start + Math.round(scene.flood.revealFrames*.34));
      add('flood-land','marker lands in the first result card',scene.start + scene.flood.revealFrames + 8);
    }
    add('flood-reveal','next scene opens',scene.start + scene.flood.revealFrames);
  }
  for (const [index,el] of score.elements.entries()) {
    if(el.kind==='image' && el.imageReveal && el.imageReveal!=='none') {
      add(index,'photo reveals',el.start+Math.floor(el.enterFrames/2));
      add(index,'photo revealed',el.start+el.enterFrames+2);
    }
    if (el.fold) {
      add(index,'before fold',el.fold.at);
      add(index,'panels hinge',el.fold.at+Math.floor(el.fold.frames/2));
      add(index,'fold settled',el.fold.at+el.fold.frames+2);
    }
    for (const [i,key] of (el.formTrack?.keys ?? []).entries()) {
      const previous = el.formTrack.keys[i-1];
      if (!previous || previous.form === key.form) continue;
      const id = `form-${index}-${i}`;
      add(id,`${previous.form} before transform`,previous.frame);
      add(id,`${previous.form} → ${key.form}`,Math.floor((previous.frame+key.frame)/2));
      if (key.form === 'logo') add(id,'logo taking shape',Math.floor(previous.frame+(key.frame-previous.frame)*.67));
      add(id,`${key.form} settled`,key.frame);
    }
    if (!el.wordClick) continue;
    const {at,frames,shape}=el.wordClick;
    add(index,'cursor approaches word',at-7);
    add(index,'word click',at);
    add(index,shape ? 'word becomes a shape' : 'word changes',at+Math.floor(frames/2));
    add(index,'word click result',at+frames+4);
  }
  if (score.elements.some(el => el.formTrack)) add('end','last score frame',score.frames-1);
  if (includeTransitions) {
    const candidates = new Map();
    const midpoint = (from,to,phase) => {
      const frame = Math.floor((from + to) / 2);
      if (to - from >= 2 && !frames.has(frame) && !candidates.has(frame)) candidates.set(frame, phase);
    };
    for (const [i,key] of score.camera.entries()) {
      const previous = score.camera[i - 1];
      if (previous && ['x','y','zoom','rotate','target'].some(field => key[field] !== previous[field])) {
        midpoint(previous.frame,key.frame,'camera in transit');
      }
    }
    for (const shape of score.shapes) for (const state of shape.states.slice(1)) {
      midpoint(state.frame,state.frame + state.duration,'shape in transit');
    }
    for (const element of score.elements) for (const [i,key] of (element.motion ?? []).entries()) {
      const previous = element.motion[i - 1];
      if (previous && ['x','y','scale','rotate','opacity'].some(field => key[field] !== previous[field])) {
        midpoint(previous.frame,key.frame,'actor in transit');
      }
    }
    const ordered = [...candidates].sort((a,b) => a[0] - b[0]);
    const count = Math.min(6,ordered.length);
    for (let i = 0; i < count; i++) {
      const [frame,phase] = ordered[Math.floor((i + .5) * ordered.length / count)];
      add('transition',phase,frame);
    }
  }
  for (const [index, el] of score.elements.entries()) {
    if (el.clickAt !== undefined) add(index, 'cursor click rays', el.clickAt + 5);
    if (score.style === 'product-demo' && el.kind === 'toggle') {
      add(index, 'before click', el.changeAt - 3);
      add(index, 'control changes', el.changeAt + 4);
      add(index, 'after click', el.changeAt + 10);
    }
    if (el.textRing) {
      const settled = el.start + el.enterFrames;
      add(index, 'text ring', settled + Math.round((el.end - settled) * .2));
      add(index, 'ring rotates', settled + Math.round((el.end - settled) * .7));
    }
    if (['spiral', 'word-type', 'word-lift', 'kinetic-stretch', 'roll-in','draw'].includes(el.enter)) {
      if (el.enter === 'spiral') {
        add(index, 'spiral', el.start + Math.round(el.enterFrames * .28));
        add(index, 'spiral resolves', el.start + Math.round(el.enterFrames * .72));
      } else {
        const phase = { 'word-type':'typing', 'word-lift':'words lift', 'kinetic-stretch':'words stretch',
          'roll-in':'object rolls',draw:'route draws' }[el.enter];
        const check = el.icon === 'circle-check';
        add(index, check ? 'confirmation ring draws' : phase, el.start + Math.round(el.enterFrames * (check ? .38 : .45)));
        if (check) add(index, 'confirmation tick draws', el.start + Math.round(el.enterFrames * .8));
      }
      add(index, el.enter === 'roll-in' ? 'roll settles' : el.icon === 'circle-check' ? 'confirmation settles' :
        el.enter === 'draw' ? 'route lands' : 'settled text', el.start + el.enterFrames + 3);
    }
    if (el.wordSwap) {
      for (const [i, variant] of el.wordSwap.variants.entries()) {
        const transition = i ? el.wordSwap.transitionFrames : el.enterFrames;
        if (i && transition) add(index, `word change ${i}`, variant.frame + Math.floor(transition / 2));
        add(index, `phrase ${i + 1}`, variant.frame + transition + 3);
      }
    }
  }
  for (const [index, el] of score.elements.entries()) {
    if (el.motion) {
      const next = el.motion.findIndex((key, i, keys) => i &&
        ['x', 'y', 'scale', 'rotate', 'opacity'].some(field => key[field] !== keys[i - 1][field]));
      if (next > 0) add(index, 'actor moves', Math.round((el.motion[next - 1].frame + el.motion[next].frame) / 2));
    }
  }
  if (samples.length > score.scenes.length * 2) {
    for (const [index, scene] of score.scenes.entries()) {
      const changes = score.shapes.flatMap(shape => shape.states.slice(1)).filter(state => state.frame === scene.start);
      if (changes.length) add(score.elements.length + index, 'shape handoff', scene.start + Math.round(Math.max(...changes.map(state => state.duration)) / 2));
    }
  }
  if (score.style === 'product-demo') {
    for (const [index, shape] of score.shapes.entries()) {
      for (const state of shape.states.slice(1)) {
        add(score.elements.length + score.scenes.length + index, 'surface changes', state.frame + Math.round(state.duration / 2));
        add(score.elements.length + score.scenes.length + index, 'surface lands', state.frame + state.duration);
      }
    }
  }
  return samples.sort((a, b) => a.frame - b.frame);
}
