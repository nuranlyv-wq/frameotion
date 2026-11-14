import {motionProgress} from './kinetic.js';

export const CONTOURS = ['roundRect', 'ellipse', 'diamond', 'hexagon', 'burst'];
export const VOLUMES = ['box', 'prism', 'octahedron'];
export const TRANSFORM_FORMS = ['tile', 'box', 'logo'];

export function transformPose(track, frame) {
  const index = track.keys.findLastIndex(key => key.frame <= frame);
  const from = track.keys[Math.max(0, index)];
  const to = track.keys[index + 1] ?? from;
  const progress = from === to ? 0 : Math.max(0, Math.min(1,
    motionProgress((frame - from.frame) / (to.frame - from.frame), to.ease ?? 'fluid')));
  const mix = (a,b) => a + (b-a)*progress;
  return {from,to,progress,
    depth:mix(from.form === 'box' ? track.depth : 0,to.form === 'box' ? track.depth : 0),
    radius:mix(from.form === 'box' ? 0 : 1,to.form === 'box' ? 0 : 1),
    rx:mix(from.rx ?? 0,to.rx ?? 0),ry:mix(from.ry ?? 0,to.ry ?? 0),
    logo:mix(Number(from.form === 'logo'), Number(to.form === 'logo')),
  };
}

const radialSamples = count => Array.from({length: count}, (_, index) => {
  const angle = index * 2 * Math.PI / count;
  const spoke = (.5 + .5 * Math.cos(8 * angle)) ** 1.7;
  return [Math.cos(angle), Math.sin(angle), .30 + .70 * spoke];
});
const circle = radialSamples(48);
const detailedCircle = radialSamples(128);

function radial(contour, x, y, halfWidth, halfHeight, radius) {
  const ax = Math.abs(x), ay = Math.abs(y);
  if (contour === 'ellipse') return 1;
  if (contour === 'diamond') return 1 / (ax + ay);
  if (contour === 'hexagon') return 1 / Math.max(ay, ax + ay / 2);
  const edge = 1 / Math.max(ax, ay);
  const dx = ax * halfWidth, dy = ay * halfHeight;
  const cornerX = halfWidth - radius, cornerY = halfHeight - radius;
  if (!radius || dx * edge <= cornerX || dy * edge <= cornerY) return edge;
  // The ray exits through the rounded corner. Solve its intersection with that corner's circle.
  const squared = dx ** 2 + dy ** 2;
  const dot = dx * cornerX + dy * cornerY;
  const constant = cornerX ** 2 + cornerY ** 2 - radius ** 2;
  return (dot + Math.sqrt(Math.max(0, dot ** 2 - squared * constant))) / squared;
}

export function traceContour(context, box, from = 'roundRect', to = from, progress = 1) {
  const {x, y, w, h} = box;
  const halfWidth = w / 2, halfHeight = h / 2;
  const radius = Math.min(box.radius || 0, halfWidth, halfHeight);
  const t = Math.max(0, Math.min(1, progress));
  if (t === 0) to = from;
  if (t === 1) from = to;
  context.beginPath();
  if (from === 'roundRect' && to === 'roundRect') {
    context.roundRect(x, y, w, h, radius);
    return;
  }
  const samples = from === 'burst' || to === 'burst' ? detailedCircle : circle;
  for (const [index, [dx, dy, spoke]] of samples.entries()) {
    const a = from === 'burst' ? spoke : radial(from, dx, dy, halfWidth, halfHeight, radius);
    const b = to === 'burst' ? spoke : radial(to, dx, dy, halfWidth, halfHeight, radius);
    const distance = a + (b - a) * t;
    const px = x + halfWidth * (1 + dx * distance);
    const py = y + halfHeight * (1 + dy * distance);
    if (index) context.lineTo(px, py);
    else context.moveTo(px, py);
  }
  context.closePath();
}

const square = [[-1,-1], [1,-1], [1,1], [-1,1]];
const hexagon = [[1,0], [.5,1], [-.5,1], [-1,0], [-.5,-1], [.5,-1]];

function extrude(rim) {
  const ring = rim.map((_, index) => index);
  const side = rim.length;
  return {
    vertices: [...rim.map(([x,y]) => [x,y,-1]), ...rim.map(([x,y]) => [x,y,1])],
    faces: [ring.slice().reverse(), ring.map(i => i + side), ...ring.map(i => {
      const j = (i + 1) % side;
      return [i,j,j + side,i + side];
    })],
  };
}

const geometry = {
  box: extrude(square),
  prism: extrude(hexagon),
  octahedron: {
    vertices: [[1,0,0], [0,1,0], [-1,0,0], [0,-1,0], [0,0,1], [0,0,-1]],
    faces: square.flatMap((_, i) => {
      const j = (i + 1) % 4;
      return [[i,j,4], [j,i,5]];
    }),
  },
};

// Orthogonal rotation followed by a perspective divide and back-face culling.
export function projectVolume(box, form, depth, rotateX, rotateY) {
  const {x,y,w,h} = box;
  const pitch = rotateX * Math.PI / 180, yaw = rotateY * Math.PI / 180;
  const sx = Math.sin(pitch), cx = Math.cos(pitch), sy = Math.sin(yaw), cy = Math.cos(yaw);
  const focal = Math.max(w,h,depth) * 2.6;
  const {vertices, faces} = geometry[form];
  const rotated = vertices.map(([vx,vy,vz]) => {
    const X = vx * w / 2, Y = vy * h / 2, Z = vz * depth / 2;
    const vertical = Y * cx - Z * sx, forward = Y * sx + Z * cx;
    return [X * cy + forward * sy, vertical, forward * cy - X * sy];
  });
  const projected = rotated.map(([vx,vy,vz]) => {
    const p = focal / (focal - vz);
    return [x + w / 2 + vx * p, y + h / 2 + vy * p];
  });
  return faces.flatMap((indices,index) => {
    const [a,b,c] = indices.map(i => rotated[i]);
    const u = b.map((v,i) => v - a[i]), v = c.map((value,i) => value - a[i]);
    const nx = u[1]*v[2] - u[2]*v[1], ny = u[2]*v[0] - u[0]*v[2], nz = u[0]*v[1] - u[1]*v[0];
    if (nx * -a[0] + ny * -a[1] + nz * (focal - a[2]) <= 0) return [];
    const light = (-.36 * nx - .50 * ny + .78 * nz) / Math.hypot(nx,ny,nz);
    const z = indices.reduce((sum,i) => sum + rotated[i][2], 0) / indices.length;
    return [{points: indices.map(i => projected[i]), light, z, front: form === 'box' && index === 1}];
  }).sort((a,b) => a.z - b.z);
}

export function floodCoverage(box, width, height) {
  // Even the diamond contour contains a centered rectangle with half its width and height.
  return Math.max(width / box.w, height / box.h) * 2.04;
}
export function diveCamera(detail, width, height, progress) {
  const cx = detail.x + detail.w / 2, cy = detail.y + detail.h / 2;
  // Finish the lateral move before the close-up gets large. After that the detail
  // stays on the optical axis through the rest of the push, including subframes.
  const aim = motionProgress(progress / .38, 'smooth');
  const push = motionProgress((progress - .12) / .88, 'fluid');
  const cover = Math.min(120, 1.06 * Math.hypot(width / detail.w, height / detail.h));
  const zoom = cover ** push;
  const x = cx + (width / 2 - cx) * aim;
  const y = cy + (height / 2 - cy) * aim;
  return [x - cx * zoom, y - cy * zoom, zoom];
}
