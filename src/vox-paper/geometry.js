import {clamp, random, seam} from './math.js';

export function sheetData({width = 14.4, height = 8.1, nx = 64, ny = 40,
  bounds = [-width / 2, -height / 2, width / 2, height / 2], seed = 1,
  tearSide = 0, tearYSide = 0, faceted = false} = {}) {
  const [left, bottom, right, top] = bounds;
  const positions = [], uvs = [], indices = [];
  for (let j = 0; j <= ny; j++) for (let i = 0; i <= nx; i++) {
    let x = left + (right - left) * i / nx, y = bottom + (top - bottom) * j / ny;
    if (tearSide === -1) x += seam(y, seed) * i / nx;
    if (tearSide === 1) x += seam(y, seed) * (1 - i / nx);
    if (tearYSide === -1) y += seam(x, seed) * j / ny;
    if (tearYSide === 1) y += seam(x, seed) * (1 - j / ny);
    if (tearYSide === 2) y += seam(x, seed);
    if (faceted && i > 0 && i < nx && j > 0 && j < ny) {
      x += (random(j * (nx + 1) + i, seed) - .5) * (right - left) / nx * .4;
      y += (random(j * (nx + 1) + i + 83, seed) - .5) * (top - bottom) / ny * .4;
    }
    // A fixed silhouette, never regenerated during playback.
    if (Math.abs(x + width / 2) < .0001 || Math.abs(x - width / 2) < .0001) x += .025 * Math.sin(y * 33 + seed);
    if (Math.abs(y + height / 2) < .0001 || Math.abs(y - height / 2) < .0001) y += .025 * Math.sin(x * 29 + seed);
    positions.push(x, y, .04);
    uvs.push(clamp(x / width + .5), clamp(y / height + .5));
  }
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const a = j * (nx + 1) + i, b = a + 1, c = a + nx + 1, d = c + 1;
    if ((i + j) % 2) indices.push(a, b, c, b, d, c);
    else indices.push(a, b, d, a, d, c);
  }
  return {positions, uvs, indices};
}

export function circularCutData({width = 14.4, height = 8.1, radius = 1.25, disc = false, segments = 160, seed = 1} = {}) {
  const positions = [], uvs = [], indices = [];
  for (let i = 0; i <= segments; i++) {
    const a = i / segments * Math.PI * 2;
    const dx = Math.cos(a), dy = Math.sin(a);
    const inner = radius + .012 * Math.sin(a * 47 + seed);
    const outer = Math.min(width / 2 / Math.max(Math.abs(dx), 1e-9), height / 2 / Math.max(Math.abs(dy), 1e-9));
    for (const r of disc ? [0, inner] : [inner, outer]) {
      const x = r * dx, y = r * dy;
      positions.push(x, y, .04); uvs.push(x / width + .5, y / height + .5);
    }
    if (i < segments) { const n = i * 2; indices.push(n, n + 1, n + 3, n, n + 3, n + 2); }
  }
  return {positions, uvs, indices};
}

export function toGeometry(THREE, data) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(data.positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(data.uvs, 2));
  geometry.setIndex(data.indices);
  geometry.computeVertexNormals();
  geometry.userData.original = Float32Array.from(data.positions);
  return geometry;
}
