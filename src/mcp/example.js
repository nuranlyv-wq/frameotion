import {DEFAULT_PALETTE} from './contract.js';

// A small editable construction example, not a generated or creatively approved film.
export function connectedExample(width=1920,height=1080){
  const H=1000*height/width,Y=H*.58;
  const plane=(id,x,y,w,h,extra={})=>({id,kind:'plane',x,y,w,h,start:0,end:1,...extra});
  const text=(id,value,x,y,w,h,extra={})=>({id,kind:'text',text:value,x,y,w,h,start:0,end:1,font:'body',weight:500,fontSize:32,ink:'foreground',...extra});
  const label=text('label','Submit',0,0,224,52,{parent:'send',ink:'onAccent',fitToParent:{x:8,y:4}});
  const first={id:'request',durationFrames:180,action:'Submit this project',result:'The project is submitted',handoff:'The same project panel and Submit button become its receipt',stage:{nodes:[
    text('title','One idea',500,H*.16,840,70,{font:'heading',fontSize:62,end:.9,track:[{t:0,opacity:1},{t:.75,opacity:1},{t:.9,opacity:0}]}),
    plane('project',500,Y,620,220,{fill:'surface',radius:24}),
    text('task','Prepare this project',0,-45,560,60,{parent:'project'}),
    plane('send',160,60,240,60,{parent:'project',fill:'accent',radius:30,control:{label:'label'}}),label,
  ]}};
  const second={id:'receipt',durationFrames:180,action:'Reveal the submitted project’s receipt',result:'The same project has been received',handoff:'',stage:{nodes:[
    plane('project',500,Y,620,220,{fill:'surface',radius:24,track:[{t:0,w:620,h:220},{t:.2,w:620,h:220},{t:.45,w:500,h:180},{t:1,w:500,h:180}]}),
    text('task','Prepare this project',0,-45,560,60,{parent:'project',end:.2,track:[{t:0,opacity:1},{t:.1,opacity:1},{t:.2,opacity:0}]}),
    plane('send',160,60,240,60,{parent:'project',fill:'accent',radius:30,control:{label:'label',to:.2},track:[{t:0,x:160,y:60,w:240,h:60},{t:.2,x:160,y:60,w:240,h:60},{t:.45,x:0,y:0,w:340,h:66},{t:1,x:0,y:0,w:340,h:66}]}),
    {...label,end:.2},
    text('received','Received',0,0,324,58,{parent:'send',start:.45,ink:'onAccent',fitToParent:{x:8,y:4}}),
    text('title','From request to result',500,H*.16,840,70,{font:'heading',fontSize:52,start:.2,track:[{t:.2,opacity:0},{t:.4,opacity:1},{t:1,opacity:1}]}),
  ],handoffs:[{fromElement:'request',fromNode:'project',toNode:'project',content:'preserve'},{fromElement:'request',fromNode:'send',toNode:'send',content:'preserve'}]}};
  return {name:'Connected project example',brief:'An editable engine example: one submitted project becomes its own receipt.',language:'en',width,height,fps:30,pace:'dynamic',palette:structuredClone(DEFAULT_PALETTE),fonts:['Comfortaa','Fira Sans'],evidence:[],scenes:[first,second]};
}
