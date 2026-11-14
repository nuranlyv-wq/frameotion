import React from 'react';
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from 'remotion';
import { clamp01, progress as P, track as T, windowAt as W } from '../src/production/choreography.js';

const PAPER = '#f3f5f8', INK = '#0e0f12', BLUE = '#4f8cff';
const mono = 'KadrMono, monospace', display = 'KadrDisplay, sans-serif';
const box = (x, y, w, h, extra = {}) => ({ position: 'absolute', left: x, top: y, width: w, height: h, ...extra });
const mix = (a, b, p) => a + (b - a) * p;

function Cursor({ x, y, scale = 1, opacity = 1 }) {
  return <svg data-object="cursor" viewBox="0 0 42 50" style={box(x, y, 52, 62, { opacity, transform: `scale(${scale})`, transformOrigin: '5px 5px', filter: 'drop-shadow(0 4px 5px #0005)' })}>
    <path d="M4 3 37 28 22 30 16 45Z" fill={INK} stroke={PAPER} strokeWidth="3" strokeLinejoin="round" />
  </svg>;
}

function Corners({ width, height, color = BLUE, opacity = 1, length = 25, weight = 4 }) {
  return <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={{ position: 'absolute', inset: 0, overflow: 'visible', opacity }}>
    <path d={`M0 ${length}V0H${length} M${width-length} 0H${width}V${length} M${width} ${height-length}V${height}H${width-length} M${length} ${height}H0V${height-length}`}
      fill="none" stroke={color} strokeWidth={weight} />
  </svg>;
}

// A real vector sculpture: the same nested ellipses deform and rotate throughout.
// No videos, bitmaps or rasterised type; each ring remains editable SVG geometry.
export function OrbitalSculpture({ t, variant = 0, scale = 1 }) {
  const turn = T(t, [[3.05,-34],[4.6,18],[5.35,108],[5.85,198],[6.5,268],[8,290],[14,345]]);
  const squeeze = T(t, [[3.1,.07],[3.72,.8],[4.7,.6],[5.35,.95],[5.85,.16],[6.45,.85],[8,.64],[14,.85]]);
  return <svg data-object="sculpture" viewBox="0 0 650 650" width="100%" height="100%" style={{ overflow: 'visible', transform: `scale(${scale}) rotate(${turn+variant*55}deg)` }}>
    <defs><linearGradient id={`ring-${variant}`} x1="0" y1="0" x2="1" y2="1"><stop stopColor="#ffffff"/><stop offset=".43" stopColor="#f3f5f8"/><stop offset=".7" stopColor="#a3c4ff"/><stop offset="1" stopColor="#d6e5ff"/></linearGradient></defs>
    <ellipse cx="325" cy="352" rx="225" ry="190" fill="#0e0f12" opacity=".12" style={{ filter: 'blur(23px)' }}/>
    {Array.from({ length: 24 }, (_, i) => {
      const a = i / 24 * Math.PI * 2;
      const cx = 325 + Math.cos(a) * 113;
      const cy = 325 + Math.sin(a) * 113;
      return <ellipse key={i} cx={cx} cy={cy} rx={117} ry={mix(32, 113, squeeze)}
        transform={`rotate(${i*15} ${cx} ${cy})`} fill="none" stroke={`url(#ring-${variant})`} strokeWidth="10.5" />;
    })}
    <circle cx="325" cy="325" r={T(t, [[3.1,94],[4,70],[5.25,112],[6.3,70],[14,70]])} fill={INK} />
    <path d="M305 290 354 325 305 360Z" fill={BLUE} style={{ transformOrigin: '325px 325px', transform: `rotate(${-turn}deg)` }}/>
  </svg>;
}

export function MotionPoster({ t, brand = 'KADR', variant = 0, lead = 'Make it', emphasis = 'move.' }) {
  const dark = variant === 1;
  const light = variant === 2;
  const bg = dark ? INK : light ? PAPER : BLUE;
  const fg = dark ? PAPER : INK;
  if (variant === 3) return <div style={{...box(0,0,1440,810),background:INK,display:'flex',alignItems:'center',justifyContent:'center',color:PAPER,fontFamily:display,fontWeight:800,fontSize:288,letterSpacing:24}}>{brand}</div>;
  if (variant === 1) return <div style={{...box(0,0,1440,810),background:INK,overflow:'hidden',color:PAPER}}>
    <div style={box(65,52,1000,40,{fontFamily:mono,fontSize:21,letterSpacing:4})}>{brand} / TYPOGRAPHY</div>
    <div style={box(-95,126,1650,550,{fontFamily:display,fontWeight:800,fontSize:540,lineHeight:1,letterSpacing:-28,transform:'rotate(-8deg)'})}>{emphasis}</div>
    <div style={box(900,499,400,12,{background:BLUE,transform:'rotate(-8deg)'})}/>
  </div>;
  if (variant === 2) return <div style={{...box(0,0,1440,810),background:BLUE,overflow:'hidden'}}>
    <div style={box(160,-420,1250,1250,{transform:'rotate(36deg)'})}><OrbitalSculpture t={5.3} variant={2}/></div>
    <div style={box(65,737,900,30,{fontFamily:mono,fontSize:21,letterSpacing:4,color:INK})}>{brand} / FORM IN MOTION</div>
  </div>;
  return <div data-object={`poster-${variant}`} style={{ ...box(0,0,1440,810), background: bg, overflow: 'hidden', color: fg }}>
    <div style={box(72,55,500,40,{ fontFamily: mono, fontSize: 21, letterSpacing: 4 })}>{brand} / MOTION STUDY</div>
    <div style={box(1280,52,90,30,{ display:'flex',gap:9 })}>{[0,1,2].map(i=><i key={i} style={{width:13,height:13,borderRadius:20,background:fg,opacity:1-i*.3}} />)}</div>
    <div style={box(68,215,820,450,{ fontFamily:display,fontWeight:800,fontSize:175,lineHeight:.91,letterSpacing:-10,transform:`translateX(${T(t,[[3.12,-950],[3.7,0],[4.8,0],[5.25,-60],[6.5,0]])}px)` })}>
      <div>{lead}</div><div style={{color:dark?BLUE:fg}}>{emphasis}</div>
    </div>
    <div style={box(756,116,625,625,{ transform:`rotate(${variant===1?-18:0}deg) scale(${T(t,[[3.1,2.25],[3.72,1],[4.6,1.08],[5.25,1.46],[5.85,1.2],[6.5,1]])})` })}><OrbitalSculpture t={t} variant={variant}/></div>
    <div style={box(74,727,600,30,{fontFamily:mono,fontSize:17,letterSpacing:2.3})}>IDEA → SHAPE → MOTION</div>
    <div style={box(1278,719,90,40,{fontFamily:display,fontSize:33,textAlign:'right'})}>0{variant+1}</div>
    <svg style={box(75,656,355,22)} viewBox="0 0 355 22"><path d="M0 11H350m-13-10 13 10-13 10" fill="none" stroke={fg} strokeWidth="2"/></svg>
  </div>;
}

function PosterCard({ t, variant, x, y, scale, rotate = 0, ry = 0, rx = 0, opacity = 1, config, lens = {zoom:1,x:720,y:405} }) {
  return <div style={box(x,y,1440,810,{opacity,transformOrigin:'center',transform:`translate(-50%,-50%) perspective(1800px) rotateX(${rx}deg) rotateY(${ry}deg) rotate(${rotate}deg) scale(${scale})`,borderRadius:20,overflow:'hidden',boxShadow:'0 40px 90px #0005',backfaceVisibility:'hidden'})}>
    <div style={{...box(0,0,1440,810),transformOrigin:'0 0',transform:`translate(720px,405px) scale(${lens.zoom}) translate(${-lens.x}px,${-lens.y}px)`}}><MotionPoster t={t} variant={variant} {...config} /></div>
  </div>;
}

export function KineticWorkbench({ timeline, config = {} }) {
  const frame = useCurrentFrame();
  const { width, height, fps } = useVideoConfig();
  const t = frame / fps * 14 / (timeline.frames / fps);
  const opts = { brand:'KADR', lead:'Make it', emphasis:'move.', prompt:'Make the product move', endline:'Make it move.', ...config };
  const intro = 1 - P(t,2.91,3.12);
  const shrink = P(t,1.24,1.92,'snap');
  const portal = P(t,2.5,3.12,'snap');
  const hero = P(t,3.02,3.26);
  const fold = P(t,6,7.22,'snap');
  const fan = P(t,7.35,8.04,'out');
  const assemble = P(t,10.3,11.8,'snap');
  const departure = P(t,10.3,11.1,'in');
  const clipVariants = [1,2,0,1,2,3];
  const activeClip = Math.min(5, Math.floor(clamp01((t-8.15)/1.75)*6));
  const preview = t < 8.15 ? 0 : clipVariants[activeClip];
  const cameraZoom = T(t,[[0,1.17],[.58,1],[2.5,1],[3.1,1.1],[3.42,1],[4.7,1],[5.28,1.88],[5.48,1.88],[5.82,1.34],[6.1,1.34],[6.45,1.07],[6.65,1],[14,1]],'snap');
  const cameraX = T(t,[[0,720],[4.7,720],[5.28,1010],[5.48,1010],[5.82,855],[6.1,855],[6.45,720]],'snap');
  const cameraY = T(t,[[0,405],[4.7,405],[5.28,405],[5.82,460],[6.45,405]],'snap');
  const sx = mix(257,264,shrink), sy = mix(380,319,shrink), sw = mix(675,912,shrink), sh = mix(233,146,shrink);
  const submitSize = mix(86,2500,portal);
  const cursorX = T(t,[[0,1310],[.71,929],[1.18,932],[1.85,1206],[2.28,1118],[2.5,1118]],'out');
  const cursorY = T(t,[[0,700],[.71,609],[1.18,613],[1.85,515],[2.28,390],[2.5,390]],'out');
  return <AbsoluteFill data-kadr-frame style={{background:INK,overflow:'hidden'}}>
    <div style={{...box(0,0,1440,810),transform:`scale(${width/1440})`,transformOrigin:'0 0'}}>
      <div style={{...box(0,0,1440,810),background:PAPER,opacity:1-P(t,6.5,7.15)}}/>
      <div style={{...box(0,0,1440,810),backgroundImage:'radial-gradient(#a9b1c133 .8px, transparent .8px)',backgroundSize:'24px 24px',opacity:intro}}/>
      <div style={{...box(0,0,1440,810),transformOrigin:'0 0',transform:`translate(720px,405px) scale(${cameraZoom}) translate(${-cameraX}px,${-cameraY}px)`}}>
        {/* Selected word and frame persist through the transformation into a prompt. */}
        <div style={{...box(0,0,1440,810),opacity:intro}}>
          <div style={box(70,51,400,35,{fontFamily:mono,fontSize:20,letterSpacing:4,color:INK,opacity:(1-shrink)*P(t,.35,.65)})}>{opts.brand} / 001</div>
          <div style={box(245,161,1000,205,{fontFamily:display,fontWeight:800,fontSize:201,letterSpacing:-11,lineHeight:1,color:INK,opacity:1-shrink,transform:`translateY(${-160*shrink}px)`})}>{opts.lead}</div>
          <div data-object="selection-frame" style={box(sx,sy,sw,sh,{background:shrink>.2?PAPER:'transparent',border:`${mix(3,2,shrink)}px solid ${shrink>.6?'#c4cbd6':BLUE}`,borderRadius:mix(0,90,shrink),boxShadow:`0 ${shrink*17}px ${shrink*42}px #0e0f1214`,opacity:P(t,.25,.65)})}>
            {[0,1,2,3].map(i=><span key={i} style={box(i%2?sw-7:-7,i<2?-7:sh-7,12,12,{border:`2px solid ${BLUE}`,background:PAPER,opacity:1-shrink})}/>)}
          </div>
          <div data-object="selected-word" style={box(260,366,960,260,{fontFamily:display,fontSize:242,fontWeight:800,letterSpacing:-12,lineHeight:1,color:INK,opacity:1-shrink,transform:`translateX(${T(t,[[0,-105],[.5,0]],'out')}px) scale(${1-shrink*.1})`})}>{opts.emphasis}</div>
          <div style={box(313,369,800,70,{fontFamily:'KadrInter',fontWeight:500,fontSize:43,letterSpacing:-1,color:INK,opacity:P(t,1.65,1.98),transform:`translateY(${(1-shrink)*22}px)`})}>{opts.prompt}<span style={{color:BLUE}}>│</span></div>
          <Cursor x={cursorX} y={cursorY} opacity={1-P(t,2.46,2.68)} scale={T(t,[[2.3,1],[2.42,.75],[2.52,1]])}/>
          <div style={box(72,735,1000,25,{fontFamily:mono,fontSize:17,letterSpacing:2,color:'#788292',opacity:(1-shrink)*P(t,.35,.65)})}>FROM A FEW WORDS. INTO MOTION.</div>
        </div>
        {/* The submit disc expands around its own centre and becomes the poster field. */}
        <div data-object="submit-disc" style={box(1116-submitSize/2,392-submitSize/2,submitSize,submitSize,{borderRadius:'50%',background:BLUE,opacity:P(t,1.73,2.05)*(1-hero),transform:`scale(${T(t,[[2.2,1],[2.42,.91],[2.53,1]])})`})}/>
        <svg style={box(1097,370,40,43,{opacity:P(t,1.82,2.08)*(1-P(t,2.52,2.75)),transform:`rotate(${portal*90}deg)`})} viewBox="0 0 40 43"><path d="M20 36V6M7 19 20 6 33 19" stroke={INK} strokeWidth="3.5" fill="none" strokeLinecap="round" strokeLinejoin="round"/></svg>
        {t>=3.02 && t<=6 && <div style={{...box(0,0,1440,810),opacity:hero}}><MotionPoster t={t} {...opts}/></div>}
      </div>
      {/* The poster becomes a tangible clip; camera pullback reveals its neighbours. */}
      {t>6 && <div style={{...box(0,0,1440,810),opacity:1-P(t,10.9,11.1)}}>
        <div style={box(65,46,500,40,{fontFamily:mono,fontSize:19,color:'#8e97a6',letterSpacing:2,opacity:fold})}>COMPOSE / PREVIEW / RENDER</div>
        <PosterCard t={t} variant={1} config={opts} x={720-505*fan-departure*1800} y={342+32*fan} scale={.48-.15*fan} rotate={-11*fan} ry={18*fan} opacity={fan}/>
        <PosterCard t={t} variant={2} config={opts} x={720+505*fan+departure*1800} y={342-12*fan} scale={.48-.15*fan} rotate={10*fan} ry={-18*fan} opacity={fan}/>
        <PosterCard t={t} variant={preview} config={opts} x={720-departure*1800} y={mix(405,342,fold)} scale={mix(1,.49,fold)} rotate={T(t,[[6,0],[6.55,-6],[7.4,0]])} ry={T(t,[[6,0],[6.55,-18],[7.4,0]])} rx={T(t,[[6,0],[6.55,9],[7.4,0]])} lens={{zoom:mix(1.34,1,fold),x:mix(855,720,fold),y:mix(460,405,fold)}}/>
      </div>}
      {/* Unfold the same compositions into a strip. The playhead carries the gesture. */}
      {t>7.65 && <div data-object="filmstrip" style={{...box(140,607,1160,142),opacity:W(t,7.65,11.5,.27),transform:`perspective(1500px) rotateX(${(1-P(t,7.65,8.1))*70}deg) translateY(${(1-P(t,7.65,8.1))*110}px)`,transformOrigin:'center top'}}>
        <div style={box(0,-35,1160,20,{fontFamily:mono,fontSize:14,color:'#8e97a6',display:'flex',justifyContent:'space-between'})}>{['00:00','00:04','00:08','00:12'].map(v=><span key={v}>{v}</span>)}</div>
        {[0,1,2,3,4,5].map((i)=><div key={i} style={box(i*193.3,0,188,112,{visibility:i===5&&t>=10.3?'hidden':'visible',overflow:'hidden',borderRadius:8,border:`1px solid ${activeClip===i?BLUE:'#f3f5f825'}`,transform:`translate(${-departure*1800}px,${(1-P(t,7.8+i*.055,8.16+i*.055,'out'))*100}px)`})}>
          <div style={{transform:`scale(${188/1440})`,transformOrigin:'0 0'}}><MotionPoster t={3.7+i*.55} variant={clipVariants[i]} {...opts}/></div>
        </div>)}
        <div style={box(0,121,1160,20,{display:'flex',gap:3,alignItems:'center',overflow:'hidden'})}>{Array.from({length:190},(_,i)=><i key={i} style={{width:4,flexShrink:0,height:3+Math.abs(Math.sin(i*1.63)*Math.cos(i*.7))*16,background:BLUE,opacity:.55}}/>)}</div>
        <div data-object="playhead" style={box(T(t,[[8.15,5],[9.9,1148]],'linear'),-18,2,166,{background:PAPER,boxShadow:'0 0 12px #fff8'})}><div style={box(-5,-1,12,12,{background:PAPER,clipPath:'polygon(0 0, 100% 0, 100% 65%, 50% 100%, 0 65%)'})}/></div>
      </div>}
      {/* The selected final clip already contains KADR. Its actual corners travel to the end frame. */}
      {t>=10.3 && <div data-object="final-clip" style={box(mix(1106.5,224,assemble),mix(607,244,assemble),mix(188,992,assemble),mix(112,292,assemble),{background:INK,borderRadius:mix(8,0,assemble),color:PAPER,fontFamily:display,fontWeight:800,fontSize:mix(288*188/1440,233,assemble),letterSpacing:mix(24*188/1440,17,assemble),display:'flex',alignItems:'center',justifyContent:'center'})}>
        <Corners width={mix(188,992,assemble)} height={mix(112,292,assemble)} length={mix(10,43,assemble)} weight={mix(1,4,assemble)}/>
        <span data-object="brand">{opts.brand}</span>
      </div>}
      <div style={box(224,589,992,80,{fontFamily:'KadrInter',fontSize:42,color:PAPER,textAlign:'center',letterSpacing:-1,opacity:P(t,12,12.35),transform:`translateY(${(1-P(t,12,12.35))*18}px)`})}>{opts.endline}</div>
      <div style={box(64,744,550,26,{fontFamily:mono,fontSize:16,letterSpacing:2,color:'#8e97a6',opacity:P(t,12.1,12.4)})}>MOTION STUDY — 001</div>
      <div style={box(988,744,387,26,{fontFamily:mono,fontSize:12,textAlign:'right',color:'#8e97a6',opacity:P(t,12.8,13)})}>Made with huashu-motion · Remotion</div>
    </div>
  </AbsoluteFill>;
}
