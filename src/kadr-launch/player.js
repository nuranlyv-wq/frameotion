import {cubicPrefix, fontFor, makeSpiral, makeTextRing, makeWordLift, makeWordSwap, makeWordType, motionProgress, motionTrackAt, paintSpiral, paintTextRing, paintWordLift, paintWordSwap, paintWordType, poseAt, rollEntrance, shapePoseAt, shapeTrack, spring, TOGGLE_SETTLE_FRAMES, wordHighlightRange} from './kinetic.js';
import {makeWordClick,paintWordClick} from './word-click.js';
import {diveCamera, floodCoverage, projectVolume, traceContour, transformPose} from './spatial.js';
import {compositionAudit, MIN_VISIBLE_ALPHA, projectedBox} from './composition.js';
import {foldFaces} from './fold.js';
import {motionAudit} from './motion-audit.js';
import {framingAudit} from './framing-audit.js';
import {objectRevealAt} from './object-reveal.js';
import {paintStage,stageGeometry} from './stage-player.js';
import {layoutStageTypography} from './stage-typography.js';
import {createShutter} from './shutter.js';
import {stageImageCuts,shutterSampleTime} from './shutter-cuts.js';
import {productSubject} from './product-subject.js';

const {score,scale,blur,cadence,hasLogo,hasDisplayFont,hasBrandFont,imageIds=[],assetRoles={},productFlow,stageFonts=[],stageFontFamilies={},fontAudit}=await (await fetch('/score')).json();
const {width:W,height:H,fps}=score,P=score.palette;
const canvas=document.querySelector('canvas'),out=canvas.getContext('2d');canvas.width=Math.round(W*scale/2)*2;canvas.height=Math.round(H*scale/2)*2;
const buffer=document.createElement('canvas');buffer.width=canvas.width;buffer.height=canvas.height;const c=buffer.getContext('2d',{willReadFrequently:true});
const shutter=blur>1?createShutter(canvas.width,canvas.height,blur):null;
// Optical tracking: display sizes are set tighter, as in editorial and product typography.
// Hooking the font setter keeps every measurement and every paint on the same spacing.
const fontProperty = Object.getOwnPropertyDescriptor(CanvasRenderingContext2D.prototype, 'font');
Object.defineProperty(c, 'font', {
  get() { return fontProperty.get.call(this); },
  set(value) {
    fontProperty.set.call(this, value);
    const size = Number(/([\d.]+)px/.exec(value)?.[1] ?? 0);
    const tracking = size >= 120 ? -.035 : size >= 56 ? -.02 : 0;
    this.letterSpacing = `${(size * tracking).toFixed(2)}px`;
  },
});
document.fonts.add(await new FontFace('Inter','url(/font)').load());
if (hasDisplayFont) document.fonts.add(await new FontFace('KadrDisplay','url(/display-font)',{weight:'800'}).load());
if (hasBrandFont) document.fonts.add(await new FontFace('KadrBrand','url(/brand-font)',{weight:'100 900'}).load());
for(const face of stageFonts)document.fonts.add(await new FontFace(face.family,`url(/stage-fonts/${face.key})`,{weight:String(face.weight)}).load());
await document.fonts.ready;
for(const element of score.elements.filter(e=>e.stage))layoutStageTypography(element.stage,()=>document.createElement('canvas').getContext('2d'),stageFontFamilies);
if(fontAudit)fontAudit.geometryPass='loaded-browser-canvas';
let logo;if(hasLogo){logo=new Image();logo.src='/logo';await logo.decode();}
function visibleImageBounds(img) {
  const sample=document.createElement('canvas');
  sample.width=img.width;
  sample.height=img.height;
  const context=sample.getContext('2d',{willReadFrequently:true});
  context.drawImage(img,0,0);
  const {data}=context.getImageData(0,0,img.width,img.height);
  let left=img.width,top=img.height,right=0,bottom=0;
  for (let y=0;y<img.height;y++) {
    for (let x=0;x<img.width;x++) {
      if (data[(y*img.width+x)*4+3]<24) continue;
      left=Math.min(left,x);top=Math.min(top,y);
      right=Math.max(right,x+1);bottom=Math.max(bottom,y+1);
    }
  }
  return right>left && bottom>top ? {x:left,y:top,w:right-left,h:bottom-top} : null;
}
const images = new Map(await Promise.all(imageIds.map(async id => {
  const image = new Image();
  image.src = '/image/' + id;
  await image.decode();
  let subject;
  if(assetRoles[id]==='product-photo'){
    const sample=document.createElement('canvas');sample.width=image.width;sample.height=image.height;const ctx=sample.getContext('2d',{willReadFrequently:true});ctx.drawImage(image,0,0);
    const pixels=ctx.getImageData(0,0,image.width,image.height),cutout=productSubject(pixels.data,image.width,image.height);
    if(cutout){pixels.data.set(cutout.data);ctx.putImageData(pixels,0,0);const b=cutout.bounds;subject=document.createElement('canvas');subject.width=b.w;subject.height=b.h;subject.getContext('2d').drawImage(sample,b.x,b.y,b.w,b.h,0,0,b.w,b.h);}
  }
  return [id,{image,subject,visible:visibleImageBounds(image)}];
})));
const issues=new Map(),fits=new Map(),layouts=new Map();
const composition = compositionAudit(W, H);
const motion = motionAudit(score);
const framing = framingAudit();
const stageBackdrop=document.createElement('canvas');stageBackdrop.width=canvas.width;stageBackdrop.height=canvas.height;
const stageLayer=document.createElement('canvas');stageLayer.width=canvas.width;stageLayer.height=canvas.height;
const stageGpu=document.createElement('canvas');stageGpu.width=canvas.width;stageGpu.height=canvas.height;
const stageResources={width:W,height:H,palette:P,logo,images,fontFamily:hasBrandFont?'KadrBrand':'Inter',resolution:canvas.width/1000,backdrop:stageBackdrop,
  framing,
  fontFamilies:stageFontFamilies,
  layer:stageLayer,gpu:stageGpu,
  makeCanvas:(w,h)=>{const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.ceil(w));canvas.height=Math.max(1,Math.ceil(h));return canvas;}};
const namePhotoAudit = productFlow?.name ? {samples:0, minGapPx:null} : null;
const actors = new Map(score.elements.map(element => [element.id, element]));
const shapeTracks = new Map(score.shapes.map(shape => [shape.id, shapeTrack(shape.states)]));
const screenElements = score.elements.filter(element => element.space === 'screen');
const worldElements = score.elements.filter(element => element.space !== 'screen');
const floods = score.scenes.filter(scene => scene.flood).map(scene => ({
  start: scene.start, ...scene.flood, shape: score.shapes.find(shape => shape.id === scene.flood.target),
}));
const cuts = [...new Set([
  0, score.frames, ...stageImageCuts(score),
  ...score.scenes.filter((scene,index) => {
    const previous=score.scenes[index-1];
    return previous && (scene.flood || scene.transition || ['cut','match'].includes(scene.link?.kind) || (scene.ground??'background')!==(previous.ground??'background') ||
      (scene.groundStyle??'halo')!==(previous.groundStyle??'halo'));
  }).map(scene=>scene.start),
  ...score.shapes.flatMap(shape => shape.states.filter(state => state.duration === 0).map(state => state.frame)),
  ...score.elements.flatMap(element => [
    ...(element.enter === 'none' ? [element.start] : []),
    ...(element.exit === 'cut' ? [element.end] : []),
    ...(element.wordSwap?.style === 'cut' ? element.wordSwap.variants.slice(1).map(variant => variant.frame) : []),
  ]),
])].sort((a, b) => a - b);
const cameraFields = ['x', 'y', 'zoom', 'rotate'];
const clamp=x=>Math.max(0,Math.min(1,x));const ease=x=>{x=clamp(x);return 1-(1-x)**4;};const mix=(a,b,t)=>a+(b-a)*t;
const rgb=s=>[1,3,5].map(i=>parseInt(s.slice(i,i+2),16));
function luminance(hex) {
  const [r, g, b] = rgb(hex).map(value => {
    const channel = value / 255;
    return channel <= .04045 ? channel / 12.92 : ((channel + .055) / 1.055) ** 2.4;
  });
  return .2126 * r + .7152 * g + .0722 * b;
}
const preferredInk = luminance(P.onAccent);
const pillInk = Object.fromEntries(Object.entries(P).map(([role, color]) => {
  const ground = luminance(color);
  const contrast = (Math.max(ground, preferredInk) + .05) / (Math.min(ground, preferredInk) + .05);
  return [role, contrast >= 4.5 ? P.onAccent : ground > .179 ? '#000000' : '#ffffff'];
}));
function col(a,b,t){return `rgb(${rgb(a).map((v,i)=>Math.round(mix(v,rgb(b)[i],t))).join(',')})`;}
function rect(b,fill){c.beginPath();c.roundRect(b.x,b.y,b.w,b.h,Math.min(b.radius||0,b.w/2,b.h/2));c.fillStyle=fill;c.fill();}
const contrast = (a, b) => (Math.max(a, b) + .05) / (Math.min(a, b) + .05);
// The most legible palette colour for content painted on a given role.
const inkOn = Object.fromEntries(Object.entries(P).map(([role, color]) => {
  const ground = luminance(color);
  const best = [P.foreground, P.onAccent, P.background].map(ink => [contrast(ground, luminance(ink)), ink]).sort((a, b) => b[0] - a[0])[0];
  return [role, best[0] >= 4.5 ? best[1] : ground > .179 ? '#000000' : '#ffffff'];
}));
const cssLuminance = color => color.startsWith('#') ? luminance(color) :
  luminance('#' + color.match(/\d+/g).slice(0, 3).map(v => Math.min(255, Number(v)).toString(16).padStart(2, '0')).join(''));

// A lit surface: soft ambient shadow, tight contact shadow, a faint top sheen and a hairline edge.
// Canvas shadows ignore the transform, so their size follows the current camera scale.
function surface(b, fill, elevation = 2, outline) {
  // The blur follows the camera scale up to a limit: inside a dive the surface is larger than the frame.
  const matrix = c.getTransform(), k = Math.min(Math.hypot(matrix.a, matrix.b), 8 * canvas.width / W);
  const trace = () => traceContour(c,b,outline?.from,outline?.to,outline?.progress);
  const paint = () => { trace(); c.fillStyle = fill; c.fill(); };
  if (elevation > 0) {
    c.save();
    c.shadowColor = 'rgba(0,0,0,.14)';
    c.shadowBlur = elevation * 28 * k;
    c.shadowOffsetY = elevation * 14 * k;
    paint();
    c.shadowColor = 'rgba(0,0,0,.10)';
    c.shadowBlur = elevation * 3 * k;
    c.shadowOffsetY = elevation * 1.5 * k;
    paint();
    c.restore();
  } else paint();
  if (Math.min(b.w, b.h) < 24) return;
  const light = cssLuminance(fill) > .35;
  c.save();
  trace();
  c.clip();
  const sheen = c.createLinearGradient(0, b.y, 0, b.y + b.h);
  sheen.addColorStop(0, `rgba(255,255,255,${light ? .42 : .09})`);
  sheen.addColorStop(.55, 'rgba(255,255,255,0)');
  c.fillStyle = sheen;
  c.fillRect(b.x, b.y, b.w, b.h);
  c.lineWidth = 3;
  c.strokeStyle = light ? 'rgba(0,0,0,.07)' : 'rgba(255,255,255,.16)';
  c.stroke();
  c.restore();
}

function fitText(text, width, owner) {
  if (c.measureText(text).width <= width) return text;
  // A shortened card line is reported with the text fits, so a reviewer sees copy the viewer cannot read in full.
  if (owner) fits.set(owner + ':cut', {target: owner, truncated: text});
  const letters = [...text];
  while (letters.length > 1 && c.measureText(letters.join('').trimEnd() + '…').width > width) letters.pop();
  return letters.join('').trimEnd() + '…';
}

// A content row: avatar or icon, title, supporting line and a trailing badge.
function drawCard(element) {
  const {box, card} = element, {x, y, w, h} = box;
  const onAccentCard = element.fill === 'accent';
  // A stacked card shows the edge of a second sheet beneath it, which gives the row depth without a second actor.
  if (card.stacked) surface({x: x + w * .025, y: y + h * .13, w: w * .95, h, radius: box.radius}, P.surface, 1);
  surface(box, P[element.fill], element.elevation ?? 2);
  const ink = inkOn[element.fill], pad = h * .18, d = h - pad * 2;
  let left = x + pad, right = x + w - pad;
  if (card.avatar || card.icon) {
    c.beginPath();
    c.arc(left + d / 2, y + h / 2, d / 2, 0, Math.PI * 2);
    c.fillStyle = onAccentCard ? P.onAccent : P.accent;
    c.fill();
    const mark = onAccentCard ? P.accent : P.onAccent;
    if (card.icon) icon(card.icon, {x:left + d * .24, y:y + h / 2 - d * .26, w:d * .52, h:d * .52}, mark);
    else {
      c.font = `700 ${d * .4}px Inter`;
      c.fillStyle = mark;
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillText(card.avatar, left + d / 2, y + h / 2 + d * .02);
    }
    left += d + pad * .8;
  }
  if (card.badge) {
    c.font = `650 ${h * .2}px Inter`;
    const width = c.measureText(card.badge).width + h * .3, height = h * .38;
    rect({x:right - width, y:y + (h - height) / 2, w:width, h:height, radius:height / 2}, onAccentCard ? P.onAccent : P.accent);
    c.fillStyle = onAccentCard ? P.accent : P.onAccent;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText(card.badge, right - width / 2, y + h / 2 + h * .01);
    right -= width + pad * .6;
  }
  c.textAlign = 'left';
  c.textBaseline = 'alphabetic';
  c.fillStyle = ink;
  // A lone title on a thin bar is set larger relative to the bar, so search fields and badges stay legible.
  let titleSize = card.subtitle ? h * .235 : Math.max(h * .27, Math.min(h * .4, 48));
  c.font = `650 ${titleSize}px Inter`;
  // A long title is set a little smaller before it is cut short.
  for (const floor = titleSize * .7; titleSize > floor && c.measureText(card.title).width > right - left; ) {
    titleSize -= 1;
    c.font = `650 ${titleSize}px Inter`;
  }
  c.fillText(fitText(card.title, right - left, element.id), left, card.subtitle ? y + h * .47 : y + h / 2 + titleSize * .35);
  if (card.subtitle) {
    const size = h * .17;
    c.font = `450 ${size}px Inter`;
    if (score.staging === 'scenes') {
      const fitted = Math.max(Math.min(24, size), size * Math.min(1, (right - left - 2) / c.measureText(card.subtitle).width));
      c.font = `450 ${fitted}px Inter`;
    }
    c.globalAlpha *= .62;
    c.fillText(fitText(card.subtitle, right - left, element.id), left, y + h * .73);
  }
}
function shape(shape, frame) {
  const index = shape.states.findLastIndex(state => frame >= state.frame);
  const current = shape.states[index];
  const pose = shapePoseAt(shapeTracks.get(shape.id),frame);
  if (!index) return {...pose,color:P[current.fill],outline:{from:current.contour}};
  const previous = shape.states[index - 1];
  const progress = current.duration === 0 ? 1 : motionProgress((frame - current.frame) / current.duration, current.ease ?? 'smooth');
  const from = P[previous.fill], to = P[current.fill];
  const color = progress === 0 ? from : progress === 1 || from === to ? to : col(from,to,progress);
  return {...pose,color,outline:{from:previous.contour ?? 'roundRect',to:current.contour ?? 'roundRect',progress}};
}

function rotateAround(x,y,angle) {
  if (!angle) return;
  c.translate(x,y);
  c.rotate(angle * Math.PI / 180);
  c.translate(-x,-y);
}

function cameraCenter(key, frame, shapes) {
  if (!key.target) return key;
  const actor = actors.get(key.target);
  const box = actor ? actor.box : shapes.get(key.target).box;
  const parent = actor?.attachTo && shapes.get(actor.attachTo);
  const pose = actor?.motion && poseAt(actor.motion, frame);
  const roll = actor?.enter === 'roll-in' && rollEntrance(box,(frame - actor.start) / actor.enterFrames,actor.rollFrom);
  const x = box.x + box.w / 2 + (pose?.x ?? 0) + (roll?.x ?? 0);
  const y = box.y + box.h / 2 + (pose?.y ?? 0) + (roll?.y ?? 0);
  if (!parent) return {...key,x:key.x+x,y:key.y+y};
  const {box:{x:left,y:top,w,h},rotate} = parent;
  const theta = rotate * Math.PI / 180, dx=x-w/2, dy=y-h/2;
  return {...key,x:key.x+left+w/2+dx*Math.cos(theta)-dy*Math.sin(theta),
    y:key.y+top+h/2+dx*Math.sin(theta)+dy*Math.cos(theta)};
}

function camera(frame, shapes, flood) {
  let {x, y, zoom, rotate} = motionTrackAt(score.camera, frame, cameraFields, {
    read: key => cameraCenter(key, frame, shapes), defaultEase: 'smooth',
  });
  if (flood?.push) {
    const {box} = flood.cover;
    const t = motionProgress(flood.progress,'fluid');
    x = mix(x, box.x + box.w / 2, t);
    y = mix(y, box.y + box.h / 2, t);
    zoom = Math.exp(mix(Math.log(zoom), Math.log(floodCoverage(box,W,H) * 100), t));
    rotate *= 1 - t;
  }
  c.translate(W / 2, H / 2);
  c.rotate(rotate * Math.PI / 180);
  c.scale(zoom / 100, zoom / 100);
  c.translate(-x, -y);
}

function floodAt(frame) {
  const transition = floods.find(({start,frames,revealFrames}) => frame >= start - frames && frame < start + revealFrames);
  if (!transition) return null;
  const {start,frames,revealFrames} = transition;
  const push = frame < start;
  return {...transition,push,cover:shape(transition.shape,start - .001),
    progress:push ? (frame - start + frames) / frames : (frame - start) / revealFrames};
}

function paintFlood(flood, worldTransform, landing) {
  if (flood.push && flood.progress <= .25) return;
  const {box,color,outline} = flood.cover;
  c.save();
  if (flood.push) {
    c.setTransform(worldTransform);
    c.globalAlpha = clamp((flood.progress - .25) / .5);
  } else {
    if (flood.land) {
      const t = motionProgress(flood.progress,'snap');
      const zoom = floodCoverage(box,W,H);
      const anchor = landing.box;
      const point = worldTransform.transformPoint({x:anchor.x + anchor.w / 2,y:anchor.y + anchor.h / 2});
      const a = worldTransform.a * W / canvas.width, b = worldTransform.b * H / canvas.height;
      const scale = Math.hypot(a,b);
      const width = mix(box.w * zoom,anchor.w * scale,t), height = mix(box.h * zoom,anchor.h * scale,t);
      c.translate(mix(W / 2,point.x * W / canvas.width,t),mix(H / 2,point.y * H / canvas.height,t));
      c.rotate((Math.atan2(b,a) + landing.rotate * Math.PI / 180) * t);
      traceContour(c,{x:-width/2,y:-height/2,w:width,h:height,radius:mix(box.radius * zoom,anchor.radius * scale,t)},
        outline.to ?? outline.from,landing.outline.to ?? landing.outline.from,t);
      c.fillStyle = color;
      c.fill();
      if (flood.mark && t > .4) {
        const size = Math.min(width,height) * .5;
        c.globalAlpha = clamp((t - .4) / .25);
        icon(flood.mark,{x:-size/2,y:-size/2,w:size,h:size},P.onAccent);
      }
      c.restore();
      return;
    }
    const zoom = floodCoverage(box,W,H) * (1 - motionProgress(flood.progress,'snap'));
    if (!zoom) { c.restore(); return; }
    c.translate(W / 2,H / 2);
    c.scale(zoom,zoom);
    c.translate(-box.x - box.w / 2,-box.y - box.h / 2);
  }
  traceContour(c,box,outline.from,outline.to,outline.progress);
  c.fillStyle = color;
  c.fill();
  c.restore();
}

function drawVolume(element, frame, layers) {
  const {box,mesh} = element;
  const {rx,ry} = motionTrackAt(mesh.keys, frame, ['rx','ry'], {defaultEase:'smooth'});
  const faces = projectVolume(box,mesh.form,mesh.depth,rx,ry);
  for (const {points,light,front} of faces) {
    c.beginPath();
    c.moveTo(...points[0]);
    for (const point of points.slice(1)) c.lineTo(...point);
    c.closePath();
    c.fillStyle = col(P[element.fill],light > 0 ? '#ffffff' : '#000000',Math.abs(light) * .42);
    c.fill();
    c.strokeStyle = c.fillStyle;
    c.lineWidth = .8;
    c.stroke();
    if (front && (mesh.mark || mesh.assetId)) {
      const [a,b,d,e] = points;
      c.save();
      c.clip();
      c.transform((b[0]+d[0]-a[0]-e[0])/2,(b[1]+d[1]-a[1]-e[1])/2,
        (e[0]+d[0]-a[0]-b[0])/2,(e[1]+d[1]-a[1]-b[1])/2,
        points.reduce((sum,p)=>sum+p[0],0)/4,points.reduce((sum,p)=>sum+p[1],0)/4);
      if(mesh.assetId)paintImage(mesh.assetId,{x:-.4,y:-.4,w:.8,h:.8});
      else icon(mesh.mark,{x:-.25,y:-.25,w:.5,h:.5},P.onAccent);
      c.restore();
    }
  }
  if (layers && faces.length) {
    const points = faces.flatMap(face => face.points);
    const left = Math.min(...points.map(([x]) => x)), top = Math.min(...points.map(([,y]) => y));
    recordLayer(layers,element,{x:left,y:top,w:Math.max(...points.map(([x]) => x)) - left,
      h:Math.max(...points.map(([,y]) => y)) - top});
  }
}

function traceFace(points, round) {
  c.beginPath();
  for (const [i,point] of points.entries()) {
    const previous = points[(i + points.length - 1) % points.length];
    const next = points[(i + 1) % points.length];
    const start = point.map((v,axis) => mix(v,previous[axis],round));
    const end = point.map((v,axis) => mix(v,next[axis],round));
    if (i === 0) c.moveTo(...start); else c.lineTo(...start);
    c.quadraticCurveTo(...point,...end);
  }
  c.closePath();
}

function paintImage(assetId,box,fit='contain',zoom=1,pan=0) {
  c.imageSmoothingQuality='high';
  const {image}=images.get(assetId);
  if (fit==='cover') {
    const ratio=Math.max(box.w/image.width,box.h/image.height)*zoom;
    const sw=box.w/ratio,sh=box.h/ratio;
    const sx=Math.max(0,Math.min(image.width-sw,(image.width-sw)*(.5+pan)));
    c.drawImage(image,sx,(image.height-sh)/2,sw,sh,box.x,box.y,box.w,box.h);
  } else {
    const ratio=Math.min(box.w/image.width,box.h/image.height);
    c.drawImage(image,box.x+(box.w-image.width*ratio)/2,box.y+(box.h-image.height*ratio)/2,image.width*ratio,image.height*ratio);
  }
}

function drawFold(element, frame, layers) {
  const {box,fold} = element;
  const time = motionProgress((frame-fold.at)/fold.frames,'fluid');
  const progress = fold.direction === 'open' ? 1-time : time;
  const faces = foldFaces(box,progress,fold.material);
  for (const face of faces) {
    c.save();
    c.globalAlpha *= face.opacity ?? 1;
    traceFace(face.points,.015);
    c.fillStyle = col(P[element.fill],face.light > 0 ? '#ffffff' : '#000000',Math.abs(face.light)*.5);
    c.fill();
    c.strokeStyle = col(P[element.fill],P.onAccent,.2);
    c.lineWidth = 1.5;
    c.stroke();
    if (face.front && (fold.mark || fold.assetId)) {
      const [a,b,,d] = face.points;
      c.save();
      c.clip();
      c.transform(b[0]-a[0],b[1]-a[1],d[0]-a[0],d[1]-a[1],a[0],a[1]);
      if (fold.assetId) paintImage(fold.assetId,{x:.14,y:.14,w:.72,h:.72});
      else icon(fold.mark,{x:.22,y:.22,w:.56,h:.56},pillInk[element.fill]);
      c.restore();
    }
    c.restore();
  }
  const points = faces.flatMap(face=>face.points);
  const x = Math.min(...points.map(p=>p[0])), y = Math.min(...points.map(p=>p[1]));
  recordLayer(layers,element,{x,y,w:Math.max(...points.map(p=>p[0]))-x,h:Math.max(...points.map(p=>p[1]))-y},{content:true});
}

function drawTransform(element, frame, layers) {
  const {box,formTrack,fill} = element;
  const pose = transformPose(formTrack,frame);
  if (pose.logo === 1) {
    const paint=(key,amount)=>{if(!amount)return;c.save();c.globalAlpha*=amount;
      if(key.assetId)paintImage(key.assetId,box);else drawMark(box);c.restore();};
    if(pose.from.assetId===pose.to.assetId)paint(pose.to,1);
    else {paint(pose.from,1-pose.progress);paint(pose.to,pose.progress);}
    recordLayer(layers,element,box,{content:true});
    return;
  }
  const {from,to,progress,depth,rx,ry} = pose;
  const faces = projectVolume(box,'box',depth,rx,ry);
  const fromColor = rgb(P[from.fill ?? fill]), toColor = rgb(P[to.fill ?? fill]);
  const base = fromColor.map((channel,index) => mix(channel,toColor[index],progress));
  const lightMix = clamp(depth / formTrack.depth);
  const logoReveal = clamp((pose.logo-.24)/.65);
  const markProgress = to.form === 'logo' ? logoReveal : from.form === 'logo' ? 1-logoReveal : clamp((progress-.28)/.55);
  for (const {points,light,front} of faces) {
    const corner = front ? Math.min(.45,box.radius / Math.min(box.w,box.h)) * pose.radius * (1-clamp(lightMix*3)) : 0;
    traceFace(points,corner);
    const tint = light > 0 ? 255 : 0;
    c.fillStyle = `rgb(${base.map(channel => Math.round(mix(channel,tint,Math.abs(light)*.42*lightMix))).join(',')})`;
    c.save();
    if (front) c.globalAlpha *= 1 - clamp((pose.logo-.8)/.2);
    c.fill();
    c.restore();
    if (!front) continue;
    c.save();
    c.clip();
    const [a,b,,d] = points;
    c.transform(b[0]-a[0],b[1]-a[1],d[0]-a[0],d[1]-a[1],a[0],a[1]);
    const alpha = c.globalAlpha;
    const paintFaceMark = (key, amount) => {
      if ((!key.mark && !key.assetId) || !amount) return;
      if (key.form==='logo' && key.assetId) return;
      c.globalAlpha = alpha * amount;
      const role = key.fill ?? fill;
      const ink = ['foreground','onAccent'].includes(role) && contrast(luminance(P[role]),luminance(P.accent)) >= 4.5
        ? P.accent : pillInk[role];
      if (key.assetId) paintImage(key.assetId,{x:.1,y:.1,w:.8,h:.8});
      else icon(key.mark,{x:.17,y:.17,w:.66,h:.66},ink);
    };
    if (from.mark === to.mark && from.assetId === to.assetId && (from.fill ?? fill) === (to.fill ?? fill)) {
      paintFaceMark(from,1);
    } else {
      paintFaceMark(from,1-markProgress);
      paintFaceMark(to,markProgress);
    }
    if (logoReveal) {
      c.globalAlpha = alpha * logoReveal;
      const key=to.form==='logo'?to:from;
      if(key.assetId)paintImage(key.assetId,{x:0,y:0,w:1,h:1});
      else drawMark({x:0,y:0,w:1,h:1,radius:corner});
    }
    c.restore();
  }
  const points = faces.flatMap(face => face.points);
  if (points.length) {
    const xs = points.map(([x])=>x), ys = points.map(([,y])=>y);
    const x = Math.min(...xs), y = Math.min(...ys);
    recordLayer(layers,element,{x,y,w:Math.max(...xs)-x,h:Math.max(...ys)-y},{content:true});
  }
}
function layout(el){if(layouts.has(el.id))return layouts.get(el.id);let size=el.fontSize||48,lines=[];for(;size>=20;size--){c.font=fontFor(el,size);lines=[];for(const paragraph of (el.text||'').split('\n')){let current='';for(const word of paragraph.split(/\s+/)){const candidate=current?current+' '+word:word;if(el.kind!=='pill'&&current&&c.measureText(candidate).width>el.box.w){lines.push(current);current=word;}else current=candidate;}lines.push(current);}if(lines.length*size*1.2<=el.box.h&&lines.every(s=>c.measureText(s).width<=el.box.w))break;}if(size<(el.fontSize||48))fits.set(el.id,{target:el.id,requestedSize:el.fontSize,fittedSize:size});if(size<Math.max(24,Math.min(W,H)*.028)||size<(el.fontSize||48)*.6)issues.set(el.id,{code:'text_too_small',target:el.id,frame:el.start});let v={size,lines};layouts.set(el.id,v);return v;}
// Props for show scenes, drawn in the same 100-unit box and stroke as the line icons.
const propIcons = {
  pin() { c.arc(0,-12,26,Math.PI*.82,Math.PI*.18); c.lineTo(0,40); c.closePath(); c.stroke(); c.beginPath(); c.arc(0,-12,8,0,Math.PI*2); c.fill(); },
  home() { c.moveTo(-38,-4); c.lineTo(0,-38); c.lineTo(38,-4); c.moveTo(-27,-12); c.lineTo(-27,36); c.lineTo(27,36); c.lineTo(27,-12); c.moveTo(-8,36); c.lineTo(-8,12); c.lineTo(8,12); c.lineTo(8,36); c.stroke(); },
  courier() { c.roundRect(-40,-24,30,26,4); c.moveTo(-26,26); c.lineTo(2,26); c.lineTo(14,-18); c.moveTo(4,-18); c.lineTo(26,-18); c.moveTo(14,-18); c.lineTo(27,26); c.moveTo(-40,12); c.lineTo(-4,12); c.stroke();
    c.beginPath(); c.arc(-26,28,10,0,Math.PI*2); c.moveTo(37,28); c.arc(27,28,10,0,Math.PI*2); c.fill(); },
  car() { c.roundRect(-40,-6,80,28,8); c.moveTo(-24,-6); c.lineTo(-14,-28); c.lineTo(14,-28); c.lineTo(26,-6); c.stroke();
    c.beginPath(); c.arc(-20,24,9,0,Math.PI*2); c.moveTo(29,24); c.arc(20,24,9,0,Math.PI*2); c.fill(); },
  doc() { c.moveTo(-26,-38); c.lineTo(10,-38); c.lineTo(28,-20); c.lineTo(28,38); c.lineTo(-26,38); c.closePath(); c.moveTo(10,-38); c.lineTo(10,-20); c.lineTo(28,-20); c.moveTo(-12,2); c.lineTo(14,2); c.moveTo(-12,18); c.lineTo(14,18); c.stroke(); },
  mail() { c.roundRect(-38,-26,76,52,6); c.moveTo(-38,-20); c.lineTo(0,8); c.lineTo(38,-20); c.stroke(); },
  person() { c.arc(0,-20,15,0,Math.PI*2); c.moveTo(-30,36); c.bezierCurveTo(-30,2,30,2,30,36); c.stroke(); },
  clock() { c.arc(0,0,36,0,Math.PI*2); c.moveTo(0,-20); c.lineTo(0,0); c.lineTo(16,10); c.stroke(); },
  cart() { c.moveTo(-40,-28); c.lineTo(-26,-28); c.lineTo(-16,14); c.lineTo(26,14); c.lineTo(34,-14); c.lineTo(-22,-14); c.stroke();
    c.beginPath(); c.arc(-10,30,6,0,Math.PI*2); c.moveTo(26,30); c.arc(20,30,6,0,Math.PI*2); c.fill(); },
  bag() { c.moveTo(-28,-12); c.lineTo(28,-12); c.lineTo(32,38); c.lineTo(-32,38); c.closePath(); c.moveTo(-14,-12); c.bezierCurveTo(-14,-42,14,-42,14,-12); c.stroke(); },
  card() { c.roundRect(-38,-25,76,50,8); c.moveTo(-38,-8); c.lineTo(38,-8); c.moveTo(-26,10); c.lineTo(-6,10); c.stroke(); },
  star() { for (let point = 0; point < 10; point++) { const r = point % 2 ? 16 : 38, a = -Math.PI / 2 + point * Math.PI / 5; c[point ? 'lineTo' : 'moveTo'](r * Math.cos(a), r * Math.sin(a)); } c.closePath(); c.stroke(); },
  phone() { c.roundRect(-22,-40,44,80,10); c.moveTo(-6,28); c.lineTo(6,28); c.stroke(); },
  chat() { c.roundRect(-36,-30,72,50,12); c.moveTo(-16,20); c.lineTo(-22,38); c.lineTo(2,20); c.stroke(); },
  cup() { c.moveTo(-28,-20); c.lineTo(-22,32); c.lineTo(18,32); c.lineTo(24,-20); c.closePath(); c.moveTo(24,-8); c.bezierCurveTo(46,-8,46,20,21,20); c.moveTo(-10,-40); c.lineTo(-10,-31); c.moveTo(6,-40); c.lineTo(6,-31); c.stroke(); },
  bean() { c.ellipse(0,0,24,37,.5,0,Math.PI*2); c.moveTo(12,-30); c.bezierCurveTo(-16,-10,16,10,-12,30); c.stroke(); },
  flame() { c.moveTo(0,-40); c.bezierCurveTo(32,-10,30,40,0,40); c.bezierCurveTo(-30,40,-32,-4,-12,-18); c.bezierCurveTo(-8,-4,2,-8,0,-40); c.closePath(); c.stroke(); },
  screen() { c.roundRect(-40,-30,80,52,6); c.moveTo(-16,36); c.lineTo(16,36); c.moveTo(0,22); c.lineTo(0,36); c.stroke(); },
  code() { c.moveTo(-14,-22); c.lineTo(-36,0); c.lineTo(-14,22); c.moveTo(14,-22); c.lineTo(36,0); c.lineTo(14,22); c.moveTo(6,-30); c.lineTo(-6,30); c.stroke(); },
  megaphone() { c.moveTo(-34,-10); c.lineTo(-34,10); c.lineTo(-16,10); c.lineTo(22,30); c.lineTo(22,-30); c.lineTo(-16,-10); c.closePath(); c.moveTo(-24,10); c.lineTo(-17,34); c.moveTo(34,-10); c.lineTo(34,10); c.stroke(); },
  chart() { c.moveTo(-36,-36); c.lineTo(-36,36); c.lineTo(36,36); c.moveTo(-16,36); c.lineTo(-16,12); c.moveTo(2,36); c.lineTo(2,-6); c.moveTo(20,36); c.lineTo(20,-24); c.stroke(); },
  image() { c.roundRect(-38,-30,76,60,6); c.moveTo(-38,18); c.lineTo(-10,-4); c.lineTo(8,12); c.lineTo(20,2); c.lineTo(38,20); c.stroke(); c.beginPath(); c.arc(16,-12,7,0,Math.PI*2); c.fill(); },
  brush() { c.moveTo(32,-36); c.lineTo(-4,6); c.moveTo(-4,6); c.bezierCurveTo(-24,2,-34,18,-36,36); c.bezierCurveTo(-18,34,0,26,-4,6); c.stroke(); },
  coin() { c.arc(0,0,36,0,Math.PI*2); c.moveTo(20,0); c.arc(0,0,20,0,Math.PI*2); c.stroke(); },
};
function icon(name,b,fill){c.save();c.translate(b.x+b.w/2,b.y+b.h/2);c.scale(Math.min(b.w,b.h)/100,Math.min(b.w,b.h)/100);c.strokeStyle=fill;c.fillStyle=fill;c.lineWidth=7;c.lineCap='round';c.lineJoin='round';c.beginPath();if(propIcons[name]){propIcons[name]();c.restore();return;}if(name==='check'){c.moveTo(-30,0);c.lineTo(-8,22);c.lineTo(31,-25);}else if(name==='arrow'){c.moveTo(-35,0);c.lineTo(33,0);c.moveTo(9,-24);c.lineTo(33,0);c.lineTo(9,24);}else if(name==='plus'){c.moveTo(-30,0);c.lineTo(30,0);c.moveTo(0,-30);c.lineTo(0,30);}else if(name==='lock'){c.arc(0,-14,24,Math.PI,0);c.lineTo(24,10);c.moveTo(-24,-14);c.lineTo(-24,10);c.stroke();c.beginPath();c.roundRect(-34,4,68,42,8);c.fill();c.restore();return;}else if(name==='calendar'){c.roundRect(-34,-30,68,65,8);c.moveTo(-34,-9);c.lineTo(34,-9);c.moveTo(-18,-40);c.lineTo(-18,-20);c.moveTo(18,-40);c.lineTo(18,-20);}else if(name==='pause'){c.moveTo(-15,-28);c.lineTo(-15,28);c.moveTo(15,-28);c.lineTo(15,28);}else if(name==='search'){c.arc(-8,-8,25,0,Math.PI*2);c.moveTo(10,10);c.lineTo(32,32);}else if(name==='paw'){for(const [x,y,r] of [[-27,-22,10],[-8,-35,10],[14,-30,10],[30,-12,10],[0,15,25]]){c.moveTo(x+r,y);c.arc(x,y,r,0,Math.PI*2);}c.fill();c.restore();return;}else if(name==='box'){
  c.moveTo(0,-40);
  c.lineTo(36,-20);
  c.lineTo(36,20);
  c.lineTo(0,40);
  c.lineTo(-36,20);
  c.lineTo(-36,-20);
  c.closePath();
  c.moveTo(-36,-20);
  c.lineTo(0,0);
  c.lineTo(36,-20);
  c.moveTo(0,0);
  c.lineTo(0,40);
  c.moveTo(-18,-30);
  c.lineTo(18,-10);
}else if(name==='bolt'){c.moveTo(5,-40);c.lineTo(-25,3);c.lineTo(0,3);c.lineTo(-5,40);c.lineTo(28,-8);c.lineTo(4,-8);c.closePath();c.fill();c.restore();return;}else if(name==='heart'){c.moveTo(0,32);c.bezierCurveTo(-60,-5,-25,-48,0,-22);c.bezierCurveTo(25,-48,60,-5,0,32);c.fill();c.restore();return;}c.stroke();c.restore();}
const swaps = new Map(), clicks = new Map(), spirals = new Map(), typed = new Map(), lifted = new Map(), rings = new Map();

const CHECK_LENGTH = Math.hypot(22, 22) + Math.hypot(39, 47);

function drawCircleCheck(box, fill, progress) {
  const size = Math.min(box.w, box.h) / 100;
  const ring = clamp(progress * 2) ** 2;
  const tick = 1 - (1 - clamp((progress - .625) / .375)) ** 3;
  c.save();
  c.translate(box.x + box.w / 2, box.y + box.h / 2);
  c.scale(size, size);
  c.strokeStyle = fill;
  c.lineWidth = 7;
  c.lineCap = 'round';
  c.lineJoin = 'round';
  if (ring > 0) {
    const turn = Math.PI * 2;
    const start = -Math.PI / 2 - 2 * turn * (1 - ring);
    c.beginPath();
    c.arc(0, 0, 44, start, start + turn * ring);
    if (ring === 1) c.closePath();
    c.stroke();
  }
  if (tick > 0) {
    c.scale(.8, .8);
    c.lineWidth /= .8;
    c.setLineDash([tick * CHECK_LENGTH, CHECK_LENGTH]);
    c.beginPath();
    c.moveTo(-30, 0);
    c.lineTo(-8, 22);
    c.lineTo(31, -25);
    c.stroke();
  }
  c.restore();
}

const CURSOR_RAYS = [-101, -69, -37, -5].map(angle => {
  const radians = angle * Math.PI / 180;
  return [Math.cos(radians), Math.sin(radians)];
});

function drawCursor(box, fill, clickAge = -1) {
  c.save();
  c.translate(box.x, box.y);
  c.scale(box.w / 36, box.h / 42);
  if (clickAge >= 0 && clickAge < 18) {
    const travel = (clickAge / 18) ** 1.6;
    const radius = 7 + travel * 18;
    const alpha = Math.min(clamp(clickAge / 3), clamp((18 - clickAge) / 7));
    c.save();
    c.globalAlpha *= alpha;
    c.lineCap = 'round';
    c.beginPath();
    for (const [dx, dy] of CURSOR_RAYS) {
      c.moveTo(5 + dx * radius, 4 + dy * radius);
      c.lineTo(5 + dx * (radius + 5), 4 + dy * (radius + 5));
    }
    c.strokeStyle = P.surface;
    c.lineWidth = 4;
    c.stroke();
    c.strokeStyle = fill;
    c.lineWidth = 2.4;
    c.stroke();
    c.restore();
    const scale = 1 - .23 * Math.sin(Math.PI * clamp(clickAge / 11));
    c.translate(5, 4);
    c.scale(scale, scale);
    c.translate(-5, -4);
  }
  c.beginPath();
  c.moveTo(5, 4);
  c.lineTo(31, 25);
  c.lineTo(20, 26);
  c.lineTo(15, 38);
  c.closePath();
  c.lineJoin = 'round';
  c.lineWidth = 3;
  c.strokeStyle = P.surface;
  c.fillStyle = fill;
  c.stroke();
  c.fill();
  c.restore();
}

function drawToggle(element, frame) {
  const box = element.box;
  const elapsed = (frame - element.changeAt) / TOGGLE_SETTLE_FRAMES;
  let progress = ease(elapsed), travel = spring(elapsed / 1.6);
  if (element.on === false) { progress = 1 - progress; travel = 1 - travel; }
  rect({...box, radius: box.h / 2}, col('#d2d2d2', element.activeColor ?? P.accent, progress));
  const x = mix(box.x + box.h / 2, box.x + box.w - box.h / 2, travel);
  const k = Math.hypot(c.getTransform().a, c.getTransform().b);
  c.save();
  c.shadowColor = 'rgba(0,0,0,.22)';
  c.shadowBlur = box.h * .16 * k;
  c.shadowOffsetY = box.h * .05 * k;
  c.beginPath();
  c.arc(x, box.y + box.h / 2, box.h * .4, 0, Math.PI * 2);
  c.fillStyle = P.foreground;
  c.fill();
  c.restore();
}

function drawMark(box) {
  c.save();
  c.translate(box.x + box.w / 2, box.y + box.h / 2);
  if (logo) {
    const scale = Math.min(box.w / logo.width, box.h / logo.height);
    c.drawImage(logo, -logo.width * scale / 2, -logo.height * scale / 2, logo.width * scale, logo.height * scale);
  } else {
    const side = Math.min(box.w, box.h);
    rect({x: -box.w / 2, y: -box.h / 2, w: box.w, h: box.h, radius: side * .2}, P.accent);
    c.fillStyle = P.onAccent;
    c.font = `600 ${side * .55}px Inter`;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText([...score.brand][0], 0, 0);
  }
  c.restore();
}

function drawPill(element) {
  const box = element.box;
  if (element.elevation) surface(box, P[element.fill], element.elevation);
  else rect(box, P[element.fill]);
  const {size} = layout({...element, box: {...box, w: box.w * .85, h: box.h * .65}});
  c.font = fontFor(element,size);
  c.fillStyle = pillInk[element.fill];
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  c.fillText(element.text, box.x + box.w / 2, box.y + box.h / 2);
}

function textInk(line, x, y) {
  const ink = c.measureText(line);
  return {x:x - ink.actualBoundingBoxLeft, y:y - ink.actualBoundingBoxAscent,
    w:ink.actualBoundingBoxLeft + ink.actualBoundingBoxRight, h:ink.actualBoundingBoxAscent + ink.actualBoundingBoxDescent};
}

// Paints one laid-out line, switching colour for the emphasised words.
// firstWord is the index of the line's first word within the whole text.
function fillLine(element, line, x, baseline, firstWord) {
  const range = element.emphasis && wordHighlightRange(element.text, element.emphasis.text);
  const words = [...line.matchAll(/\S+/gu)];
  const from = range ? Math.max(0, range.start - firstWord) : 0;
  const to = range ? Math.min(words.length, range.end - firstWord) : 0;
  if (to <= from) { c.fillText(line, x, baseline); return; }
  const width = c.measureText(line).width, align = c.textAlign;
  const left = x - (align === 'center' ? width / 2 : align === 'right' ? width : 0);
  const a = words[from].index, b = words[to - 1].index + words[to - 1][0].length;
  const base = c.fillStyle;
  c.textAlign = 'left';
  for (const [text, start, fill] of [[line.slice(0, a), 0, base], [line.slice(a, b), a, P[element.emphasis.fill]], [line.slice(b), b, base]]) {
    if (!text) continue;
    c.fillStyle = fill;
    c.fillText(text, left + c.measureText(line.slice(0, start)).width, baseline);
  }
  c.fillStyle = base;
  c.textAlign = align;
}
const wordsIn = line => (line.match(/\S+/gu) ?? []).length;

function drawText(element, frame, inkBounds) {
  if (element.wordClick) {
    let click = clicks.get(element.id);
    if (!click) {
      click = makeWordClick(c,element);
      clicks.set(element.id,click);
      const {size,bounds} = click.layout;
      if (size < element.fontSize) fits.set(element.id,{target:element.id,requestedSize:element.fontSize,fittedSize:size});
      if (size < Math.max(24,Math.min(W,H)*.028,element.fontSize*.6) || bounds.w > element.box.w || bounds.h > element.box.h) {
        issues.set(element.id,{code:'text_too_small',target:element.id,frame:element.start});
      }
    }
    const fill=P[element.wordClick.fill ?? element.fill];
    const markFill=[P.background,P.foreground,P.onAccent].sort((a,b)=>
      contrast(cssLuminance(fill),cssLuminance(b))-contrast(cssLuminance(fill),cssLuminance(a)))[0];
    paintWordClick(c,element,click,P,frame,{
      cursor:box=>drawCursor(box,fill),
      mark:(name,box)=>icon(name,{x:box.x+box.w*.12,y:box.y+box.h*.12,w:box.w*.76,h:box.h*.76},markFill),
      recordInk:inkBounds && (box=>inkBounds.push(box)),
    });
    return click.layout.bounds;
  }
  if (element.textRing) {
    let ring = rings.get(element.id);
    if (!ring) {
      ring = makeTextRing(c, element);
      rings.set(element.id, ring);
      if (ring.size < element.fontSize) fits.set(element.id, {target: element.id, requestedSize: element.fontSize, fittedSize: ring.size});
      if (!ring.fits || ring.size < Math.max(24, Math.min(W, H) * .028, element.fontSize * .6)) {
        issues.set(element.id, {code: 'ring_text_too_small', target: element.id, frame: element.start});
      }
    }
    paintTextRing(c, element, ring, P[element.fill], frame, fps);
    return element.box;
  }
  if (element.wordSwap) {
    let swap = swaps.get(element.id);
    if (!swap) {
      swap = makeWordSwap(c, element);
      swaps.set(element.id, swap);
      if (swap.size < element.fontSize) fits.set(element.id, {target: element.id, requestedSize: element.fontSize, fittedSize: swap.size});
      if (swap.size < Math.max(24, Math.min(W, H) * .028, element.fontSize * .6) ||
        swap.bounds.w > element.box.w || swap.bounds.h > element.box.h) {
        issues.set(element.id, {code: 'word_swap_too_small', target: element.id, frame: element.start});
      }
    }
    paintWordSwap(c, element, swap, P, frame);
    return swap.bounds;
  }

  const box = element.box, align = element.align || 'left', text = layout(element);
  c.font = fontFor(element,text.size);
  c.fillStyle = P[element.fill];
  if (element.enter === 'object-reveal') {
    const target = score.elements.find(item => item.id === element.objectReveal.target);
    const reveal = objectRevealAt(element, target, frame);
    const {vertical, positive, edge, x: dx, y: dy} = reveal;
    const left = vertical || !positive ? -W * 2 : edge;
    const top = !vertical || !positive ? -H * 2 : edge;
    const right = vertical || positive ? W * 3 : edge;
    const bottom = !vertical || positive ? H * 3 : edge;
    c.save();
    c.beginPath(); c.rect(left, top, right - left, bottom - top); c.clip();
    c.translate(dx, dy);
    c.textAlign = align; c.textBaseline = 'alphabetic';
    const x = box.x + (align === 'center' ? box.w / 2 : align === 'right' ? box.w : 0);
    let firstWord = 0;
    for (const [index, line] of text.lines.entries()) {
      const baseline = box.y + text.size * (.86 + index * 1.2);
      fillLine(element, line, x, baseline, firstWord);
      if (inkBounds && line) {
        const ink = textInk(line, x, baseline);
        const x1 = Math.max(left, ink.x + dx), y1 = Math.max(top, ink.y + dy);
        const x2 = Math.min(right, ink.x + dx + ink.w), y2 = Math.min(bottom, ink.y + dy + ink.h);
        if (x2 > x1 && y2 > y1) inkBounds.push({...ink, x: x1, y: y1, w: x2 - x1, h: y2 - y1});
      }
      firstWord += wordsIn(line);
    }
    c.restore();
    return box;
  }
  if (element.enter === 'word-lift' || element.enter === 'kinetic-stretch') {
    let line = lifted.get(element.id);
    if (!line) {
      line = makeWordLift(c,element,text);
      lifted.set(element.id,line);
    }
    paintWordLift(c,line,element,frame,inkBounds && ((word,x,y,top,bottom,stretch) => {
      const ink = textInk(word,x,y);
      const start = Math.max(top,y + (ink.y - y) * stretch);
      const end = Math.min(bottom,y + (ink.y + ink.h - y) * stretch);
      if (end > start) inkBounds.push({...ink,y:start,h:end-start});
    }), element.emphasis && (() => {
      const range = wordHighlightRange(element.text, element.emphasis.text);
      return index => range && index >= range.start && index < range.end ? P[element.emphasis.fill] : P[element.fill];
    })());
    return line.bounds;
  }
  if (element.enter === 'word-type') {
    let line = typed.get(element.id);
    if (!line) {
      line = makeWordType(c, element, text);
      typed.set(element.id, line);
    }
    paintWordType(c, line, element, P, frame,
      inkBounds && ((text, x, y) => inkBounds.push(textInk(text, x, y))));
    return line.bounds;
  }
  if (element.enter === 'spiral') {
    let spiral = spirals.get(element.id);
    if (!spiral) {
      spiral = makeSpiral(c, element, text);
      spirals.set(element.id, spiral);
    }
    paintSpiral(c, spiral, element, frame);
    return spiral.bounds;
  }

  const x = box.x + (align === 'center' ? box.w / 2 : align === 'right' ? box.w : 0);
  c.textAlign = align;
  c.textBaseline = 'alphabetic';
  if (element.enter === 'mask-rise') {
    const height = text.size * 1.2;
    const progress = motionProgress((frame - element.start) / element.enterFrames, 'smooth');
    c.save();
    c.beginPath();
    c.rect(box.x, box.y, box.w, box.h);
    c.clip();
    let firstWord = 0;
    for (const [index, line] of text.lines.entries()) {
      const top = box.y + index * height;
      c.save();
      c.beginPath();
      c.rect(box.x, top, box.w, height);
      c.clip();
      const baseline = top + text.size * .91 + (1 - progress) * height;
      if (inkBounds && line && progress > 0) {
        const ink = textInk(line, x, baseline);
        const y = Math.max(top, ink.y), bottom = Math.min(top + height, ink.y + ink.h);
        if (bottom > y) inkBounds.push({...ink, y, h:bottom - y});
      }
      fillLine(element, line, x, baseline, firstWord);
      firstWord += wordsIn(line);
      c.restore();
    }
    c.restore();
    return box;
  }
  let firstWord = 0;
  for (const [index, line] of text.lines.entries()) {
    c.save();
    const delay = ['hero-rise', 'word-blur'].includes(element.enter) ? index * 3 : 0;
    const progress = element.enter === 'none' ? 1 : ease((frame - element.start - delay) / element.enterFrames);
    if (element.enter === 'word-blur' && progress < 1) c.filter = `blur(${(1 - progress) * 14}px)`;
    c.globalAlpha *= progress;
    const baseline = box.y + text.size * (.86 + index * 1.2 + (1 - progress) * .25);
    if (inkBounds && line && c.globalAlpha >= MIN_VISIBLE_ALPHA) inkBounds.push(textInk(line, x, baseline));
    fillLine(element, line, x, baseline, firstWord);
    firstWord += wordsIn(line);
    c.restore();
  }
  return box;
}

function checkTextFrame(element, bounds, frame) {
  const moving = element.motion?.some((key, index, keys) => index && frame > keys[index - 1].frame && frame < key.frame &&
    ['x', 'y', 'scale', 'rotate', 'opacity'].some(field => key[field] !== keys[index - 1][field]));
  if (moving || c.globalAlpha < .9 || frame <= element.start + element.enterFrames + 8) return;
  const matrix = c.getTransform();
  for (const x of [bounds.x, bounds.x + bounds.w]) {
    for (const y of [bounds.y, bounds.y + bounds.h]) {
      const point = matrix.transformPoint({x, y});
      if (point.x < -1 || point.y < -1 || point.x > canvas.width + 1 || point.y > canvas.height + 1) {
        issues.set(element.id, {code: 'text_outside_camera', target: element.id, frame: Math.round(frame)});
        return;
      }
    }
  }
}

function checkProductLayer(element, parent, inverseParent, frame) {
  const key = 'product-flow-' + element.id;
  if (issues.has(key)) return;
  const {x, y, w, h} = element.box;
  const matrix = c.getTransform();
  for (const [px, py] of [[x, y], [x + w, y], [x, y + h], [x + w, y + h]]) {
    const screen = matrix.transformPoint({x: px, y: py});
    const local = inverseParent.transformPoint(screen);
    const outsideCard = local.x < -1 || local.y < -1 || local.x > parent.w + 1 || local.y > parent.h + 1;
    const outsideFrame = screen.x < -1 || screen.y < -1 || screen.x > canvas.width + 1 || screen.y > canvas.height + 1;
    if (outsideCard || outsideFrame) {
      issues.set(key, {code: outsideCard ? 'product_layer_outside_card' : 'product_layer_outside_camera',
        target: element.id, frame: Math.round(frame)});
      return;
    }
  }
}

function cardBounds(bounds, inverseParent) {
  const {x, y, w, h} = bounds;
  const matrix = inverseParent.multiply(c.getTransform());
  const corners = [[x,y],[x+w,y],[x,y+h],[x+w,y+h]].map(([x,y]) => matrix.transformPoint({x,y}));
  return {left:Math.min(...corners.map(point => point.x)), right:Math.max(...corners.map(point => point.x)),
    top:Math.min(...corners.map(point => point.y)), bottom:Math.max(...corners.map(point => point.y))};
}

function recordLayer(layers, element, box, {background = false, content = false} = {}) {
  if (!layers || c.globalAlpha < MIN_VISIBLE_ALPHA || box.w <= 0 || box.h <= 0) return;
  const bounds = projectedBox(box, c.getTransform(), canvas.width / W, canvas.height / H);
  const rider=element.kind==='image' && /^subject-(\d+)$/u.exec(element.id);
  const occludes=rider && actors.has(`track-${rider[1]}-0`)
    ? [...actors.keys()].filter(id=>new RegExp(`^(stop|lit|lit-icon)-${rider[1]}-\\d+$`,'u').test(id)) : [];
  const caption=/^gallery-(?:shade|label)-(\d+)-(\d+)$/u.exec(element.id);
  if(caption)occludes.push(`gallery-image-${caption[1]}-${caption[2]}`);
  // Score validation bounds this explicit handoff in time and checks the shared
  // position plus retirement of the outgoing actor. Only that pair may overlap.
  if(element.handoffFrom)occludes.push(element.handoffFrom);
  layers.push({id:element.id, parent:element.attachTo, bounds, background, content,occludes});
}

function drawStroke(element,progress) {
  if (progress <= 0) return;
  const {box,curve} = element;
  const [start,a,b,end] = cubicPrefix(curve.points,progress).map(({x,y}) =>
    [box.x+x*box.w/1000,box.y+y*box.h/1000]);
  c.beginPath();
  c.moveTo(...start);
  c.bezierCurveTo(...a,...b,...end);
  c.lineWidth=curve.width;
  c.lineCap='round';
  c.strokeStyle=P[element.fill];
  c.stroke();
  if (curve.head && progress < 1) {
    c.beginPath();
    c.arc(...end,curve.head,0,Math.PI*2);
    c.fillStyle=P[element.fill];
    c.fill();
  }
}

function drawElement(element, frame, check, shapes, handoff, layers) {
  if (frame < element.start || frame >= element.end) return;
  if(element.kind==='stage'){
    stageResources.check=check;
    const staged=paintStage(c,element,frame,stageResources);
    if(check)for(const finding of staged.safety??[]){
      const target=element.id+'-'+finding.target,related=finding.related?element.id+'-'+finding.related:undefined;
      const key=[finding.code,target,related].join(':');
      if(!issues.has(key))issues.set(key,{...finding,target,...(related?{related}:{}),frame:Number(frame.toFixed(3))});
    }
    if(layers)layers.push(...staged);
    return;
  }
  const box = element.box;
  const progress = ease((frame - element.start) / element.enterFrames);
  const exit = element.exit === 'cut' || element.end === score.frames ? 1 : clamp((element.end - frame) / 7);
  const pose = element.motion && poseAt(element.motion, frame);
  const parentShape = element.attachTo && shapes.get(element.attachTo);
  if (pose?.opacity === 0 || parentShape?.opacity === 0) return;
  const roll = element.enter === 'roll-in' && rollEntrance(box,(frame-element.start)/element.enterFrames,element.rollFrom);
  let entry = progress;
  if (['none','mask-rise','object-reveal','word-lift','kinetic-stretch','draw'].includes(element.enter)) entry = 1;
  if (roll) entry = roll.opacity;
  if (element.enter === 'spiral') entry = .7 + .3 * clamp((frame - element.start) / 5);
  if (element.enter === 'word-type') entry = clamp((frame - element.start + 1) / 3);
  c.save();
  c.globalAlpha = exit * entry * ((pose?.opacity ?? 100) / 100) * ((parentShape?.opacity ?? 100) / 100);
  const parent = parentShape?.box;
  if (parent) {
    c.translate(parent.x,parent.y);
    rotateAround(parent.w/2,parent.h/2,parentShape.rotate);
  }
  const audit = check && parent && productFlow && (element.id === productFlow.photo || element.id === productFlow.price);
  const trackHandoff = handoff && parent && (element.id === productFlow.photo || element.id === productFlow.name);
  const inverseParent = (audit || trackHandoff) && c.getTransform().inverse();
  if (pose || roll || element.enter === 'pop') {
    const x = box.x + box.w / 2, y = box.y + box.h / 2;
    const zoom = ((pose?.scale ?? 100) / 100) * (roll?.scale ?? 1) * (element.enter === 'pop' ? .62 + .38 * spring((frame - element.start) / element.enterFrames) : 1);
    c.translate(x + (pose?.x ?? 0) + (roll?.x ?? 0), y + (pose?.y ?? 0) + (roll?.y ?? 0));
    const rotation = (pose?.rotate ?? 0) + (roll?.rotate ?? 0);
    if (rotation) c.rotate(rotation * Math.PI / 180);
    c.scale(zoom, zoom);
    c.translate(-x, -y);
  }
  if (element.enter === 'rise') c.translate(0, (1 - progress) * 44);
  if (audit) checkProductLayer(element, parent, inverseParent, frame);

  switch (element.kind) {
    case 'fold':
      drawFold(element,frame,layers);
      break;
    case 'transform':
      drawTransform(element,frame,layers);
      break;
    case 'volume':
      drawVolume(element, frame, layers);
      break;
    case 'stroke':
      drawStroke(element,element.enter==='draw' ? motionProgress((frame-element.start)/element.enterFrames,'smooth') : 1);
      break;
    case 'card':
      drawCard(element);
      recordLayer(layers, element, box, {content:true});
      break;
    case 'rect':
      if (element.elevation) surface(box, P[element.fill], element.elevation);
      else rect(box, P[element.fill]);
      if (Math.min(box.w, box.h) >= 8) recordLayer(layers, element, box, {background:true});
      break;
    case 'icon':
      if (element.icon === 'cursor') drawCursor(box, P[element.fill], frame - (element.clickAt ?? Infinity));
      else {
        if (element.icon === 'circle-check') {
          drawCircleCheck(box, P[element.fill], element.enter === 'draw' ? (frame - element.start) / element.enterFrames : 1);
        } else icon(element.icon, box, P[element.fill]);
        const side = Math.min(box.w, box.h) * .86;
        recordLayer(layers, element, {x:box.x + (box.w - side) / 2, y:box.y + (box.h - side) / 2, w:side, h:side});
      }
      break;
    case 'toggle':
      drawToggle(element, frame);
      recordLayer(layers, element, box, {content:true});
      break;
    case 'logo':
      drawMark(box);
      if (logo) {
        const factor = Math.min(box.w / logo.width, box.h / logo.height);
        const w = logo.width * factor, h = logo.height * factor;
        recordLayer(layers, element, {x:box.x + (box.w - w) / 2, y:box.y + (box.h - h) / 2, w, h}, {content:true});
      } else recordLayer(layers, element, box, {content:true});
      break;
    case 'pill':
      drawPill(element);
      recordLayer(layers, element, box, {content:true});
      break;
    case 'image': {
      const {image,visible} = images.get(element.assetId);
      const age=clamp((frame-element.start)/Math.max(1,element.end-element.start));
      c.save();
      c.beginPath();c.roundRect(box.x,box.y,box.w,box.h,box.radius);c.clip();
      const reveal=motionProgress((frame-element.start)/element.enterFrames,'glide');
      if (element.imageReveal==='wipe') {c.beginPath();c.rect(box.x,box.y,box.w*reveal,box.h);c.clip();}
      if (element.imageReveal==='iris') {c.beginPath();c.arc(box.x+box.w/2,box.y+box.h/2,Math.hypot(box.w,box.h)*.5*reveal,0,Math.PI*2);c.clip();}
      const scale = Math.min(box.w / image.width, box.h / image.height);
      const width = image.width * scale, height = image.height * scale;
      const x = box.x + (box.w - width) / 2, y = box.y + (box.h - height) / 2;
      if (trackHandoff) handoff.photo = cardBounds({x, y, w:width, h:height}, inverseParent);
      const moving=element.mediaMotion && element.mediaMotion!=='none';
      const fit=element.imageFit ?? (moving?'cover':'contain');
      paintImage(element.assetId,box,fit,
        element.mediaMotion==='ken-burns'?1+age*.16:moving?1.12:1,element.mediaMotion==='parallax'?(age-.5)*.8:0);
      c.restore();
      if (fit==='cover') recordLayer(layers,element,box,{content:true,background:true});
      else if (visible) recordLayer(layers,element,{
        x:x+visible.x*scale,y:y+visible.y*scale,w:visible.w*scale,h:visible.h*scale,
      },{content:true});
      break;
    }
    case 'text': {
      const ink = trackHandoff || layers ? [] : null;
      const bounds = drawText(element, frame, ink);
      if (probe?.id === element.id) probe.detail = textDetail(element, bounds);
      if (trackHandoff) handoff.name = ink.map(line => cardBounds(line, inverseParent));
      if (layers) for (const line of ink) recordLayer(layers, element, line, {content:true});
      if (check && !parentShape?.rotate) checkTextFrame(element, bounds, frame);
      break;
    }
  }
  if (probe?.id === element.id) probe.box = projectedBox(probe.detail ?? box, c.getTransform(), canvas.width / W, canvas.height / H);
  c.restore();
}

// The part of a line a dive aims at: the mark a clicked word became, the key phrase, or the whole line.
function textDetail(element, bounds) {
  if (element.wordClick?.shape) return clicks.get(element.id).target;
  const line = lifted.get(element.id);
  const range = line && element.emphasis && wordHighlightRange(element.text, element.emphasis.text);
  if (!range) return bounds;
  const words = line.words.slice(range.start, range.end);
  const left = Math.min(...words.map(word => word.x)), right = Math.max(...words.map(word => word.x + word.width));
  const top = Math.min(...words.map(word => word.y)) - line.size * .74, bottom = Math.max(...words.map(word => word.y)) + line.size * .04;
  return {x: left, y: top, w: right - left, h: bottom - top};
}
let probe = null;

const elevations = new Map(score.shapes.map(item => [item.id, item.elevation ?? 2]));
const rgba = (hex, alpha) => `rgba(${rgb(hex).join(',')},${alpha})`;
const grain = (() => {
  const tile = document.createElement('canvas');
  tile.width = tile.height = 128;
  const context = tile.getContext('2d'), pixels = context.createImageData(128, 128);
  let seed = 20261109;
  for (let index = 0; index < pixels.data.length; index += 4) {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    const value = seed >>> 24;
    pixels.data.set([value, value, value, 255], index);
  }
  context.putImageData(pixels, 0, 0);
  return c.createPattern(tile, 'repeat');
})();

// aurora: two slow accent-tinted fields of light. grid: a dot lattice that fades from the centre.
// Both finish with a gentle vignette that keeps attention inside the frame.
function paintGround(style, ground, frame) {
  const dark = luminance(ground) < .2, seconds = frame / fps;
  if (style === 'aurora') {
    const tint = contrast(luminance(P.accent), luminance(ground)) > 1.25 ? P.accent : P.muted;
    // A neutral tint on a light ground reads as haze, so it is applied at half strength.
    const channels = rgb(tint), neutral = Math.max(...channels) - Math.min(...channels) < 24;
    const strength = neutral && !dark ? .5 : 1;
    for (const [px, py, radius, color, alpha, phase] of [
      [.22, .2, .62, tint, (dark ? .34 : .2) * strength, 0],
      [.86, .92, .58, P.surface === ground ? tint : P.surface, dark ? .22 : .5, 2.1],
    ]) {
      const x = W * (px + .04 * Math.sin(seconds * .35 + phase)), y = H * (py + .05 * Math.cos(seconds * .28 + phase));
      const glow = c.createRadialGradient(x, y, 0, x, y, Math.max(W, H) * radius);
      glow.addColorStop(0, rgba(color, alpha));
      glow.addColorStop(1, rgba(color, 0));
      c.fillStyle = glow;
      c.fillRect(0, 0, W, H);
    }
  } else {
    const step = Math.max(W, H) / 40, dot = Math.max(2, step * .07), reach = Math.hypot(W, H) * .55;
    c.fillStyle = dark ? '#ffffff' : '#000000';
    for (let y = step / 2; y < H; y += step) for (let x = step / 2; x < W; x += step) {
      const alpha = (dark ? .2 : .14) * (1 - Math.hypot(x - W / 2, y - H / 2) / reach);
      if (alpha <= .01) continue;
      c.globalAlpha = alpha;
      c.fillRect(x - dot / 2, y - dot / 2, dot, dot);
    }
    c.globalAlpha = 1;
  }
  const vignette = c.createRadialGradient(W / 2, H / 2, Math.min(W, H) * .35, W / 2, H / 2, Math.hypot(W, H) * .62);
  vignette.addColorStop(0, 'rgba(0,0,0,0)');
  vignette.addColorStop(1, `rgba(0,0,0,${dark ? .42 : .07})`);
  c.fillStyle = vignette;
  c.fillRect(0, 0, W, H);
  // Fixed fine grain dithers the long gradients, which otherwise band after 8-bit encoding.
  c.save();
  c.setTransform(1, 0, 0, 1, 0, 0);
  c.globalAlpha = .045;
  c.fillStyle = grain;
  c.fillRect(0, 0, canvas.width, canvas.height);
  c.restore();
}

const transitions = score.scenes.filter(scene => scene.transition).map(scene => ({
  start: scene.start, ground: P[scene.ground ?? 'background'], ...scene.transition,
}));
// Project the detail at the current subframe, using the same camera and actor
// transforms as paint. An empty clip lets the text renderer measure its actual ink
// without painting a second copy of the scene.
function diveDetail(target, frame) {
  const actor = actors.get(target);
  const shapes = new Map(score.shapes.map(item => [item.id, shape(item, frame)]));
  c.save();
  c.setTransform(canvas.width / W, 0, 0, canvas.height / H, 0, 0);
  if (actor?.space !== 'screen') camera(frame, shapes, null);
  let found;
  if (actor) {
    c.beginPath();
    c.clip();
    probe = {id: target};
    drawElement(actor, frame, false, shapes, null, null);
    found = probe.box;
    probe = null;
  } else {
    const detail = shapes.get(target);
    if (detail?.opacity > 0) {
      const {box, rotate} = detail;
      rotateAround(box.x + box.w / 2, box.y + box.h / 2, rotate);
      found = projectedBox(box, c.getTransform(), canvas.width / W, canvas.height / H);
    }
  }
  c.restore();
  if (!found || found.right - found.left < 4 || found.bottom - found.top < 4) return null;
  return {x: found.left, y: found.top, w: found.right - found.left, h: found.bottom - found.top};
}

function paintDive(transition, frame, outputFrame) {
  const {before, progress, fill, target, start} = transition, color = P[fill];
  let alpha;
  if (before) {
    const detail = diveDetail(target, frame);
    if (!detail && !issues.has(`dive-target-${start}`)) {
      issues.set(`dive-target-${start}`, {code: 'dive_target_not_visible', target, frame: outputFrame});
    }
    paint(frame, false, outputFrame, detail && diveCamera(detail, W, H, progress));
    // Finish the takeover after the centered detail is already dominating the frame.
    alpha = motionProgress((progress - .73) / .25, 'smooth');
  } else {
    const zoom = 1 + .14 * (1 - motionProgress(progress, 'expo'));
    paint(frame, false, outputFrame, [W / 2 * (1 - zoom), H / 2 * (1 - zoom), zoom]);
    alpha = 1 - motionProgress(progress / .7, 'smooth');
  }
  if (alpha <= 0) return;
  c.save();
  c.setTransform(canvas.width / W, 0, 0, canvas.height / H, 0, 0);
  c.globalAlpha = alpha;
  c.fillStyle = color;
  c.fillRect(0, 0, W, H);
  c.restore();
}

function transitionAt(frame) {
  const found = transitions.find(({kind,start,frames,revealFrames = 0}) => kind === 'portal' ?
    frame >= start && frame < start + frames : frame >= start - frames && frame < start + revealFrames);
  if (!found) return null;
  const {kind,start,frames,revealFrames = 0} = found, before = frame < start;
  return {...found, before, progress: kind === 'portal' ? (frame - start) / frames :
    before ? (frame - start + frames) / frames : (frame - start) / revealFrames};
}

// A plane with a slanted edge travels across the frame. It covers the outgoing scene, then clears the incoming one.
function paintWipe({direction = 'left', fill, ground, before, progress}) {
  const horizontal = direction === 'left' || direction === 'right';
  const along = horizontal ? W : H, cross = horizontal ? H : W, slant = cross * .18;
  const edge = mix(along / 2 + slant, -along / 2 - slant, motionProgress(progress, 'glide'));
  c.save();
  c.setTransform(canvas.width / W, 0, 0, canvas.height / H, 0, 0);
  c.translate(W / 2, H / 2);
  c.rotate({left: 0, right: Math.PI, up: Math.PI / 2, down: -Math.PI / 2}[direction]);
  const far = (before ? 1 : -1) * (along + slant * 2);
  c.beginPath();
  c.moveTo(edge + slant, -cross / 2);
  c.lineTo(edge - slant, cross / 2);
  c.lineTo(far, cross / 2);
  c.lineTo(far, -cross / 2);
  c.closePath();
  c.fillStyle = fill ? P[fill] : ground;
  c.fill();
  c.restore();
}

// The camera leaves along one axis and arrives from the opposite side, so the direction of travel survives the cut.
function whipShift({direction = 'left', before, progress, frames, revealFrames}) {
  const sign = direction === 'left' || direction === 'up' ? -1 : 1;
  const travel = before ? sign * progress ** 3 : -sign * (1 - progress) ** 3;
  const distance = .52 * (before ? frames : revealFrames) / Math.max(frames, revealFrames);
  return direction === 'left' || direction === 'right' ? [travel * W * distance, 0] : [0, travel * H * distance];
}

function draw(frame, check, outputFrame) {
  const transition = transitionAt(frame);
  if (transition?.kind === 'dive') return paintDive(transition, frame, outputFrame);
  if (transition?.kind !== 'portal') {
    paint(frame, check && transition?.kind !== 'whip', outputFrame, transition?.kind === 'whip' ? whipShift(transition) : null);
    if (transition?.kind === 'wipe') paintWipe(transition);
    return;
  }
  // The outgoing scene holds on its last frame; the incoming one plays inside the opening circle.
  paint(transition.start - .001, false, outputFrame, null);
  const {x, y} = transition;
  const reach = Math.max(...[[0, 0], [W, 0], [0, H], [W, H]].map(([cx, cy]) => Math.hypot(cx - x, cy - y)));
  const radius = reach * motionProgress(transition.progress, 'glide');
  if (radius <= 0) return;
  c.save();
  c.setTransform(canvas.width / W, 0, 0, canvas.height / H, 0, 0);
  c.beginPath();
  c.arc(x, y, radius, 0, Math.PI * 2);
  c.clip();
  paint(frame, check, outputFrame, null);
  c.restore();
}

function paint(frame, check, outputFrame, shift) {
  c.setTransform(canvas.width / W, 0, 0, canvas.height / H, 0, 0);
  const scene = score.scenes.find(scene => frame < scene.end);
  const ground = P[scene?.ground ?? 'background'];
  c.fillStyle = ground;
  if (!['flat','aurora','grid'].includes(scene?.groundStyle)) {
    const gradient = c.createRadialGradient(W * .25 + Math.sin(frame / fps * .2) * 10, H * .45, 0, W * .25, H * .45, W * .55);
    gradient.addColorStop(0, col(ground, P.surface, ground === P.background ? .4 : .12));
    gradient.addColorStop(1, ground);
    c.fillStyle = gradient;
  }
  c.fillRect(0, 0, W, H);
  if (['aurora','grid'].includes(scene?.groundStyle)) paintGround(scene.groundStyle, ground, frame);
  const shapes = new Map(score.shapes.map(item => [item.id, shape(item, frame)]));
  const flood = floodAt(frame);
  const audit = check && !flood?.push;
  const layers = audit ? [] : null;
  const handoff = namePhotoAudit && frame >= productFlow.handoffFrame && frame <= productFlow.cartLandingFrame ? {} : null;
  if (shift) {
    c.translate(shift[0], shift[1]);
    if (shift[2]) c.scale(shift[2], shift[2]);
  }
  c.save();
  camera(frame, shapes, flood);
  const worldTransform = flood ? c.getTransform() : null;
  for (const [id, {box, color, rotate, opacity, outline}] of shapes) {
    if (opacity <= 0) continue;
    if (flood?.push && flood.target === id && flood.progress >= .75) continue;
    if (flood?.land && !flood.push && flood.target === id) continue;
    c.save();
    c.globalAlpha = opacity / 100;
    rotateAround(box.x+box.w/2,box.y+box.h/2,rotate);
    if (Math.min(box.w,box.h) >= 8 && color !== ground) recordLayer(layers,{id},box,{background:true});
    surface(box, color, elevations.get(id), outline);
    if (probe?.id === id) probe.box = projectedBox(box, c.getTransform(), canvas.width / W, canvas.height / H);
    c.restore();
  }
  for (const element of worldElements) drawElement(element, frame, audit, shapes, handoff, layers);
  c.restore();
  for (const element of screenElements) drawElement(element, frame, check, shapes, null, layers);
  if (flood) paintFlood(flood, worldTransform, shapes.get(flood.target));
  if (layers) {
    composition.sample(outputFrame, scene?.id, layers);
    motion.sample(outputFrame,scene?.id,layers);
  }
  if (handoff?.photo && handoff.name?.length) {
    const photo = handoff.photo;
    const gap = Math.min(...handoff.name.map(name => Math.max(
      name.left - photo.right, photo.left - name.right, name.top - photo.bottom, photo.top - name.bottom,
    )));
    namePhotoAudit.samples++;
    namePhotoAudit.minGapPx = Math.min(namePhotoAudit.minGapPx ?? Infinity, gap);
    if (gap < 0 && !issues.has('product-name-photo')) {
      issues.set('product-name-photo', {code:'product_name_overlaps_photo', target:productFlow.name,
        related:productFlow.photo, frame:Number(frame.toFixed(3))});
    }
  }
}

function sampleTime(frame,index,cut) {
  return shutterSampleTime(frame,index,blur,cadence.samplesPerFrame,cuts);
}

window.auditFrames = (start, end) => {
  for (let index = start; index < end; index++) {
    const frame = index / cadence.samplesPerFrame;
    const cut = cuts.findLastIndex(time => time <= frame);
    draw(sampleTime(frame, Math.floor(blur / 2), cut), true, frame);
  }
};

window.renderFrame = (frame, audit = true) => {
  out.setTransform(1, 0, 0, 1, 0, 0);
  out.clearRect(0, 0, canvas.width, canvas.height);
  const cut = cuts.findLastIndex(time => time <= frame);
  for (let index = 0; index < blur; index++) {
    draw(sampleTime(frame, index, cut), audit && index === Math.floor(blur / 2), frame);
    if(shutter)shutter.sample(buffer,index);else out.drawImage(buffer,0,0);
  }
  if(shutter){shutter.finish();out.drawImage(shutter.canvas,0,0);}
  out.globalAlpha = 1;
  out.globalCompositeOperation = 'source-over';
};
window.grab = () => canvas.toDataURL('image/png');
window.nativeGeometry = frame => score.elements.filter(e=>e.stage&&frame>=e.start&&frame<e.end).map(e=>({id:e.id,nodes:stageGeometry(e,frame,stageResources)}));
window.review = () => ({issues: [...issues.values()], textFits: [...fits.values()],fontAudit, namePhotoAudit, composition:composition.report(), motionAudit:motion.report(),directionAudit:framing.report(),shutterMode:shutter?.mode??'single-sample',stageProjection:stageResources.projective?'webgl':stageResources.projective===null?'canvas-mesh':null,glassMode:stageResources.glassMode??null});
window.__ready = true;
