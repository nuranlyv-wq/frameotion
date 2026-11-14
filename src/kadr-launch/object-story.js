import {checkSchema} from '../production/contracts.js';
import {resolveInterfacePalette} from './interface-palette.js';
import {validateScore} from './score.js';
import {stageObjectImpact,supportsObjectImpact} from './object-impact.js';

const line = maxLength => ({type:'string',minLength:1,maxLength});
const fields = {
  brand:line(32), hook:line(52), route:line(42), benefit:line(32), qualifier:line(60), evidenceId:line(48),
  steps:{type:'array',minItems:2,maxItems:3,items:line(24)},
};
const demoFields = {
  lead:line(18), subline:line(34), context:line(40), actionTitle:line(25), actionHint:line(38),
  control:line(20), state:line(25), productName:line(26), productDetail:line(32), benefitTitle:line(20),
  cta:line(30), actionEvidenceId:line(48), assetId:line(48),
};
export const ObjectStorySchema = {
  type:'object',properties:{...fields,demo:{type:'object',properties:demoFields,required:Object.keys(demoFields),additionalProperties:false}},
  required:Object.keys(fields),additionalProperties:false,
};

export function objectImpactPhotos(source, settings) {
  return supportsObjectImpact(settings) ? (source.assets ?? []).filter(asset =>
    asset.kind === 'screenshot' && asset.role === 'product-photo' && source.evidence.some(row=>row.id===asset.evidenceId)) : [];
}

export function validateObjectStory(value, source) {
  const issues = checkSchema(ObjectStorySchema,value);
  if (issues.length) throw new Error(issues.join('\n'));
  const clean = Object.fromEntries(Object.entries(value).map(([key,item]) =>
    [key,key === 'demo' ? Object.fromEntries(Object.entries(item).map(([id,text])=>[id,text.trim()])) :
      Array.isArray(item) ? item.map(label => label.trim()) : item.trim()]));
  if (Object.values(clean).flat().some(item => !item)) throw new Error('Заполните текст сцен и подписи всех отметок.');
  const words = text => text.split(/\s+/u).length;
  const limits = {brand:5,hook:7,route:7,benefit:6,qualifier:9};
  for (const [key,max] of Object.entries(limits)) {
    if (words(clean[key]) > max) throw new Error(`${key}: не более ${max} слов для читаемой паузы.`);
  }
  if (clean.steps.some(step => words(step)>3)) throw new Error('Каждая отметка графика должна занимать не более трёх слов.');
  if (clean.demo && words(clean.demo.state)>4) throw new Error('Use at most four words in the switch state so it can be read before the portal.');
  if (source && !source.evidence.some(row => row.id === clean.evidenceId)) throw new Error('Укажите источник для обещания в ролике.');
  if (clean.demo && source) {
    const photo = source.assets?.find(asset=>asset.id===clean.demo.assetId && asset.kind==='screenshot' && asset.role==='product-photo');
    if (!photo || !source.evidence.some(row=>row.id===photo.evidenceId)) throw new Error('Use a captured product photo and its source evidence.');
    if (!source.evidence.some(row=>row.id===clean.demo.actionEvidenceId)) throw new Error('Use a known evidence ID for the action on the product card.');
  }
  return clean;
}

const box = (x,y,w,h,radius=0) => ({x:Math.round(x),y:Math.round(y),w:Math.round(w),h:Math.round(h),radius:Math.round(radius)});
const actor = (id,kind,start,end,b,fields={}) => ({
  id,kind,start,end,box:b,fill:'foreground',enter:'none',enterFrames:1,sound:'none',evidenceIds:[],...fields,
});

function balanceQualifier(copy) {
  const words = copy.split(/\s+/u);
  if (copy.length <= 24 || words.length < 4) return copy;
  let line = words[0], split = 1;
  while (split < words.length-2 && line.length + (words[split].length+1)/2 < copy.length/2) {
    line += ' '+words[split++];
  }
  return `${line}\n${words.slice(split).join(' ')}`;
}

export function compileObjectStory(value, settings, source) {
  const story = validateObjectStory(value, source);
  const photoForImpact = objectImpactPhotos(source,settings).find(asset=>asset.id===story.demo?.assetId);
  if (photoForImpact) return validateScore(stageObjectImpact(story,settings,source,photoForImpact),settings,source);
  const {width:W,height:H,frames:total,fps,style} = settings;
  const wide = W > H * 1.2, square = W === H, edge = Math.min(W,H), margin = W*.085;
  const route = Math.round(total*.23), delivery = Math.round(total*.53), close = Math.round(total*.80);
  const slow = settings.pace === 'calm';
  const lift = delivery - (slow ? 18 : 14), parcelLand = delivery + (slow ? 30 : 24);
  const routeExit = delivery + 9;
  const benefitIn = routeExit + (square ? 6 : 0);
  const fold = close-15, logoLand = close+24;
  const lastX = W*.81, routeY = H*(wide ? .59 : .52);
  const parcelX = W*(wide ? .755 : .50), parcelY = H*(wide ? .53 : .65);
  const logoX = W*.50, logoY = H*(wide ? .31 : .33), side = Math.round(edge*.18);
  const marker = Math.round(edge*.10);
  const scaleMarker = Math.round(marker/side*100);
  const carrier = 'route-parcel-logo';
  const palette = source.brand?.interfacePalette ?? resolveInterfacePalette().palette;
  const evidenceIds = [story.evidenceId];
  const center = (x,y,w,h,radius=0) => box(x-w/2,y-h/2,w,h,radius);
  const text = (id,copy,size,start,end,b,options={}) => actor(id,'text',start,end,b,{
    text:copy,fontSize:Math.round(size),weight:750,space:'screen',enter:'mask-rise',enterFrames:12,...options,
  });
  const position = (frame,x,y,scale,rotate=0) => ({frame,x:Math.round(x-logoX),y:Math.round(y-logoY),
    scale,rotate,opacity:100,ease:'fluid'});
  const camera = frame => ({frame,x:W/2,y:H/2,zoom:100,rotate:0});
  const photo = source.assets?.find(asset => asset.kind === 'screenshot');
  const intro = center(W*(wide ? .745 : .50),H*(wide ? .52 : .63),edge*.38,edge*.38,edge*.08);
  const elements = [
    text('hook',story.hook,edge*.127,0,route,box(margin,H*(wide ? .25 : .105),W*(wide ? .50 : .83),H*(wide ? .51 : .34)),{
      font:'display',enter:'none',enterFrames:1,evidenceIds,
    }),
    photo ? actor('opening-object','image',0,route,intro,{assetId:photo.id}) :
      actor('opening-object','icon',0,route,intro,{icon:'calendar',fill:'accent'}),
    text('route-heading',story.route,edge*.094,route,routeExit,box(margin,H*(square ? .09 : .146),W-2*margin,H*.235),{font:'display',evidenceIds}),
  ];
  const interval = (lastX - W*.19)/(story.steps.length-1);
  const timeStep = Math.floor((lift-route-41)/story.steps.length);
  for (const [i,label] of story.steps.entries()) {
    const x = W*.19+i*interval;
    const at = route+13+i*timeStep;
    if (i) elements.push(actor(`route-line-${i}`,'stroke',at-10,routeExit,box(x-interval+marker*.57,routeY-5,interval-marker*1.14,10),{
      enter:'draw',enterFrames:10,curve:{width:5,points:[{x:0,y:500},{x:333,y:500},{x:667,y:500},{x:1000,y:500}]},
    }));
    if (i < story.steps.length-1) {
      elements.push(actor(`node-${i}`,'rect',at,routeExit,center(x,routeY,marker,marker,marker*.23),{
        fill:'accent',enter:'pop',enterFrames:12,sound:'pop',
      }),actor(`step-icon-${i}`,'icon',at+2,routeExit,center(x,routeY,marker*.63,marker*.63),{
        icon:'calendar',fill:'onAccent',enter:'pop',enterFrames:10,
      }));
    } else {
      elements.push(actor(carrier,'transform',at,total,center(logoX,logoY,side,side,side*.25),{
        space:'screen',fill:'accent',enter:'pop',enterFrames:12,sound:'pop',
        formTrack:{depth:Math.round(side*.63),keys:[{frame:at,form:'tile',mark:'calendar'},
          {frame:lift,form:'tile',mark:'calendar'},
          {frame:delivery+5,form:'box',mark:'box',rx:-16,ry:-34},
          {frame:parcelLand,form:'box',mark:'box',rx:17,ry:33},
          {frame:fold,form:'box',mark:'box',rx:17,ry:33},
          {frame:logoLand,form:'logo'},
        ]},
        motion:[position(at,lastX,routeY,scaleMarker),position(lift,lastX,routeY,scaleMarker),
          position(delivery,lastX-edge*.035,routeY-marker*.73,102,-8),
          position(parcelLand,parcelX,parcelY,180),position(fold,parcelX,parcelY,180),
          position(logoLand,logoX,logoY,100)],
      }));
    }
    const labelW = Math.min(interval*.88,W*.27);
    const labelEnd = i === story.steps.length-1 ? delivery : routeExit;
    elements.push(text(`step-${i}`,label,edge*(wide ? .049 : .042),at+3,labelEnd,
      center(x,routeY+marker*1.02,labelW,edge*.115),{enterFrames:8,align:'center',evidenceIds}));
  }
  const benefitW = W*(wide ? .48 : .83), benefitY = H*(wide ? .24 : .08);
  const benefitHeight = H*(wide ? .29 : .164);
  elements.push(
    text('benefit',story.benefit,edge*.183,benefitIn,close,box(margin,benefitY,benefitW,benefitHeight),{
      font:'display',enter:'none',enterFrames:1,exit:'cut',evidenceIds,sound:'ding',
    }),
    text('qualifier',balanceQualifier(story.qualifier),edge*.060,benefitIn,close,box(margin,benefitY+benefitHeight+H*.008,benefitW,H*.15),{
      enter:'none',enterFrames:1,exit:'cut',evidenceIds,
    }),
    text('brand',story.brand,edge*.109,logoLand-6,total,box(margin,H*(wide ? .445 : .435),W-2*margin,H*.16),{
      align:'center',font:'display',enter:'resolve',enterFrames:6,sound:'ding',
    }),
  );
  const domain = source.url && new URL(source.url).hostname;
  if (domain) elements.push(text('address',domain,edge*.051,logoLand,total,box(margin,H*.65,W-2*margin,H*.08),{
    align:'center',enter:'none',enterFrames:1,
  }));
  const cameras = [camera(0), camera(total)];
  if (style === 'product-demo') cameras[0] = {...camera(0),target:'opening-object',x:Math.round(W/2-intro.x-intro.w/2),y:Math.round(H/2-intro.y-intro.h/2)};
  const scenes = [
    {id:'opening',start:0,end:route,purpose:'Establish the product promise',ground:'background'},
    {id:'route',start:route,end:delivery,purpose:'Read the steps in sequence',ground:'surface'},
    {id:'benefit',start:delivery,end:close,purpose:'The last step becomes a parcel beside the benefit',ground:'surface',
      link:{kind:'carry',anchor:carrier,why:'The final route tile expands and turns into the same object in depth.'}},
    {id:'brand',start:close,end:total,purpose:'The parcel flattens into the brand mark',ground:'surface',
      link:{kind:'carry',anchor:carrier,why:'The parcel flattens as it travels to the brand position.'}},
  ];
  return validateScore({version:1,staging:'connected',style,brand:story.brand,width:W,height:H,fps,frames:total,palette,scenes,
    concept:'One route marker gains depth as a parcel, holds beside the benefit, and folds into the brand mark.',
    shapes:[],elements,camera:cameras},settings,source);
}
