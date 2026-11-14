import path from 'node:path';
import { copyFile, readFile } from 'node:fs/promises';
import { ROOT } from '../config.js';
import { captureWebsite } from '../import/website-capture.js';
import { registerBrandAsset } from './brand-assets.js';
import { motionCurves } from './asset-library.js';
import { chooseSound } from './sound-library.js';
import { validateDirectedFilm } from './world-stage.js';
import { capturedChapters, extendedWebsiteTracks } from './website-chapters.js';
import { journeyRoles, websiteJourneyTracks } from './website-journey.js';
import { clipKeys } from './motion-clips.js';

function color(value, fallback) {
  const match = value?.match(/^rgb\((\d+), (\d+), (\d+)\)$/);
  return match ? '#' + match.slice(1).map(v => Number(v).toString(16).padStart(2, '0')).join('') : fallback;
}

export async function importWebsiteLayers(url, dir, settings, focus, signal) {
  const scale = Math.min(1, 1440 / Math.max(settings.width, settings.height));
  const captureDir = path.join(dir, 'website-layers');
  const expanded = settings.websitePace === 'dynamic' && settings.frames >= 22 * settings.fps;
  const captured = await captureWebsite(url, {
    dir: captureDir, width: Math.round(settings.width * scale),
    height: Math.round(settings.height * scale), focus, signal, nested: settings.websitePace === 'dynamic',
    expanded,
  });
  // This first source pack records a public, client-side journey. Website capture itself
  // still uses the guarded static importer and does not run storefront scripts.
  const pageUrl = new URL(captured.url);
  const lapaHomepage = ['lapa.az', 'www.lapa.az'].includes(pageUrl.hostname) && pageUrl.pathname === '/';
  if (expanded && lapaHomepage) {
    const packDir = path.join(ROOT, 'assets/website-journeys/lapa');
    const pack = JSON.parse(await readFile(path.join(packDir, 'manifest.json'), 'utf8'));
    for (const { file, ...layer } of pack.layers) {
      signal?.throwIfAborted();
      const capture = path.join(captureDir, file);
      await copyFile(path.join(packDir, file), capture);
      captured.layers.push({ ...layer, file: capture });
    }
  }
  const layers = [];
  for (const { file, ...layer } of captured.layers) {
    const asset = await registerBrandAsset({ file, source: layer.sourceUrl || captured.url, name: layer.role, kind: 'screenshot' });
    layers.push({ ...layer, asset, capture: 'website-layers/' + path.basename(file) });
  }
  return { ...captured, layers };
}

function relativeBox(box, container) {
  return {
    x: Math.round(500 + (box.x - container.x) * 1000 / container.w),
    y: Math.round(500 + (box.y - container.y) * 1000 / container.h),
    w: Math.max(1, Math.round(box.w * 1000 / container.w)),
    h: Math.max(1, Math.round(box.h * 1000 / container.h)),
  };
}

function badgeHandoff({ badge, detail, index, primaryNode, anchor, freeze, target, original, image, move }) {
  const start = index === 0 ? .245 : .425;
  const lift = index === 0 ? .30 : .48;
  const land = index === 0 ? .41 : .60;
  const carrierId = badge.role + '-carrier';
  const initial = relativeBox(original({ box: badge.ink }), primaryNode.pose);
  const goal = relativeBox(target, anchor);
  const shape = {
    id: badge.role, kind: 'group', parent: carrierId, fill: 'surface',
    pose: { ...initial, scale: 100, rotate: 0, opacity: 100, radius: 0 },
    keys: [
      ...clipKeys('badge-expand', { start, end: land, from: initial, to: goal },
        (time, pose, easing) => ({ ...move(time, pose), easing })),
      move(.705, {}), move(.785, { x: goal.x + 280, y: goal.y - 90, scale: 85, opacity: 0 }),
    ],
  };
  if ([initial, goal].some(box => box.w > 6000 || box.h > 6000 ||
      box.x < -3900 || box.x > 4700 || box.y < -3900 || box.y > 5000)) {
    return { attached: { ...image(badge, relativeBox(original(badge), primaryNode.pose), []), parent: primaryNode.id } };
  }
  // Identical parent geometry until the handoff keeps the captured badge on its real DOM position.
  // Once the carrier freezes, the same child starts its own trajectory in that coordinate space.
  const carrier = { ...primaryNode, id: carrierId, kind: 'group',
    keys: primaryNode.keys.filter(key => key.at <= move(freeze, {}).at) };
  delete carrier.assetId;
  delete carrier.fit;
  const fill = color(badge.background, '') === '#ffffff' ? 'surface' : 'accent';
  const panel = {
    id: badge.role + '-panel', kind: 'rect', parent: shape.id, fill, clip: true, shadow: fill === 'surface',
    pose: { x: 500, y: 500, w: 1000, h: 1000, opacity: 0, scale: 100, rotate: 0, radius: 80 },
    keys: [move(lift, {}), move(lift + .03, { opacity: 100 }), move(land, { radius: 26 })],
  };
  const surface = {
    id: badge.role + '-surface', kind: 'rect', parent: panel.id, fill: 'surface',
    pose: { x: 500, y: 500, w: 985, h: 973, opacity: 0, scale: 100, rotate: 0, radius: 22 },
    keys: [move(lift + .035, {}), move(land, { opacity: 100 })],
  };
  const content = { ...image(detail, { x: 500, y: 500, w: 920, h: 890, opacity: 0 }, [
    move(lift + .045, { reveal: 0 }), move(land, { opacity: 100, reveal: 100 }),
  ]), parent: panel.id };
  const face = { ...image(badge, relativeBox(original(badge), original({ box: badge.ink })), [
    move(lift + .025, {}), move(land - .018, { opacity: 0 }),
  ]), id: badge.role + '-face', parent: shape.id };
  return { nodes: [carrier, shape, panel, surface, content, face] };
}

function dynamicTracks({ layers, primary, details, closing, tall, fitted, original, image, move }) {
  const opening = layers.get('opening');
  const initial = original(primary);
  const hero = fitted(primary, 500, 480, tall ? 890 : 610, tall ? 630 : 745);
  const grouped = fitted(primary, tall ? 500 : 305, tall ? 300 : 485, tall ? 810 : 455, tall ? 420 : 655);
  const badges = new Map([...layers.values()].filter(layer => layer.destination && layer.ink).map(layer => [layer.destination, layer]));
  const secondaryStart = .235;
  const nodes = [
    image(opening, original(opening), [
      move(.045, {}), move(.195, { x: 490, y: 580, scale: 122, blur: 12, opacity: 0 }),
    ]),
    image(primary, initial, [
      move(.045, {}), move(.115, { x: initial.x, y: initial.y - 24, rotate: -8, rotateY: -15, scale: 110 }),
      move(.225, { ...hero, rotate: 0, rotateY: 0, scale: 100 }, 'ms-saas-launch-morph'),
      move(.275, {}), move(.385, { ...(details.length ? grouped : hero), rotate: details.length && !badges.size ? -3 : 0 }, 'ms-saas-launch-out-front'),
      move(.445, {}), move(.535, { ...fitted(primary, tall ? 500 : 132, tall ? 165 : 505, tall ? 340 : 205, 350), rotate: -8, opacity: 65 }),
      move(.68, {}), move(.765, { x: tall ? 350 : -120, y: 785, scale: 70, opacity: 0 }),
    ]),
  ];
  for (const [index, layer] of details.entries()) {
    const landing = fitted(layer, tall ? 500 : 755, tall ? 610 + index * 180 : 315 + index * 330,
      tall ? 815 : 410, tall ? 165 : 300);
    if (badges.size) {
      const badge = badges.get(layer.role);
      if (badge) {
        const target = { ...landing, w: Math.round(landing.w * 1.10), h: Math.round(landing.h * 1.10) };
        const handoff = badgeHandoff({ badge, detail: layer, index, primaryNode: nodes[1],
          anchor: index === 0 ? hero : grouped, freeze: index === 0 ? .225 : .385, target, original, image, move });
        if (handoff.nodes) { nodes.push(...handoff.nodes); continue; }
        nodes.push(handoff.attached);
      }
      const start = index === 0 ? .30 : .49;
      nodes.push(image(layer, { ...landing, x: tall ? 480 : 610, opacity: 0, rotateY: -70 }, [
        move(start, {}), move(start + .11, { ...landing, opacity: 100, rotateY: 0 }, 'ms-saas-launch-out-front'),
        move(.705, {}), move(.785, { opacity: 0, scale: 75 }),
      ]));
      continue;
    }
    const focus = fitted(layer, tall ? 500 : 560, tall ? 550 : 500, tall ? 875 : 650, tall ? 355 : 640);
    const start = secondaryStart + index * .07;
    const keys = [
      move(start, {}), move(start + .12, { ...landing, opacity: 100, rotateY: 0, rotate: 0, scale: 100 }, 'ms-saas-launch-out-front'),
    ];
    if (index === 0) {
      keys.push(
        move(.435, {}), move(.505, focus, 'ms-saas-launch-morph'), move(.565, {}),
        move(.64, { ...landing, x: tall ? 490 : 315, y: tall ? 295 : 230, scale: 80, opacity: 72 }),
      );
    } else {
      keys.push(
        move(.465, {}), move(.525, { ...landing, y: tall ? 825 : 810, scale: 70, opacity: 65 }),
        move(.565, {}), move(.635, { ...focus, scale: 100, opacity: 100 }, 'ms-saas-launch-morph'),
      );
    }
    keys.push(move(.705, {}), move(.79, { x: tall ? 640 : 1100, y: 490, scale: 65, opacity: 0, rotateY: 52 }));
    nodes.push(image(layer, { ...landing, x: tall ? 475 : 570, y: tall ? 465 : 475,
      opacity: 0, rotateY: -79, originX: 0, scale: 78 }, keys));
  }
  // A brand-colour field travels across the same composition and covers the outgoing layers.
  nodes.push({
    id: 'brand-sweep', kind: 'rect', parent: '', fill: 'accent',
    pose: { x: -1150, y: 500, w: 1760, h: 1480, rotate: -8, scale: 100, opacity: 100, radius: 180 },
    keys: [move(.705, {}), move(.79, { x: 550, rotate: -3 }), move(.88, { x: 2030, rotate: 4 })],
  });
  const wideClosing = !tall && closing.some(layer => layer.role === 'headline') && closing.some(layer => layer.role === 'cta');
  const closingY = closing.length === 1 ? [495] : closing.length === 2 ? [335, 635] : [230, 480, 770];
  for (const [index, layer] of closing.entries()) {
    const headline = layer.role === 'headline';
    const brand = layer.role === 'brand';
    const target = fitted(layer,
      wideClosing ? layer.role === 'cta' ? 770 : 340 : 500,
      wideClosing ? brand ? 220 : headline ? 560 : 540 : closingY[index],
      headline ? wideClosing ? 545 : 850 : brand ? tall ? 400 : 220 : tall ? 670 : 300,
      headline ? wideClosing ? 525 : 380 : brand ? 125 : 155);
    const start = .79 + index * .018;
    nodes.push(image(layer, { ...target, y: target.y + 65, x: target.x - 36, opacity: 0, scale: 82 }, [
      move(start, {}), move(start + .072, { x: target.x, y: target.y, opacity: 100, scale: 100 }, 'ms-saas-launch-out-settle'),
    ]));
  }
  // Pages with only feature cards finish on their last captured detail.
  let retained;
  if (!closing.length) {
    nodes.splice(nodes.findIndex(node => node.id === 'brand-sweep'), 1);
    const lastDetail = details.at(-1);
    const badge = badges.get(lastDetail?.role);
    retained = nodes.find(node => node.id === badge?.role) || nodes.find(node => node.id === lastDetail?.role) || nodes[1];
    retained.keys.pop();
  }
  return {
    nodes, boundaries: [.14, .715], retained,
    camera: [move(0, { x: 500, y: 500, zoom: 100, rotate: 0 }),
      move(.045, { x: 500, y: 500, zoom: 100, rotate: 0 }),
      move(.16, { x: 515, y: 500, zoom: 112, rotate: 0 }), move(.245, { x: 500, y: 500, zoom: 100, rotate: 0 })],
    events: [[.105, 'whoosh', 64], [.225, 'pop', 58],
      ...(badges.size ? [[.29, 'whoosh', 54], [.41, 'pop', 54],
        ...(details.length > 1 ? [[.47, 'whoosh', 49], [.60, 'click', 54]] : [])] : [
      ...(details.length ? [[.355, 'click', 48], [.505, 'swish', 56]] : []),
      ...(details.length > 1 ? [[.425, 'click', 45], [.635, 'pop', 52]] : [])]),
      ...(closing.length ? [[.795, 'whoosh', 59], [.895, 'pop', 54]] : [])],
  };
}

export function directWebsite(source, settings) {
  const { frames, width, height, fps } = settings;
  const at = fraction => Math.round((frames - 1) * fraction);
  const layers = new Map(source.layers.map(layer => [layer.role, layer]));
  const primary = layers.get('primary');
  const details = source.layers.filter(layer => /^detail\d$/.test(layer.role));
  const closing = ['brand', 'headline', 'cta'].map(role => layers.get(role)).filter(Boolean);
  if (!details.length && !closing.length) throw new Error('На странице слишком мало отдельных элементов для анимации');
  const tall = height > width;
  const curves = motionCurves();
  const motionCurve = id => curves[id] ? { curveId: id } : {};
  const move = (fraction, properties, curve) => ({
    at: at(fraction), easing: 'in-out-cubic', ...properties, ...motionCurve(curve),
  });
  const fitted = (layer, x, y, maxWidth, maxHeight) => {
    const factor = Math.min(maxWidth * width / 1000 / layer.box.width, maxHeight * height / 1000 / layer.box.height);
    return { x, y, w: Math.max(1, Math.round(layer.box.width * factor * 1000 / width)),
      h: Math.max(1, Math.round(layer.box.height * factor * 1000 / height)) };
  };
  const original = ({ box }) => ({
    x: Math.round((box.x + box.width / 2) * 1000 / source.width),
    y: Math.round((box.y + box.height / 2) * 1000 / source.height),
    w: Math.round(box.width * 1000 / source.width), h: Math.round(box.height * 1000 / source.height),
  });
  const image = (layer, pose, keys) => ({
    id: layer.role, kind: 'image', parent: '', assetId: layer.asset.id, fill: 'surface',
    fit: 'contain', pose: { scale: 100, rotate: 0, opacity: 100, radius: 0, ...pose }, keys,
  });
  const background = color(source.background, '#F5F4F0');
  const nodes = [];
  let sections;
  let boundaries = [.22, .73];
  let events = [[.20, 'whoosh', 53], [.38, 'pop', 49], [.49, 'swish', 43], [.58, 'click', 43], [.86, 'pop', 51]];
  let camera = [
    move(0, { x: 500, y: 500, zoom: 100, rotate: 0 }),
    move(.14, { x: 500, y: 500, zoom: 104, rotate: 0 }),
    move(.36, { x: 500, y: 500, zoom: 100, rotate: 0 }),
  ];
  if (settings.websitePace === 'dynamic') {
    const chapters = frames >= 22 * fps ? capturedChapters(layers) : [];
    const inputs = { layers, primary, details, closing, tall, fitted, original, image, move };
    const extended = { ...inputs, chapters, width, height,
      makeIntro: introMove => dynamicTracks({ ...inputs, closing: [], move: introMove }) };
    const hasJourney = frames >= 22 * fps && closing.length > 0 && journeyRoles.every(role => layers.has(role));
    const tracks = hasJourney ? websiteJourneyTracks(extended)
      : chapters.length ? extendedWebsiteTracks(extended) : dynamicTracks(inputs);
    nodes.push(...tracks.nodes);
    ({ boundaries, events, camera, sections } = tracks);
  } else {
  nodes.push(image(layers.get('opening'), original(layers.get('opening')), [
    move(.14, {}), move(.35, { opacity: 0, y: 525, scale: 106, blur: 6 }),
  ]));
  const showcase = fitted(primary, details.length && !tall ? 300 : 500, tall && details.length ? 315 : 485,
    details.length && !tall ? 430 : 830, tall && details.length ? 435 : 715);
  nodes.push(image(primary, original(primary), [
    move(.14, {}), move(.23, { rotate: -7, scale: 105, y: original(primary).y - 24 }),
    move(.38, { ...showcase, rotate: 0, scale: 100 }, 'ms-saas-launch-morph'),
    move(.69, {}), move(.87, { ...fitted(primary, 500, closing.length ? 860 : 485, closing.length ? 280 : 760, closing.length ? 150 : 650),
      rotate: closing.length ? 9 : 0, opacity: closing.length ? 0 : 100 }, 'ms-saas-launch-out-settle'),
  ]));
  for (const [index, layer] of details.entries()) {
    const target = fitted(layer, tall ? 500 : 755, tall ? 615 + index * 180 : 315 + index * 330,
      tall ? 810 : 405, tall ? 170 : 305);
    const start = .34 + index * .09;
    nodes.push(image(layer, { ...target, x: showcase.x, y: showcase.y, opacity: 0, rotateY: -78, originX: 0 }, [
      move(start, {}), move(start + .15, { ...target, rotateY: 0, opacity: 100 }, 'ms-saas-launch-out-front'),
      move(.70, {}), move(.83, { x: 500, y: 510, opacity: 0, rotateY: 65, scale: 65 }),
    ]));
  }
  const closingY = closing.length === 1 ? [510] : closing.length === 2 ? [360, 610] : [270, 480, 700];
  for (const [index, layer] of closing.entries()) {
    const maxWidth = layer.role === 'headline' ? 780 : layer.role === 'brand' ? (tall ? 400 : 220) : (tall ? 620 : 350);
    const target = fitted(layer, 500, closingY[index], maxWidth, layer.role === 'headline' ? 285 : 125);
    nodes.push(image(layer, { ...target, y: target.y + 70, opacity: 0, scale: 68 }, [
      move(.72 + index * .025, {}), move(.86 + index * .025, { y: target.y, opacity: 100, scale: 100 }, 'ms-saas-launch-out-settle'),
    ]));
  }
  }
  const cuts = [0, ...boundaries.map(at), frames];
  sections ||= ['site', 'detail', 'end'].map((id, index) => ({
    id,
    focus: index === 0 ? 'opening' : index === 1 ? 'primary' : closing[0]?.role || details.at(-1)?.role || 'primary',
    action: ['Open on the captured page', 'Lift and unfold captured elements', 'Resolve to the page’s original branding and call to action'][index],
  }));
  const scenes = sections.map((section, index) => ({ ...section, start: cuts[index], end: cuts[index + 1] }));
  const cues = events
    .map(([fraction, kind, gain]) => {
      const asset = chooseSound({ kind });
      return { frame: at(fraction), kind, gain, sync: 'peak', ...(asset ? { assetId: asset.id } : {}) };
    });
  const motion = {
    version: 1, fps, width, height, frames, scenes,
    world: { background: 'background', nodes, camera },
    audio: { mode: 'sfx-only', bpm: 100, mood: 'warm', intensity: 'medium', key: 'C', cues },
  };
  const narrative = {
    artDirection: { typography: 'sans', radius: 16, palette: {
      background, surface: '#FFFFFF', foreground: color(source.foreground, '#161616'),
      accent: color(source.accent, '#E8B400'), onAccent: '#161616', muted: '#6B6B6B',
    } },
    scenes: scenes.map(scene => ({ id: scene.id, frames: scene.end - scene.start, requiredStates: [] })),
  };
  const ctx = { motion, narrative, interface: { components: [] }, product: { assets: source.layers.map(layer => layer.asset) }, settings };
  validateDirectedFilm(motion, ctx);
  return ctx;
}
