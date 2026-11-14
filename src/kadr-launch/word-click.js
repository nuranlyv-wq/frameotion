import {makeWordSwap, motionProgress, paintWordSwap} from './kinetic.js';
import {CONTOURS, traceContour} from './spatial.js';
import {MAX_READING_SECONDS, readingBudget} from './reading.js';

const wordPattern = /[\p{L}\p{N}][\p{L}\p{N}\p{M}]*(?:[-’'][\p{L}\p{N}\p{M}]+)*/gu;
const word = {type:'string',minLength:1,maxLength:32};
export const WORD_CLICK_MARKS = ['calendar','check','arrow','bolt','heart','paw','search','lock','pause','plus','box',
  'pin','home','courier','car','doc','mail','person','clock','cart','bag','card','star','phone','chat','cup','bean','flame',
  'screen','code','megaphone','chart','image','brush','coin'];
export const wordClickProperties = {
  word, occurrence:{type:'integer',minimum:1,maximum:12}, replace:word,
  shape:{type:'string',enum:CONTOURS},
  mark:{type:'string',enum:WORD_CLICK_MARKS},
  fill:{type:'string',enum:['foreground','accent','surface','background','muted','onAccent']},
};

export function splitClickedWord(text, {word, occurrence = 1}) {
  const match = [...(text ?? '').matchAll(wordPattern)].filter(match => match[0] === word)[occurrence - 1];
  if (!match) return null;
  return {before:text.slice(0,match.index), after:text.slice(match.index + word.length)};
}

export function wordClickIssue(text, click) {
  if (!splitClickedWord(text,click)) return 'wordClick must identify a whole word and an existing occurrence in text';
  if (Boolean(click.replace) === Boolean(click.shape) || ((click.mark || click.fill) && !click.shape)) {
    return 'wordClick needs either replace or shape; mark belongs to shape';
  }
  if (click.replace && (![...click.replace.matchAll(wordPattern)].some(match => match[0] === click.replace) ||
      click.replace.normalize('NFC') === click.word.normalize('NFC'))) {
    return 'wordClick.replace must be a different single word';
  }
}

export const WORD_CLICK_ENTRY = 10;
export const WORD_CLICK_FRAMES = 18;
export const wordClickRead = text => readingBudget(text, {minimum:24});
export const wordClickMinimum = (text,tail=22) => WORD_CLICK_ENTRY + wordClickRead(text) + WORD_CLICK_FRAMES + tail;

export function stageWordClick(click, text, start, end, tail=22) {
  return {...click, at:Math.max(start+WORD_CLICK_ENTRY+wordClickRead(text),
    Math.min(start+WORD_CLICK_ENTRY+MAX_READING_SECONDS*30,end-WORD_CLICK_FRAMES-tail,Math.round(start+(end-start)*.53))), frames:WORD_CLICK_FRAMES};
}

const mix = (a,b,t) => a+(b-a)*t;
const boundsOfInk = (context,text,x,baseline) => {
  const metrics = context.measureText(text);
  return {x:x-metrics.actualBoundingBoxLeft,y:baseline-metrics.actualBoundingBoxAscent,
    w:metrics.actualBoundingBoxLeft+metrics.actualBoundingBoxRight,
    h:metrics.actualBoundingBoxAscent+metrics.actualBoundingBoxDescent};
};

export function makeWordClick(context, element) {
  const click = element.wordClick;
  const parts = splitClickedWord(element.text,click);
  const variants = [{frame:element.start,text:click.word}];
  if (click.replace) variants.push({frame:click.at,text:click.replace});
  const asSwap = layout => ({...element, wordSwap:{...parts,fill:element.fill,style:'roll',
    layout,transitionFrames:click.frames,variants}});
  const options = {fixedSuffix:true,minWordEm:click.shape ? .84 : 0};
  let swap = asSwap('inline'), layout = makeWordSwap(context,swap,options);
  if (layout.size < element.fontSize*.75 && (parts.before.trim() || parts.after.trim())) {
    const stacked = asSwap('stacked'), candidate = makeWordSwap(context,stacked,options);
    if (candidate.size > layout.size) { swap = stacked; layout = candidate; }
  }
  const {slot, size, wordX} = layout;
  context.font = slot.font;
  context.textAlign = 'left';
  const ink = variants.map(({text},index)=>boundsOfInk(context,text,wordX[index],slot.baseline));
  const side = Math.min(size*.84,slot.w);
  const target = {x:slot.x+(slot.w-side)/2,y:slot.y+(slot.h-side)/2,w:side,h:side,radius:side*.18};
  const hit = {x:ink[0].x+ink[0].w*.73,y:ink[0].y+ink[0].h*.65};
  return {swap,layout,ink,target,hit};
}

// Sample the source ink and destination in horizontal runs. Each run converges
// into a slice of the destination contour so the painted strokes do the moving.
function readRuns(document, paint) {
  const width=256, height=88;
  const mask=document.createElement('canvas');
  mask.width=width; mask.height=height;
  const context=mask.getContext('2d',{willReadFrequently:true});
  paint(context,width,height);
  const {data}=context.getImageData(0,0,width,height);
  return Array.from({length:height},(_,y)=>{
    const runs=[];
    let start=-1;
    for (let x=0;x<=width;x++) {
      const visible=x<width && data[(y*width+x)*4+3]>=128;
      if (visible && start<0) start=x;
      if (!visible && start>=0) {
        runs.push([start/width,x/width]);
        start=-1;
      }
    }
    return runs;
  });
}

function morphRuns(context, click, authored) {
  const {ink:[box],layout} = authored;
  const before=readRuns(context.canvas.ownerDocument,(mask,w,h)=>{
    mask.scale(w/box.w,h/box.h);
    mask.translate(layout.wordX[0]-box.x,layout.slot.baseline-box.y);
    mask.font=layout.slot.font;
    mask.fillText(click.word,0,0);
  });
  const after=readRuns(context.canvas.ownerDocument,(mask,w,h)=>{
    mask.scale(w,h);
    traceContour(mask,{x:0,y:0,w:1,h:1,radius:.18},click.shape);
    mask.fill();
  });
  return before.map((row,y)=>matchRuns(row,after[y]));
}

// Pair equal shares of the ink on either side, retaining the gaps of both silhouettes.
function matchRuns(before, after) {
  const inkTrack = runs => {
    if (!runs.length) return [{a:.5,b:.5,start:0,end:1}];
    const total=runs.reduce((sum,[a,b])=>sum+b-a,0);
    let progress=0;
    return runs.map(([a,b],i)=>{
      const start=progress;
      progress=i===runs.length-1 ? 1 : progress+(b-a)/total;
      return {a,b,start,end:progress};
    });
  };
  const source=inkTrack(before), target=inkTrack(after);
  const slices=[];
  let i=0, j=0;
  const point=(run,at)=>mix(run.a,run.b,(at-run.start)/(run.end-run.start));
  while (i<source.length && j<target.length) {
    const a=source[i], b=target[j];
    const start=Math.max(a.start,b.start), end=Math.min(a.end,b.end);
    if (end>start) slices.push([point(a,start),point(a,end),point(b,start),point(b,end)]);
    if (a.end===end) i++;
    if (b.end===end) j++;
  }
  return slices;
}

function paintMorph(context, element, authored, color, progress) {
  const {target,ink:[before]}=authored;
  const {shape}=element.wordClick;
  context.fillStyle=color;
  if (progress===1) {
    traceContour(context,target,shape);
    context.fill();
    return target;
  }
  const rows=authored.rows ??= morphRuns(context,element.wordClick,authored);
  const box={x:mix(before.x,target.x,progress),y:mix(before.y,target.y,progress),
    w:mix(before.w,target.w,progress),h:mix(before.h,target.h,progress)};
  context.beginPath();
  const stride=box.h/rows.length;
  rows.forEach((runs,i)=>{
    for (const [a,b,c,d] of runs) {
      const x=mix(a,c,progress), width=mix(b,d,progress)-x;
      if (width>0) context.rect(box.x+x*box.w,box.y+i*stride,width*box.w,stride+.3);
    }
  });
  context.fill();
  return box;
}

export function paintWordClick(context, element, authored, palette, frame, {cursor,mark,recordInk}) {
  const {layout,swap,ink,target,hit}=authored;
  const click=element.wordClick, elapsed=frame-click.at;
  const progress=motionProgress(elapsed/click.frames,'fluid');
  context.textAlign='left';
  context.textBaseline='alphabetic';
  if (click.replace || elapsed<=0) {
    paintWordSwap(context,swap,layout,palette,frame);
    // The roll stays inside its slot, which is wider than either word.
    const visible=elapsed<=0 ? ink[0] : elapsed>=click.frames ? ink[1] : null;
    if (visible) recordInk?.(visible);
    else recordInk?.(layout.slot);
  } else {
    context.fillStyle=palette[element.fill];
    context.font=layout.labelFont;
    for (const label of layout.labels) context.fillText(label.text,label.x,label.y);
    const from=palette[element.fill],to=palette[click.fill ?? element.fill];
    const color=from===to ? from : 'rgb('+[1,3,5].map(offset=>Math.round(mix(
      parseInt(from.slice(offset,offset+2),16),parseInt(to.slice(offset,offset+2),16),progress))).join(',')+')';
    const visible=paintMorph(context,element,authored,color,progress);
    recordInk?.(visible);
    if (click.mark && progress>.67) {
      context.save();
      context.globalAlpha*=motionProgress((progress-.67)/.33,'smooth');
      mark(click.mark,target);
      context.restore();
    }
  }
  if (recordInk) {
    context.font=layout.labelFont;
    for (const label of layout.labels) if (label.text.trim()) recordInk(boundsOfInk(context,label.text,label.x,label.y));
  }
  if (elapsed < -18 || elapsed > 12) return;
  const approach=motionProgress((elapsed+18)/18,'fluid');
  const leave=motionProgress(elapsed/12,'fluid');
  const press=motionProgress((elapsed+2)/2,'smooth')*(1-motionProgress(elapsed/6,'fluid'));
  const size=Math.max(28,Math.min(layout.size*.45,63))*(1-.14*press);
  const x=hit.x+(1-approach)*size*.95+leave*size*.24;
  const y=hit.y+(1-approach)*size*.85+leave*size*.34;
  context.save();
  context.globalAlpha*=Math.min(1,approach*3)*(1-leave);
  cursor({x:x-size*5/36,y:y-size*4/36,w:size,h:size*42/36});
  context.restore();
}
