import {STORIES} from './direction-stories.js';
import {compileLaunch,normalizeSemanticTreatment} from '../../src/kadr-launch/compile.js';
export function stageFixture(pace='dynamic') {
 const story=STORIES.forma,plan=structuredClone(story.plan);
 const stage={nodes:[
  {id:'panel',kind:'plane',material:'glass',fill:'surface',x:500,y:650,w:650,h:300,start:0,end:1,
   track:[{t:0,rx:55,ry:-20,opacity:0,blur:18},{t:.15,rx:15,ry:12,opacity:1,blur:0},{t:.6,rx:15,ry:12},{t:.9,rx:-15,ry:-12},{t:1,rx:-15,ry:-12}]},
  {id:'copy',kind:'text',parent:'panel',text:'Запись подтверждена',x:0,y:0,w:530,h:130,start:.15,end:.58,fontSize:64,
   track:[{t:.15,opacity:0,blur:18},{t:.22,opacity:1,blur:0},{t:.51,opacity:1,blur:0},{t:.58,opacity:0,blur:18}]},
  {id:'light',kind:'glow',fill:'accent',x:500,y:1050,w:1200,h:500,start:0,end:1,
   track:[{t:0,x:100},{t:.15,x:500},{t:.6,x:500},{t:.9,x:800},{t:1,x:800}]},
 ],events:[{t:.15,kind:'whoosh',actor:'panel'}]};
 plan.beats=plan.beats.slice(0,3).map(beat=>({...beat,move:'keyframes',text:undefined,visual:{scene:'composition',seconds:4,ground:'background',backdrop:'flat',evidenceId:'D1',link:'cut',stage:structuredClone(stage)}}));
 for(const beat of plan.beats)delete beat.text;
 const settings={...story.settings,width:1080,height:1920,frames:360,pace};
 const treatment=normalizeSemanticTreatment(plan,settings,story.source);
 const score=compileLaunch(treatment,settings,story.source);
 return {score,treatment,settings,source:story.source,stage};
}
