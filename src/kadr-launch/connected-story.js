import {checkSchema} from '../production/contracts.js';
import {validateScore} from './score.js';
import {resolveInterfacePalette} from './interface-palette.js';
import {CONNECTED_STORY} from './motion-recipe.js';

const line = maxLength => ({type:'string',minLength:1,maxLength});
const object = (required,optional={}) => ({
  type:'object',properties:{...required,...optional},required:Object.keys(required),additionalProperties:false,
});
export const ConnectedStorySchema = object({
  hook: line(42), subject: line(36), action: line(23), confirmation: line(30),
  result: line(40), explanation: line(48), causalLink: line(180),
  mark: {type:'string',enum:['calendar','check','box','arrow','bolt','heart']},
  actionEvidenceId: line(48), resultEvidenceId: line(48),
  outcomes: {type:'array',minItems:1,maxItems:3,items:object({label:line(24)},{detail:line(24)})},
}, {brand:line(38), subjectDetail:line(35), assetId:line(48), repeatDetail:line(22)});

const normalize = value => value.trim().replace(/\s+/gu,' ').normalize('NFC');
const images = source => source.assets.filter(asset => ['screenshot','illustration'].includes(asset.kind));

export function validateConnectedStory(value, source) {
  const issues = checkSchema(ConnectedStorySchema,value);
  if (issues.length) throw new Error(issues.join('\n'));
  const clean = {...value,outcomes:value.outcomes.map(({label,detail}) => ({
    label:normalize(label),...(detail && {detail:normalize(detail)}),
  }))};
  for (const field of ['hook','subject','action','confirmation','result','explanation','causalLink','subjectDetail','brand','repeatDetail']) {
    if (clean[field] !== undefined) clean[field] = normalize(clean[field]);
  }
  if (Object.values(clean).some(field => field === '') || clean.outcomes.some(({label,detail}) => !label || detail === '')) {
    issues.push('Use visible copy rather than blank labels');
  }
  const evidence = new Set(source.evidence.map(item => item.id));
  if (![clean.actionEvidenceId,clean.resultEvidenceId].every(id => evidence.has(id))) {
    issues.push('Use known evidence IDs for the action and its outcome');
  }
  if (clean.assetId && !images(source).some(asset => asset.id === clean.assetId)) {
    issues.push('Choose a supplied image asset or omit assetId');
  }
  if (clean.hook.split(' ').length > 7) issues.push('Keep the hook to seven words or fewer');
  if (new Set(clean.outcomes.map(({label}) => label.toLowerCase())).size !== clean.outcomes.length) {
    issues.push('Name distinct visible outcomes or successive positions in one illustrative schedule');
  }
  if (clean.repeatDetail && (clean.outcomes.length < 2 || clean.outcomes.some(({detail}) => detail))) {
    issues.push('For recurring events, supply one repeatDetail and two or three outcome labels without individual details');
  }
  if (clean.hook.toLowerCase() === clean.result.toLowerCase() ||
      clean.action.toLowerCase() === clean.confirmation.toLowerCase()) {
    issues.push('Show a concrete change from action to result');
  }
  if (issues.length) throw new Error(issues.join('\n'));
  return clean;
}

const box = (x,y,w,h,radius=0) => ({x:Math.round(x),y:Math.round(y),w:Math.round(w),h:Math.round(h),radius:Math.round(radius)});
const actor = (id,kind,start,end,b,props={}) => ({
  id,kind,start,end,box:b,fill:'foreground',enter:'none',enterFrames:1,sound:'none',evidenceIds:[],...props,
});
const key = (frame,extra={}) => ({frame,x:0,y:0,scale:100,rotate:0,opacity:100,ease:'fluid',...extra});
const state = (frame,duration,b,fill,extra={}) => ({frame,duration,box:b,fill,ease:'fluid',...extra});
const centered = (b,scale) => box(b.x+b.w*(1-scale)/2,b.y+b.h*(1-scale)/2,b.w*scale,b.h*scale,b.radius*scale);
const MARK = 'action-marker';

export function compileConnectedStory(value,settings,source) {
  const story = validateConnectedStory(value,source);
  const {width:W,height:H,frames,fps,style} = settings;
  const wide = W > H * 1.12, edge = Math.min(W,H), margin = Math.round(W*.069);
  const palette = source.brand?.interfacePalette ?? resolveInterfacePalette().palette;
  const brand = String(source.nameHint || story.brand || 'KADR').slice(0,64);
  const captures = images(source);
  const photo = captures.find(asset=>asset.id===story.assetId)
    ?? (style==='product-demo' ? captures.find(asset=>asset.kind==='screenshot') : undefined);
  const actionScene = Math.round(frames*.24), morph = Math.round(frames*.46), cut = Math.round(frames*.70);
  const press = morph - 44, confirmation = press + 11;
  const calm = settings.pace === 'calm';
  const pushFrames = calm ? 34 : 27, revealFrames = calm ? 24 : 21;
  const push = cut - pushFrames, revealed = cut + revealFrames;
  const turn = morph + 22;
  const panel = wide ? box(W*.53,H*.22,W*.40,H*.62,edge*.048) : box(W*.09,H*.44,W*.82,H*.49,edge*.048);
  const button = box(panel.x+panel.w*.12,panel.y+panel.h*.76,panel.w*.76,panel.h*.155,edge*.037);
  const side = Math.round(edge*.42);
  const sideBySide = wide && photo;
  const centerX = sideBySide ? W*.51 : wide ? W*.716 : W/2, centerY = wide ? H*.545 : H*.68;
  const big = box(centerX-side/2,centerY-side/2,side,side,edge*.014);
  const left = box(margin,H*(wide ? .28 : .155),W*(wide ? .42 : .862),H*(wide ? .40 : .25));
  const title = box(margin,H*.133,W-2*margin,H*.173);
  const confirmationBox = sideBySide ? box(left.x,left.y,W*.30,left.h) : left;
  const contentBottom = H*(story.repeatDetail ? .865 : .897);
  const proof = sideBySide
    ? box(W*.635,H*.377,W*.296,contentBottom-H*.377,edge*.032)
    : box(margin,H*.38,W-2*margin,H*.156,edge*.032);
  const proofSize = edge*(sideBySide ? .355 : .144);
  const proofPhoto = sideBySide
    ? box(proof.x+(proof.w-proofSize)/2,proof.y+H*.015,proofSize,proofSize)
    : box(proof.x+proof.w-proofSize-edge*.034,proof.y+(proof.h-proofSize)/2,proofSize,proofSize);
  const cardsTop = H*(sideBySide ? .377 : photo ? .559 : wide ? .485 : .46);
  const stacked = !wide || sideBySide;
  const count = story.outcomes.length;
  const gap = stacked ? H*.017 : W*.032;
  const cardW = sideBySide ? W*.53 : stacked ? W-2*margin : (W-2*margin-(count-1)*gap)/count;
  const cardH = stacked ? Math.min(H*(sideBySide ? .202 : .137),(contentBottom-cardsTop-(count-1)*gap)/count) : H*.228;
  const cards = story.outcomes.map((outcome,index) => {
    const area = box(margin+(stacked ? 0 : index*(cardW+gap)),cardsTop+(stacked ? index*(cardH+gap) : 0),
      cardW,cardH,edge*.037);
    const iconSide = Math.round(Math.min(edge*.080,area.h*.48,area.w*.19));
    const marker = box(area.x+area.w*.083,area.y+(area.h-iconSide)/2,iconSide,iconSide,iconSide*.22);
    const at = revealed + index * Math.min(36,Math.round(11 * frames/360));
    return {item:outcome,area,marker,at};
  });
  const landing = cards[0].marker;
  const depth = Math.round(side*.23);
  // At zero tilt, the projected front fills the outgoing tile.
  const face = Math.round((side + Math.sqrt(side**2 - 4*side*depth/5.2))/2);
  const elementList = [];
  const actionRef = [story.actionEvidenceId], resultRef = [story.resultEvidenceId];
  const text = (id,copy,start,end,b,fontSize,props={}) => actor(id,'text',start,end,b,{
    text:copy,fontSize:Math.round(fontSize),align:'left',enter:'mask-rise',enterFrames:13,...props,
  });
  const display = {font:'display',weight:800,space:'screen'};
  const within = {attachTo:'subject-panel',align:'center',evidenceIds:actionRef};
  const flatMark = (id,start,end,size) => actor(id,'icon',start,end,box(size*.25,size*.25,size*.5,size*.5),{
    attachTo:MARK,icon:story.mark,fill:'onAccent',exit:'cut',evidenceIds:resultRef,
  });

  elementList.push(
    text('hook',story.hook,0,confirmation,left,edge*(wide ? .103 : .097),{
      ...display,enter:'kinetic-stretch',enterFrames:23,evidenceIds:actionRef,
    }),
    text('subject',story.subject,0,morph+2,box(panel.w*.05,panel.h*(photo ? .515 : .23),panel.w*.90,panel.h*.17),
      edge*.049,{...within,weight:750,enter:'none',enterFrames:1}),
    text('action-label',story.action,0,confirmation,box(8,2,button.w-16,button.h-4),edge*.035,{
      attachTo:MARK,fill:'onAccent',align:'center',weight:700,enter:'word-lift',enterFrames:12,evidenceIds:actionRef,
    }),
    text('confirmation',story.confirmation,confirmation,cut,confirmationBox,
      edge*.085,{...display,fill:'foreground',evidenceIds:actionRef}),
    actor('pointer','icon',press-15,press+20,box(button.x+button.w*.77,button.y+button.h*.51,edge*.048,edge*.056),{
      icon:'cursor',enter:'resolve',enterFrames:21,sound:'click',
      motion:[key(press-15,{x:48,y:64,opacity:0}),key(press-1),key(press+3,{scale:83,ease:'snap'}),key(press+8),
        key(press+19,{x:48,y:24,opacity:0})],
    }),
    actor('marker-on-control','icon',confirmation,turn+4,box(0,0,side*.5,side*.5),{
      attachTo:MARK,icon:story.mark,fill:'onAccent',enter:'resolve',enterFrames:6,evidenceIds:resultRef,
      motion:[
        key(confirmation,{x:Math.round(button.w/2-side*.25),y:Math.round(button.h/2-side*.25),scale:26}),
        key(morph,{x:Math.round(button.w/2-side*.25),y:Math.round(button.h/2-side*.25),scale:26}),
        key(turn,{x:Math.round(side*.25),y:Math.round(side*.25)}),
      ],
    }),
    actor('carrier-volume','volume',turn,push,box(centerX-face/2,centerY-face/2,face,face),{
      fill:'accent',enter:'resolve',enterFrames:4,evidenceIds:resultRef,
      mesh:{form:'box',depth,mark:story.mark,keys:[
        {frame:turn,rx:0,ry:0},{frame:turn+8,rx:-22,ry:29,ease:'fluid'},
        {frame:push-5,rx:0,ry:0,ease:'fluid'},
      ]},
    }),
    flatMark('marker-before-flood',push-7,cut,side),
    text('result-title',story.result,cut+5,frames,title,edge*.089,{
      ...display,enter:'kinetic-stretch',enterFrames:18,evidenceIds:resultRef,
    }),
    text('result-explanation',story.explanation,cut+9,frames,box(margin,H*.302,W-2*margin,H*.075),
      edge*.043,{space:'screen',weight:650,evidenceIds:resultRef}),
  );
  if (photo) {
    const side = Math.min(panel.w*.56,panel.h*.42);
    const opening = box(panel.x+(panel.w-side)/2,panel.y+panel.h*.255-side/2,side,side);
    const photoEvidence = source.evidence.find(item=>item.id===photo.evidenceId)?.id;
    const subjectRef = photoEvidence && !actionRef.includes(photoEvidence) ? [...actionRef,photoEvidence] : actionRef;
    const poseAt = (frame,x,y,size) => key(frame,{
      x:Math.round(x-opening.x-opening.w/2),
      y:Math.round(y-opening.y-opening.h/2),
      scale:Math.round(size/opening.w*100),
    });
    const dockX = proofPhoto.x+proofPhoto.w/2, dockY = proofPhoto.y+proofPhoto.h/2;
    const dockSize = sideBySide ? edge*.245 : proofPhoto.w;
    const photoStart = cut+12, photoLand = revealed+15;
    elementList.push(actor('result-product-panel','rect',photoLand-7,frames,proof,{
      space:'screen',fill:'surface',enter:'resolve',enterFrames:10,
    }));
    // The pack keeps its pose across the flood's cover. Only the panel around it changes.
    elementList.push(actor('subject-image','image',0,frames,opening,{
      space:'screen',assetId:photo.id,evidenceIds:subjectRef,
      motion:[key(0),key(morph-7),
        ...(sideBySide ? [poseAt(morph+8,W*.875,opening.y+opening.h/2,dockSize)] : []),
        poseAt(sideBySide ? turn+9 : morph+10,dockX,dockY,dockSize),
        poseAt(photoStart,dockX,dockY,dockSize),
        poseAt(photoLand,proofPhoto.x+proofPhoto.w/2,proofPhoto.y+proofPhoto.h/2,proofPhoto.w)],
    }));
    const inset = edge*.028;
    const nameBox = sideBySide ? box(proof.x+inset,proofPhoto.y+proofPhoto.h+H*.012,proof.w-2*inset,H*.105)
      : box(proof.x+inset,proof.y+proof.h*.24,proofPhoto.x-proof.x-2*inset,proof.h*.67);
    elementList.push(text('result-subject',story.subject,photoLand-1,frames,nameBox,
      edge*.044,{space:'screen',align:sideBySide ? 'center' : 'left',weight:750,evidenceIds:subjectRef}));
  }
  if (story.repeatDetail) {
    const last = cards.at(-1);
    elementList.push(text('schedule-event',story.repeatDetail,last.at+5,frames,
      box(margin,last.area.y+last.area.h+edge*.022,W-2*margin,H*.066),edge*.040,{
        space:'screen',weight:650,evidenceIds:resultRef,
      }));
  }
  if (story.subjectDetail) elementList.push(text('subject-detail',story.subjectDetail,0,morph+2,
    box(panel.w*.055,panel.h*(photo ? .657 : .43),panel.w*.89,panel.h*.095),edge*.030,
    {...within,fill:'muted',enter:'none',enterFrames:1}));
  const logo = source.assets.some(asset => asset.kind === 'logo');
  if (logo) elementList.push(actor('brand-logo','logo',0,frames,box(margin,H*.055,edge*.05,edge*.05),{space:'screen'}));
  elementList.push(text('brand',brand,0,frames,box(margin+(logo?edge*.064:0),H*.057,W*.55,edge*.061),edge*.032,{
    ...display,enter:'none',enterFrames:1,
  }));
  for (const [index,{item,area,marker,at}] of cards.entries()) {
    const x = marker.x + marker.w + area.w*.06;
    const labelY = area.y + area.h*(item.detail ? .18 : .32);
    const labelW = area.x+area.w*.95-x;
    const labelSize = Math.min(edge*.05,Math.max(edge*.034,area.h*(item.detail ? .21 : .34)));
    if (!index) elementList.push(flatMark('result-marker',at,frames,marker.w));
    else elementList.push(
      actor(`mark-bg-${index}`,'rect',at,frames,marker,{space:'screen',fill:'accent',enter:'resolve',enterFrames:9}),
      actor(`mark-${index}`,'icon',at,frames,box(marker.x+marker.w*.25,marker.y+marker.h*.25,marker.w*.5,marker.h*.5),{
        space:'screen',fill:'onAccent',icon:story.mark,enter:'resolve',enterFrames:9,evidenceIds:resultRef,
      }),
    );
    if (index && story.repeatDetail) {
      const previous = cards[index-1].area;
      const segment = stacked ? box(area.x+area.w*.083+marker.w/2-1,previous.y+previous.h,2,area.y-previous.y-previous.h)
        : box(previous.x+previous.w,area.y+area.h/2-1,area.x-previous.x-previous.w,2);
      const points = [0,333,667,1000].map(value=>stacked ? {x:500,y:value} : {x:value,y:500});
      elementList.push(actor(`recurrence-${index}`,'stroke',at-5,frames,segment,{
        space:'screen',fill:'muted',enter:'draw',enterFrames:12,evidenceIds:resultRef,curve:{points,width:3},
      }));
    }
    elementList.push(text(`outcome-${index}`,item.label,index ? at : cut+11,frames,
      box(x,labelY,labelW,item.detail ? area.h*.35 : area.h*.66),
      labelSize,{space:'screen',weight:750,evidenceIds:resultRef}));
    if (item.detail) elementList.push(text(`outcome-note-${index}`,item.detail,at+3,frames,
      box(x,area.y+area.h*.565,labelW,area.h*.30),edge*.029,{space:'screen',fill:'muted',evidenceIds:resultRef}));
  }
  const score = {
    version:1,staging:'connected',style,brand,width:W,height:H,frames,fps,palette,concept:story.causalLink,
    scenes:[
      {id:'hook',start:0,end:actionScene,purpose:story.hook,groundStyle:'flat'},
      {id:'action',start:actionScene,end:morph,purpose:story.action,groundStyle:'flat'},
      {id:'consequence',start:morph,end:cut,purpose:story.confirmation,groundStyle:'flat'},
      {id:'result',start:cut,end:frames,purpose:story.result,groundStyle:'flat',
        flood:{target:MARK,frames:pushFrames,revealFrames,land:true,mark:story.mark}},
    ],
    shapes:[
      {id:'subject-panel',elevation:1,states:[
        state(0,1,panel,'surface'),state(morph-(wide ? 5 : 8),10,panel,'surface',{opacity:0}),
      ]},
      ...cards.map(({area,at},index)=>({id:`result-card-${index}`,elevation:0,states:[
        state(0,1,area,'surface',{opacity:0}),state(index ? at-5 : cut,11,area,'surface',{opacity:100}),
      ]})),
      {id:MARK,elevation:0,states:[
        state(0,1,button,'accent'),state(press,4,centered(button,.94),'accent'),
        state(press+4,6,button,'accent'),
        state(morph,22,big,'accent',{contour:'roundRect'}),
        state(turn,4,big,'accent',{opacity:0}),
        state(push-8,4,big,'accent',{opacity:100}),
        state(cut,1,landing,'accent'),
      ]},
    ],
    elements:elementList,
    camera:[
      {frame:0,x:Math.round(W/2-panel.x-panel.w/2),y:Math.round(H/2-panel.y-panel.h/2),zoom:100,rotate:0,target:'subject-panel'},
      {frame:cut,x:Math.round(W/2),y:Math.round(H/2),zoom:100,rotate:0},
    ],
  };
  return validateScore(score,{...settings,motionRecipe:CONNECTED_STORY},source);
}

export function compileContinuousMorph(value, settings, source) {
  const story = validateConnectedStory(value, source);
  const {width:W, height:H, frames, fps, style} = settings;
  const edge = Math.min(W, H), wide = W > H * 1.12;
  const palette = source.brand?.interfacePalette ?? resolveInterfacePalette().palette;
  const brand = String(source.nameHint || story.brand || 'KADR').slice(0, 64);
  const captures = images(source);
  const photo = captures.find(asset => asset.id === story.assetId) ??
    (style === 'product-demo' ? captures.find(asset => asset.kind === 'screenshot') : undefined);
  const press = Math.round(frames * .265), detach = press + 12;
  const seedAt = detach + 24, bloom = seedAt + 23;
  const returnAt = Math.round(frames * .565), landing = returnAt + 28;
  const calm = settings.pace === 'calm';

  const panelW = W * (wide ? .60 : .82), panelH = edge * (photo ? .37 : .23);
  const panel = box((W - panelW) / 2, H * .55 - panelH / 2, panelW, panelH, edge * .033);
  const buttonShare = photo && !wide ? .43 : .37;
  const button = box(panel.x + panel.w * (.95 - buttonShare), panel.y + panel.h - edge * .113,
    panel.w * buttonShare, edge * .088, edge * .024);
  const squareAt = (x, y, size, radius = 0) => box(x - size / 2, y - size / 2, size, size, radius);
  const seed = squareAt(W / 2, H * .51, edge * .049);
  const bloomBox = squareAt(W / 2, H * .50, edge * .28);
  const rowH = edge * .113, rowPad = edge * .029;
  const resultH = rowH * story.outcomes.length + rowPad * 2;
  const result = box((W - panelW) / 2, H * .47, panelW, resultH, edge * .035);
  const badgeSize = edge * .069;
  const badge = squareAt(result.x + result.w * .091, result.y + rowPad + rowH / 2, badgeSize, edge * .018);
  const actionRef = [story.actionEvidenceId], resultRef = [story.resultEvidenceId];
  const text = (id, copy, start, end, bounds, size, props = {}) => actor(id, 'text', start, end, bounds, {
    text:copy, fontSize:Math.round(size), weight:650, align:'center', enter:'mask-rise', enterFrames:13, ...props,
  });
  const subjectBounds = photo
    ? box(panel.w * .46, panel.h * .20, panel.w * .48, panel.h * .28)
    : box(panel.w * .054, panel.h * .18, panel.w * .89, panel.h * .36);
  const textWidth = W * .82, textLeft = (W - textWidth) / 2;
  const textBox = (y, height) => box(textLeft, H * y, textWidth, H * height);
  const elements = [
    text('brand', brand, 0, frames, textBox(.070, .055), edge * .034, {space:'screen', enter:'none', enterFrames:1}),
    text('hook', story.hook, 0, detach, textBox(photo && W === H ? .15 : .20, .20), edge * .092, {
      space:'screen', font:'display', weight:800, enter:'word-lift', enterFrames:18, evidenceIds:actionRef,
    }),
    text('subject', story.subject, 9, detach + 8, subjectBounds, edge * .050, {
      attachTo:'input-panel', align:'left', enter:photo ? 'mask-rise' : 'word-type', enterFrames:18, evidenceIds:actionRef,
    }),
    text('action-label', story.action, 0, detach,
      box(6, button.h * (wide ? .22 : .18), button.w - 12, button.h * (wide ? .78 : .82)), edge * .032, {
      attachTo:MARK, fill:'onAccent', enter:'none', enterFrames:1, evidenceIds:actionRef,
    }),
    actor('pointer', 'icon', press - 24, detach + 12,
      box(button.x + button.w * .82, button.y + button.h * .65, edge * .042, edge * .054), {
        icon:'cursor', enter:'resolve', enterFrames:34, sound:'click', motion:[
          key(press - 24, {x:44, y:62}), key(press), key(press + 4, {scale:82, ease:'snap'}),
          key(detach + 11, {x:24, y:22, opacity:0}),
        ],
      }),
    text('confirmation', story.confirmation, seedAt + 5, returnAt + 4, textBox(.69, .095), edge * .044, {
      space:'screen', evidenceIds:actionRef,
    }),
    text('result-title', story.result, landing - 10, frames, textBox(.19, .16), edge * .082, {
      space:'screen', font:'display', weight:800, evidenceIds:resultRef,
    }),
    text('result-explanation', story.explanation, landing - 2, frames, textBox(.36, .09), edge * .037, {
      space:'screen', fill:'muted', evidenceIds:resultRef,
    }),
    actor('result-marker', 'icon', landing, frames, box(badge.w * .24, badge.h * .24, badge.w * .52, badge.h * .52), {
      attachTo:MARK, icon:story.mark, fill:'onAccent', enter:'resolve', enterFrames:7, sound:'ding', evidenceIds:resultRef,
    }),
  ];
  if (photo) elements.push(actor('subject-image', 'image', 0, detach + 8,
    box(panel.w * .047, panel.h * .085, panel.w * .36, panel.h * .83), {
      attachTo:'input-panel', assetId:photo.id, evidenceIds:actionRef,
    }));
  if (story.subjectDetail) elements.push(text('subject-detail', story.subjectDetail, 24, detach + 8,
    box(subjectBounds.x, panel.h * (photo ? .49 : .53), panel.w * (photo ? .45 : .50), edge * .079),
    edge * .031, {attachTo:'input-panel', align:'left', fill:'muted', evidenceIds:actionRef}));
  for (const [index, item] of story.outcomes.entries()) {
    const y = rowPad + index * rowH;
    const at = landing + 1 + index * 8;
    const detail = story.repeatDetail ?? item.detail;
    const x = result.w * .17, width = result.w * .77;
    if (index) {
      elements.push(actor(`row-marker-${index}`, 'icon', at, frames,
        box(result.w * .064, y + rowH * .28, badgeSize * .71, badgeSize * .71), {
          attachTo:'result-panel', icon:story.mark, fill:'accent', enter:'resolve', enterFrames:9, evidenceIds:resultRef,
        }));
    }
    elements.push(text(`outcome-${index}`, item.label, at, frames,
      box(x, y + rowH * (detail ? .10 : .26), width, rowH * .45), edge * .041, {
        attachTo:'result-panel', align:'left', evidenceIds:resultRef,
      }));
    if (detail) elements.push(text(`outcome-detail-${index}`, detail, at + 3, frames,
      box(x, y + rowH * .55, width, rowH * .41), edge * .030, {
        attachTo:'result-panel', align:'left', fill:'muted', evidenceIds:resultRef,
      }));
  }

  const camera = (frame, zoom, target) => ({
    frame, x:target ? 0 : Math.round(W / 2), y:Math.round(target ? H * -.05 : H / 2),
    zoom, rotate:0, ease:'fluid', ...(target && {target}),
  });
  const score = {
    version:1, staging:'connected', style, brand, width:W, height:H, frames, fps, palette, concept:story.causalLink,
    scenes:[
      {id:'input', start:0, end:press - 18, purpose:story.hook, groundStyle:'halo'},
      {id:'press', start:press - 18, end:seedAt, purpose:story.action, groundStyle:'halo'},
      {id:'bloom', start:seedAt, end:returnAt, purpose:story.confirmation, groundStyle:'halo'},
      {id:'result', start:returnAt, end:frames, purpose:story.result, groundStyle:'halo'},
    ],
    shapes:[
      {id:'input-panel', elevation:1, states:[
        state(0, 1, panel, 'surface'), state(detach - 6, 15, centered(panel, .95), 'surface', {opacity:0}),
      ]},
      {id:'result-panel', elevation:1, states:[
        state(0, 1, result, 'surface', {opacity:0}),
        state(landing - 12, 18, result, 'surface', {opacity:100}),
      ]},
      {id:MARK, elevation:0, states:[
        state(0, 1, button, 'accent'), state(press, 4, centered(button, .93), 'accent'),
        state(press + 4, 6, button, 'accent'),
        state(detach, 24, seed, 'accent', {contour:'ellipse', rotate:-20}),
        state(seedAt, 23, bloomBox, 'accent', {contour:'burst', rotate:calm ? 18 : 46}),
        state(bloom, 20, centered(bloomBox, .88), 'accent', {contour:'burst', rotate:calm ? 26 : 67}),
        state(returnAt, 28, badge, 'accent', {rotate:0}),
      ]},
    ],
    elements,
    camera:[
      camera(0, 100, 'input-panel'), camera(press, calm ? 103 : 106, 'input-panel'),
      camera(seedAt, 100), camera(returnAt, calm ? 102 : 108), camera(landing + 12, 100),
    ],
  };
  return validateScore(score, settings, source);
}
