const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
const textKinds = new Set(['text', 'pill']);

export function launchFindings(review) {
  return [...review.issues, ...(review.composition?.issues ?? [])];
}

function findingKey({code, target, related, scene}) {
  return JSON.stringify([code, target, related, scene]);
}

function impact(issue) {
  return (issue.affectedFrames ?? 1) * (1 + (issue.cropPx ??
    (issue.overlapPx ? Math.min(...issue.overlapPx) : 0)));
}

export function improvesFindings(before, after) {
  const previous = new Map(before.map(issue => [findingKey(issue), impact(issue)]));
  return after.length <= before.length &&
    after.every(issue => previous.has(findingKey(issue)) && impact(issue) <= previous.get(findingKey(issue))) &&
    after.reduce((sum, issue) => sum + impact(issue), 0) < before.reduce((sum, issue) => sum + impact(issue), 0);
}

function keepBoxInFrame(score, box) {
  box.x = clamp(Math.round(box.x), 0, score.width - box.w);
  box.y = clamp(Math.round(box.y), 0, score.height - box.h);
}

function* cameraRepairs(score, findings) {
  const crops = findings.filter(issue => ['composition_crop', 'text_outside_camera', 'product_layer_outside_camera'].includes(issue.code));
  if (!crops.length) return;
  const centered = score.camera.filter(key => key.target &&
    Math.abs(key.x - score.width / 2) <= score.width * .05 &&
    Math.abs(key.y - score.height / 2) <= score.height * .05);
  if (centered.length) {
    yield ['camera_target_offset', next => {
      for (const key of next.camera) if (centered.some(item => item.frame === key.frame)) key.x = key.y = 0;
    }];
  }
  const affected = new Set();
  for (const issue of crops) {
    const start = issue.firstFrame ?? issue.frame;
    const end = issue.lastFrame ?? issue.frame;
    score.camera.forEach((key, index) => {
      if ((score.camera[index - 1]?.frame ?? 0) <= end && (score.camera[index + 1]?.frame ?? score.frames) >= start) {
        affected.add(key.frame);
      }
    });
  }
  if (score.camera.some(key => affected.has(key.frame) && key.zoom > 90)) {
    yield ['camera_safe_zoom', next => {
      for (const key of next.camera) if (affected.has(key.frame)) key.zoom = Math.min(key.zoom, 90);
    }];
  }
}

function* layoutRepairs(score, findings, source) {
  const protectedIds = new Set(Object.values(source.productFlow?.ids ?? {}));
  const getText = id => score.elements.find(item => item.id === id && textKinds.has(item.kind) &&
    !item.attachTo && !protectedIds.has(id));
  for (const issue of findings) {
    if (issue.code === 'text_too_small') {
      const element = getText(issue.target);
      if (!element || element.textRing || element.enter === 'spiral') continue;
      yield ['text_wrap', next => {
        const {box} = next.elements.find(item => item.id === element.id);
        const width = Math.min(Math.round(score.width * .86), Math.round(box.w * 1.35));
        const height = Math.min(Math.round(score.height * .38), Math.round(box.h * 1.6));
        box.x -= Math.max(0, width - box.w) / 2;
        box.y -= Math.max(0, height - box.h) / 2;
        box.w = Math.max(box.w, width);
        box.h = Math.max(box.h, height);
        keepBoxInFrame(score, box);
      }];
    }
    if (issue.code !== 'composition_overlap' || !issue.bounds || !issue.relatedBounds) continue;
    const element = getText(issue.related) ?? getText(issue.target);
    if (!element) continue;
    const [a, b] = element.id === issue.target ? [issue.bounds, issue.relatedBounds] : [issue.relatedBounds, issue.bounds];
    const gap = Math.round(Math.min(score.width, score.height) * .025);
    const offsets = [
      {x: 0, y: b.top - a.bottom - gap}, {x: 0, y: b.bottom - a.top + gap},
      {x: b.left - a.right - gap, y: 0}, {x: b.right - a.left + gap, y: 0},
    ].sort((left, right) => Math.hypot(left.x, left.y) - Math.hypot(right.x, right.y));
    for (const offset of offsets.slice(0, 2)) {
      yield ['text_clearance', next => {
        const {box} = next.elements.find(item => item.id === element.id);
        box.x += offset.x;
        box.y += offset.y;
        keepBoxInFrame(score, box);
      }];
    }
  }
}

function* stageLayoutRepairs(score,findings){
  const locate=target=>{for(const e of score.elements.filter(e=>e.stage)){const node=e.stage.nodes.find(n=>e.id+'-'+n.id===target);if(node)return {element:e,node};}};
  for(const issue of findings){
    const found=locate(issue.target);if(!found)continue;const {element,node}=found;
    if(issue.code==='control_label_outside'){
      const label=element.stage.nodes.find(n=>n.id===node.control?.label);
      if(label?.kind==='text'&&label.textMode!=='baseline')yield ['stage_control_label_fit',next=>{
        const child=next.elements.find(e=>e.id===element.id).stage.nodes.find(n=>n.id===label.id);child.x=child.y=0;child.fitToParent={x:8,y:4};
        for(const key of child.track??[]){if(key.x!==undefined)key.x=0;if(key.y!==undefined)key.y=0;}
      }];
    }
    if(issue.code==='control_outside_parent'&&node.parent&&!node.track?.some(k=>k.x!==undefined||k.y!==undefined)){
      yield ['stage_control_dock',next=>{const button=next.elements.find(e=>e.id===element.id).stage.nodes.find(n=>n.id===node.id);button.dock={x:node.x>0?'right':node.x<0?'left':'center',y:node.y>0?'bottom':node.y<0?'top':'center',insetX:12,insetY:12};}];
    }
    if(issue.code!=='stage_text_collision'||!issue.bounds||!issue.relatedBounds)continue;
    const other=locate(issue.related),chosen=other?.node.kind==='text'&&!other.node.parent?other:node.kind==='text'&&!node.parent?found:null;
    if(!chosen)continue;
    const a=chosen.node.id===node.id?issue.bounds:issue.relatedBounds,b=chosen.node.id===node.id?issue.relatedBounds:issue.bounds;
    const offsets=[b.top-a.bottom-8,b.bottom-a.top+8].sort((x,y)=>Math.abs(x)-Math.abs(y));
    for(const offset of offsets)yield ['stage_text_clearance',next=>{const text=next.elements.find(e=>e.id===chosen.element.id).stage.nodes.find(n=>n.id===chosen.node.id);text.y+=offset;for(const k of text.track??[])if(k.y!==undefined)k.y+=offset;}];
  }
}

export async function preflightLaunch(score, source, {audit, validate, signal}) {
  let findings = launchFindings(await audit(score, source, {signal}));
  const before = findings;
  const accepted = [];
  let attempts = 0;
  const seen = new Set([JSON.stringify(score)]);
  while (findings.length && attempts < 10) {
    const repairs = [...stageLayoutRepairs(score,findings),...cameraRepairs(score, findings), ...layoutRepairs(score, findings, source)];
    let improved = false;
    for (const [name, apply] of repairs) {
      if (attempts >= 10) break;
      const candidate = structuredClone(score);
      apply(candidate);
      const key = JSON.stringify(candidate);
      if (seen.has(key)) continue;
      seen.add(key);
      try { validate(candidate); } catch { continue; }
      attempts++;
      const next = launchFindings(await audit(candidate, source, {signal}));
      if (!improvesFindings(findings, next)) continue;
      accepted.push(name);
      score = candidate;
      findings = next;
      improved = true;
      break;
    }
    if (!improved) break;
  }
  return {score, before, remaining: findings, accepted, attempts};
}
