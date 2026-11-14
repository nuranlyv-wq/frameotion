import {pacingAudit} from './pacing.js';
import {MAX_READING_SECONDS} from './reading.js';

// Use an existing scene handoff to remove a small idle tail without changing
// any authored actor, fact, event time, scene boundary or total film duration.
export function fitStagePauses(input) {
 if(!input.elements.some(element=>element.stage))return input;
 const score=structuredClone(input),audit=pacingAudit(score);let pass=0;
 for(const [index,reading]of audit.scenes.entries()){
  const scene=score.scenes[index],next=score.scenes[index+1];
  if(!reading.exceedsReadingLimit||!next||next.transition||next.link?.kind!=='cut'||!score.elements.some(element=>element.stage&&element.start===scene.start))continue;
  const rapid=score.staging==='superdynamic',limit=rapid?Math.floor(score.fps*.5):24;
  const needed=Math.max(6,Math.ceil(reading.readingHoldFrames-MAX_READING_SECONDS*score.fps)+1);
  // Larger gaps need new staging, not an overlong transition disguising them.
  if(needed>=limit)continue;
  next.transition={kind:'wipe',frames:needed,revealFrames:rapid?Math.min(6,limit-needed):6,
   direction:pass++%2?'right':'left',fill:next.ground==='foreground'?'background':'foreground'};
  next.link={kind:'wipe',asked:'cut',why:'The sweep starts before the reading hold exceeds 1.2 seconds; authored actor tracks and total duration are retained.'};
 }
 return score;
}
