import test from 'node:test';
import assert from 'node:assert/strict';
import {lowerBody,walkingMotion} from '../src/character-studio/locomotion.js';
import {CHARACTER_STYLES} from '../src/character-studio/styles.js';

test('standing legs remain straight and planted regardless of the last step phase',()=>{
  for(const distance of [0,17,99,210])for(const leg of lowerBody({distance,weight:0})){
    assert.equal(leg.sole,900);assert.equal(leg.contact,true);
    assert.equal(leg.hip[0],leg.knee[0]);assert.equal(leg.knee[0],leg.ankle[0]);
  }
});
test('both leg segments retain their length through the walking cycle',()=>{
  for(let distance=0;distance<280;distance+=2)for(const direction of [-1,1])for(const leg of lowerBody({distance,weight:1,direction})){
    const length=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1]);
    assert.ok(Math.abs(length(leg.hip,leg.knee)-83)<.0001);
    assert.ok(Math.abs(length(leg.knee,leg.ankle)-85)<.0001);
    assert.ok(leg.sole<=900);assert.ok(leg.sole>=873);
  }
});
test('the supporting foot stays fixed in world space while the body advances',()=>{
  for(const direction of [-1,1]){
    const positions=[10,20,30].map(distance=>{
      const foot=lowerBody({distance,weight:1,direction})[0];assert.equal(foot.contact,true);
      return distance*direction+foot.ankle[0];
    });
    assert.ok(Math.max(...positions)-Math.min(...positions)<.0001);
  }
});
test('walking follows travelled distance and settles when movement stops',()=>{
  const node={x:0,y:775,w:230,pose:'walk',keys:[{at:0,x:0},{at:2.8,x:180,pose:'carry'}]};
  assert.equal(walkingMotion(node,0).weight,0);assert.equal(walkingMotion(node,2.8).weight,0);
  assert.equal(walkingMotion({...node,keys:[{at:0,x:0},{at:2.8,x:0}]},1).weight,0);
  const a=walkingMotion(node,1.4),b=walkingMotion({...node,keys:[{at:0,x:0},{at:5.6,x:180,pose:'carry'}]},2.8);
  assert.ok(a.weight>0);assert.equal(a.distance,b.distance);
  assert.deepEqual(walkingMotion(node,1.4),a);
});
test('each reference rig keeps its own leg proportions through a complete stride',()=>{
  for(const style of CHARACTER_STYLES)for(let distance=0;distance<300;distance+=3)for(const leg of lowerBody({distance,weight:1},style.rig.legs)){
    const length=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1]);
    assert.ok(Math.abs(length(leg.hip,leg.knee)-style.rig.legs.upper)<.0001,style.id);
    assert.ok(Math.abs(length(leg.knee,leg.ankle)-style.rig.legs.lower)<.0001,style.id);
    assert.ok(leg.sole<=900);
  }
});
