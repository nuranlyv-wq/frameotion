import test from 'node:test';
import assert from 'node:assert/strict';
import {applyDirectedPatch} from '../src/production/motion-patch.js';
test('director patches merge poses and replace tracks without changing the source or unrelated actors',()=>{
 const base={world:{nodes:[{id:'shape',pose:{x:100,y:200},keys:[{at:0,x:100}]},{id:'label',text:'Keep'}],camera:[]},audio:{cues:[]}};
 const patch={reason:'Correct framing',actors:[{id:'shape',pose:{y:150},keys:[{at:10,x:120,easing:'linear'}]}]};
 const result=applyDirectedPatch(base,patch);
 assert.deepEqual(result.world.nodes[0].pose,{x:100,y:150});assert.equal(result.world.nodes[0].keys.length,1);
 assert.equal(base.world.nodes[0].pose.y,200);assert.deepEqual(result.world.nodes[1],base.world.nodes[1]);assert.deepEqual(result.audio,base.audio);
 assert.throws(()=>applyDirectedPatch(base,{reason:'bad',actors:[{id:'missing',pose:{x:10}}]}),/unknown/);
 assert.throws(()=>applyDirectedPatch(base,{reason:'bad',actors:[],source:'javascript'}),/unknown field/);
});
test('a corrective model patch may add bounded native objects without replacing existing actors',()=>{
 const base={world:{nodes:[{id:'shape'}],camera:[]},audio:{cues:[]}};
 const added={id:'lock',kind:'symbol',symbol:'lock',parent:'shape',pose:{x:500,y:500,w:100,h:100,scale:100,rotate:0,opacity:0,radius:0},fill:'foreground',keys:[]};
 const patch={reason:'Give the fixed price a visible lock',actors:[],addActors:[added]};
 const result=applyDirectedPatch(base,patch);assert.equal(result.world.nodes.length,2);assert.equal(base.world.nodes.length,1);assert.deepEqual(result.audio,base.audio);
 assert.throws(()=>applyDirectedPatch(base,{...patch,addActors:[added,added]}),/already exists/);
 assert.throws(()=>applyDirectedPatch(base,{...patch,addActors:[{...added,id:'shape'}]}),/already exists/);
 assert.throws(()=>applyDirectedPatch(base,{...patch,addActors:[{...added,source:'javascript'}]}),/unknown field/);
});
