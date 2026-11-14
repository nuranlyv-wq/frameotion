import {phase, rotate, wear, POSES, crumple} from './math.js';
import {sheetData, circularCutData, toGeometry} from './geometry.js';
import {sampleAction} from './timeline.js';
import {validateAction} from './catalog.js';

const W = 14.4, H = 8.1;

/** Inject THREE and printable canvases/textures; no DOM, fetch, assets or global player assumptions. */
export function createPaperStage({THREE, canvas, width = 1280, height = 720, seed = 11,
  before, after, back, scrap, replacement, tape, stamp, background = '#dfdfd9', pixelRatio = 1}) {
  if (!THREE || !before || !after || !back) throw new TypeError('THREE, before, after and back are required');
  const renderer = new THREE.WebGLRenderer({canvas, antialias: true, preserveDrawingBuffer: true, alpha: false});
  renderer.setPixelRatio(pixelRatio);
  renderer.setSize(width, height, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(background);
  const camera = new THREE.PerspectiveCamera(32, width / height, .1, 100);
  camera.position.set(0, 0, 22);
  camera.zoom = 1.54;
  camera.updateProjectionMatrix();
  camera.lookAt(0, 0, 0);
  scene.add(new THREE.AmbientLight(0xffffff, 2));
  const light = new THREE.DirectionalLight(0xfff9ef, 2.1);
  light.position.set(-5, 7, 13);
  light.castShadow = true;
  light.shadow.mapSize.set(2048, 2048);
  Object.assign(light.shadow.camera, {left: -13, right: 13, top: 10, bottom: -10, near: .5, far: 40});
  Object.assign(light.shadow, {bias: -.0002, normalBias: .025, radius: 3});
  light.shadow.intensity = .36;
  scene.add(light);

  const ownedTextures = [];
  function texture(source) {
    if (!source) return null;
    if (source.isTexture) return source;
    const t = new THREE.CanvasTexture(source);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    ownedTextures.push(t);
    return t;
  }
  const maps = Object.fromEntries(Object.entries({before, after, back, scrap, replacement, tape, stamp}).map(([k, v]) => [k, texture(v)]));
  const desk = new THREE.Mesh(new THREE.PlaneGeometry(100, 70), new THREE.MeshStandardMaterial({color: background, roughness: 1}));
  desk.position.z = -.5;
  desk.receiveShadow = true;
  scene.add(desk);
  const stampTool = new THREE.Group();
  const plateGeo = new THREE.BoxGeometry(3.8, 1.8, .24);
  const handleGeo = new THREE.CylinderGeometry(.4, .55, .9, 32);
  const wood = new THREE.MeshStandardMaterial({color: '#7f4931', roughness: .8});
  const rubber = new THREE.MeshStandardMaterial({color: '#282521', roughness: 1});
  const plate = new THREE.Mesh(plateGeo, rubber), handle = new THREE.Mesh(handleGeo, wood);
  handle.rotation.x = Math.PI / 2; handle.position.z = .57;
  for (const mesh of [plate, handle]) { mesh.castShadow = true; stampTool.add(mesh); }
  scene.add(stampTool);
  const pieces = [];
  let action, dirty = true, lastSample;

  function piece(data, map = maps.before, {transparent = false, flat = false, opacity = 1, color = '#ffffff'} = {}) {
    const geo = toGeometry(THREE, data), group = new THREE.Group();
    const front = new THREE.MeshStandardMaterial({map, color, roughness: 1, side: THREE.FrontSide, flatShading: flat,
      transparent, opacity, alphaTest: transparent ? .015 : 0, shadowSide: THREE.DoubleSide});
    const rear = front.clone();
    rear.side = THREE.BackSide; rear.map = transparent ? map : maps.back;
    const rearGeo = geo.clone();
    rearGeo.setAttribute('position', geo.attributes.position);
    rearGeo.setAttribute('normal', geo.attributes.normal);
    const uv = rearGeo.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setX(i, 1 - uv.getX(i));
    const face = new THREE.Mesh(geo, front), reverse = new THREE.Mesh(rearGeo, rear);
    for (const mesh of [face, reverse]) { mesh.castShadow = true; mesh.receiveShadow = true; group.add(mesh); }
    scene.add(group);
    const value = {geo, rearGeo, group, front, rear};
    pieces.push(value);
    return value;
  }
  function grid(bounds, map, extra = {}) {
    return piece(sheetData({width: W, height: H, seed, bounds, ...extra}), map, extra);
  }
  let under, primary, parts = [], overlay;

  function clearPieces() {
    for (const item of pieces) {
      scene.remove(item.group);
      item.geo.dispose(); item.rearGeo.dispose(); item.front.dispose(); item.rear.dispose();
    }
    pieces.length = 0; parts = []; overlay = null;
  }
  function rebuild() {
    clearPieces();
    const id = action.technique;
    under = grid(undefined, maps.after);
    under.group.position.z = -.16;
    if (id === 'calendar-tear') {
      primary = grid([-W / 2, -H / 2, W / 2, H / 2 - .35], maps.before, {tearYSide:-1});
      parts = [grid([-W / 2, H / 2 - .35, W / 2, H / 2], maps.before, {tearYSide:1})];
    } else if (id === 'tear-split') {
      parts = [grid([-W / 2, -H / 2, 0, H / 2], maps.before, {tearSide: -1}),
        grid([0, -H / 2, W / 2, H / 2], maps.before, {tearSide: 1})];
    } else if (id === 'strip-tear') {
      primary = grid([-W / 2, -H / 2, W / 2, -.95], maps.before, {tearYSide:-1});
      parts = [grid([-W / 2, -.95, W / 2, .8], maps.before, {tearYSide:2}),
        grid([-W / 2, .8, W / 2, H / 2], maps.before, {tearYSide:1})];
    } else if (id === 'window-cut') {
      const a = 2.9, b = 1.55;
      parts = [[-W / 2, -H / 2, -a, H / 2], [a, -H / 2, W / 2, H / 2], [-a, b, a, H / 2], [-a, -H / 2, a, -b]].map(bounds => grid(bounds));
      overlay = grid([-a, -b, a, b]);
    } else if (id === 'hole-punch') {
      primary = piece(circularCutData({width: W, height: H, seed}));
      overlay = piece(circularCutData({width: W, height: H, seed, disc: true}));
    } else {
      primary = grid(undefined, maps.before, {faceted: id === 'crumple', nx: id === 'crumple' ? 40 : 72, ny: id === 'crumple' ? 28 : 48, flat: id === 'crumple'});
      if (['phrase-swap', 'rising-scrap', 'collage', 'tape-peel', 'label-peel', 'stamp'].includes(id)) {
        const local = id === 'tape-peel' ? [3.6, .9] : id === 'stamp' ? [3.4, 1.4] : [6.8, 2];
        const localData = () => sheetData({width: local[0], height: local[1], seed, nx: 48, ny: 16});
        const map = id === 'stamp' ? maps.stamp : id === 'tape-peel' ? maps.tape : maps.scrap;
        overlay = piece(localData(), map ?? maps.before, {transparent: ['tape-peel', 'stamp'].includes(id)});
        if (id === 'phrase-swap') parts.push(piece(localData(), maps.replacement ?? maps.after));
        if (id === 'collage') {
          parts.push(piece(localData(), maps.replacement ?? maps.scrap));
          parts.push(piece(localData(), maps.scrap));
        }
      }
      if (id === 'marker') {
        const region = action.region ?? [-6.22, -.74, 1.95, .43];
        overlay = grid(region, null, {transparent:true, opacity:.5, color:'#e0a704'});
        overlay.front.blending = THREE.MultiplyBlending; overlay.rear.blending = THREE.MultiplyBlending;
        overlay.front.premultipliedAlpha = true; overlay.rear.premultipliedAlpha = true;
        overlay.group.children.forEach(mesh => { mesh.castShadow = false; mesh.receiveShadow = false; });
      }
    }
    dirty = false;
  }
  function deform(item, pose = (x, y, z) => [x, y, z], amount = 0, withWear = true) {
    const attr = item.geo.attributes.position, rest = item.geo.userData.original;
    for (let i = 0; i < attr.count; i++) {
      const x = rest[3 * i], y = rest[3 * i + 1];
      const q = pose(x, y, rest[3 * i + 2]);
      if (withWear) q[2] += wear(x, y, W, H, amount, seed);
      attr.setXYZ(i, ...q);
    }
    attr.needsUpdate = true;
    item.geo.computeVertexNormals();
    item.geo.computeBoundingSphere();
    item.rearGeo.boundingSphere = item.geo.boundingSphere;
  }
  function transform(item, x = 0, y = 0, z = 0, rz = 0, rx = 0, ry = 0) {
    item.group.position.set(x, y, z);
    item.group.rotation.set(rx, ry, rz);
    item.group.scale.set(1, 1, 1);
    item.group.visible = true;
  }

  function render(time) {
    if (!action) throw new Error('Call setAction before render');
    if (dirty) rebuild();
    const s = sampleAction(action, time), p = s.p, id = action.technique;
    stampTool.visible = id === 'stamp' && p < .82;
    lastSample = s;
    for (const item of pieces) transform(item);
    under.group.position.z = -.16;
    under.group.visible = !['crumple', 'half-fold', 'gate-fold', 'accordion', 'map-fold', 'corner-peel', 'roll', 'scroll'].includes(id);
    deform(under);
    if (primary) { primary.front.map = maps.before; deform(primary); }
    if (POSES[id]) {
      deform(primary, (x, y) => POSES[id](x, y, p, W, H), p);
      if (id === 'calendar-tear') parts.forEach(item => deform(item));
    }
    else if (id === 'crumple') {
      primary.front.map = maps[s.print];
      deform(primary, (x, y) => crumple(x, y, s.crumpleAmount, W, H, seed), 0, false);
    } else if (id === 'tear-split') {
      parts.forEach((item, i) => deform(item, (x, y) => {
        const open = phase(p, .12 + (H / 2 - y) / H * .3, .5 + (H / 2 - y) / H * .3);
        const fly = phase(p, .5, 1), side = i ? 1 : -1;
        const q = rotate([x, y, .04], 0, side * .35 * open, side * .1 * fly);
        return [q[0] + side * (1.8 * open + 12 * fly), q[1] - 2 * fly, q[2] + .4 * open];
      }, p));
    } else if (id === 'strip-tear') {
      const e = phase(p, .1, 1);
      deform(parts[0], (x, y) => {
        const lift = phase(p, .1 + (x / W + .5) * .3, .45 + (x / W + .5) * .3);
        const q = rotate([x, y + .8, .04], -.5 * lift, .18 * lift, -.3 * e);
        return [q[0] + 18 * e, q[1] - .8 + 4 * e, q[2] + .9 * lift];
      }, p);
      deform(parts[1]);
    } else if (id === 'window-cut' || id === 'hole-punch') {
      parts.forEach(item => deform(item));
      const e = phase(p, .18, 1);
      deform(overlay, (x, y) => {
        const q = rotate([x, y, .04], .8 * e, -.5 * e, .3 * e);
        return [q[0] + 11 * e, q[1] - 12 * e * e, q[2] + 3 * Math.sin(Math.PI * e)];
      }, p);
    } else if (id === 'phrase-swap') {
      const peeled = phase(p, .13, .3), fly = phase(p, .3, .45);
      deform(overlay, (x, y) => {
        const hinge = 3.4 - 6.8 * peeled, distance = Math.max(0, x - hinge), angle = .55 * peeled;
        return [x + distance * (Math.cos(angle) - 1), y, .04 + distance * Math.sin(angle)];
      }, p);
      deform(parts[0], (x, y) => [x, y, .04 + .25 * Math.sin(Math.PI * (x / 6.8 + .5)) * (1 - s.attach)], p);
      transform(overlay, 15 * fly, -10 * fly * fly, .12, -.6 * fly);
      transform(parts[0], -3 * (1 - s.attach), -10 * (1 - s.attach), .13, .2 * (1 - s.attach));
      overlay.group.visible = p < .48;
      parts[0].group.visible = p >= .48;
    } else if (id === 'rising-scrap' || id === 'collage') {
      const scraps = [overlay, ...parts];
      scraps.forEach((item, i) => {
        const enter = phase(p, .05 + i * .08, .3 + i * .08);
        const leave = id === 'rising-scrap' ? s.leave : phase(p, .78, 1);
        deform(item);
        transform(item, id === 'collage' ? (i - 1) * 3.5 : 0,
          (id === 'collage' ? (i === 1 ? -2.8 : -1.0) : -1.25) - 10 * (1 - enter + leave),
          .12 + i * .07, (i - 1) * .06 + .15 * (1 - enter) - .2 * leave);
        item.group.scale.setScalar(id === 'collage' ? .7 : 1);
      });
    } else if (id === 'tape-peel' || id === 'label-peel') {
      const localW = id === 'tape-peel' ? 3.6 : 6.8, localH = id === 'tape-peel' ? .9 : 2;
      deform(overlay, (x, y) => {
        const q = POSES.roll(x, y, phase(p, .15, .86), localW, localH);
        const fly = phase(p, .73, 1);
        return [q[0] - 13 * fly, q[1] + fly * 8, q[2] + .13 + fly * 2];
      }, p, false);
      if (id === 'tape-peel') overlay.group.position.y = .1;
    } else if (id === 'stamp') {
      deform(overlay, (x, y) => [x, y, .06], 0, false);
      const impact = phase(p, .08, .36), lift = phase(p, .4, .76);
      transform(overlay, 3.2, -1.6, .12, -.13);
      overlay.front.opacity = overlay.rear.opacity = p < .36 ? 0 : 1;
      // The stamp body is an optional caller-owned prop; the print always stays on the sheet.
      stampTool.position.set(3.2 + 7 * lift, -1.6 + 6 * lift, .30 + 6 * (1 - impact) + 5 * lift);
      stampTool.rotation.z = -.13 + .3 * lift;
      camera.position.z = 22 - .06 * Math.sin(Math.PI * phase(p, .34, .42));
    } else if (id === 'marker') {
      const [left] = action.region ?? [-6.22, -.74, 1.95, .43];
      deform(overlay, (x, y) => {
        const xx = left + (x - left) * s.mark;
        return [xx, y + .017 * Math.sin(xx * 28 + seed), .10 + wear(xx, y, W, H, 0, seed)];
      }, 0, false);
      overlay.group.visible = s.mark > 0;
    }
    if (id !== 'stamp') camera.position.z = 22;
    renderer.render(scene, camera);
    return renderer.domElement;
  }
  return {
    setAction(value) {
      validateAction(value);
      if (value.technique !== 'crumple' && value.duration < .2) throw new RangeError('Paper action needs at least 0.2 seconds');
      action = {...value, ...(value.region ? {region:[...value.region]} : {})}; dirty = true; primary = null;
    },
    render,
    updateTexture(name, source) {
      if (!(name in maps)) throw new RangeError(`Unknown paper texture: ${name}`);
      // Reuse the GPU allocation when the caller redraws an existing canvas.
      if (maps[name] && ownedTextures.includes(maps[name]) && !source?.isTexture) {
        maps[name].image = source; maps[name].needsUpdate = true;
      } else if (maps[name] !== source) {
        const previous = maps[name], index = ownedTextures.indexOf(previous);
        if (index >= 0) { previous.dispose(); ownedTextures.splice(index, 1); }
        maps[name] = texture(source); dirty = true;
      } else if (maps[name]) maps[name].needsUpdate = true;
    },
    inspect() {
      return {technique: action?.technique, sample: lastSample, pieces: pieces.length,
        vertices: pieces.reduce((n, item) => n + item.geo.attributes.position.count, 0),
        geometries: renderer.info.memory.geometries, textures: renderer.info.memory.textures,
        calls: renderer.info.render.calls};
    },
    resize(w, h) {
      if (!(w > 0 && h > 0)) throw new RangeError('Positive viewport dimensions required');
      renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
    },
    dispose() {
      clearPieces(); ownedTextures.forEach(t => t.dispose());
      plateGeo.dispose(); handleGeo.dispose(); wood.dispose(); rubber.dispose();
      desk.geometry.dispose(); desk.material.dispose(); renderer.dispose();
    },
  };
}
