export const source={evidence:[{id:'D1',source:'user-description',text:'Forma — сервис онлайн-записи. Клиент выбирает удобное время; запись подтверждается автоматически.'}],assets:[],brand:{colors:['#A5F45A']}};
export function launchScore({width=1920,height=1080,brand='Forma'}={}){
  const W=width,H=height,box=(x,y,w,h,radius=0)=>({x:Math.round(x*W),y:Math.round(y*H),w:Math.round(w*W),h:Math.round(h*H),radius});
  const shape={id:'thread',states:[{frame:0,duration:16,box:box(.35,.58,.3,.14,80),fill:'accent'},
    {frame:120,duration:18,box:box(.2,.48,.6,.29,40),fill:'surface'},
    {frame:240,duration:18,box:box(.43,.16,.14,.24,40),fill:'accent'}]};
  const el=(id,text,start,end,b,enter='word-blur')=>({id,kind:'text',text,start,end,box:b,fill:'foreground',enter,enterFrames:18,sound:'pop',fontSize:Math.round(W*.055),align:'center',evidenceIds:['D1']});
  return {version:1,style:'saas-launch',concept:'Один объект превращается в запись и в знак продукта.',brand,width:W,height:H,fps:30,frames:360,
    palette:{background:'#F4F3F1',foreground:'#21201F',surface:'#FFFFFF',muted:'#6F6D68',accent:'#A5F45A',onAccent:'#21201F'},
    scenes:[{id:'promise',start:0,end:120,purpose:'Хук'},{id:'action',start:120,end:240,purpose:'Действие'},{id:'close',start:240,end:360,purpose:'Бренд и CTA'}],shapes:[shape],
    elements:[el('hook','Запись.',0,120,box(.15,.22,.7,.18),'hero-rise'),el('promiseText','Время для вас.',25,120,box(.15,.42,.7,.1)),
      {id:'switch',kind:'toggle',start:30,end:120,box:box(.39,.6,.22,.1,55),fill:'accent',enter:'pop',enterFrames:14,sound:'none',on:true,changeAt:66,evidenceIds:[]},
      el('actionTitle','Выберите время.',137,240,box(.1,.19,.8,.2),'rise'),
      el('result','Запись подтверждена',165,240,box(.25,.55,.5,.15)),
      {id:'mark',kind:'logo',start:260,end:360,box:box(.43,.16,.14,.24,40),fill:'accent',enter:'resolve',enterFrames:12,sound:'ding',evidenceIds:[]},
      el('brandName',brand,270,360,box(.15,.46,.7,.15)),
      {id:'cta',kind:'pill',text:'Попробовать',fontSize:Math.round(W*.033),start:285,end:360,box:box(.3,.71,.4,.12,60),fill:'accent',enter:'pop',enterFrames:15,sound:'pop',evidenceIds:[]}],
    camera:[{frame:0,x:W/2,y:H/2,zoom:100,rotate:0},{frame:110,x:W/2,y:H/2,zoom:102,rotate:0},{frame:138,x:W/2,y:H/2,zoom:100,rotate:0},{frame:230,x:W/2,y:H/2,zoom:102,rotate:0},{frame:258,x:W/2,y:H/2,zoom:100,rotate:0},{frame:360,x:W/2,y:H/2,zoom:102,rotate:0}]};
}
