import {motionProgress, poseAt, spring} from './kinetic.js';
import {projectVolume, transformPose} from './spatial.js';

// World-space aperture: text travels out of an actual actor's edge. No accumulated
// state, so scrubbing backwards and rendering subframes use identical geometry.
export function objectRevealAt(element, target, frame) {
  const pose = target.motion ? poseAt(target.motion, frame) : {x: 0, y: 0, scale: 100};
  const entrance = target.enter === 'pop' ? .62 + .38 * spring((frame - target.start) / target.enterFrames) : 1;
  const scale = pose.scale / 100 * entrance;
  let b = target.box;
  if (target.formTrack) {
    const form = transformPose(target.formTrack, frame);
    if (form.logo !== 1) {
      const points = projectVolume(b, 'box', form.depth, form.rx, form.ry).flatMap(face => face.points);
      const xs = points.map(point => point[0]), ys = points.map(point => point[1]);
      b = {x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys)};
    }
  }
  const cx = target.box.x + target.box.w / 2, cy = target.box.y + target.box.h / 2;
  const origin = {x: cx + (b.x - cx) * scale + pose.x,
    y: cy + (b.y - cy) * scale + pose.y, w: b.w * scale, h: b.h * scale};
  const box = element.box, direction = element.objectReveal.direction;
  const progress = motionProgress((frame - element.start) / element.enterFrames, 'expo');
  const vertical = direction === 'up' || direction === 'down';
  const positive = direction === 'down' || direction === 'right';
  const edge = vertical ? origin.y + (positive ? origin.h : 0) : origin.x + (positive ? origin.w : 0);
  const far = vertical ? box.y + (positive ? box.h : 0) : box.x + (positive ? box.w : 0);
  const offset = (edge - far) * (1 - progress);
  return {vertical, positive, edge, x: vertical ? 0 : offset, y: vertical ? offset : 0, progress};
}
