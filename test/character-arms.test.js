import test from 'node:test';
import assert from 'node:assert/strict';
import {armJoints,characterHeadPose} from '../src/character-studio/arms.js';
import {CHARACTER_STYLES} from '../src/character-studio/styles.js';
import {gardenStoryFixture} from './fixtures/character-stories.js';
import {authoredStory} from '../src/character-story/authored.js';
import {storyNodeStates} from '../src/character-story/timeline.js';
const length=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1]);

test('upper arms and forearms preserve their length through every gesture',()=>{
  for(const style of CHARACTER_STYLES)for(const actionPose of ['idle','carry','reach','point','think','celebrate','talk'])for(let gesture=-2;gesture<=2;gesture+=.1){
    for(const arm of armJoints(style,{actionPose,gesture,bothHands:true})){
      assert.ok(Math.abs(length(arm.shoulder,arm.elbow)-style.rig.arms.upper)<1e-8);
      assert.ok(Math.abs(length(arm.elbow,arm.wrist)-style.rig.arms.lower)<1e-8);
      assert.ok(Math.abs(length(arm.wrist,arm.hand)-11*style.rig.arms.palm)<1e-8);
      assert.ok(length(arm.shoulder,arm.wrist)<=style.rig.arms.upper+style.rig.arms.lower+.001);
    }
  }
});
test('resting arms hang close to the body and a carry raises the forearm from a low elbow',()=>{
  for(const style of CHARACTER_STYLES){
    const rest=armJoints(style,{actionPose:'idle'});
    for(const arm of rest){assert.ok(Math.abs(arm.hand[0])<125);assert.ok(arm.hand[1]>640);}
    const carry=armJoints(style,{actionPose:'carry',gesture:.85})[1];
    assert.ok(carry.elbow[1]-carry.shoulder[1]>80);assert.ok(Math.abs(carry.hand[1]-carry.elbow[1])<25);assert.ok(carry.hand[0]>carry.elbow[0]+80);
  }
});
test('sleeves follow the upper arm and palms continue the forearm direction',()=>{
  for(const style of CHARACTER_STYLES)for(const arm of armJoints(style,{actionPose:'celebrate',gesture:1.1,bothHands:true})){
    assert.ok(Math.abs(length(arm.shoulder,arm.cuff)-style.rig.arms.sleeve)<1e-8);
    const cross=(arm.cuff[0]-arm.shoulder[0])*arm.upper[1]-(arm.cuff[1]-arm.shoulder[1])*arm.upper[0];assert.ok(Math.abs(cross)<1e-8);
    assert.ok(arm.hand[1]<arm.shoulder[1]);
  }
});
test('a pose change and a shared-scene handoff do not pop the wrist or elbow',()=>{
  const {story}=gardenStoryFixture();
  for(const style of CHARACTER_STYLES){
    const sample=(scene,time)=>armJoints(style,storyNodeStates(story,scene,time,style).get('hero').armPhysical)[1];
    for(const [a,b]of [[sample(story.scenes[0],3.999999),sample(story.scenes[1],4)],[sample(story.scenes[1],6.399999),sample(story.scenes[1],6.4)]]){
      assert.ok(length(a.hand,b.hand)<.01,style.id);assert.ok(length(a.elbow,b.elbow)<.01,style.id);
    }
  }
});
test('a left-hand catch uses the left arm and keeps the letter in that palm',()=>{
  const story=authoredStory(),scene=story.scenes[4];
  for(const style of CHARACTER_STYLES){
    const states=storyNodeStates(story,scene,18.5,style),person=states.get('lev'),letter=states.get('letter');
    assert.equal(person.armPhysical.activeHand,'left');const arms=armJoints(style,person.armPhysical);
    assert.ok(arms[0].amount>arms[1].amount);
    assert.ok(Math.abs(letter.matrix[4]-(person.matrix[4]+person.matrix[0]*arms[0].hand[0]))<.0001);
    assert.ok(Math.abs(letter.matrix[5]-(person.matrix[5]+person.matrix[3]*(arms[0].hand[1]-900)))<.0001);
  }
});
function chinPoint(style,physical){
  const head=characterHeadPose(style,physical),side=physical.activeHand==='left'?-1:1,x=side*12,y=style.id==='minimal-stickman'?90:78*(style.rig.headScale??1);
  return [head.center[0]+Math.cos(head.rotation)*x-Math.sin(head.rotation)*y,head.center[1]+Math.sin(head.rotation)*x+Math.cos(head.rotation)*y];
}
test('thinking makes contact with the jaw and supports the other elbow in every style',()=>{
  for(const style of CHARACTER_STYLES)for(const activeHand of ['right','left']){
    const physical={actionPose:'think',gesture:1.65,activeHand,bodyOffset:1.2},arms=armJoints(style,physical),active=arms[activeHand==='right'?1:0],support=arms[activeHand==='right'?0:1];
    const touch=active.wrist.map((v,i)=>v+active.forearm[i]*20*style.rig.arms.palm);
    assert.ok(length(touch,chinPoint(style,physical))<.001,style.id);
    assert.ok(length(support.hand,[active.elbow[0],active.elbow[1]+13])<.001,style.id);
  }
});
test('thinking entry and exit keep the elbow close to the torso',()=>{
  for(const style of CHARACTER_STYLES){
    const base={actionPose:'idle',gesture:0},thinking={actionPose:'think',gesture:1.65};
    for(let armBlend=0;armBlend<=1;armBlend+=.01){
      const entering=armJoints(style,{...thinking,fromArms:armJoints(style,base),fromHead:characterHeadPose(style,base),armBlend});
      const leaving=armJoints(style,{...base,fromArms:armJoints(style,thinking),fromHead:characterHeadPose(style,thinking),armBlend});
      for(const arms of [entering,leaving]){
        const active=arms[1];assert.ok(Math.abs(active.elbow[0])<style.rig.arms.x+35,style.id);
        for(const arm of arms){assert.ok(Math.abs(length(arm.shoulder,arm.elbow)-style.rig.arms.upper)<1e-6);assert.ok(Math.abs(length(arm.elbow,arm.wrist)-style.rig.arms.lower)<1e-6);}
      }
    }
  }
});
test('a character holding a letter thinks with the free hand and keeps the letter away from the face',()=>{
  const story=authoredStory(),scene=story.scenes[1];
  for(const style of CHARACTER_STYLES){
    const person=storyNodeStates(story,scene,6,style).get('anna'),physical=person.armPhysical;
    assert.equal(physical.activeHand,'left');assert.deepEqual(physical.occupiedHands,['right']);
    const arms=armJoints(style,physical);assert.equal(arms[1].handShape,'grip');assert.equal(arms[0].handShape,'chin');
    assert.ok(arms[1].hand[0]>130);assert.ok(arms[1].hand[1]>500);
  }
});
test('the head stays continuous when entering or leaving a thought',()=>{
  const story=authoredStory(),scene=story.scenes[1];
  for(const style of CHARACTER_STYLES){
    const sample=t=>characterHeadPose(style,storyNodeStates(story,scene,t,style).get('anna').armPhysical).center;
    assert.ok(length(sample(7.399999),sample(7.4))<.01,style.id);
  }
});
