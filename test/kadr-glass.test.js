import test from 'node:test';
import assert from 'node:assert/strict';
import {glassSettings} from '../src/kadr-launch/stage-glass.js';
import {stageFrame,stagePose} from '../src/kadr-launch/stage-player.js';
import {StageSchema,StageKeySchema} from '../src/kadr-launch/stage-contract.js';
import {checkSchema} from '../src/production/contracts.js';
import {ordinaryCapabilities} from '../src/kadr-launch/ordinary-direction.js';

test('optical materials are validated and exposed to the director',()=>{
 const node={id:'lens',kind:'plane',material:'liquid-glass',x:500,y:281,w:500,h:250,start:0,end:1,
  glass:{blur:3,refraction:28,dispersion:1,tint:.08,edge:28,shine:.4},track:[{t:0,glassStrength:0},{t:1,glassStrength:1}]};
 assert.deepEqual(checkSchema(StageSchema,{nodes:[node]}),[]);
 assert.ok(checkSchema(StageSchema,{nodes:[{...node,glass:{refraction:999}}]}).length);
 assert.ok(checkSchema(StageKeySchema,{t:.5,glassStrength:3}).length);
 const caps=ordinaryCapabilities({assets:[],evidence:[]},{width:1920,height:1080,pace:'dynamic'});
 assert.ok(caps.composition.authored.materials.includes('liquid-glass'));
 assert.match(caps.composition.authored.opticalGlass.use,/children/);
});
test('glass strength animates optics without moving or distorting child geometry',()=>{
 const lens={id:'lens',kind:'plane',material:'liquid-glass',x:500,y:281,w:500,h:250,start:0,end:1,
  track:[{t:0,glassStrength:0},{t:1,glassStrength:1}]},child={id:'copy',kind:'text',text:'Məna hərəkətə gəlir.',parent:'lens',x:0,y:0,w:350,h:60,z:1,start:0,end:1};
 const stage={nodes:[lens,child]},a=stageFrame(stage,0).find(i=>i.node.id==='copy'),b=stageFrame(stage,.9).find(i=>i.node.id==='copy');
 assert.deepEqual(a.points,b.points);assert.equal(stagePose(lens,0).glassStrength,0);
 const neutral=glassSettings(lens,stagePose(lens,0));for(const f of ['blur','refraction','dispersion','tint','shine'])assert.equal(neutral[f],0);
 assert.ok(glassSettings(lens,stagePose(lens,.9)).refraction>20);
 assert.ok(glassSettings({material:'glass'}).blur>glassSettings(lens).blur);
});
