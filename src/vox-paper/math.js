// Every pose is a pure function of absolute time. No accumulated simulation state.
export const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
export const mix = (a, b, t) => a + (b - a) * t;
export const ease = x => { x = clamp(x); return x * x * x * (x * (x * 6 - 15) + 10); };
export const phase = (p, a, b) => ease((p - a) / (b - a));
export function random(i, seed = 1) {
  const n = Math.sin(i * 127.1 + seed * 311.7) * 43758.5453;
  return n - Math.floor(n);
}
export function rotate([x, y, z], ax = 0, ay = 0, az = 0) {
  const yy = y * Math.cos(ax) - z * Math.sin(ax);
  let zz = y * Math.sin(ax) + z * Math.cos(ax);
  const xx = x * Math.cos(ay) + zz * Math.sin(ay);
  zz = -x * Math.sin(ay) + zz * Math.cos(ay);
  return [xx * Math.cos(az) - yy * Math.sin(az), xx * Math.sin(az) + yy * Math.cos(az), zz];
}
export function seam(y, seed = 1) {
  return .034 * Math.sin(y * 39 + seed) + .019 * Math.sin(y * 89 + seed * 2);
}
export function wear(x, y, w, h, p = 0, seed = 1) {
  const u = 2 * x / w, v = 2 * y / h;
  const edge = Math.pow(Math.max(Math.abs(u), Math.abs(v)), 4);
  return .035 * Math.exp(-Math.abs(u + .37 * v - .1) / .025)
    - .025 * Math.exp(-Math.abs(v - .21 * u + .2) / .035)
    + .024 * edge * Math.sin(11 * u + 7 * v + seed)
    + .08 * Math.sin(Math.PI * clamp(p)) * edge * Math.sin(9 * u - 5 * v + p * 12);
}

export function pageTurn(x, y, p, w, h) {
  const u = (x + w / 2) / w, e = ease(p);
  let xx = -w / 2, z = .04;
  const ds = w * u / 32;
  for (let i = 0; i < 32; i++) {
    const s = u * (i + .5) / 32;
    const a = Math.PI * e + Math.sin(Math.PI * e) * (1.1 * Math.sin(Math.PI * s) + .18 * y / h * s);
    xx += ds * Math.cos(a); z += ds * Math.sin(a);
  }
  return [xx - 1.8 * phase(p, .82, 1), y, z];
}
export function calendarTear(x, y, p, w, h) {
  if (p <= 0) return [x, y, .04];
  const down = clamp((h / 2 - y) / h);
  let yy = h / 2, z = .04;
  const ds = h * down / 24, lift = .95 * Math.sin(Math.PI * clamp(p / .8));
  for (let i = 0; i < 24; i++) {
    const a = lift * Math.pow(down * (i + .5) / 24, .9);
    yy -= ds * Math.cos(a); z += ds * Math.sin(a);
  }
  const fly = phase(p, .42, 1);
  const released = phase(p, .16 + (x / w + .5) * .18, .32 + (x / w + .5) * .18);
  yy -= released * Math.exp(-down * 15) * .18;
  const q = rotate([x, yy, z], .16 * fly, -.2 * fly, -.65 * fly);
  return [q[0] + 22 * fly, q[1] - 14 * fly, q[2] + 1.7 * Math.sin(Math.PI * fly)];
}
export function crumple(x, y, amount, w, h, seed = 1) {
  const u = 2 * x / w, v = 2 * y / h, a = ease(amount);
  const f = .07 * Math.sin(17 * u + 9 * v + seed) + .065 * Math.cos(21 * v - 8 * u) + .045 * Math.sin(27 * (u + v));
  const r = 1.08 + f * 1.8, theta = u * Math.PI * 1.18, phi = v * 1.42;
  const q = rotate([mix(x, r * Math.cos(phi) * Math.sin(theta), a),
    mix(y, .96 * Math.sin(phi) + f * .7, a),
    mix(.04, r * Math.cos(phi) * Math.cos(theta) + 1.2, a)
      + Math.sin(Math.PI * a) * (f * 3 + Math.pow(Math.max(Math.abs(u), Math.abs(v)), 3) * .8)],
  a * .2, a * .45, a * .25);
  return q;
}
export function halfFold(x, y, p, w, h, hinge = 0) {
  if (x <= hinge) return [x, y, .04];
  const d = x - hinge, a = (Math.PI - .018) * ease(p);
  return [hinge + d * Math.cos(a), y, .04 + d * Math.sin(a)];
}
export function gateFold(x, y, p, w) {
  const hinge = Math.sign(x) * w / 4;
  if (Math.abs(x) <= w / 4) return [x, y, .04];
  const a = (Math.PI - .025) * ease(p), d = x - hinge;
  return [hinge + d * Math.cos(a), y, .04 + Math.abs(d) * Math.sin(a)];
}
export function accordion(x, y, p, w, h, panels = 6) {
  const size = w / panels, d = x + w / 2;
  let xx = 0, z = .04;
  for (let i = 0; i < panels; i++) {
    const length = i === 0 && d < 0 ? d : i === panels - 1 ? Math.max(0, d - i * size) : clamp(d - i * size, 0, size);
    const a = (i % 2 ? -1 : 1) * 1.42 * ease(p);
    xx += length * Math.cos(a); z += length * Math.sin(a);
  }
  return [xx - w * Math.cos(1.42 * ease(p)) / 2, y, z];
}
export function mapFold(x, y, p, w, h) {
  let q = [x, y, .04];
  if (y < 0) {
    const a = (Math.PI - .025) * phase(p, 0, .45);
    q = [x, y * Math.cos(a), .04 - y * Math.sin(a)];
  }
  if (x > 0) {
    const a = (Math.PI - .035) * phase(p, .55, 1);
    const r = rotate([q[0], q[1], q[2] - .20], 0, -a, 0);
    q = [r[0], r[1], r[2] + .20];
  }
  return q;
}
export function cornerPeel(x, y, p, w, h) {
  // Reflection about a diagonal crease, preserving distances within the flap.
  const nx = Math.SQRT1_2, ny = Math.SQRT1_2;
  const c = (w / 2 + h / 2 - 3.5) * nx, d = x * nx + y * ny - c;
  if (d <= 0) return [x, y, .04];
  const a = 2.8 * ease(p);
  return [x + nx * d * (Math.cos(a) - 1), y + ny * d * (Math.cos(a) - 1), .04 + d * Math.sin(a)];
}
export function roll(x, y, p, w, h, both = false) {
  if (p <= 0) return [x, y, .04];
  const side = both ? Math.sign(x) || 1 : 1;
  const boundary = both ? w / 2 * (1 - ease(p)) : w / 2 - w * ease(p);
  const d = both ? Math.abs(x) - boundary : x - boundary;
  if (d <= 0) return [x, y, .04];
  let xx = 0, z = .04;
  // Spiral integration leaves room for paper thickness between consecutive wraps.
  const n = 64, ds = d / n;
  let angle = 0;
  for (let i = 0; i < n; i++) {
    const radius = .48 + angle * .012;
    const mid = angle + ds / radius / 2;
    xx += ds * Math.cos(mid); z += ds * Math.sin(mid);
    angle += ds / radius;
  }
  return [(boundary + xx) * side, y, z];
}

export const POSES = {
  'page-turn': pageTurn, 'calendar-tear': calendarTear,
  'half-fold': halfFold, 'gate-fold': gateFold, accordion, 'map-fold': mapFold,
  'corner-peel': cornerPeel, roll, scroll: (x, y, p, w, h) => roll(x, y, p, w, h, true),
};
