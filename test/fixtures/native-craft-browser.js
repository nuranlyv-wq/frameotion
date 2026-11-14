import {compileStage} from '../../src/kadr-launch/stage-contract.js';
const palette={background:'#0e1012',foreground:'#f2f2f0',surface:'#23272a',muted:'#acb1b1',accent:'#ff5a1f',onAccent:'#ffffff'};
const copy={
  az:{title:'Əla İşıq',prefix:'Aktual sözü',word:'böyüt',request:'Layihəni hazırla',send:'Göndər',result:'Qəbul edildi',receipt:'Sorğudan nəticəyə'},
  en:{title:'Clear idea',prefix:'Make the title',word:'larger',request:'Prepare this project',send:'Submit',result:'Received',receipt:'Your request becomes a result'},
  ru:{title:'Живая идея',prefix:'Сделай заголовок',word:'крупнее',request:'Подготовить проект',send:'Отправить',result:'Принято',receipt:'Из запроса — в результат'},
};
export function nativeCraftBrowserFixture(width=1920,height=1080,language='az'){
  const L=copy[language];if(!L)throw Error('Unknown fixture language');
  const H=1000*height/width,Y=H*.67,source={kind:'description',nameHint:'Native local QA',brand:{fonts:['Comfortaa','Fira Sans'],interfacePalette:palette},assets:[],evidence:[{id:'QA',source:'local-test-fixture',text:'A local form submits the same project and becomes its receipt. This is an engine fixture, not an advertised product workflow.'}]};
  const plane=(id,x,y,w,h,props={})=>({id,kind:'plane',x,y,w,h,start:0,end:1,...props}),text=(id,value,x,y,w,h,props={})=>({id,kind:'text',text:value,x,y,w,h,start:0,end:1,font:'body',weight:500,fontSize:32,ink:'foreground',...props});
  const request=compileStage({nodes:[
    text('title',L.title,500,H*.12,840,70,{font:'heading',fontSize:68,track:[{t:0,opacity:1},{t:.8,opacity:1},{t:1,opacity:0}]}),
    {id:'line',kind:'group',x:500,y:H*.35,w:900,h:120,start:0,end:.9,layout:{gap:18,align:'center'},track:[{t:0,opacity:1},{t:.8,opacity:1},{t:.9,opacity:0}]},
    text('prefix',L.prefix,0,0,300,80,{parent:'line',weight:700,fontSize:42,end:.9}),
    plane('ui',500,Y,720,180,{fill:'foreground',material:'matte',radius:24,track:[{t:0,w:720,ry:-10},{t:.4,w:600,ry:10},{t:.75,w:680,ry:0},{t:1,w:680,ry:0}]}),
    text('requestText',L.request,0,-40,640,40,{parent:'ui',ink:'background'}),
  ],fragments:[
    {id:'inline',kind:'control',parent:'line',x:0,y:0,w:220,h:60,start:0,end:.9,label:L.word},
    {id:'send',kind:'control',parent:'ui',x:0,y:0,w:200,h:60,start:0,end:1,label:L.send,dock:{x:'right',y:'bottom',insetX:18,insetY:18},clickAt:.85},
  ]},6);
  const receipt={nodes:[
    plane('receipt',500,Y,680,180,{fill:'foreground',material:'matte',radius:24,track:[{t:0,y:Y,w:680,h:180},{t:.2,y:Y,w:680,h:180},{t:.32,y:H*.53,w:500,h:160},{t:1,y:H*.53,w:500,h:160}]}),
    text('requestText',L.request,0,-40,640,40,{parent:'receipt',ink:'background',end:.2,track:[{t:0,opacity:1},{t:.15,opacity:1},{t:.2,opacity:0}]}),
    plane('send',222,42,200,60,{parent:'receipt',z:1,fill:'accent',radius:30,control:{label:'oldLabel',from:0,to:.2},track:[{t:0,x:222,y:42,w:200,h:60,radius:30},{t:.2,x:222,y:42,w:200,h:60,radius:30},{t:.32,x:0,y:0,w:340,h:66,radius:33},{t:1,x:0,y:0,w:340,h:66,radius:33}]}),
    text('oldLabel',L.send,0,0,184,52,{parent:'send',z:0,ink:'onAccent',end:.2,fitToParent:{x:8,y:4}}),
    text('resultLabel',L.result,0,0,324,58,{parent:'send',z:0,ink:'onAccent',start:.32,fontSize:38,fitToParent:{x:8,y:4}}),
    text('title',L.receipt,500,H*.12,840,70,{font:'heading',fontSize:58,start:.2,track:[{t:.2,opacity:0},{t:.4,opacity:1},{t:1,opacity:1}]}),
  ],handoffs:[{fromElement:'request',fromNode:'ui',toNode:'receipt',content:'preserve'},{fromElement:'request',fromNode:'send',toNode:'send',content:'preserve'}]};
  const element=(id,start,end,stage)=>({id,kind:'stage',start,end,stage,space:'screen',box:{x:0,y:0,w:width,h:height,radius:0},fill:'background',enter:'none',exit:'cut',enterFrames:1,sound:'none',evidenceIds:['QA']});
  const score={version:1,style:'saas-launch',staging:'scenes',brand:'Native local QA',concept:'One submitted project becomes its receipt; text and controls preserve measured alignment throughout the transition.',width,height,fps:30,frames:360,palette,shapes:[],scenes:[{id:'request',start:0,end:180,purpose:'Submit this project',ground:'background',groundStyle:'flat'},{id:'receipt',start:180,end:360,purpose:'The same project becomes its receipt',ground:'background',groundStyle:'flat'}],elements:[element('request',0,180,request),element('receipt',180,360,receipt)],camera:[{frame:0,x:width/2,y:height/2,zoom:100,rotate:0},{frame:360,x:width/2,y:height/2,zoom:100,rotate:0}]};
  return {score,source};
}
