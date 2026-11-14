import test from 'node:test';
import assert from 'node:assert/strict';
import {gardenStoryFixture,doorStoryFixture} from './fixtures/character-stories.js';
import {validateStoryWindow} from '../src/character-story/contract.js';
import {trackPose,storyNodeStates,sceneAt} from '../src/character-story/timeline.js';
import {characterStyle} from '../src/character-studio/styles.js';
import {CHARACTER_STYLES} from '../src/character-studio/styles.js';
import {characterJoints} from '../src/character-studio/characters.js';
import {directStory,transcriptWindows} from '../src/character-story/director.js';

test('story scenes cover the audio contiguously and reference its actual words',()=>{
  const {story}=gardenStoryFixture();assert.equal(story.scenes[0].start,0);assert.equal(story.scenes.at(-1).end,16);
  for(let i=1;i<story.scenes.length;i++)assert.equal(story.scenes[i].start,story.scenes[i-1].end);
  assert.equal(sceneAt(story,12).scene.id,'bloom');
});
test('a shared object can attach to a hand, release, and retain absolute-time reproducibility',()=>{
  const {story}=gardenStoryFixture(),style=characterStyle('drawn-2d');
  const held=storyNodeStates(story,story.scenes[1],5,style).get('held-seed');
  const planted=storyNodeStates(story,story.scenes[1],6.5,style).get('held-seed');
  assert.equal(held.pose.parent,'hero');assert.equal(planted.pose.parent,'');
  assert.ok(planted.matrix[4]>850);assert.ok(planted.matrix[5]>700);
  storyNodeStates(story,story.scenes[3],15,style);
  assert.deepEqual(storyNodeStates(story,story.scenes[1],5,style).get('held-seed'),held);
});
test('growth is physical geometry anchored to the same ground',()=>{
  const {story}=gardenStoryFixture(),scene=story.scenes[3],flower=scene.nodes.find(n=>n.id==='bloom');
  const early=trackPose(flower,flower.keys,12,12),late=trackPose(flower,flower.keys,15,12);
  assert.ok(late.h>early.h*100);assert.ok(Math.abs(early.y+early.h/2-(late.y+late.h/2))<1);
});
test('attachment handoffs interpolate in world space without a pre-release excursion',()=>{
  const {story}=gardenStoryFixture(),scene=story.scenes[1],style=characterStyle('drawn-2d');
  const sample=t=>storyNodeStates(story,scene,t,style).get('held-seed').matrix;
  const start=sample(5.8),end=sample(6.4),middle=sample(6.1);
  assert.ok(Math.abs(middle[4]-(start[4]+end[4])/2)<2);
  assert.ok(Math.abs(middle[5]-(start[5]+end[5])/2)<3);
  for(let t=5.8;t<6.4;t+=.03){const p=sample(t);assert.ok(p[4]<=Math.max(start[4],end[4])+2);assert.ok(p[5]<=Math.max(start[5],end[5])+3);}
  assert.ok(Math.abs(sample(6.3999)[4]-end[4])<.1);
});
test('changing a held pose preserves the hand position at the moment of change',()=>{
  const {story}=gardenStoryFixture(),scene=story.scenes[1],style=characterStyle('cartoon-2d');
  const before=storyNodeStates(story,scene,6.39999,style).get('hero').gesture;
  const after=storyNodeStates(story,scene,6.4,style).get('hero').gesture;
  assert.ok(before>.8);assert.ok(Math.abs(before-after)<.001);
});
test('held props follow the actual hand and breathing offset of all three replacement rigs',()=>{
  const {story}=gardenStoryFixture(),scene=story.scenes[1];
  for(const style of CHARACTER_STYLES){
    const states=storyNodeStates(story,scene,5,style),hero=states.get('hero'),prop=states.get('held-seed');
    const hand=characterJoints(style,hero.armPhysical).hands[1].hand;
    assert.ok(Math.abs(prop.matrix[4]-(hero.matrix[4]+hero.matrix[0]*hand[0]))<.0001,style.id);
    assert.ok(Math.abs(prop.matrix[5]-(hero.matrix[5]+hero.matrix[3]*(hand[1]-900)))<.0001,style.id);
  }
});
test('negated source action can retain a closed door while the character leaves',()=>{
  const {story}=doorStoryFixture();assert.ok(story.scenes[0].quote.includes('не открыла'));
  for(const scene of story.scenes){const door=scene.nodes.find(n=>n.id==='closed-door');assert.equal(door.rotation,0);assert.deepEqual(door.parts,[]);}
  const scene=story.scenes[1],actor=scene.nodes.find(n=>n.id==='hero');assert.ok(trackPose(actor,actor.keys,7.6,4).x<actor.x);
});
test('fabricated evidence, impossible match handoffs and scriptable paths are rejected',()=>{
  const {raw,transcript}=gardenStoryFixture();
  const quote=structuredClone(raw);quote.scenes[0].quote='Это выдуманная цитата';assert.throws(()=>validateStoryWindow(quote,{transcript,start:0,end:16}));
  const match=structuredClone(raw);match.scenes[1].transition.anchor='missing';assert.throws(()=>validateStoryWindow(match,{transcript,start:0,end:16}));
  const path=structuredClone(raw);path.entities[2].parts[0].d='<script>alert(1)</script>';assert.throws(()=>validateStoryWindow(path,{transcript,start:0,end:16}));
});
test('cyclic parents and unsupported on-screen facts cannot enter the renderer',()=>{
  const {raw,transcript}=gardenStoryFixture();
  const cycle=structuredClone(raw);cycle.scenes[0].nodes[0].parent='hero';cycle.scenes[0].nodes[1].parent='held-seed';assert.throws(()=>validateStoryWindow(cycle,{transcript,start:0,end:16}));
  const facts=structuredClone(raw);facts.entities[1].parts.push({id:'fake-price',parent:'',kind:'text',x:0,y:0,w:100,h:100,fill:'ink',stroke:'none',text:'999 рублей'});assert.throws(()=>validateStoryWindow(facts,{transcript,start:0,end:16}));
});
test('director receives the actual transcript and produces validated graphs through its model adapter',async()=>{
  const {raw,transcript}=gardenStoryFixture();let called=0;
  const story=await directStory({transcript,duration:16,request:async args=>{called++;assert.equal(args.input.transcript.segments[0].text,transcript.segments[0].text);assert.ok(args.prompt.includes('Negated actions'));return {output:raw};}});
  assert.equal(called,1);assert.equal(story.scenes.length,4);assert.equal(story.provenance.generated,true);
});
test('animated part parents cannot introduce a cycle after a valid initial pose',()=>{
  const {raw,transcript}=gardenStoryFixture(),value=structuredClone(raw);
  const prop=value.entities.find(e=>e.kind==='prop'),node=value.scenes.flatMap(s=>s.nodes).find(n=>n.entity===prop.id);
  node.parts.push({target:prop.parts[0].id,keys:[{at:0,parent:prop.parts[0].id}]});
  assert.throws(()=>validateStoryWindow(value,{transcript,start:0,end:16}),/parent cycle/);
});
test('invalid model graphs get one targeted repair; provider failure never becomes a stock story',async()=>{
  const {raw,transcript}=gardenStoryFixture();let calls=0;
  const repaired=await directStory({transcript,duration:16,request:async args=>{calls++;if(calls===1){const wrong=structuredClone(raw);wrong.scenes[0].quote='wrong';return {output:wrong};}assert.ok(args.feedback.some(s=>s.includes('quote')));return {output:raw};}});
  assert.equal(repaired.scenes.length,4);assert.equal(calls,2);
  await assert.rejects(directStory({transcript,duration:16,request:async()=>{throw new Error('provider-unavailable');}}),/provider-unavailable/);
});
