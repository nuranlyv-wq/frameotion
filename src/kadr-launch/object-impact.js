import {resolveInterfacePalette} from './interface-palette.js';

export const supportsObjectImpact = settings => settings.pace === 'dynamic' &&
  settings.width === 1920 && settings.height === 1080 && settings.frames >= 450 && settings.frames <= 600;

// Stage durations serve different jobs. Frame numbers are 30 fps score time;
// the final exports two independently sampled poses per score frame.
const [A,B,C,D,E,F] = [0,76,162,254,366,450];
const box = (x,y,w,h,radius=0) => ({x,y,w,h,radius});
const key = (frame, fields={}) => ({frame,x:0,y:0,scale:100,rotate:0,opacity:100,ease:'glide',...fields});
const cut = {exit:'cut'};
const fixed = {space:'screen',...cut};
const onCard = {attachTo:'product-stamp',...cut};
const mask = (frames=12) => ({enter:'mask-rise',enterFrames:frames});
const pop = (frames=12) => ({enter:'pop',enterFrames:frames});
const el = (id,kind,start,end,bounds,opts={}) => ({id,kind,start,end,box:bounds,fill:'foreground',enter:'none',enterFrames:1,sound:'none',evidenceIds:[],...opts});
const type = (id,copy,size,start,end,bounds,opts={}) => el(id,'text',start,end,bounds,{text:copy,fontSize:size,weight:700,...opts});
const display = (id,copy,size,start,end,bounds,opts={}) => type(id,copy,size,start,end,bounds,{font:'display',weight:800,...opts});
const icon = (id,mark,start,end,bounds,opts={}) => el(id,'icon',start,end,bounds,{icon:mark,...opts});
const rect = (id,start,end,bounds,fill,opts={}) => el(id,'rect',start,end,bounds,{fill,...opts});
const pill = (id,copy,size,start,end,bounds,opts={}) => el(id,'pill',start,end,bounds,{text:copy,fontSize:size,weight:700,...opts});
const cam = (frame,x=960,y=540,zoom=100,rotate=0,opts={}) => ({frame,x,y,zoom,rotate,ease:'fluid',...opts});
const scene = (id,start,end,purpose,ground,groundStyle='flat',opts={}) => ({id,start,end,purpose,ground,groundStyle,...opts});
const straight = (id,start,end,x,y,w) => el(id,'stroke',start,end,box(x,y,w,12),{
  ...cut,enter:'draw',enterFrames:11,curve:{points:[{x:0,y:500},{x:333,y:500},{x:666,y:500},{x:1000,y:500}],width:5},
});

export function stageObjectImpact(story, settings, source, photo) {
  const demo = story.demo;
  const subjectEvidence = photo.evidenceId ?? demo.actionEvidenceId;
  const sampledPalette = source.brand?.interfacePalette ?? resolveInterfacePalette().palette;
  const palette = {...sampledPalette, surface:sampledPalette.background};
  const accentOnDark = palette.accent === palette.foreground ? 'surface' : 'accent';
  const [first, middle, last] = story.steps.length === 3 ? story.steps : [story.steps[0], null, story.steps[1]];
  const labels = [[309,185,first],[933,198,middle],[1569,210,last]].filter(([, , label]) => label);
  const actionRef = [demo.actionEvidenceId], benefitRef = [story.evidenceId];
  const benefitSize = story.benefit.length > 18 ? 128 : story.benefit.length > 10 ? 155 : 247;
  const prefix = demo.benefitTitle + ' ';
  const qualification = story.qualifier.toLowerCase().startsWith(prefix.toLowerCase())
    ? story.qualifier.slice(prefix.length) : story.qualifier;
  const score = {
    version:1,staging:'connected',style:settings.style,brand:story.brand,width:settings.width,height:settings.height,fps:settings.fps,frames:F,shapeSounds:true,
    concept:'The product rolls into a control card. The press reveals a route, whose final mark becomes a parcel and then the brand mark.',
    palette,
    scenes:[
      scene('hook',A,B,'Introduce the offer and product','background'),
      scene('subscribe',B,C,'The product moves onto the control card','foreground','flat',{
        link:{kind:'carry',anchor:'product-stamp',why:'The photograph stays attached to the moving surface.'},
      }),
      scene('monthly',C,D,'The press reveals the recurring route','accent','flat',{
        link:{kind:'portal',why:'The portal opens at the switch.'},
        transition:{kind:'portal',frames:14,x:1621,y:627},
      }),
      scene('delivery',D,E,'The last marker becomes a parcel beside the benefit','foreground','aurora',{
        link:{kind:'carry',anchor:'calendar-parcel-logo',why:'The final marker leaves the route and gains depth.'},
      }),
      scene('close',E,F,'Land on the brand and call to action','background','flat',{
        link:{kind:'carry',anchor:'calendar-parcel-logo',why:'The parcel flattens into the brand mark on the same trajectory.'},
      }),
    ],
    shapes:[{
      id:'halo',states:[
        {frame:0,duration:0,box:box(1026,119,818,818,409),fill:'accent',contour:'ellipse'},
        {frame:4,duration:18,box:box(1040,136,720,720,360),fill:'accent',contour:'ellipse',ease:'glide'},
        {frame:65,duration:11,box:box(1100,196,600,600,300),fill:'accent',contour:'ellipse',opacity:0,ease:'fluid'},
      ],
    },{
      id:'product-stamp',elevation:0,states:[
        {frame:0,duration:0,box:box(1260,216,530,530,262),fill:'surface',contour:'ellipse',rotate:-42},
        {frame:2,duration:20,box:box(1146,234,520,520,260),fill:'surface',contour:'ellipse',rotate:0,ease:'spring'},
        {frame:63,duration:13,box:box(1132,249,510,510,255),fill:'surface',contour:'ellipse',rotate:0,ease:'fluid'},
        {frame:B,duration:25,box:box(960,288,812,481,42),fill:'surface',contour:'roundRect',rotate:0,ease:'fluid'},
        {frame:C,duration:0,box:box(960,288,812,481,42),fill:'surface',opacity:0},
      ],
    },{
      id:'route-marker',states:[
        {frame:0,duration:0,box:box(1518,574,122,122,61),fill:'onAccent',contour:'ellipse',opacity:0},
        {frame:C,duration:0,box:box(1518,574,122,122,61),fill:'onAccent',contour:'ellipse',opacity:100},
        {frame:C+2,duration:30,box:box(248,574,122,122,34),fill:'onAccent',contour:'roundRect',rotate:-360,ease:'fluid'},
        {frame:D,duration:0,box:box(248,574,122,122,34),fill:'onAccent',opacity:0},
      ],
    }],
    elements:[
      // Hook: photo on a real white stamp. The stamp and its contents keep the same IDs into the subscription shot.
      el('product-photo','image',A,C,box(78,78,364,364),{...onCard,assetId:photo.id,evidenceIds:[subjectEvidence],
        motion:[key(A,{scale:105}),key(22),key(63),key(B),key(101,{x:-95,y:-11,scale:73,ease:'fluid'}),key(161,{x:-95,y:-11,scale:73})]}),
      el('hook-mark','logo',A,B,box(124,100,70,70),fixed),
      type('hook-brand',story.brand,43,A,B,box(215,109,245,57),fixed),
      display('hook-hero',demo.lead,228,A,B,box(113,278,895,279),{...fixed,motion:[key(A,{x:-21,scale:96}),key(15,{ease:'spring'}),key(64),key(75,{x:-60,opacity:0,ease:'fluid'})]}),
      display('hook-offer',demo.subline,96,A,B,box(124,557,894,180),{...fixed,enter:'kinetic-stretch',enterFrames:16,evidenceIds:actionRef,
        motion:[key(A,{x:18,scale:93}),key(18,{ease:'spring'}),key(65),key(75,{x:-65,opacity:0,ease:'fluid'})]}),
      type('hook-caption',demo.context,38,20,B,box(128,752,650,56),{...fixed,...mask(),fill:'muted',evidenceIds:actionRef}),

      // Actual photo, explicitly schematic controls. Camera gives the press a local accent.
      display('ui-title',demo.actionTitle,114,B,C,box(117,302,750,305),{...fixed,enter:'word-lift',enterFrames:19,fill:'surface',evidenceIds:actionRef}),
      type('ui-caption',demo.actionHint,39,94,C,box(126,654,725,55),{...fixed,...mask(),fill:'surface',evidenceIds:actionRef}),
      type('item-brand',demo.productName,54,94,C,box(336,110,400,76),{...onCard,...mask(10),evidenceIds:[subjectEvidence]}),
      type('item-caption',demo.productDetail,34,97,C,box(339,182,400,82),{...onCard,...mask(9),fill:'muted',evidenceIds:[subjectEvidence]}),
      rect('ui-rule',100,C,box(338,273,410,2,1),'muted',{...onCard,enter:'resolve',enterFrames:10}),
      type('toggle-label',demo.control,38,100,C,box(337,313,252,57),{...onCard,...mask(9),evidenceIds:actionRef}),
      el('subscribe-toggle','toggle',101,C,box(599,302,149,72,36),{...onCard,...pop(),changeAt:127,on:true}),
      icon('clicker','cursor',112,145,box(666,336,54,66),{...onCard,clickAt:127,
        motion:[key(112,{x:73,y:41,opacity:0}),key(116,{x:58,y:26}),key(127),key(130,{scale:79,ease:'snap'}),key(137,{scale:100,ease:'spring'}),key(144,{x:33,y:21,opacity:0})]}),
      icon('confirmed','circle-check',132,C,box(340,399,38,38),{...onCard,enter:'draw',enterFrames:8}),
      type('confirmation',demo.state,33,132,C,box(394,393,352,46),{...onCard,...mask(5),evidenceIds:actionRef}),

      // Portal → horizontal route. The action names become readable after the short burst.
      display('schedule-title',story.route,story.route.length>22 ? 132 : 147,C+4,D,box(118,218,1650,238),{...fixed,enter:'word-lift',enterFrames:21,fill:'onAccent',evidenceIds:benefitRef}),
      straight('segment-one',185,D,383,629,middle ? 476 : 1111),
      ...(middle ? [straight('segment-two',199,D,1018,629,476),
        rect('month-two',194,D,box(872,574,122,122,32),'onAccent',{...cut,...pop(12),sound:'pop'}),
        icon('second-calendar','calendar',196,D,box(894,597,78,78),{...cut,fill:'accent',...pop(11)})] : []),
      icon('first-calendar','calendar',178,D,box(22,23,78,78),{attachTo:'route-marker',...cut,fill:'accent',enter:'resolve',enterFrames:8}),
      ...labels.map(([x,at,label],i)=>type(`month-label-${i+1}`,label,48,at,x===1569 ? D-4 : D,
        box(x-170,729,340,67),{...fixed,...mask(9),align:'center',fill:'onAccent'})),

      // One actor spans all three scenes. The price has its own visual pause.
      type('delivery-context',demo.context,34,D,E,box(128,108,650,54),{...fixed,...mask(10),fill:accentOnDark,evidenceIds:actionRef}),
      display('delivery-title',demo.benefitTitle,106,D+2,E,box(123,255,754,151),{...fixed,...mask(15),fill:'surface',evidenceIds:actionRef}),
      display('delivery-zero',story.benefit,benefitSize,D+15,E,box(115,406,775,310),{...fixed,fill:accentOnDark,sound:'ding',evidenceIds:benefitRef}),
      type('delivery-condition',qualification,53,D+15,E,box(129,745,820,128),{...fixed,fill:'surface',evidenceIds:benefitRef}),
      el('calendar-parcel-logo','transform',208,F,box(548,345,234,234,61),{...fixed,...pop(12),fill:'accent',sound:'pop',
        formTrack:{depth:174,keys:[
          {frame:208,form:'tile',mark:'calendar',fill:'onAccent'},
          {frame:D-17,form:'tile',mark:'calendar',fill:'onAccent'},
          {frame:D+7,form:'box',mark:'box',rx:-21,ry:-49},
          {frame:D+30,form:'box',mark:'box',rx:17,ry:35},
          {frame:E-12,form:'box',mark:'box',rx:17,ry:35},
          {frame:E+22,form:'logo'},
        ]},
        motion:[key(208,{x:904,y:173,scale:52}),key(D-17,{x:904,y:173,scale:52}),
          key(D,{x:840,y:93,scale:106,rotate:-12,ease:'fluid'}),
          key(D+30,{x:685,y:63,scale:190,ease:'fluid'}),key(E-12,{x:685,y:63,scale:190}),
          key(E+2,{x:450,y:20,scale:157,rotate:-9,ease:'fluid'}),key(E+22,{ease:'fluid'})]}),

      display('wordmark',story.brand,211,E+15,F,box(832,328,690,260),{...fixed,...mask(19)}),
      type('end-caption',story.hook,46,E+13,F,box(440,626,1040,65),{...fixed,...mask(13),align:'center',evidenceIds:actionRef}),
      pill('end-link',demo.cta,45,E+20,F,box(655,746,610,101,51),{...fixed,...pop(14),fill:'foreground',sound:'ding'}),
    ],
    camera:[cam(0,978,548,104,-1),cam(20),cam(63),cam(B),cam(106),
      cam(127,-556,-68,117,0,{target:'subscribe-toggle'}),cam(141,-556,-68,117,0,{target:'subscribe-toggle'}),
      cam(161),cam(C),cam(D),cam(D+35,1013,538,105,1),cam(D+57,1009,538,104,0),cam(E-13,1010,538,104),cam(E),cam(F)],
  };

  return retimeImpact(score, settings.frames);
}

// Keep the impact and rest relationships when adapting the short landscape cut.
function retimeImpact(score, frames) {
  if (frames === F) return score;
  const frame = at => Math.round(at * frames/F);
  const keys = track => track.map(key => ({...key,frame:frame(key.frame)}));
  return {...score,frames,
    scenes:score.scenes.map(scene => ({...scene,start:frame(scene.start),end:frame(scene.end)})),
    shapes:score.shapes.map(shape => ({...shape,states:shape.states.map(state => ({...state,
      frame:frame(state.frame),duration:frame(state.frame+state.duration)-frame(state.frame),
    }))})),
    elements:score.elements.map(element => ({...element,start:frame(element.start),end:frame(element.end),
      ...(element.clickAt !== undefined && {clickAt:frame(element.clickAt)}),
      ...(element.changeAt !== undefined && {changeAt:frame(element.changeAt)}),
      ...(element.motion && {motion:keys(element.motion)}),
      ...(element.formTrack && {formTrack:{...element.formTrack,keys:keys(element.formTrack.keys)}}),
    })),
    camera:keys(score.camera),
  };
}
