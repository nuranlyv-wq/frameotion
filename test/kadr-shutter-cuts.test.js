import test from 'node:test';
import assert from 'node:assert/strict';
import {stageImageCuts,shutterSampleTime} from '../src/kadr-launch/shutter-cuts.js';
const image=(id,start,end,extra={})=>({id,kind:'image',assetId:id,x:500,y:281,w:1000,h:562.5,start,end,...extra});
test('discrete source pictures get local shutter cuts without treating fades as frame sequences',()=>{
 const score={fps:24,elements:[{start:120,end:216,stage:{nodes:[image('one',0,2/96),image('two',2/96,4/96),image('fadeOne',.4,.42,{track:[{t:.4,opacity:0},{t:.42,opacity:1}]}),image('fadeTwo',.42,.44,{track:[{t:.42,opacity:1},{t:.44,opacity:0}]})]}}]};
 assert.deepEqual(stageImageCuts(score),[120,122,124]);
});
test('an eight-sample shutter never blends the preceding picture into a new source frame',()=>{
 const cuts=[0,2,4,96],samples=Array.from({length:8},(_,i)=>shutterSampleTime(2,i,8,1,cuts));
 assert.ok(samples.every(t=>t>2&&t<4));
 assert.ok(Array.from({length:8},(_,i)=>shutterSampleTime(1.95,i,8,1,cuts)).every(t=>t<2));
 assert.ok(shutterSampleTime(0,0,1,1,cuts)>=0);
});
