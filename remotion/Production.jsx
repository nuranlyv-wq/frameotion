import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { AbsoluteFill, staticFile, useCurrentFrame, useDelayRender, useVideoConfig } from 'remotion';
import { absoluteBounds, blendBounds, bridgeAt, cameraAt, COMPONENT_TARGET, ease, matchProgress, revealAt, stateAt, valueAt, visualAt } from '../src/production/motion.js';
import { fitFontSize } from '../src/production/text-fit.js';
import { KineticWorkbench } from './KineticWorkbench.jsx';
import { DirectedFilm } from './DirectedFilm.jsx';
import {useResourceFonts} from './ResourceFonts.jsx';

const FONT = { sans: 'KadrInter, Arial, sans-serif', serif: 'KadrSerif, Georgia, serif', mono: 'KadrMono, Menlo, monospace' };
const DISPLAY = { ...FONT, sans: 'KadrDisplay, KadrInter, sans-serif' };
const FONT_FILES = [
  ['KadrInter', 500, 'Inter/Inter_500Medium.ttf'],
  ['KadrInter', 700, 'Inter/Inter_700Bold.ttf'],
  ['KadrDisplay', 800, 'InterTight/InterTight_800ExtraBold.ttf'],
  ['KadrSerif', 700, 'SourceSerif4/SourceSerif4_700Bold.ttf'],
  ['KadrMono', 500, 'IBMPlexMono/IBMPlexMono_500Medium.ttf'],
];
const pct = (n) => `${n / 10}%`;
const placement = ({ x, y, w, h }, { opacity, shiftX, shiftY, scale = 1, rotation = 0, reveal = 1, focus = 0 }) => ({
  position: 'absolute', left: pct(x + shiftX), top: pct(y + shiftY), width: pct(w), height: pct(h), opacity, transform: `rotate(${rotation}deg) scale(${scale})`, transformOrigin: 'center',
  clipPath: reveal < 1 ? `inset(0 ${(1 - reveal) * 100}% 0 0)` : undefined,
  outline: focus ? `${2 + focus * 3}px solid currentColor` : undefined, outlineOffset: focus ? 6 : undefined,
});
const align = { left: 'flex-start', center: 'center', right: 'flex-end' };

function LocalFonts() {
  return <style>{FONT_FILES.map(([family, weight, file]) => (
    `@font-face{font-family:${family};font-weight:${weight};src:url("${staticFile('fonts/' + file)}") format("truetype");}`
  )).join('') + '[data-kadr-frame] *{box-sizing:border-box;}'}</style>;
}

function useKadrFonts() {
  const { delayRender, continueRender, cancelRender } = useDelayRender();
  const [handle] = useState(() => delayRender('Loading KADR fonts'));
  const [ready, setReady] = useState(false);
  useEffect(() => {
    Promise.all(FONT_FILES.map(([family, weight]) => document.fonts.load(`${weight} 24px ${family}`)))
      .then(() => setReady(true), cancelRender);
  }, [cancelRender]);
  useLayoutEffect(() => {
    if (ready) continueRender(handle);
  }, [ready, handle, continueRender]);
  return ready;
}

export function Text({ children, text = children, target, frame, scene, style, area, center = false, audit = true, auditFrame = false }) {
  const ref = useRef(null);
  const contentRef = useRef(null);
  const cache = useRef(null);
  const { width, height } = useVideoConfig();
  const preferred = style.fontSize;
  const key = [scene, target, text, area?.w, area?.h, style.width, style.height, style.fontFamily, preferred,
    style.fontWeight, style.lineHeight, style.letterSpacing, style.whiteSpace, style.padding, audit].join('|');
  useLayoutEffect(() => {
    if (cache.current === key) return;
    const node = ref.current;
    const viewport = node.closest('[data-kadr-frame]');
    if (viewport.clientWidth !== width || viewport.clientHeight !== height) return;
    cache.current = key;
    const content = contentRef.current;
    const maxHeight = node.clientHeight;
    content.style.overflowWrap = 'normal';
    const wrappedLines = [...content.querySelectorAll('[data-kadr-title-line]')];
    const fits = (size) => {
      content.style.fontSize = size + 'px';
      return content.scrollHeight <= maxHeight + 2 && content.scrollWidth <= content.clientWidth + 2 &&
        wrappedLines.every((line) => line.scrollWidth <= line.clientWidth + 2);
    };
    const unit = Math.min(width, height) / 1000;
    const floor = target === 'headline' ? 36 * unit : 18 * unit;
    const minimum = Math.min(preferred, Math.max(floor, preferred * 0.62));
    let result = fitFontSize(preferred, minimum, fits);
    if (!result.fits && style.whiteSpace !== 'nowrap') {
      content.style.overflowWrap = 'anywhere';
      result = { size: minimum, fits: fits(minimum) };
    }
    content.style.fontSize = result.size + 'px';
    if(audit && auditFrame){
      const range=document.createRange();range.selectNodeContents(content);
      const ink=range.getBoundingClientRect(),screen=viewport.getBoundingClientRect(),epsilon=2;
      const intersects=ink.right>screen.left&&ink.left<screen.right&&ink.bottom>screen.top&&ink.top<screen.bottom;
      if(intersects&&(ink.left<screen.left-epsilon||ink.right>screen.right+epsilon||ink.top<screen.top-epsilon||ink.bottom>screen.bottom+epsilon)){
        const bounds=r=>({left:Math.round((r.left-screen.left)/screen.width*1000),top:Math.round((r.top-screen.top)/screen.height*1000),right:Math.round((r.right-screen.left)/screen.width*1000),bottom:Math.round((r.bottom-screen.top)/screen.height*1000)});
        console.log('KADR_QA '+JSON.stringify({code:'text_frame_clipping',scene,target,frame,inkBounds:bounds(ink),viewport:{left:0,top:0,right:1000,bottom:1000}}));
      }
    }
    if (audit && (!result.fits || result.size < preferred)) {
      const code = result.fits ? 'text_fitted' : 'text_clipping';
      console.log('KADR_QA ' + JSON.stringify({
        code, scene, target, frame, width: node.clientWidth, height: maxHeight,
        scrollWidth: content.scrollWidth, scrollHeight: content.scrollHeight,
        originalSize: Number(preferred.toFixed(2)), fittedSize: Number(result.size.toFixed(2)),
      }));
    }
  });
  return <div ref={ref} style={{
    ...style, overflow: 'hidden', ...(center ? { display: 'flex', flexDirection: 'column', justifyContent: 'center' } : {}),
  }}>
    <div ref={contentRef} style={{ flexShrink: 0, minWidth: 0 }}>{children}</div>
  </div>;
}

export function InterfaceElement({ element, prop, style, palette, radius, font, frame, scene, target, value, unit, area, audit=true, auditFrame=false }) {
  const fill = palette[prop.role];
  style = { ...style, outlineColor: palette.accent };
  const finish = element.finish === 'outline' ? { border: `${2 * unit}px solid ${palette.muted}` } :
    element.finish === 'raised' ? { boxShadow: `0 ${12 * unit}px ${35 * unit}px #00000024` } : {};
  const fontFamily = FONT[element.font] ?? font;
  const textStyle = {
    fontFamily, fontSize: element.fontSize * unit, fontWeight: fontFamily === FONT.mono ? 500 : 700,
    lineHeight: fontFamily === FONT.serif ? 1.36 : 1.2, textAlign: element.align,
  };
  switch (element.kind) {
    case 'panel':
      return <div style={{ ...style, ...finish, backgroundColor: fill, borderRadius: element.bounds.h < 10 ? 0 : radius }} />;
    case 'number':
      return <Text audit={audit} auditFrame={auditFrame} scene={scene} target={target} frame={frame} area={area} center style={{ ...style, ...textStyle, color: fill }}>{Math.round(value)}{prop.text}</Text>;
    case 'progress':
      return <div style={{ ...style, borderRadius: radius, overflow: 'hidden', backgroundColor: palette.background }}>
        <div style={{ height: '100%', width: `${value}%`, backgroundColor: fill, borderRadius: radius }} />
      </div>;
    case 'cursor':
      return <svg viewBox="0 0 40 44" style={{ ...style, filter: 'drop-shadow(0 3px 3px #0005)' }} aria-hidden>
        <path d="M5 3 35 26 21 27 17 41Z" fill={fill} stroke={palette.background} strokeWidth="2" strokeLinejoin="round" />
      </svg>;
    case 'pin':
      return <svg viewBox="0 0 44 56" style={{ ...style, filter: 'drop-shadow(0 2px 3px #0003)' }} aria-hidden>
        <path d="M22 54C17 48 3 31 3 22a19 19 0 1 1 38 0c0 9-14 26-19 32Z" fill={fill} stroke={palette.background} strokeWidth="2" />
        <circle cx="22" cy="22" r="7" fill={prop.role === 'accent' ? palette.onAccent : palette.background} />
      </svg>;
    case 'check':
      return <svg viewBox="0 0 32 32" style={style} aria-hidden>
        <rect x="1.5" y="1.5" width="29" height="29" rx="7" fill={value ? fill : 'none'} stroke={fill} strokeWidth="2.5" />
        {value > 0 && <path d="m8 16 5 5 11-11" fill="none" stroke={palette.onAccent} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />}
      </svg>;
    case 'badge':
      return <div style={{ ...style, ...finish, backgroundColor: fill, borderRadius: radius, display: 'flex', alignItems: 'center', justifyContent: align[element.align] }}>
        <Text audit={audit} auditFrame={auditFrame} scene={scene} target={target} frame={frame} area={area} center style={{ ...textStyle, width: '100%', height: '100%', padding: `0 ${8 * unit}px`, color: prop.role === 'accent' ? palette.onAccent : palette.foreground }}>{prop.text}</Text>
      </div>;
    default:
      return <div style={{ ...style, display: 'flex', alignItems: 'center' }}>
        <Text audit={audit} auditFrame={auditFrame} scene={scene} target={target} frame={frame} area={area} center style={{ ...textStyle, width: '100%', height: '100%', color: fill }}>{prop.text}</Text>
      </div>;
  }
}

function Interface({ component, scene, previous, frame, localFrame, art, unit, font, motifId, hiddenTarget }) {
  const state = stateAt(component, scene, localFrame);
  const moving = scene.transition.type === 'shared' && localFrame < scene.transition.frames;
  const radius = art.radius * unit;
  return component.elements.map((element) => {
    const prop = state.props.find((item) => item.target === element.id);
    if (!prop.visible || element.id === motifId || element.id === hiddenTarget) return null;
    let area = absoluteBounds(scene.bounds, element.bounds);
    const shared = moving && [element.id, COMPONENT_TARGET].includes(scene.transition.target);
    if (shared) {
      const oldArea = absoluteBounds(previous.bounds, element.bounds);
      area = blendBounds(oldArea, area, ease('in-out-cubic', localFrame / (scene.transition.frames - 1)));
    }
    const target = `${component.id}:${element.id}`;
    const value = ['progress', 'number'].includes(element.kind) ? valueAt(component, scene, element.id, localFrame, state) : prop.value;
    return <div key={target} data-object={target} data-state={state.id}>
      <InterfaceElement element={element} prop={prop} palette={art.palette} radius={radius}
        font={font} unit={unit} frame={frame} scene={scene.id} target={target} value={value} area={area}
        style={placement(area, visualAt(scene, element.id, localFrame))} />
    </div>;
  });
}

function TitleLines({ text, reveal, frame }) {
  if (!reveal) return text;
  const lines = text.split('\n');
  return lines.map((line, i) => (
    <div key={i} data-kadr-title-line style={{ overflow: 'hidden', paddingBottom: '0.08em', marginBottom: '-0.08em' }}>
      <div style={{ transform: `translateY(${(1 - revealAt(reveal, i, lines.length, frame)) * 100}%)` }}>{line}</div>
    </div>
  ));
}

function SceneLayer({ narrative, kit, timeline, index, sceneFrame, frame, unit, fieldOpacity = 1, contentOpacity = 1, hiddenTarget }) {
  const scene = timeline.scenes[index];
  const story = narrative.scenes[index];
  const localFrame = sceneFrame - scene.start;
  const art = narrative.artDirection;
  const { background, foreground, accent, onAccent, muted } = art.palette;
  const treatment = scene.treatment;
  const inverse = treatment?.field === 'inverse';
  const accentField = treatment?.field === 'accent';
  const paper = accentField ? accent : inverse ? foreground : background;
  const ink = accentField ? onAccent : inverse ? background : foreground;
  const inkColor = treatment?.headlineColor === 'accent' ? accent : ink;
  const textureInk = ink + '16';
  const texture = treatment?.texture === 'grid'
    ? `linear-gradient(${textureInk} 1px, transparent 1px), linear-gradient(90deg, ${textureInk} 1px, transparent 1px)`
    : treatment?.texture === 'dots' ? `radial-gradient(${textureInk} 1.5px, transparent 1.5px)` : undefined;
  const font = FONT[art.typography];
  const component = kit.components.find(({ id }) => id === scene.componentId);
  const reveal = scene.effects.find(({ skill }) => skill === 'reveal-lines');
  const camera = cameraAt(scene, component, localFrame);
  const cameraTransform = `translate(${timeline.width/2}px,${timeline.height/2}px) rotate(${camera.rotation}deg) scale(${camera.scale}) translate(${-camera.x/1000*timeline.width}px,${-camera.y/1000*timeline.height}px)`;
  return <>
    <AbsoluteFill style={{
      backgroundColor: paper, backgroundImage: texture, backgroundSize: `${art.grid * 2.5 * unit}px ${art.grid * 2.5 * unit}px`,
      opacity: fieldOpacity,
    }} />
    <AbsoluteFill style={{ fontFamily: font, opacity: contentOpacity, transform:cameraTransform, transformOrigin:'0 0' }}>
      {component && hiddenTarget !== COMPONENT_TARGET && <AbsoluteFill style={{ transform: `scale(${visualAt(scene, 'component', localFrame).scale})`, transformOrigin: `${pct(scene.bounds.x + scene.bounds.w / 2)} ${pct(scene.bounds.y + scene.bounds.h / 2)}` }}><Interface component={component} scene={scene} previous={timeline.scenes[index - 1]} frame={frame}
        localFrame={localFrame} art={art} unit={unit} font={font} motifId={narrative.continuity?.id} hiddenTarget={hiddenTarget} /></AbsoluteFill>}
      <Text target="headline" scene={scene.id} frame={frame} text={story.headline} style={{
        ...placement(scene.headline, visualAt(scene, 'headline', localFrame)),
        fontFamily: DISPLAY[treatment?.headlineFont ?? art.typography], fontWeight: 800,
        fontSize: (treatment?.headlineSize ?? 86) * unit, textAlign: treatment?.headlineAlign,
        letterSpacing: '-0.038em', lineHeight: 1.02, color: inkColor, whiteSpace: 'pre-line',
      }}>
        <TitleLines text={story.headline} reveal={reveal} frame={localFrame} />
      </Text>
      {story.copy && <Text target="copy" scene={scene.id} frame={frame} style={{
        ...placement(scene.copy, visualAt(scene, 'copy', localFrame)),
        fontFamily: treatment ? FONT.mono : font, fontWeight: 500, fontSize: (treatment ? 27 : 37) * unit,
        textAlign: treatment?.copyAlign, lineHeight: 1.2, color: inverse || accentField ? ink : muted,
        letterSpacing: treatment ? '0.06em' : undefined,
      }}>{story.copy}</Text>}
    </AbsoluteFill>
    {component?.fidelity === 'conceptual' && <div style={{ position: 'absolute', left: '6%', bottom: '2%', color: ink,
      font: `${22 * unit}px ${FONT.mono}`, opacity: 0.72 * contentOpacity }}>CONCEPT UI · SAMPLE DATA</div>}
  </>;
}

function ContinuityObject({ narrative, kit, scene, previous, frame, unit, progress }) {
  const motif = narrative.continuity;
  const art = narrative.artDirection;
  const locate = (shot) => {
    const component = kit.components.find(({ id }) => id === shot.componentId);
    const layer = component.elements.find(({ id }) => id === motif.id);
    return absoluteBounds(shot.bounds, layer.bounds);
  };
  const destination = locate(scene);
  const area = previous ? blendBounds(locate(previous), destination, progress) : destination;
  const element = { kind: motif.kind, bounds: area, align: 'center', fontSize: 28 };
  return <div data-object={`continuity:${motif.id}`}>
    <InterfaceElement element={element} prop={{ role: motif.role, text: motif.label }}
      palette={art.palette} radius={art.radius * unit} font={FONT[art.typography]} unit={unit}
      frame={frame} scene={scene.id} target={`${scene.componentId}:${motif.id}`} area={area}
      style={placement(area, { shiftX: 0, shiftY: 0, opacity: 1 })} />
  </div>;
}

// Semantic object-to-object bridge, inspired by Onda expand-morph (MIT).
// Uses our scene contracts, local fonts and stable targets; no external code execution.
function ObjectBridge({ narrative, kit, timeline, index, frame, unit }) {
  const next = timeline.scenes[index], previous = timeline.scenes[index - 1];
  const locate = (shot, id, at) => {
    const component = kit.components.find((item) => item.id === shot.componentId);
    const element = component.elements.find((item) => item.id === id);
    const prop = stateAt(component, shot, at).props.find((item) => item.target === id);
    return { element, prop, area: absoluteBounds(shot.bounds, element.bounds) };
  };
  const from = locate(previous, next.transition.sourceTarget, previous.end - previous.start - 1);
  const to = locate(next, next.transition.target, 0);
  const b = bridgeAt(from.area, to.area, frame - next.start, next.transition.frames, next.transition.type);
  const layers = { narrative, kit, timeline, frame, unit };
  if (b.progress === 0) return <SceneLayer {...layers} index={index - 1} sceneFrame={previous.end - 1} />;
  if (b.progress === 1) return <SceneLayer {...layers} index={index} sceneFrame={frame} />;
  const art = narrative.artDirection;
  const color = (a, z, t) => '#' + [1, 3, 5].map((i) => Math.round(parseInt(a.slice(i, i + 2), 16) * (1 - t) + parseInt(z.slice(i, i + 2), 16) * t).toString(16).padStart(2, '0')).join('');
  const background = color(art.palette[from.prop.role], art.palette[to.prop.role], b.progress);
  const contentProgress = ease('in-out-cubic', (b.progress - 0.25) / 0.5);
  const portal = (entry, shotIndex, shotFrame, opacity, target) => {
    const scale = Math.min(b.area.w / entry.area.w, b.area.h / entry.area.h);
    const sx = scale, sy = scale;
    return <div style={{ ...placement(b.area, { opacity, shiftX: 0, shiftY: 0 }), overflow: 'hidden', borderRadius: art.radius * unit }}>
      <div style={{ position: 'absolute', width: timeline.width, height: timeline.height,
        left: ((b.area.w - entry.area.w * sx) / 2 - entry.area.x * sx) / 1000 * timeline.width,
        top: ((b.area.h - entry.area.h * sy) / 2 - entry.area.y * sy) / 1000 * timeline.height,
        transform: `scale(${sx}, ${sy})`, transformOrigin: '0 0' }}>
        <SceneLayer {...layers} index={shotIndex} sceneFrame={shotFrame} fieldOpacity={0}
          hiddenTarget={entry.element.kind === 'panel' ? target : undefined} />
      </div>
    </div>;
  };
  return <>
    <AbsoluteFill style={{ transform: `scale(${b.camera})`, transformOrigin: `${pct(from.area.x + from.area.w / 2)} ${pct(from.area.y + from.area.h / 2)}` }}>
      <SceneLayer {...layers} index={index - 1} sceneFrame={previous.end - 1} contentOpacity={1 - b.progress} />
    </AbsoluteFill>
    <SceneLayer {...layers} index={index} sceneFrame={frame} fieldOpacity={b.progress}
      contentOpacity={Math.max(0, (b.progress - 0.7) / 0.3)} hiddenTarget={COMPONENT_TARGET} />
    <div style={{ ...placement(b.area, { opacity: 1, shiftX: 0, shiftY: 0 }), backgroundColor: background,
      borderRadius: art.radius * unit, overflow: 'hidden',
      border: from.element.finish === 'outline' || to.element.finish === 'outline' ? `${2 * unit}px solid ${art.palette.muted}` : undefined,
      boxShadow: to.element.finish === 'raised' ? `0 ${12 * unit * b.progress}px ${35 * unit * b.progress}px #00000024` : undefined }} />
    {portal(from, index - 1, previous.end - 1, 1 - contentProgress, next.transition.sourceTarget)}
    {portal(to, index, frame, contentProgress, next.transition.target)}
  </>;
}

const EMPTY_RESOURCES={fonts:{},images:{},curves:{}};
export function Production({ narrative, kit, timeline,resources=EMPTY_RESOURCES }) {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const ready = useKadrFonts();
  const resourceReady=useResourceFonts(resources.fonts);
  if(timeline.world)return <AbsoluteFill><LocalFonts/>{ready&&resourceReady&&<DirectedFilm timeline={timeline} narrative={narrative} kit={kit} resources={resources}/>}</AbsoluteFill>;
  if (timeline.choreography?.recipe === 'kinetic-workbench') return <AbsoluteFill>
    <LocalFonts />{ready && <KineticWorkbench timeline={timeline} config={timeline.choreography} />}
  </AbsoluteFill>;
  const index = timeline.scenes.findIndex(({ end }) => frame < end);
  if (index === -1) return null;
  const scene = timeline.scenes[index];
  const previous = timeline.scenes[index - 1];
  const localFrame = frame - scene.start;
  const unit = Math.min(width, height) / 1000;
  const bridging = ['morph', 'zoom-through'].includes(scene.transition.type) && localFrame < scene.transition.frames;
  const matching = scene.transition.type === 'match' && localFrame < scene.transition.frames;
  const progress = matching ? matchProgress(scene.transition, localFrame) : 1;
  const outgoing = Math.max(0, 1 - progress / 0.48);
  const incoming = Math.max(0, (progress - 0.52) / 0.48);
  const layers = { narrative, kit, timeline, frame, unit };
  return <AbsoluteFill data-kadr-frame style={{ overflow: 'hidden' }}>
    <LocalFonts />
    {ready && (bridging ? <ObjectBridge {...layers} index={index} /> : <>
      {matching && <SceneLayer key={previous.id} {...layers} index={index - 1}
        sceneFrame={previous.end - 1} contentOpacity={outgoing} />}
      <SceneLayer key={scene.id} {...layers} index={index} sceneFrame={frame}
        fieldOpacity={progress} contentOpacity={incoming} />
      {narrative.continuity && <ContinuityObject narrative={narrative} kit={kit} scene={scene}
        previous={matching ? previous : null} frame={frame} unit={unit} progress={progress} />}
    </>)}
  </AbsoluteFill>;
}
