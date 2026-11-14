import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,readFile,writeFile,rm,access} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {launchScore,source} from './fixtures/launch.js';
import {validateScore,scoreCues,scoreSamples} from '../src/kadr-launch/score.js';
import {generateLaunch as generateNativeLaunch,validateLaunchRequest} from '../src/kadr-launch/index.js';
import {validateTreatment, validateTreatmentScore} from '../src/kadr-launch/treatment.js';
import {applyRevision} from '../src/kadr-launch/revision.js';
import {PRODUCT_FLOW_IDS, productFlowMilestones} from '../src/kadr-launch/product-flow.js';
import {compileLaunch, recordedProductTreatment} from '../src/kadr-launch/compile.js';
import {compileConnectedStory} from '../src/kadr-launch/connected-story.js';
import {compileObjectStory} from '../src/kadr-launch/object-story.js';
import {cubicPrefix, makeWordType, motionTrackAt, paintWordType, rollEntrance, shapeBoxAt, shapePoseAt, shapeTrack} from '../src/kadr-launch/kinetic.js';
import {checkPresentationTimestamps, renderCadence} from '../src/render/cadence.js';
import {compositionAudit, projectedBox} from '../src/kadr-launch/composition.js';
import {motionEvents} from '../src/kadr-launch/motion-profile.js';
import {projectVolume, traceContour, transformPose} from '../src/kadr-launch/spatial.js';
import {splitClickedWord} from '../src/kadr-launch/word-click.js';
import {CONFIG} from '../src/config.js';

const settings={width:1920,height:1080,fps:30,frames:360};
const generateLaunch = options => generateNativeLaunch({directionMode: 'detailed', ...options});

test('authored 24 fps scores retain a frame-exact export clock', () => {
  const score = launchScore();
  score.fps = 24;
  validateScore(score, {...settings, fps:24}, source);
  const cadence = renderCadence(score, 24);
  assert.deepEqual(cadence, {fps:24, frames:360, samplesPerFrame:1});
  assert.equal(cadence.frames / cadence.fps, 15);
  assert.deepEqual(checkPresentationTimestamps(
    Array.from({length:360}, (_, index) => index * 512), '1/12288', cadence,
  ), {ok:true, framesChecked:360});
});

test('60 fps export retains the score clock and checks the presentation time of every frame', () => {
  const cadence = renderCadence(settings);
  assert.deepEqual(cadence, {fps:60, frames:720, samplesPerFrame:2});
  assert.equal(cadence.frames / cadence.fps, settings.frames / settings.fps);
  assert.deepEqual(renderCadence(settings, 30), {fps:30, frames:360, samplesPerFrame:1});
  const ticks = Array.from({length:720}, (_, i) => i * 256);
  assert.deepEqual(checkPresentationTimestamps(ticks, '1/15360', cadence), {ok:true, framesChecked:720});
  ticks[400] = ticks[399];
  assert.deepEqual(checkPresentationTimestamps(ticks, '1/15360', cadence), {ok:false, framesChecked:720, badFrame:400});
});

test('smooth tracks keep velocity at moving waypoints and respect explicit holds and reversals', () => {
  const sample = (values, frame) => motionTrackAt(values.map((x, i) => ({x,frame:i*10,ease:'smooth'})), frame, ['x']).x;
  const continuing = [0, 100, 300];
  const previous = sample(continuing, 9.99), next = sample(continuing, 10.01);
  assert.equal(sample(continuing, 10), 100);
  assert.ok(100 - previous > .12 && next - 100 > .12);
  assert.ok(Math.abs((100 - previous) - (next - 100)) < .001);
  assert.equal(sample([0, 100, 100], 10.5), 100);
  assert.ok(sample([0, 100, 50], 10.01) < 100);
  assert.ok(100 - sample([0, 100, 50], 10.01) < .001);
});

test('fluid tracks keep velocity and acceleration continuous without overshooting uneven waypoints', () => {
  const keys = [
    {frame:0,x:0}, {frame:6,x:40}, {frame:24,x:290}, {frame:30,x:290},
  ].map(key => ({...key,ease:'fluid'}));
  const x = frame => motionTrackAt(keys,frame,['x']).x;
  const step = .01;
  const velocity = (frame, sign) => (x(frame + sign * step) - x(frame)) / (sign * step);
  const acceleration = (frame, sign) =>
    (x(frame + sign * 2 * step) - 2 * x(frame + sign * step) + x(frame)) / step ** 2;
  assert.ok(velocity(6,1) > 1);
  for (const frame of [6,24]) {
    assert.ok(Math.abs(velocity(frame,1) - velocity(frame,-1)) < .001);
    assert.ok(Math.abs(acceleration(frame,1) - acceleration(frame,-1)) < .15);
  }
  for (let frame = .5; frame <= 30; frame += .5) {
    assert.ok(x(frame) >= x(frame - .5) && x(frame) <= 290);
  }
});

test('a shape carries speed through adjacent changes, then holds until its next move', () => {
  const state = (frame, duration, x, w = 32) => ({frame,duration,fill:'accent',
    box:{x,y:100,w,h:32,radius:16}});
  const states = [state(0,1,100),state(10,10,200),state(20,10,400),state(40,10,360,112)];
  const track = shapeTrack(states);
  const center = frame => {const {x,w}=shapeBoxAt(track,frame);return x+w/2;};
  const before = center(20) - center(19.99), after = center(20.01) - center(20);
  assert.ok(before > .12 && Math.abs(before - after) < .001);
  assert.equal(center(5), 116);
  assert.equal(center(35), 416);
  assert.equal(center(45), 416);
  assert.equal(shapeBoxAt(track,45).w, 72);
  assert.deepEqual(scoreCues({frames:60,elements:[],shapes:[{id:'shape',states}]}).map(cue=>cue.frame),[30,50]);
});

test('spatial score accepts a contour morph, a volume and a flood with a stable target', () => {
  const score = launchScore();
  const [before, after] = score.shapes[0].states;
  before.contour = 'ellipse';
  after.contour = 'diamond';
  after.box = {...before.box};
  score.elements[0].enter = 'kinetic-stretch';
  score.elements.push({
    id:'solid', kind:'volume', start:130, end:215, box:{x:200,y:330,w:180,h:160,radius:0},
    fill:'accent', enter:'resolve', enterFrames:12, sound:'none', evidenceIds:[],
    mesh:{form:'box',depth:100,keys:[{frame:130,rx:0,ry:0},{frame:184,rx:25,ry:38}]},
  });
  score.scenes[2].flood = {target:'thread',frames:24,revealFrames:14};
  assert.equal(validateScore(score,settings,source),score);
  assert.ok(motionEvents(score).some(event => event.id === 'thread' && event.kind === 'morph' && event.frame === 129));
  assert.ok(scoreCues(score).some(cue => cue.frame === 240 && cue.actor === 'thread' && cue.kind === 'whoosh'));
  assert.ok(scoreSamples(score).some(sample => sample.frame === 240 && sample.phase === 'shape covers the frame'));
  const movingTarget = structuredClone(score);
  movingTarget.shapes[0].states[1].frame = 205;
  assert.throws(() => validateScore(movingTarget,settings,source), /flood needs a settled/);
  score.elements.at(-1).mesh.keys[0].frame++;
  assert.throws(() => validateScore(score,settings,source), /mesh keys must start at actor entry/);
});

test('contours interpolate between outlines and a turning volume exposes side faces', () => {
  const area = {x:0,y:0,w:200,h:200,radius:50};
  function diagonal(progress) {
    const points = [];
    traceContour({beginPath(){}, moveTo(){}, lineTo(x,y){points.push([x,y]);}, closePath(){}},
      area, 'ellipse', 'diamond', progress);
    return points[5][0];
  }
  assert.ok(diagonal(0) > diagonal(.5) && diagonal(.5) > diagonal(1));
  assert.equal(projectVolume(area,'box',110,0,0).length,1);
  for (const form of ['box','prism','octahedron']) {
    const faces = projectVolume(area,form,110,-26,34);
    assert.ok(faces.length >= 2);
    assert.ok(faces.every(face => face.points.flat().every(Number.isFinite)));
    assert.ok(faces.some(face => face.light !== faces[0].light));
  }
});
function treatmentFor(score = launchScore()) {
  return {
    directions: [
      {id:'continuous', idea:'One object carries the booking through the film.', opening:'A compact control.',
        signature:'The switch widens into the confirmation panel.', look:'Green accents on a neutral field.', route:'continuous',
        creative:{approach:'product-action',subject:'Booking switch',change:'Switch widens into the confirmation panel.',meaning:'The selected time is booked.',evidenceId:'D1'}},
      {id:'rhythm', idea:'Words mark the steps of a booking.', opening:'A large headline.',
        signature:'An anchored headline changes on each cut.', look:'Strong type hierarchy.', route:'montage',
        creative:{approach:'editorial-contrast',subject:'Headline',change:'The headline cuts from selection to confirmation.',meaning:'The steps happen quickly.',evidenceId:'D1'}},
    ],
    selected:'continuous', rationale:'The transformation demonstrates the booking.', signatureBeat:score.scenes[1].id,
    beats: score.scenes.map((scene, i) => ({id:scene.id, frames:scene.end-scene.start, purpose:scene.purpose,
      action:'The active object changes form.', landing:'The viewer can read the result.',
      handoff:i === score.scenes.length - 1 ? '' : 'The object keeps its focal position.', energy:5+i, move:'type'})),
  };
}

function kineticScore() {
  const score = launchScore();
  score.shapes = [];
  const spiral = score.elements.find(el => el.id === 'hook');
  Object.assign(spiral, {text:'Диалог', enter:'spiral', enterFrames:36, box:{x:240,y:180,w:1440,h:620,radius:0}});
  const phrase = score.elements.find(el => el.id === 'actionTitle');
  delete phrase.text;
  Object.assign(phrase, {start:124, enterFrames:8, wordSwap:{before:'Мы ищем ', after:'', fill:'accent',
    style:'roll', layout:'inline', transitionFrames:8, variants:[
      {frame:124,text:'предпринимателей'}, {frame:161,text:'бухгалтеров'}, {frame:198,text:'бизнесменов'},
    ]}});
  return score;
}
test('native score: exact duration, arbitrary product and recomposed formats',()=>{
  for(const dimensions of [{width:1920,height:1080},{width:1080,height:1920},{width:1080,height:1080}]){
    const score=launchScore({...dimensions,brand:'Другой сервис'});assert.equal(validateScore(score,{...settings,...dimensions},source),score);
  }
});
test('native score rejects hallucinated evidence, duplicate IDs, out-of-bounds and unsorted timing',()=>{
  for(const edit of [s=>s.elements[0].evidenceIds=['unknown'],s=>s.elements[1].id=s.elements[0].id,s=>s.elements[0].box.w=1920,s=>s.shapes[0].states[1].frame=1,s=>s.scenes[1].start=121,s=>s.camera[1].frame=0,s=>s.elements[0].end=5]){
    const score=launchScore();edit(score);assert.throws(()=>validateScore(score,settings,source));
  }
});
test('new treatments require distinct visual approaches and source-backed payoffs', () => {
  const treatment = treatmentFor();
  const rules = {source, requireCreative: true};
  assert.equal(validateTreatment(treatment, settings, rules), treatment);
  treatment.directions[1].creative.approach = 'product-action';
  treatment.directions[1].creative.evidenceId = 'unknown';
  treatment.signatureBeat = 'missing';
  assert.throws(() => validateTreatment(treatment, settings, rules), /different approaches[\s\S]+known source evidence[\s\S]+signatureBeat/);
});
test('a directed camera move counts as keyframes and exact copy can carry across the cut', () => {
  const score = launchScore(), treatment = treatmentFor(score);
  const title = score.elements.find(el => el.id === 'actionTitle');
  title.end = score.frames;
  Object.assign(treatment.beats[1], {move:'keyframes', text:title.text});
  assert.equal(validateTreatmentScore(score, treatment), score);
  score.camera = [{frame:0,x:960,y:540,zoom:100,rotate:0},{frame:360,x:960,y:540,zoom:100,rotate:0}];
  assert.throws(() => validateTreatmentScore(score, treatment), /visible actor or the camera/);
});
test('a compact revision can layer a mask and specify the toggle response', () => {
  const initial = launchScore();
  const mask = {id:'veil', kind:'rect', start:0, end:80, box:{x:0,y:0,w:120,h:100,radius:0},
    fill:'surface', enter:'none', enterFrames:1, sound:'none', evidenceIds:[]};
  const revised = applyRevision(initial, {
    addActors:[{element:mask, after:'hook'}],
    actors:[{id:'switch', activeColor:'#1e9e56'}],
  });
  assert.equal(validateScore(revised, settings, source), revised);
  assert.equal(revised.elements[1].id, 'veil');
  assert.equal(revised.elements.find(el => el.id === 'switch').activeColor, '#1e9e56');
  assert.throws(() => applyRevision(initial, {addActors:[{element:mask, after:'missing'}]}), /paint order anchor/);
});

test('Product Demo captures source layers, binds them to the plan and preserves them on resume', async t => {
  const runsDir = await workspace(t);
  const url = 'https://example.com/';
  const assetId = 'brand-01234567890123456789';
  let captures = 0;
  const score = launchScore();
  score.style = 'product-demo';
  score.camera[1] = {frame:90, x:0, y:0, zoom:145, rotate:0, target:'switch', ease:'smooth'};
  score.elements.push({id:'photo', kind:'image', start:0, end:360, box:{x:5,y:8,w:120,h:100,radius:0},
    fill:'foreground', enter:'none', enterFrames:1, sound:'none', attachTo:'thread', assetId, evidenceIds:['CAP1']});
  const result = await generateLaunch({
    runsDir, runId:'product-demo', url, style:'product-demo', pace:'calm', seconds:12, description:source.evidence[0].text,
    services:{...services,
      importer:async () => ({facts:[], brand:'Forma', finalUrl:url, identity:{colors:['#059669'],fonts:[]}}),
      appearance:async () => ({url,heading:'Forma',background:'#ffffff',foreground:'#111111',
        controls:[{label:'Продолжить',fill:'#111111',ink:'#ffffff'}]}),
      capture:async () => {
        captures++;
        return {layers:[{role:'primary', text:'Выбранное время записи', asset:{id:assetId, kind:'screenshot', source:url}}]};
      }},
    requestStage:async args => args.name === 'launch_score' ? {output:score} : requestStage(args),
  });
  assert.equal(result.ok, true);
  assert.equal(captures, 1);
  const saved = JSON.parse(await readFile(path.join(result.dir,'source.json')));
  assert.equal(saved.assets[0].evidenceId, 'CAP1');
  assert.equal(saved.brand.paletteSource,'rendered-interface');
  assert.deepEqual(saved.brand.colors,['#ffffff','#111111']);
  const savedScore=JSON.parse(await readFile(path.join(result.dir,'launch-score.json')));
  assert.deepEqual(savedScore.palette,saved.brand.interfacePalette);
  assert.equal(scoreSamples(score).filter(sample => /click|control changes/.test(sample.phase)).length, 3);
  const wrong = structuredClone(score);
  wrong.elements.at(-1).assetId = 'brand-98765432109876543210';
  wrong.camera[1].target = 'missing';
  assert.throws(() => validateScore(wrong, settings, saved), /captured source image[\s\S]+visible world actor/);
  const resumed = await generateLaunch({runsDir, runId:'product-demo', resume:true, renderOnly:true, services});
  assert.equal(resumed.ok, true);
  assert.equal(captures, 1);
});

test('layered Product Demo retains one photo and price and gates the status and cart', () => {
  const score = launchScore(), {card, photo, price, toggle, status, cart} = PRODUCT_FLOW_IDS;
  const assetId = 'brand-01234567890123456789';
  const productFlow = {photoAssetId:assetId, price:'24 ₼', labels:{status:'Подписка выбрана',cart:'Корзина'}};
  const productSource = {...source, productFlow, assets:[{kind:'screenshot',id:assetId}]};
  score.style = 'product-demo';
  score.shapes[0].id = card;
  const control = score.elements.find(element => element.id === 'switch');
  Object.assign(control, {id:toggle, attachTo:card});
  score.camera[1] = {...score.camera[1], target:toggle, x:0, y:0};
  const element = (id, fields) => ({id, start:0, end:360, box:{x:20,y:20,w:200,h:80,radius:0},
    fill:'foreground', enter:'none', enterFrames:1, sound:'none', evidenceIds:[], ...fields});
  score.elements.push(
    element(photo, {kind:'image', assetId, attachTo:card}),
    element(price, {kind:'text', text:'24 ₼', fontSize:48, attachTo:card}),
    element(status, {kind:'text', text:productFlow.labels.status, fontSize:48, start:75, end:200}),
    element(cart, {kind:'text', text:productFlow.labels.cart, fontSize:48, start:250, enter:'mask-rise', enterFrames:10}),
  );
  assert.equal(validateScore(score, settings, productSource), score);
  productFlow.ids = {name:'product-name'};
  productFlow.name = 'VIDA Nativa, 2 кг';
  assert.throws(() => validateScore(score, settings, productSource), /separate, fully visible text layer/);
  score.elements.push(element('product-name', {kind:'text', text:productFlow.name, fontSize:48, attachTo:card}));
  assert.equal(validateScore(score, settings, productSource), score);
  const timing = productFlowMilestones(score);
  assert.equal(timing.switchSettledFrame, 74);
  assert.equal(timing.cartLandingFrame, 258);
  assert.ok(scoreSamples(score).some(sample => sample.phase === 'same card in transit'));
  score.elements.find(el => el.id === status).start = 74;
  score.elements.find(el => el.id === price).end = 240;
  score.elements.find(el => el.id === cart).start = 60;
  assert.throws(() => validateScore(score, settings, productSource),
    /same fully opaque layer[\s\S]+start after the switch settles[\s\S]+morph the same card/);
});
test('native cues are tied to morph landing and toggle change, not independent timestamps',()=>{
  const score=launchScore(),cues=scoreCues(score);
  assert.equal(cues.find(c=>c.actor==='thread').frame,138);
  assert.equal(cues.find(c=>c.actor==='switch').frame,74);
  score.shapes[0].states[1].frame+=30;assert.equal(scoreCues(score).find(c=>c.actor==='thread').frame,168);
});
test('review samples include settled CTA and result after the moving control',()=>{
  const score=launchScore();
  const samples=scoreSamples(score);
  assert.equal(samples.length,6);
  assert.ok(samples.find(s=>s.id==='close-result').frame>315);
  assert.ok(samples.find(s=>s.id==='promise-result').frame>74);
  assert.ok(samples.every(s=>s.frame>=0&&s.frame<360));
  const transitions=scoreSamples(score,{includeTransitions:true});
  assert.ok(transitions.some(s=>s.phase==='camera in transit'));
  assert.ok(transitions.some(s=>s.phase==='shape in transit'));
});
test('composition audit catches a crop and crossing between clean key poses at draft resolution', () => {
  const audit = compositionAudit(1920,1080);
  const matrix = {transformPoint:({x,y})=>({x:x/2,y:y/2})};
  const layer = (id,x,y,w,h,props={}) => ({
    id, bounds:projectedBox({x,y,w,h},matrix,.5,.5), ...props,
  });
  const panel = layer('panel',100,100,700,300,{background:true});
  const label = layer('label',200,200,120,30,{content:true,parent:'panel'});
  const pill = (x,y=180) => layer('slot',x,y,160,75,{content:true});
  audit.sample(30,'handoff',[panel,label,pill(20,410)]);
  audit.sample(30.5,'handoff',[panel,label,pill(190),layer('progress',1830,85,130,30,{background:true})]);
  audit.sample(31,'handoff',[panel,label,pill(900)]);
  const {samples,issues}=audit.report();
  assert.equal(samples,3);
  assert.ok(issues.some(i=>i.code==='composition_crop'&&i.target==='progress'&&i.cropPx===40));
  assert.ok(issues.some(i=>i.code==='composition_overlap'&&i.target==='label'&&i.related==='slot'&&i.frame===30.5&&i.affectedFrames===1));
  assert.equal(issues.length,2);
});
test('a treatment locks the spiral and exact word replacements to their intended beats', () => {
  const score = kineticScore(), treatment = treatmentFor(score);
  const spiral = score.elements.find(el => el.id === 'hook');
  spiral.id = score.scenes[0].id;
  Object.assign(treatment.beats[0], {move:'spiral', text:'Диалог'});
  Object.assign(treatment.beats[1], {move:'word-swap', phrase:{before:'Мы ищем ', after:'',
    words:['предпринимателей','бухгалтеров','бизнесменов']}});
  assert.equal(validateTreatment(treatment, settings), treatment);
  assert.equal(validateTreatmentScore(validateScore(score, settings, source), treatment), score);
  const variants = score.elements.find(el => el.id === 'actionTitle').wordSwap.variants;
  [variants[1].text, variants[2].text] = [variants[2].text, variants[1].text];
  assert.throws(() => validateTreatmentScore(score, treatment), /exact phrase and ordered variants/);
  spiral.enter = 'rise';
  assert.throws(() => validateTreatmentScore(score, treatment), /planned spiral/);
});
test('word replacements hold long enough to read and are sampled and sounded at their landings', () => {
  const score = kineticScore();
  assert.equal(validateScore(score, settings, source), score);
  const cues = scoreCues(score);
  assert.ok(cues.some(cue => cue.actor === 'hook' && cue.frame === 36));
  assert.deepEqual(cues.filter(cue => cue.actor === 'actionTitle' && cue.kind === 'click').map(cue => cue.frame), [169, 206]);
  const samples = scoreSamples(score);
  assert.ok(samples.some(sample => sample.phase === 'spiral' && sample.frame < 36));
  assert.ok(samples.some(sample => sample.phase === 'word change 1' && sample.frame === 165));
  assert.ok(samples.some(sample => sample.phase === 'phrase 3' && sample.frame === 209));
  score.elements.find(el => el.id === 'actionTitle').wordSwap.variants[1].frame = 135;
  assert.throws(() => validateScore(score, settings, source), /readable frames/);
});
test('a word click targets a whole word, preserves punctuation, and starts its sound and transition together', () => {
  const score=launchScore(), actor=score.elements[0];
  const click={word:'Запись',occurrence:2,at:65,frames:18,replace:'Подтверждение'};
  Object.assign(actor,{text:'Запись: Запись!',enter:'resolve',enterFrames:10,sound:'none',wordClick:click});
  assert.deepEqual(splitClickedWord(actor.text,click),{before:'Запись: ',after:'!'});
  assert.equal(splitClickedWord('Записью',click),null);
  assert.equal(validateScore(score,settings,source),score);
  assert.deepEqual(scoreCues(score).filter(cue=>cue.actor===actor.id).map(cue=>[cue.kind,cue.frame]),[['click',65]]);
  assert.ok(scoreSamples(score).some(sample=>sample.phase==='word click' && sample.frame===65));
  assert.ok(scoreSamples(score).some(sample=>sample.phase==='word click result' && sample.frame===87));
  assert.throws(()=>validateScore({...score,elements:[{...actor,wordClick:{...click,shape:'ellipse'}},...score.elements.slice(1)]},settings,source),
    /either replace or shape/);
  assert.throws(()=>validateScore({...score,elements:[{...actor,wordClick:{...click,at:109}},...score.elements.slice(1)]},settings,source),
    /readable hold/);
});
test('a planned ring requires curved text and is sampled at two different angles', () => {
  const score = launchScore(), treatment = treatmentFor(score);
  const title = score.elements.find(el => el.id === 'hook');
  Object.assign(title, {text:'Раз в месяц',enter:'none',enterFrames:1,box:{x:90,y:48,w:1740,h:984,radius:0},
    textRing:{direction:'clockwise',speed:30,phase:-90,repeats:2,style:'outline',tracking:3}});
  Object.assign(treatment.beats[0], {move:'text-ring',text:title.text});
  assert.equal(validateTreatmentScore(validateScore(score, settings, source), treatment), score);
  const samples = scoreSamples(score).filter(sample => ['text ring', 'ring rotates'].includes(sample.phase));
  assert.equal(samples.length, 2);
  assert.ok(samples[1].frame > samples[0].frame);
  title.enter = 'spiral';
  assert.throws(() => validateScore(score, settings, source), /textRing needs ordinary text/);
  delete title.textRing;
  assert.throws(() => validateTreatmentScore(score, treatment), /planned text ring/);
});
test('typing highlights whole visible words across rows and blinks after the line settles', () => {
  const score = launchScore(), title = score.elements.find(el => el.id === 'hook');
  const lines = ['Пауза в любой', '', 'момент доступна'];
  Object.assign(title, {
    text: lines.join('\n'), align: 'left', enter: 'word-type', enterFrames: 30,
    wordType: {highlight: {text: 'в любой момент', fill: 'accent'}, caret: 'blink'},
  });
  assert.equal(validateScore(score, settings, source), score);
  const highlights = [], carets = [];
  const context = {
    measureText: text => ({width: text.length * 10}),
    beginPath() {}, fill() {}, fillText() {},
    roundRect: (x, _y, width) => highlights.push([x, width]),
    fillRect: x => carets.push(x),
  };
  const layout = makeWordType(context, title, {size: 40, lines});
  paintWordType(context, layout, title, score.palette, title.start);
  assert.equal(highlights.length, 0);
  assert.equal(carets.length, 1);
  paintWordType(context, layout, title, score.palette, title.start + 30);
  assert.deepEqual(highlights, [
    [title.box.x + 60 - layout.padding, 70 + layout.padding * 2],
    [title.box.x - layout.padding, 60 + layout.padding * 2],
  ]);
  assert.equal(carets.at(-1), title.box.x + lines.at(-1).length * 10 + 40 * .09);
  paintWordType(context, layout, title, score.palette, title.start + 45);
  assert.equal(carets.length, 2);
  title.wordType.highlight.text = 'любо';
  assert.throws(() => validateScore(score, settings, source), /consecutive whole words/);
});
test('native request enforces format, length, language and text types',()=>{
  assert.equal(validateLaunchRequest({description:'X'}).seconds,25);
  assert.equal(validateLaunchRequest({description:'X'}).pace,'dynamic');
  for(const options of [{description:[]},{description:'x',seconds:3},{description:'x',format:'__proto__'},{description:'x',language:'xxx'},{}])assert.throws(()=>validateLaunchRequest(options));
  const recipe = {description:'X', motionRecipe:'product-ui-promo'};
  assert.throws(() => validateLaunchRequest(recipe), /Product Demo/);
  assert.equal(validateLaunchRequest({...recipe,style:'product-demo'}).motionRecipe, recipe.motionRecipe);
  assert.equal(validateLaunchRequest({...recipe,motionRecipe:'kinetic-typography'}).motionRecipe, 'kinetic-typography');
  assert.equal(validateLaunchRequest({...recipe,motionRecipe:'explainers-data-viz'}).motionRecipe, 'explainers-data-viz');
  assert.throws(() => validateLaunchRequest({...recipe,motionRecipe:'__proto__'}), /Неизвестный рецепт/);
});
test('dynamic pace rejects a three-scene plan without rolls while calm still accepts it', () => {
  const score=launchScore();
  assert.equal(validateScore(score,{...settings,pace:'calm'},source),score);
  assert.throws(() => validateScore(score,{...settings,pace:'dynamic'},source),error =>
    ['distinct scenes','two visible object rolls'].every(phrase=>error.message.includes(phrase)));
});

test('a rolling shape interpolates rotation and visibility, then carries both across a hold', () => {
  const box={x:100,y:120,w:180,h:100,radius:24};
  const track=shapeTrack([
    {frame:0,duration:1,box,rotate:-90,opacity:0},
    {frame:10,duration:20,box:{...box,x:340},rotate:0,opacity:100},
    {frame:40,duration:10,box:{...box,x:340,w:280}},
  ]);
  assert.deepEqual(shapePoseAt(track,20),{box:{...box,x:220},rotate:-45,opacity:50});
  assert.deepEqual(shapePoseAt(track,35),{box:{...box,x:340},rotate:0,opacity:100});
  assert.deepEqual(shapePoseAt(track,50),{box:{...box,x:340,w:280},rotate:0,opacity:100});
  assert.ok(rollEntrance(box,.2,'left').x < 0 && rollEntrance(box,.2,'right').rotate > 0);
  assert.equal(rollEntrance(box,1,'left').rotate,0);
});
test('a traced route ends at the matching point on its authored curve', () => {
  const curve=[{x:0,y:0},{x:0,y:1000},{x:1000,y:1000},{x:1000,y:0}];
  assert.deepEqual(cubicPrefix(curve,.5).at(-1),{x:500,y:750});
  assert.deepEqual(cubicPrefix(curve,1),curve);
});
async function workspace(t){const dir=await mkdtemp(path.join(os.tmpdir(),'kadr-launch-test-'));t.after(()=>rm(dir,{recursive:true,force:true}));return dir;}
const services={runtime:()=>{},render:async(_s,_source,dir)=>({video:path.join(dir,'video.mp4'),issues:[]}),inspect:async()=>({ok:true,issues:[]})};
test('the object recipe compiles the same continuous carrier from director copy and manual copy', async t => {
  const runsDir = await workspace(t);
  const objectStory = {brand:'Лапа',hook:'Корм по подписке',route:'Раз в месяц',
    steps:['Месяц 01','Месяц 02','Месяц 03'],benefit:'0 ₼',qualifier:'Доставка по подписке на корм'};
  const options = {runsDir,seconds:15,motionRecipe:'object-transform',services,visualReview:false};
  const manual = await generateNativeLaunch({...options,runId:'manual',directionMode:'manual',objectStory,visualReview:true,
    requestStage:()=>assert.fail('manual staging called the model')});
  let calls = 0;
  const directed = await generateNativeLaunch({...options,runId:'directed',description:'Корм по подписке. Доставка по подписке на корм бесплатная.',
    requestStage:async ({name})=>{
      assert.equal(name,'object_story');
      calls++;
      return {output:{...objectStory,evidenceId:'D1'}};
    }});
  assert.equal(calls,1);
  assert.equal(manual.report.directionSource,'manual');
  for (const run of [manual,directed]) {
    assert.equal(run.ok,true,run.report.error?.message);
    const score = JSON.parse(await readFile(path.join(run.dir,'launch-score.json'),'utf8'));
    const actors = score.elements.filter(actor=>actor.kind==='transform');
    assert.equal(actors.length,1);
    const [carrier] = actors;
    const [,,benefit,brand] = score.scenes;
    assert.equal(benefit.link.anchor,carrier.id);
    assert.equal(brand.link.anchor,carrier.id);
    assert.ok(transformPose(carrier.formTrack,benefit.start).depth > 0);
    assert.ok(transformPose(carrier.formTrack,brand.start).logo > 0);
    assert.equal(transformPose(carrier.formTrack,449).logo,1);
    const benefitText = score.elements.find(actor=>actor.id==='benefit');
    const qualifier = score.elements.find(actor=>actor.id==='qualifier');
    assert.equal(benefitText.start,qualifier.start);
    assert.equal(benefitText.enterFrames,qualifier.enterFrames);
    assert.ok(benefitText.end - qualifier.start - qualifier.enterFrames >= 60);
    assert.ok(score.elements.find(actor=>actor.id==='route-heading').end > benefit.start);
  }
});
test('the dynamic object demo carries the photographed subject through the interaction and leaves a stable price hold', () => {
  const photo = {id:'brand-12345678901234567890',kind:'screenshot',role:'product-photo',evidenceId:'item'};
  const product = {assets:[photo],evidence:[{id:'item'},{id:'offer'}]};
  const story = {brand:'Лапа',hook:'Корм приезжает сам',route:'Раз в месяц',steps:['Подписка','Доставка','Повтор'],
    benefit:'0 ₼',qualifier:'Доставка по подписке на корм',evidenceId:'offer',demo:{
      lead:'Корм',subline:'по подписке',context:'Доставка по Баку',actionTitle:'Выберите корм',actionHint:'Включите подписку',
      control:'Подписка',state:'Выбрано раз в месяц',productName:'VIDA Nativa',productDetail:'Корм для кошек · 2 кг',
      benefitTitle:'Доставка',cta:'Открыть магазин',assetId:photo.id,actionEvidenceId:'offer',
    }};
  const score = compileObjectStory(story,{...settings,frames:450,style:'saas-launch',pace:'dynamic',motionRecipe:'object-transform'},product);
  const [hook,interaction,route] = score.scenes;
  const image = score.elements.find(actor=>actor.kind==='image');
  const toggle = score.elements.find(actor=>actor.kind==='toggle');
  const click = score.elements.find(actor=>actor.clickAt!==undefined);
  assert.equal(image.start,hook.start);
  assert.equal(image.end,interaction.end);
  assert.equal(image.attachTo,interaction.link.anchor);
  assert.ok(score.camera.some(key=>key.target===toggle.id && key.zoom>100));
  assert.equal(click.clickAt,toggle.changeAt);
  assert.equal(route.transition.kind,'portal');
  assert.ok(route.start>click.clickAt);
  assert.ok(score.elements.some(actor=>actor.enter==='kinetic-stretch'));
  assert.ok(score.elements.some(actor=>actor.enter==='draw' && actor.kind==='stroke'));
  assert.equal(score.shapeSounds,true);
  assert.deepEqual(score.elements.map(actor=>actor.text).filter(value=>/\d/u.test(value??'')), ['Корм для кошек · 2 кг','0 ₼']);
  const carrier=score.elements.find(actor=>actor.kind==='transform');
  const hold=carrier.formTrack.keys.filter(key=>key.form==='box').slice(-2);
  const price=score.elements.find(actor=>actor.text==='0 ₼');
  assert.ok(price.start<=hold[0].frame && price.end>hold[1].frame);
  assert.ok(hold[1].frame-hold[0].frame>=60);
  assert.ok(transformPose(carrier.formTrack,route.end).depth>0);
  assert.equal(transformPose(carrier.formTrack,449).logo,1);
});
const requestStage=async({name})=>({output:name==='launch_review'?{verdict:'pass',issues:[]}:name==='launch_treatment'?treatmentFor():launchScore()});
test('connected calendar keeps the same source image through the flood and labels the recurring event once', () => {
  const photo = {id:'brand-12345678901234567890',kind:'screenshot',role:'product-photo',evidenceId:'D2'};
  const product = {...source,assets:[photo],evidence:[...source.evidence,{id:'D2',text:'Фото корма'}]};
  const story = {
    hook:'Корм приедет сам',subject:'Корм для кошек',action:'Оформить подписку',confirmation:'Подписка оформлена',
    result:'Календарь доставок',explanation:'Пример графика · раз в месяц',causalLink:'Подписка открывает график.',
    mark:'calendar',actionEvidenceId:'D1',resultEvidenceId:'D1',assetId:photo.id,repeatDetail:'Доставка корма',
    outcomes:[{label:'Подписка'},{label:'Доставка'},{label:'Повтор'}],
  };
  for (const [width,height] of [[1920,1080],[1080,1920],[1080,1080]]) {
    const score = compileConnectedStory(story,{...settings,width,height,style:'saas-launch',pace:'calm'},product);
    const [image,...duplicates] = score.elements.filter(element=>element.assetId===photo.id);
    const result = score.scenes.at(-1);
    assert.equal(duplicates.length,0);
    assert.equal(image.start,0);
    assert.equal(image.end,score.frames);
    const [docked,hold] = image.motion.slice(-3,-1);
    assert.ok(docked.frame < result.start - result.flood.frames && hold.frame > result.start);
    for (const field of ['x','y','scale']) assert.equal(docked[field],hold[field]);
    assert.ok(image.evidenceIds.includes(photo.evidenceId));
    assert.equal(score.elements.find(element=>element.id==='result-subject').text,story.subject);
    assert.equal(score.elements.filter(element=>element.text===story.repeatDetail).length,1);
    assert.equal(score.elements.filter(element=>element.kind==='stroke').length,2);
    assert.ok(score.elements.find(element=>element.id==='outcome-0').start < result.start+result.flood.revealFrames);
  }
});

test('connected preset compiles a brief to one marker and recompiles the saved story without the model',async t=>{
  const runsDir=await workspace(t);
  const story={
    brand:'Forma',hook:'Запись без звонка',subject:'Ближайшее время',action:'Выбрать время',
    confirmation:'Время выбрано',result:'Детали записи',explanation:'Подтверждение выбранного времени',
    causalLink:'Выбор времени создаёт запись, которую показывает календарная метка.',mark:'calendar',
    actionEvidenceId:'D1',resultEvidenceId:'D1',outcomes:[{label:'Время выбрано'}],
  };
  const brief='Выберите время и покажите, где его увидеть после подтверждения';
  const options={runsDir,runId:'connected-booking',services:{...services,audit:async()=>({issues:[]})}};
  const stages=[];
  const result=await generateNativeLaunch({...options,description:source.evidence[0].text,brief,seconds:12,
    motionRecipe:'connected-story',visualReview:false,requestStage:async ({name,input})=>{
      stages.push(name);
      assert.equal(input.brief,brief);
      return {output:story};
    }});
  assert.equal(result.ok,true,result.report.error?.message);
  assert.deepEqual(stages,['connected_story']);
  assert.equal(result.report.artifacts.treatment,'connected-story.json');
  const readScore=async dir=>JSON.parse(await readFile(path.join(result.dir,dir),'utf8'));
  const score=await readScore(result.report.artifacts.score);
  const {flood}=score.scenes.at(-1);
  const initial=score.elements.find(element=>element.id==='marker-on-control');
  const solid=score.elements.find(element=>element.kind==='volume');
  const landed=score.elements.find(element=>element.id==='result-marker');
  assert.equal(initial.attachTo,flood.target);
  assert.equal(landed.attachTo,flood.target);
  assert.equal(initial.icon,solid.mesh.mark);
  assert.equal(landed.icon,flood.mark);
  assert.equal(flood.land,true);
  assert.equal(score.elements[0].enter,'kinetic-stretch');
  assert.ok(score.shapes.find(shape=>shape.id===flood.target).states.length>3);
  const portrait=await generateNativeLaunch({...options,resume:true,renderOnly:true,exportFormat:'portrait',
    requestStage:()=>assert.fail('saved connected story requested a model')});
  assert.equal(portrait.ok,true,portrait.report.error?.message);
  const portraitScore=await readScore(portrait.report.artifacts.score);
  assert.equal(portraitScore.width,1080);
  assert.equal(portraitScore.scenes.at(-1).flood.target,flood.target);
});

test('continuous morph carries one opaque control into the result badge and survives reformatting', async t => {
  const runsDir = await workspace(t);
  const options = {runsDir,runId:'morph-booking',services:{...services,audit:async()=>({issues:[]})}};
  const story = {
    brand:'Forma',hook:'Запись без звонка',subject:'Ближайшее время',action:'Выбрать время',
    confirmation:'Время выбрано',result:'Детали записи',explanation:'Подтверждение выбранного времени',
    causalLink:'Выбор времени создаёт запись и открывает её детали.',mark:'calendar',
    actionEvidenceId:'D1',resultEvidenceId:'D1',outcomes:[{label:'Запись подтверждена'}],
  };
  const result = await generateNativeLaunch({...options,description:source.evidence[0].text,seconds:12,
    motionRecipe:'continuous-morph',visualReview:false,requestStage:async ({name,prompt}) => {
      assert.equal(name,'connected_story');
      assert.match(prompt,/contracts into a dot/);
      return {output:story};
    }});
  assert.equal(result.ok,true,result.report.error?.message);
  assert.equal(result.report.credits[0].author,'Ishu Agrawal');
  const readScore = run => readFile(path.join(run.dir,run.report.artifacts.score),'utf8').then(JSON.parse);
  const assertMorph = score => {
    const button = score.elements.find(element => element.id === 'action-label');
    const badge = score.elements.find(element => element.id === 'result-marker');
    const carrier = score.shapes.find(shape => shape.id === button.attachTo);
    assert.equal(badge.attachTo,carrier.id);
    assert.deepEqual(carrier.states.map(state => state.contour ?? 'roundRect'),
      ['roundRect','roundRect','roundRect','ellipse','burst','burst','roundRect']);
    assert.ok(carrier.states.every(state => (state.opacity ?? 100) === 100));
    assert.ok(score.scenes.every(scene => !scene.flood && scene.groundStyle === score.scenes[0].groundStyle));
  };
  assertMorph(await readScore(result));
  const portrait = await generateNativeLaunch({...options,resume:true,renderOnly:true,exportFormat:'portrait',
    requestStage:()=>assert.fail('saved morph requested a model')});
  assert.equal(portrait.ok,true,portrait.report.error?.message);
  const score = await readScore(portrait);
  assert.equal(score.height,1920);
  assertMorph(score);
});

test('native lifecycle persists score and provenance; render-only resume makes no model call',async t=>{
  const runsDir=await workspace(t);
  const result=await generateLaunch({runsDir,runId:'one',description:source.evidence[0].text,seconds:12,pace:'calm',services,requestStage});
  assert.equal(result.ok,true);assert.equal(result.report.renderer,'kadr-launch');
  const saved=JSON.parse(await readFile(path.join(result.dir,'launch-score.json')));assert.equal(saved.brand,'Forma');
  const treatment=JSON.parse(await readFile(path.join(result.dir,result.report.artifacts.treatment)));
  assert.equal(treatment.selected,'continuous');
  const resumed=await generateLaunch({runsDir,runId:'one',resume:true,renderOnly:true,services,requestStage:()=>{throw Error('No model allowed');}});
  assert.equal(resumed.ok,true);await assert.rejects(access(path.join(result.dir,'.lock')));
});
test('native lifecycle validates and retries model output, then repairs a draft before final export',async t=>{
  const runsDir=await workspace(t);let calls=0,revisions=0,inspections=0,renders=0;
  const result=await generateLaunch({runsDir,runId:'repair',description:source.evidence[0].text,seconds:12,pace:'calm',
    requestStage:async({name,input,model})=>{
      assert.equal(model,name==='launch_treatment'?CONFIG.model:CONFIG.launchBuildModel);
      if(name==='launch_revision'){
        revisions++;
        return {output:{actors:[{id:'hook',fontSize:112}]}};
      }
      if(name!=='launch_score')return requestStage({name});
      assert.equal(input.treatment.direction.id,'continuous');
      calls++;
      const score=launchScore();
      if(calls===1)score.frames=361;
      return {output:score};
    },
    services:{...services,render:async(...args)=>{renders++;return services.render(...args);},inspect:async()=>++inspections===1?{ok:false,issues:[{code:'text_too_small'}]}:{ok:true,issues:[]}}});
  assert.equal(result.ok,true);assert.equal(calls,2);assert.equal(revisions,1);assert.equal(renders,3);
});

test('resuming reuses an identical visual review and cannot reset the spent budget',async t=>{
  const runsDir=await workspace(t);
  const args={runsDir,runId:'budget',description:source.evidence[0].text,seconds:12,pace:'calm',budgetUSD:.25};
  let image='same sampled frames';
  const inspect=async(_rendered,_score,dir)=>{
    await writeFile(path.join(dir,'contact-sheet.jpg'),image);
    return {ok:true,issues:[]};
  };
  const first=await generateLaunch({...args,services:{...services,inspect},requestStage:async request=>({
    ...await requestStage(request),model:request.model,usage:{input_tokens:1000,output_tokens:500},
  })});
  assert.equal(first.ok,true);
  assert.equal(first.report.cost.calls,3);
  assert.ok(first.report.cost.usd>0);

  let paid=0;
  const resume={runsDir,runId:'budget',resume:true,services:{...services,inspect},
    requestStage:async request=>{paid++;return requestStage(request);}};
  const same=await generateLaunch(resume);
  assert.equal(same.ok,true);
  assert.equal(same.report.cost.budgetUSD,.25);
  assert.equal(same.report.cost.usd,first.report.cost.usd);
  assert.equal(paid,0);

  image='changed sampled frames';
  const ledgerFile=path.join(first.dir,'cost.json');
  const ledger=JSON.parse(await readFile(ledgerFile,'utf8'));
  ledger.perCall.push({model:CONFIG.launchBuildModel,input:0,output:0,cacheRead:0,cacheWrite:0,usd:.25-ledger.usd});
  await writeFile(ledgerFile,JSON.stringify(ledger));
  const exhausted=await generateLaunch(resume);
  assert.equal(exhausted.report.status,'needs_revision');
  assert.match(exhausted.report.error.message,/Бюджета недостаточно/);
  assert.equal(exhausted.report.cost.budgetUSD,.25);
  assert.equal(exhausted.report.cost.usd,.25);
  assert.equal(paid,0);
});

test('a response cut off by the token limit is recorded once and is not replayed',async t=>{
  const runsDir=await workspace(t);
  let scoreCalls=0;
  const result=await generateLaunch({runsDir,runId:'truncated',description:source.evidence[0].text,seconds:12,pace:'calm',
    services,requestStage:async args=>{
      if(args.name!=='launch_score')return requestStage(args);
      scoreCalls++;
      return {output:null,stopReason:'max_tokens',model:args.model,usage:{input_tokens:1000,output_tokens:1000}};
    },
  });
  assert.equal(result.ok,false);
  assert.match(result.report.error.message,/max_tokens/);
  assert.equal(result.report.cost.calls,1);
  assert.equal(scoreCalls,1);
});
test('a limited-budget repair changes only the requested actor and keeps the saved plan', async t => {
  const runsDir = await workspace(t);
  let inspections = 0, revisions = 0;
  const result = await generateLaunch({runsDir, runId:'focused', description:source.evidence[0].text, seconds:12, pace:'calm', budgetUSD:.25,
    requestStage: async ({name}) => {
      if (name !== 'launch_revision') return requestStage({name});
      revisions++;
      return {output:{actors:[{id:'hook',box:{x:300},fontSize:88}]}};
    },
    services:{...services, inspect:async () => ++inspections === 1
      ? {ok:false,issues:[{code:'text_outside_camera',target:'hook'}]} : {ok:true,issues:[]}},
  });
  assert.equal(result.ok, true);
  assert.equal(revisions, 1);
  const final = JSON.parse(await readFile(path.join(result.dir, 'launch-score.json')));
  const initial = launchScore();
  assert.equal(final.elements[0].fontSize, 88);
  assert.equal(final.elements[0].box.x, 300);
  assert.equal(final.elements[0].box.w, initial.elements[0].box.w);
  assert.deepEqual(final.elements.slice(1), initial.elements.slice(1));
  assert.deepEqual(final.scenes, initial.scenes);
});
test('a composition finding sends evidence to a focused repair and blocks full rendering until cleared', async t => {
  const runsDir = await workspace(t);
  const stages=[];
  let inspections=0, revisions=0;
  const result=await generateLaunch({runsDir,runId:'composition',description:source.evidence[0].text,seconds:12,pace:'calm',
    onEvent:e=>{if(e.type==='stage')stages.push(e.name);},
    requestStage:async args=>{
      if(args.name!=='launch_revision')return requestStage(args);
      revisions++;
      assert.match(args.imagePaths[0],/draft-.+\/composition-sheet\.jpg$/);
      assert.match(args.feedback[0],/composition_crop/);
      return {output:{actors:[{id:'hook',box:{x:300}}]}};
    },
    services:{...services,inspect:async()=>++inspections===1?{
      ok:false,issues:[{code:'composition_crop',target:'hook',frame:54.5}],
      composition:{contactSheet:'composition-sheet.jpg'},
    }:{ok:true,issues:[]}},
  });
  assert.equal(result.ok,true);
  assert.equal(revisions,1);
  assert.deepEqual(stages.slice(-7),['draft-inspect','repair','draft','draft-inspect','visual-review','render','inspect']);
});

test('an unavailable visual review leaves a draft and does not start the final render', async t => {
  const runsDir=await workspace(t);
  const stages=[];
  const result=await generateLaunch({runsDir,runId:'review-failure',description:source.evidence[0].text,seconds:12,pace:'calm',
    services,onEvent:e=>stages.push(e.name),requestStage:args=>args.name==='launch_review'?{output:null}:requestStage(args),
  });
  assert.equal(result.report.status,'needs_revision');
  assert.equal(result.report.quality.artistic,'review_unavailable');
  assert.match(result.report.draft,/^draft-/);
  assert.ok(!stages.includes('render'));
});
test('native cancellation releases lock and does not report video completed',async t=>{
  const runsDir=await workspace(t),controller=new AbortController();
  const result=await generateLaunch({runsDir,runId:'cancel',description:source.evidence[0].text,seconds:12,pace:'calm',signal:controller.signal,requestStage,
    services:{...services,render:async()=>{controller.abort(new Error('cancelled'));throw controller.signal.reason;}}});
  assert.equal(result.ok,false);assert.equal(result.report.status,'cancelled');assert.equal(result.report.video,undefined);
  await assert.rejects(access(path.join(result.dir,'.lock')));
});
test('native resume refuses another renderer and run path traversal',async t=>{
  const runsDir=await workspace(t);
  await assert.rejects(generateLaunch({runsDir,runId:'../escape',description:'description',services}),/ID/);
});

test('a recorded shop demo builds and resumes without a model even with visual review enabled', async t => {
  const runsDir = await workspace(t);
  const runId = 'recorded-shop';
  const dir = path.join(runsDir, runId);
  await mkdir(dir);
  const photoAssetId = 'brand-01234567890123456789';
  const productFlow = {
    provenance: 'recorded-public-shop', ids: {...PRODUCT_FLOW_IDS, name: 'product-name'}, photoAssetId,
    name: 'VIDA Nativa, 2 кг', price: '24 ₼', labels: {status: 'Подписка выбрана', cart: 'Корзина'},
    shelfEvidenceId: 'SHELF', cartEvidenceId: 'CART',
  };
  const input = {engine: 'kadr-launch', directionMode: 'semantic', style: 'product-demo',
    description: 'Товар и подписка', seconds: 12, visualReview: true, budgetUSD: .6,
    motionRecipe: 'product-ui-promo'};
  const recordedSource = {...source, productFlow,
    evidence: [{id: 'SHELF', text: productFlow.name}, {id: 'CART', text: productFlow.price}],
    assets: [{kind: 'screenshot', id: photoAssetId}],
  };
  for (const [name, value] of Object.entries({request: input, report: {}, source: recordedSource})) {
    await writeFile(path.join(dir, `${name}.json`), JSON.stringify(value));
  }
  const args = {runsDir, runId, resume: true, services: {...services, audit: async () => ({issues: []})},
    requestStage: () => assert.fail('the recorded demo requested a model')};
  const first = await generateNativeLaunch(args);
  assert.equal(first.ok, true, first.report.error?.message);
  const score = JSON.parse(await readFile(path.join(dir, 'launch-score.json'), 'utf8'));
  const timing = productFlowMilestones(score, productFlow);
  assert.ok(timing.switchSettledFrame < timing.statusFrame && timing.statusSettledFrame < timing.handoffFrame);
  assert.deepEqual(score.elements.flatMap(element => element.text ?? []),
    [productFlow.name, productFlow.price, productFlow.labels.status, productFlow.labels.cart]);
  assert.equal(first.report.cost.calls, 0);
  assert.equal(first.report.directionSource, 'recorded-product');
  assert.equal(first.report.motionRecipe, input.motionRecipe);
  assert.equal(first.report.credits[0].author, 'HiAPIAI');
  assert.equal(score.shapes[0].states.at(-1).ease, 'fluid');
  const kinetic = {...settings, style:'product-demo', pace:'dynamic', motionRecipe:'kinetic-typography', language:'en'};
  const treatment = recordedProductTreatment(recordedSource, kinetic);
  const typed = compileLaunch(treatment, kinetic, recordedSource);
  const [heading] = typed.elements.filter(element => element.text === 'Subscription');
  assert.equal(heading.attachTo, productFlow.ids.card);
  assert.equal(heading.enter, 'word-lift');
  assert.ok(heading.motion.at(-2).frame < typed.scenes[1].start);
  assert.ok(heading.motion.at(-1).frame > typed.scenes[1].start);
  assert.ok(heading.motion.at(-1).scale < heading.motion[0].scale);
  assert.deepEqual(productFlowMilestones(typed, productFlow), timing);
  const explainer = {...kinetic, motionRecipe:'explainers-data-viz', language:'ru'};
  const compile = source => compileLaunch(recordedProductTreatment(source, explainer), explainer, source);
  assert.ok(!compile(recordedSource).shapes.some(shape => shape.id === 'delivery-calendar'));
  const monthlySource = {...recordedSource, evidence:[...recordedSource.evidence,
    {id:'MONTHLY', source:'https://lapa.az/', text:'Корм доставляют раз в месяц.'}]};
  const explained = compile(monthlySource);
  const calendar = explained.shapes.find(shape => shape.id === 'delivery-calendar');
  assert.equal(calendar.states[0].opacity, 0);
  const milestones = productFlowMilestones(explained, productFlow);
  assert.ok(calendar.states[1].frame > milestones.statusSettledFrame);
  const stops = explained.elements.filter(element => element.id.startsWith('calendar-icon-'));
  assert.equal(stops.length, 3);
  assert.ok(explained.elements.some(element => element.text === 'Пример графика · раз в месяц'));
  assert.ok(!explained.elements.some(element => /^Месяц \d/u.test(element.text ?? '')));
  assert.ok(stops.every((stop, i) => stop.evidenceIds.includes('MONTHLY') &&
    stop.start > (stops[i - 1]?.start ?? calendar.states[1].frame) &&
    stop.end === explained.frames && stop.end - stop.start - stop.enterFrames >= 30));
  const resumed = await generateNativeLaunch(args);
  assert.equal(resumed.ok, true, resumed.report.error?.message);
  assert.equal(resumed.report.cost.calls, 0);
  assert.deepEqual(JSON.parse(await readFile(path.join(dir, 'launch-score.json'), 'utf8')), score);
});

test('KADR builds a film from one direction and recomposes portrait export without calling the model', async t => {
  const runsDir = await workspace(t);
  const direction = treatmentFor();
  direction.brand = 'Forma';
  direction.beats = direction.beats.map(({frames, ...beat}, index) => ({
    ...beat, text: ['Время для записи', 'Выберите время', 'Запись подтверждена'][index],
    move: ['word-type', 'interface', 'word-lift'][index],
    visual: {scene: ['hero', 'input', 'brand'][index],
      ...(index === 1 && {label: 'Вторник, 11:30', action: 'Записаться'}), evidenceId: 'D1'},
  }));
  const calls = [];
  const result = await generateNativeLaunch({
    runsDir, runId: 'compiled', description: source.evidence[0].text, seconds: 12, pace: 'calm',
    visualReview: false, services, requestStage: async ({name}) => {
      calls.push(name);
      return {output: direction, usage: {input_tokens: 1000, output_tokens: 700}};
    },
  });
  assert.equal(result.ok, true);
  assert.deepEqual(calls, ['launch_treatment']);
  const original = await readFile(path.join(result.dir, 'launch-score.json'), 'utf8');
  const portrait = await generateNativeLaunch({
    runsDir, runId: result.runId, resume: true, renderOnly: true, exportFormat: 'portrait', services,
    requestStage: () => assert.fail('re-export called the model'),
  });
  assert.equal(portrait.ok, true);
  assert.equal(portrait.report.cost.calls, result.report.cost.calls);
  assert.equal(await readFile(path.join(result.dir, 'launch-score.json'), 'utf8'), original);
  const reframed = JSON.parse(await readFile(path.join(portrait.dir, portrait.report.artifacts.score), 'utf8'));
  assert.deepEqual([reframed.width, reframed.height], [1080, 1920]);
  const copy = score => score.elements.filter(element => element.text).map(element => element.text);
  assert.deepEqual(copy(reframed), copy(JSON.parse(original)));
  assert.deepEqual(reframed.scenes.map(scene => [scene.start, scene.end]),
    JSON.parse(original).scenes.map(scene => [scene.start, scene.end]));
  assert.equal(reframed.staging, 'scenes');
  assert.ok(reframed.elements.some(element => element.kind === 'pill' && element.text === 'Записаться'));
});

test('the ordinary KADR director compiles both word click outcomes and keeps them when reframing', async t => {
  const runsDir=await workspace(t);
  const direction=treatmentFor();
  direction.brand='Forma';
  const clicks=[{word:'Запись',replace:'Бронь'},{word:'Время',shape:'ellipse',mark:'calendar'}];
  const copy=['Запись онлайн','Время записи','Выберите время'];
  direction.beats=direction.beats.map(({frames,...beat},index)=>({
    ...beat,text:copy[index],move:index===2 ? 'type' : 'word-click',
    visual:{scene:['hero','feature','brand'][index],evidenceId:'D1',
      ...(index===1 && {label:'Онлайн-запись'}),...(clicks[index] && {wordClick:clicks[index]})},
  }));
  const args={runsDir,runId:'words',description:source.evidence[0].text,seconds:12,pace:'calm',visualReview:false,services};
  const run=await generateNativeLaunch({...args,requestStage:async ({name})=>{
    assert.equal(name,'launch_treatment');
    return {output:direction};
  }});
  assert.equal(run.ok,true,run.report.error?.message);
  const getScore=async run=>JSON.parse(await readFile(path.join(run.dir,run.report.artifacts.score),'utf8'));
  const score=await getScore(run);
  const wordActors=score=>score.elements.filter(el=>el.wordClick).map(el=>({text:el.text,...el.wordClick}));
  const actors=wordActors(score);
  assert.deepEqual(actors.map(({at,frames,text,...click})=>click),clicks);
  assert.deepEqual(actors.map(el=>el.text),copy.slice(0,2));
  assert.equal(score.elements.find(el=>el.id==='click-result-1').start,actors[1].at+actors[1].frames+1);
  const portrait=await generateNativeLaunch({...args,resume:true,renderOnly:true,exportFormat:'portrait',
    requestStage:()=>assert.fail('reframing a word click should use the saved direction')});
  assert.equal(portrait.ok,true,portrait.report.error?.message);
  const reframed=await getScore(portrait);
  assert.equal(reframed.height,1920);
  assert.deepEqual(wordActors(reframed),actors);
});

test('preflight fixes a misplaced tracking camera before any video is encoded', async t => {
  const runsDir = await workspace(t);
  const score = launchScore();
  score.camera[0].target = 'thread';
  const stages = [];
  const result = await generateLaunch({
    runsDir, runId: 'camera-offset', description: source.evidence[0].text, seconds: 12, pace: 'calm',
    visualReview: false, requestStage: args => args.name === 'launch_score' ? {output: score} : requestStage(args),
    onEvent: event => { if (event.type === 'stage') stages.push(event.name); },
    services: {...services, audit: async candidate => ({
      issues: candidate.camera[0].x === 0 ? [] : [{code: 'composition_crop', target: 'thread', frame: 0, cropPx: 700}],
    }), render: async (candidate, ...args) => {
      assert.deepEqual(candidate.camera[0], {...score.camera[0], x: 0, y: 0});
      return services.render(candidate, ...args);
    }},
  });
  assert.equal(result.ok, true);
  assert.deepEqual(stages.slice(-3), ['preflight', 'render', 'inspect']);
  assert.deepEqual(result.report.preflight[0].accepted, ['camera_target_offset']);
  assert.deepEqual(result.report.preflight[0].remaining, []);
});

test('a rejected artistic patch cannot spend another repair after resume', async t => {
  const runsDir = await workspace(t);
  const calls = [];
  const request = async args => {
    calls.push(args.name);
    if (args.name === 'launch_review') return {output: {verdict: 'revise', issues: ['Increase contrast in promise.']}};
    if (args.name === 'launch_revision') return {output: {actors: [{id: 'hook', fontSize: 110}]}};
    return requestStage(args);
  };
  const deps = {...services, inspect: async (_render, _score, dir) => {
    await writeFile(path.join(dir, 'contact-sheet.jpg'), 'stable review sheet');
    return {ok: true, issues: []};
  }};
  const result = await generateLaunch({runsDir, runId: 'review-limit', description: source.evidence[0].text,
    seconds: 12, pace: 'calm', services: deps, requestStage: request});
  assert.equal(result.report.status, 'needs_revision');
  assert.equal(result.report.modelAttempts['launch-revision'], 1);
  const resumed = await generateLaunch({runsDir, runId: result.runId, resume: true, services: deps, requestStage: request});
  assert.equal(resumed.report.status, 'needs_revision');
  assert.equal(calls.filter(name => name === 'launch_revision').length, 1);
  assert.equal(calls.filter(name => name === 'launch_review').length, 2);
});

test('a scene film answers review notes with a revised treatment and is still exported', async t => {
  const runsDir = await workspace(t);
  const plan = line => {
    const direction = treatmentFor();
    direction.brand = 'Forma';
    direction.beats = direction.beats.map(({frames, ...beat}, index) => ({
      ...beat, text: ['Время для записи', line, 'Запись подтверждена'][index],
      move: ['word-type', 'interface', 'word-lift'][index],
      visual: {scene: ['hero', 'input', 'brand'][index],
        ...(index === 1 && {label: 'Вторник, 11:30', action: 'Записаться'}), evidenceId: 'D1'},
    }));
    return direction;
  };
  const calls = [];
  const result = await generateNativeLaunch({
    runsDir, runId: 'scene-review', description: source.evidence[0].text, seconds: 12, pace: 'calm', services,
    requestStage: async args => {
      calls.push(args.name + (args.input?.previous ? ':revision' : ''));
      if (args.name === 'launch_review') return {output: {verdict: 'revise', issues: ['[action] Say what is being chosen.']}};
      const output = plan(args.input?.previous ? 'Выберите удобное время' : 'Выберите время');
      if (args.input?.previous) {
        assert.deepEqual(args.input.editableBeats, ['action']);
        output.beats[0].text = 'Посторонняя правка';
      }
      return {output};
    },
  });
  assert.equal(result.ok, true);
  assert.equal(result.report.status, 'completed');
  assert.deepEqual(calls, ['launch_treatment', 'launch_review', 'launch_treatment:revision', 'launch_review']);
  assert.equal(result.report.quality.artistic, 'review_notes_remaining');
  assert.deepEqual(result.report.reviewNotes, ['[action] Say what is being chosen.']);
  const saved = JSON.parse(await readFile(path.join(result.dir, 'launch-score.json'), 'utf8'));
  assert.ok(saved.elements.some(element => element.text === 'Выберите удобное время'));
  assert.ok(saved.elements.some(element => element.text === 'Время для записи'));
  const planFile = JSON.parse(await readFile(path.join(result.dir, result.report.artifacts.directionPlan), 'utf8'));
  assert.deepEqual(planFile.scenes.map(scene => scene.frames), saved.scenes.map(({start, end}) => [start, end]));
});

test('scene films join scenes with anchored transitions and validate them', () => {
  const settings = {style: 'saas-launch', width: 1080, height: 1920, fps: 30, frames: 420, pace: 'calm'};
  const plan = treatmentFor();
  plan.brand = 'Forma';
  const frames = [90, 150, 180];
  plan.beats = plan.beats.map((beat, index) => ({
    ...beat, frames: frames[index], text: ['Время для записи', 'Выберите время', 'Запись подтверждена'][index],
    move: ['word-lift', 'interface', 'word-lift'][index],
    visual: {scene: ['hero', 'input', 'brand'][index],
      ...(index === 1 && {label: 'Вторник, 11:30', action: 'Записаться'}), evidenceId: 'D1'},
  }));
  const score = compileLaunch(plan, settings, source);
  const [, input, brand] = score.scenes;
  // Both scenes have their own text, so there is no shared object to match and no synthetic dot is added.
  assert.equal(input.link.kind, 'wipe');
  assert.equal(input.transition.kind, 'wipe');
  assert.equal(score.elements.find(element => element.id === 'dot-0'), undefined);
  // The field is not left behind: the same surface travels into the close and becomes the rule under the name.
  assert.equal(brand.link.kind, 'carry');
  assert.equal(brand.transition, undefined);
  const mark = score.elements.find(element => element.id === 'sent-mark-1');
  const bar = score.shapes[0].states.find(state => state.frame === input.start + 2).box;
  const rule = score.shapes[0].states.find(state => state.frame === brand.start);
  assert.equal(rule.box.w, Math.round(settings.width * .14));
  assert.ok(rule.box.h < bar.h / 8 && (rule.opacity ?? 100) === 100);
  assert.ok(score.elements.filter(element => element.end === input.start).every(element => element.exit === 'cut'));
  assert.ok(scoreCues(score).some(cue => cue.kind === 'whoosh' && cue.frame > brand.start && cue.frame <= brand.start + 30));

  const hard = structuredClone(plan);
  hard.beats[1].visual.transition = 'cut';
  assert.equal(compileLaunch(hard, settings, source).scenes[1].transition, undefined);

  const opened = structuredClone(plan);
  opened.beats[2].visual.link = 'portal';
  const broken = compileLaunch(opened, settings, source);
  assert.equal(broken.scenes[2].transition.x, Math.round(bar.x + mark.box.x + mark.box.w / 2));
  delete broken.scenes[2].transition.x;
  assert.throws(() => validateScore(broken, settings, source), /portal needs its centre/);
});

test('each art direction compiles a valid scene film with its own look', async () => {
  const {ART_DIRECTIONS} = await import('../src/kadr-launch/art-direction.js');
  const plan = treatmentFor();
  plan.brand = 'Forma';
  const frames = [100, 150, 150, 140];
  plan.beats = ['promise', 'action', 'rows', 'close'].map((id, index) => ({
    ...plan.beats[Math.min(index, 2)], id, frames: frames[index], handoff: index === 3 ? '' : 'The surface carries on.',
    text: ['Время для записи', 'Выберите время', 'Свободные окна сегодня', 'Запись подтверждена'][index],
    move: ['type', 'interface', 'type', 'type'][index],
    visual: {scene: ['hero', 'input', 'list', 'brand'][index], evidenceId: 'D1',
      ...(index === 1 && {label: 'Вторник, 11:30', action: 'Записаться'}),
      ...(index === 2 && {items: [{title: 'Утро'}, {title: 'День'}, {title: 'Вечер'}]})},
  }));
  plan.signatureBeat = 'action';
  const looks = {};
  for (const format of [[1920, 1080], [1080, 1920]]) {
    for (const artDirection of Object.keys(ART_DIRECTIONS)) {
      const settings = {style: 'saas-launch', width: format[0], height: format[1], fps: 30, frames: 540, pace: 'calm', artDirection};
      const score = compileLaunch(plan, settings, source);
      assert.equal(score.staging, 'scenes');
      looks[artDirection] = score;
    }
  }
  assert.ok(looks.clean.scenes.every(scene => scene.ground === 'background'));
  assert.ok(looks.ambient.scenes.every(scene => scene.ground === 'foreground'));
  assert.deepEqual(looks.editorial.scenes.map(scene => scene.ground), ['background', 'foreground', 'background', 'foreground']);
  assert.ok(looks.technical.elements.some(element => element.kind === 'stroke' && element.enter === 'draw'));
  // Rows and capabilities stand in the open in every look: no card is drawn behind them.
  assert.ok(Object.values(looks).every(score => score.elements.every(element => element.kind !== 'card')));
  assert.equal(looks.editorial.elements.find(element => element.id === 'line-0').enter, 'kinetic-stretch');
  assert.equal(looks.clean.elements.find(element => element.id === 'line-0').font, undefined);
  assert.throws(() => validateLaunchRequest({description: 'Продукт', artDirection: 'neon'}), /арт-дирекшна/);
  assert.equal(validateLaunchRequest({description: 'Продукт', artDirection: 'technical'}).artDirection, 'technical');
});

test('a coloured brand control becomes the accent even when its lightness is close to the page', async () => {
  const {resolveInterfacePalette} = await import('../src/kadr-launch/interface-palette.js');
  const page = {background: '#f4f3f1', foreground: '#1c1b1a'};
  const yellow = resolveInterfacePalette({...page, controls: [
    {fill: '#ffffff', ink: '#1c1b1a'}, {fill: '#ffcc00', ink: '#1c1b1a'}]});
  assert.equal(yellow.palette.accent, '#ffcc00');
  assert.equal(yellow.palette.onAccent, '#1c1b1a');
  const neutral = resolveInterfacePalette({...page, controls: [{fill: '#ffffff', ink: '#1c1b1a'}, {fill: '#ecebe8', ink: '#1c1b1a'}]});
  assert.equal(neutral.palette.accent, '#1c1b1a');
});
