const centre = box => ({x:(box.left+box.right)/2,y:(box.top+box.bottom)/2});
import {stageTextActors} from './stage-player.js';
import {auditStageContinuity} from './stage-continuity.js';
const words = text => text.trim().split(/\s+/u).length;

export function motionAudit(score) {
  const samples = new Map();
  function sample(frame, scene, layers) {
    const boxes = new Map();
    for (const {id,bounds,readable} of layers) {
      if(readable===false)continue;
      const before = boxes.get(id);
      boxes.set(id,before ? {
        left:Math.min(before.left,bounds.left),right:Math.max(before.right,bounds.right),
        top:Math.min(before.top,bounds.top),bottom:Math.max(before.bottom,bounds.bottom),
      } : bounds);
    }
    samples.set(Number(frame.toFixed(4)),{scene,boxes});
  }
  function report() {
    const issues = [], readings = [], joins = [];
    const times = [...samples.keys()].sort((a,b)=>a-b);
    const actors=score.elements.flatMap(item=>item.stage?stageTextActors(item,score.fps):[item]);
    const textActors=actors.filter(item=>item.text && !item.id.startsWith('mast-')),byId=new Map(textActors.map(a=>[a.id,a])),parents=new Map(textActors.map(a=>[a.id,a.id]));
    const root=id=>{while(parents.get(id)!==id)id=parents.get(id);return id;};
    // A preserved word carried through a real, validated seam has already been
    // introduced. Do not demand another full reading hold for its retiring tail.
    for(const seam of auditStageContinuity(score).samples.filter(s=>s.ok&&s.content==='preserve')){
      const a=byId.get(seam.from+'-'+seam.fromNode),b=byId.get(seam.to+'-'+seam.toNode);
      if(a&&b&&a.text===b.text&&Math.abs(a.end-b.start)<.001)parents.set(root(b.id),root(a.id));
    }
    const groups=new Map();for(const actor of textActors){const id=root(actor.id);if(!groups.has(id))groups.set(id,[]);groups.get(id).push(actor);}
    for (const members of groups.values()) {
      const actor=members[0],visible=new Map();
      for(const member of members)for(const frame of times){
        const actor=member;
        if (frame < actor.start+actor.enterFrames || frame >= (actor.wordClick?.at ?? actor.end)) continue;
        const box = samples.get(frame).boxes.get(actor.id);
        if (!box || box.left < -1 || box.top < -1 || box.right > score.width+1 || box.bottom > score.height+1) continue;
        const incoming = score.scenes.find(scene=>scene.start <= frame && frame < scene.end);
        const next = score.scenes.find(scene=>scene.start > frame);
        if(!(incoming?.transition && frame < incoming.start+(incoming.transition.revealFrames ?? incoming.transition.frames)) &&
          !(next?.transition && next.transition.kind !== 'portal' && frame > next.start-next.transition.frames))visible.set(frame,box);
      }
      const valid=[...visible.keys()].sort((a,b)=>a-b);
      let longest = 0, run = 0, previous = -10;
      for (const frame of valid) {
        const now = centre(visible.get(frame));
        const before = visible.get(previous);
        const steady = !before || Math.hypot(now.x-centre(before).x,now.y-centre(before).y) <= Math.min(score.width,score.height)*.015;
        run = frame-previous <= 1 && steady ? run+(frame-previous) : .5;
        longest = Math.max(longest,run);
        previous = frame;
      }
      const needed = Math.max(22,words(actor.text)*6);
      const scene = score.scenes.find(item=>actor.start>=item.start && actor.start<item.end)?.id;
      readings.push({target:actor.id,scene,readableFrames:longest,neededFrames:needed,...(members.length>1?{continuedActors:members.map(m=>m.id)}:{})});
      if (longest+1 < needed) issues.push({code:'reading_window',scene,target:actor.id,readableFrames:longest,neededFrames:needed});
    }
    for (const scene of score.scenes.filter(item=>item.link?.kind === 'match')) {
      const before = samples.get(scene.start-.5)?.boxes.get(scene.link.anchor);
      const index = score.scenes.indexOf(scene);
      const after = samples.get(scene.start)?.boxes;
      const into = after?.get('story-object') ?? after?.get(`token-${index}`) ?? after?.get(`part-${index}-0`);
      if (!before || !into) continue;
      const a=centre(before),b=centre(into),distance=Math.hypot(a.x-b.x,a.y-b.y);
      joins.push({scene:scene.id,from:scene.link.anchor,distancePx:Number(distance.toFixed(2))});
      if (distance>Math.min(score.width,score.height)*.035) issues.push({code:'handoff_jump',scene:scene.id,target:scene.link.anchor,distancePx:distance});
    }
    return {samples:samples.size,issues,readings,joins};
  }
  return {sample,report};
}

export function audioTimingAudit(cues,fps) {
  return cues.flatMap(cue => {
    const rate=cue.playbackRate ?? 1;
    const anchor=cue.sync === 'peak' ? cue.origin?.peakAt : undefined;
    // The mixer records the effective trim and start. Its selected sync point is
    // checked independently from the video cadence.
    const expected=(cue.frame-(cue.leadFrames ?? 0))/fps;
    const actual=cue.start+(cue.syncOffset ?? anchor ?? 0)-cue.trimStart;
    if (cue.syncOffset === undefined) return [];
    return Math.abs(actual-expected)>1/fps ? [{code:'sound_sync',target:cue.actor,frame:cue.frame,errorSeconds:actual-expected,rate}] : [];
  });
}
