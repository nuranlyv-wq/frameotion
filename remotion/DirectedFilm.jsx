import React from 'react';
import { AbsoluteFill,useCurrentFrame,useVideoConfig,Img } from 'remotion';
import { actorAt,worldCameraAt } from '../src/production/world.js';
import { solidFaces } from '../src/production/solid-faces.js';
import { Text,InterfaceElement } from './Production.jsx';
const FONT={sans:'KadrDisplay, KadrInter, sans-serif',serif:'KadrSerif, serif',mono:'KadrMono, monospace'};
const SYMBOL={arrow:'M16 50H84M57 23 84 50 57 77',check:'M20 51 41 72 82 27',plus:'M50 15V85M15 50H85',play:'M32 18 82 50 32 82Z',spark:'M50 4Q53 44 96 50Q55 54 50 96Q46 55 4 50Q45 46 50 4Z',lock:'M24 45H76V88H24ZM34 45V29A16 16 0 0 1 66 29V45M50 63V73',door:'M22 92V10H78V92M12 92H88M64 51H65',calendar:'M14 24H86V88H14ZM14 42H86M32 12V30M68 12V30M32 58H45V71H32Z'};

function Actor({node,nodes,kit,art,timeline,frame,parentW,parentH,resources,movingParent=false}){
 const p=actorAt(node,frame,resources.curves),before=actorAt(node,Math.max(0,frame-2),resources.curves),after=actorAt(node,Math.min(timeline.frames-1,frame+2),resources.curves);
 const moving=movingParent||['w','h','scale','x','y','rotate','opacity','reveal','blur','rotateX','rotateY','originX','originY','characters','tracking','maskSize','depth'].some(k=>Math.abs(after[k]-before[k])>.1);
 if(p.opacity<.1)return null;
 const w=p.w/1000*parentW,h=p.h/1000*parentH,unit=Math.min(timeline.width,timeline.height)/1000;
 const style={position:'absolute',left:p.x/1000*parentW-w/2,top:p.y/1000*parentH-h/2,width:w,height:h,
  opacity:p.opacity/100,transform:`${p.rotateX||p.rotateY?`perspective(${Math.max(w,h)*3}px) rotateX(${p.rotateX}deg) rotateY(${p.rotateY}deg) `:''}rotate(${p.rotate}deg) scale(${p.scale/100})`,transformOrigin:`${p.originX/10}% ${p.originY/10}%`,
  borderRadius:node.kind==='ellipse'?'50%':p.radius*unit,
  overflow:node.clip?'hidden':undefined,clipPath:p.reveal<100?`inset(0 ${100-p.reveal}% 0 0)`:undefined,
  boxShadow:node.shadow?`0 ${14*unit}px ${45*unit}px #00000024`:undefined};
 if(p.blur)style.filter=`blur(${p.blur*unit}px)`;
 if(node.blend)style.mixBlendMode=node.blend;
 if(node.mask==='circle')style.clipPath=`circle(${Math.max(0,p.maskSize)/2}% at 50% 50%)`;
 const fill=art.palette[p.fill],stroke=(node.stroke||3)*unit;
 const hasDepth=Boolean(node.pose.depth||node.keys.some(key=>key.depth));
 const solid=p.depth*unit>=1&&hasDepth;
 if(solid)style.transformStyle='preserve-3d';
 let content=null;
 if(!solid&&['rect','ellipse'].includes(node.kind))style.background=fill;
 if(node.kind==='ring')style.border=`${stroke}px solid ${fill}`,style.borderRadius='50%';
 if(node.kind==='text')content=<Text target={node.id} scene="world" frame={frame} audit={!moving} auditFrame style={{width:'100%',height:'100%',fontFamily:resources.fonts[node.fontId]?.family||FONT[node.font],fontWeight:node.fontWeight||(resources.fonts[node.fontId]?Math.min(700,resources.fonts[node.fontId].weight.at(-1)):(node.font==='mono'?500:800)),fontSize:node.fontSize*unit,lineHeight:1.06,letterSpacing:p.tracking?`${p.tracking/1000}em`:node.font==='sans'?'-0.035em':0,color:fill,textAlign:node.align,whiteSpace:'pre-line'}} center>{Array.from(node.text).slice(0,Math.max(0,Math.floor(p.characters))).join('')}</Text>;
 if(node.kind==='image'){
  const src=resources.images[node.assetId]?.src;
  if(!src)throw new Error(`Unresolved local image ${node.assetId}`);
  content=node.tint?<div style={{width:'100%',height:'100%',background:fill,maskImage:`url(${src})`,maskSize:node.fit||'contain',maskRepeat:'no-repeat',maskPosition:'center'}}/>:<Img src={src} style={{width:'100%',height:'100%',objectFit:node.fit||'contain'}}/>;
 }
 if(node.kind==='path'){
  const points=node.points.map(p=>({x:p.x*w/1000,y:p.y*h/1000}));
  const length=points.reduce((sum,p,i)=>i?sum+Math.hypot(p.x-points[i-1].x,p.y-points[i-1].y):sum,0);
  content=<svg viewBox={`0 0 ${w} ${h}`} width="100%" height="100%" preserveAspectRatio="none" style={{overflow:'visible',opacity:p.draw>0?1:0}}><polyline points={points.map(p=>`${p.x},${p.y}`).join(' ')} fill="none" stroke={fill} strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" strokeDasharray={p.draw>=100?undefined:`${length} ${length}`} strokeDashoffset={p.draw>=100?undefined:length*(1-Math.max(0,p.draw)/100)}/></svg>;
 }
 if(node.kind==='symbol')content=<svg viewBox="0 0 100 100" width="100%" height="100%"><path d={SYMBOL[node.symbol]} fill={['play','spark'].includes(node.symbol)?fill:'none'} stroke={fill} strokeWidth="5" strokeLinecap="round" strokeLinejoin="round"/></svg>;
 if(node.kind==='cursor')content=<svg viewBox="0 0 40 44" width="100%" height="100%" style={{filter:'drop-shadow(0 3px 3px #0004)'}}><path d="M5 3 35 26 21 27 17 41Z" fill={fill} stroke={art.palette.background} strokeWidth="2"/></svg>;
 if(node.kind==='brackets')content=<svg width="100%" height="100%" viewBox={`0 0 ${w} ${h}`}><path d={`M0 25V0H25M${w-25} 0H${w}V25M${w} ${h-25}V${h}H${w-25}M25 ${h}H0V${h-25}`} fill="none" stroke={fill} strokeWidth={stroke}/></svg>;
 if(node.kind==='component'){
  const component=kit.components.find(c=>c.id===node.componentId),cue=node.states.findLast(s=>s.at<=frame),state=component.states.find(s=>s.id===cue.id);
  content=component.elements.map(el=>{const prop=state.props.find(s=>s.target===el.id);if(!prop.visible)return null;
   return <InterfaceElement key={el.id} element={el} prop={prop} palette={art.palette} radius={art.radius*unit} font={FONT[art.typography]} unit={unit}
    frame={frame} scene="world" target={`${node.id}:${el.id}`} value={prop.value} area={el.bounds} audit={!moving} auditFrame
    style={{position:'absolute',left:`${el.bounds.x/10}%`,top:`${el.bounds.y/10}%`,width:`${el.bounds.w/10}%`,height:`${el.bounds.h/10}%`}}/>;});
 }
 const attached=<>{content}{nodes.filter(n=>n.parent===node.id).map(n=><Actor key={n.id} node={n} nodes={nodes} kit={kit} art={art} timeline={timeline} frame={frame} parentW={w} parentH={h} resources={resources} movingParent={moving}/>)}</>;
 return <div data-object={node.id} style={style}>
  {solid&&solidFaces(w,h,p.depth*unit,p.radius*unit,fill,art.palette.muted).map(face=><div key={face.id} style={face.style}/>)}
  {hasDepth?<div style={{position:'absolute',inset:0,isolation:'isolate',backfaceVisibility:'hidden',
   transform:solid?'translateZ(1px)':undefined}}>{attached}</div>:attached}
 </div>;
}
export function DirectedFilm({timeline,kit,narrative,resources}){
 const outputFrame = useCurrentFrame(), {fps:outputFps} = useVideoConfig();
 const frame = outputFrame * timeline.fps / outputFps;
 const camera=worldCameraAt(timeline.world,frame,resources.curves),{width,height}=timeline,art=narrative.artDirection;
 const earlier=worldCameraAt(timeline.world,Math.max(0,frame-2),resources.curves),later=worldCameraAt(timeline.world,Math.min(timeline.frames-1,frame+2),resources.curves);
 const cameraMoving=['x','y','zoom','rotate'].some(k=>Math.abs(later[k]-earlier[k])>.05);
 const conceptual=timeline.world.nodes.some(n=>n.kind==='component'&&actorAt(n,frame).opacity>1&&kit.components.find(c=>c.id===n.componentId)?.fidelity==='conceptual')||
  (timeline.world.demonstrations||[]).some(d=>frame>=d.start&&frame<d.end&&kit.components.find(c=>c.id===d.componentId)?.fidelity==='conceptual');
 return <AbsoluteFill data-kadr-frame style={{background:art.palette[timeline.world.background],overflow:'hidden'}}>
  <AbsoluteFill style={{transformOrigin:'0 0',transform:`translate(${width/2}px,${height/2}px) rotate(${camera.rotate}deg) scale(${camera.zoom/100}) translate(${-camera.x/1000*width}px,${-camera.y/1000*height}px)`}}>
   {timeline.world.nodes.filter(n=>!n.parent).map(n=><Actor key={n.id} node={n} nodes={timeline.world.nodes} kit={kit} art={art} timeline={timeline} frame={frame} parentW={width} parentH={height} resources={resources} movingParent={cameraMoving}/>) }
  </AbsoluteFill>
  {conceptual&&<div style={{position:'absolute',left:'3%',bottom:'2%',font:`${Math.min(width,height)*.016}px KadrMono`,color:art.palette.foreground,background:art.palette.background,padding:'3px 7px',opacity:.75}}>CONCEPT UI · SAMPLE DATA</div>}
 </AbsoluteFill>;
}
