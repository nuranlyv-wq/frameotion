import { clipKeys } from './motion-clips.js';

// A recorded website journey carries one real product from the shelf to delivery.
export const journeyRoles = [
  'chapter1-item2', 'chapter2-item1', 'journey-filter', 'journey-photo', 'journey-product',
  'journey-neighbor1', 'journey-neighbor2', 'journey-cart-title', 'journey-cart-item',
  'journey-total', 'journey-delivery-title', 'journey-field1', 'journey-field2', 'journey-field3', 'journey-order',
];

export function websiteJourneyTracks({ layers, closing, tall, fitted, image, move, makeIntro }) {
  const layer = role => layers.get(role);
  const morph = (time, pose) => move(time, pose, 'ms-saas-launch-morph');
  const settle = (time, pose) => move(time, pose, 'ms-saas-launch-out-front');
  const playClip = (id, start, end, from, to) => clipKeys(id, { start, end, from, to },
    (time, pose, easing) => ({ ...move(time, pose), easing }));
  const introScale = .329;
  const intro = makeIntro((fraction, ...args) => move(fraction * introScale, ...args));
  const { nodes } = intro;
  intro.retained?.keys.push(move(.238, {}), morph(.273, { opacity: 0, scale: 76 }));
  const primary = nodes.find(node => node.id === 'primary');
  const carrierId = 'journey-carrier';
  const full = { x: 500, y: 500, w: 1000, h: 1000 };
  const monthly = layer('chapter1-item2');
  const category = layer('chapter2-item1');
  const product = layer('journey-product');
  const cart = layer('journey-cart-item');

  const focus = (source, x, y, w, h) => ({ ...fitted(source, x, y, w, h), opacity: 100, rotate: 0, rotateY: 0, scale: 100 });
  const monthlyPose = focus(monthly, 500, tall ? 517 : 560, tall ? 850 : 448, tall ? 265 : 392);
  const categoryPose = focus(category, 500, 536, tall ? 830 : 426, tall ? 262 : 360);
  const shelfPose = focus(product, 500, 543, tall ? 544 : 300, tall ? 510 : 656);
  const cartPose = focus(cart, tall ? 500 : 340, tall ? 330 : 465, tall ? 878 : 510, tall ? 215 : 255);
  const finishCart = focus(cart, tall ? 500 : 318, tall ? 255 : 420, tall ? 845 : 472, tall ? 195 : 226);

  // The original hero card becomes the moving frame. It never leaves the stage
  // between the subscription benefit, shelf tile and cart line.
  const carrier = {
    id: carrierId, kind: 'group', parent: '', fill: 'surface', pose: primary.pose,
    keys: [
      ...primary.keys.slice(0, -3),
      settle(.196, { ...fitted(layer('primary'), tall ? 500 : 265, tall ? 255 : 530, tall ? 705 : 360, tall ? 315 : 480), rotate: -4 }),
      move(.227, {}),
      morph(.264, { x: tall ? 510 : 408, y: 587, rotate: 8, rotateY: -31, scale: 91 }),
      settle(.293, monthlyPose),
      move(.353, {}),
      morph(.389, { x: tall ? 500 : 656, y: 490, rotate: -10, rotateY: 27, scale: 93 }),
      settle(.424, categoryPose),
      move(.445, {}),
      morph(.474, { ...shelfPose, rotateY: -24, rotate: 3, scale: 107 }),
      settle(.496, shelfPose),
      ...playClip('depth-launch', .548, .636, shelfPose, cartPose),
      move(.704, {}),
      morph(.778, finishCart),
      move(.867, {}),
      morph(.925, { x: tall ? 290 : 165, y: tall ? 150 : 390, scale: 64, rotate: -8, opacity: 0 }),
    ],
  };
  const stageSurface = {
    id: 'journey-surface', kind: 'rect', parent: carrierId, fill: 'surface', shadow: true,
    pose: { ...full, scale: 100, rotate: 0, opacity: 0, radius: 22 },
    keys: [move(.242, {}), move(.277, { opacity: 100 }), move(.447, {}), move(.493, { radius: 28 }),
      move(.573, {}), move(.636, { radius: 23 })],
  };
  const oldPrimary = { ...primary, parent: carrierId, pose: { ...primary.pose, ...full }, keys: [
    move(.249, {}), move(.282, { opacity: 0, reveal: 0, y: 410 }),
  ] };
  nodes.splice(nodes.indexOf(primary), 1, carrier, stageSurface, oldPrimary);
  const capturedFace = (source, enter, hold, leave) => ({
    ...image(source, { ...full, opacity: 0, y: 575 }, [
      move(enter - .028, { reveal: 0 }), settle(enter, { opacity: 100, reveal: 100, y: 500 }),
      move(hold, {}), morph(leave, { y: 455, opacity: 0, reveal: 0 }),
    ]), parent: carrierId,
  });
  nodes.push(
    capturedFace(monthly, .287, .358, .398),
    capturedFace(category, .421, .448, .477),
    capturedFace(product, .493, .584, .613),
    { ...image(cart, { ...full, opacity: 0 }, [
      move(.594, { reveal: 0 }), settle(.633, { opacity: 100, reveal: 100 }),
    ]), parent: carrierId },
  );

  const photoSlot = source => {
    const { box, photo } = source;
    return { x: Math.round((photo.x + photo.width / 2) * 1000 / box.width),
      y: Math.round((photo.y + photo.height / 2) * 1000 / box.height),
      w: Math.round(photo.width * 1000 / box.width), h: Math.round(photo.height * 1000 / box.height) };
  };
  const onShelf = photoSlot(product);
  nodes.push({
    ...image(layer('journey-photo'), { ...onShelf, y: onShelf.y + 65, opacity: 0, scale: 88 }, [
      move(.463, {}), settle(.495, { ...onShelf, opacity: 100, scale: 100 }),
      move(.586, {}), morph(.631, photoSlot(cart)),
    ]), parent: carrierId,
  });

  // Surround the carrier with genuine neighboring products and headings.
  const floating = (role, target, enter, hold, leave, from, to) => {
    const source = layers.get(role);
    if (!source) return;
    nodes.unshift(image(source, { ...target, ...from, opacity: 0 }, [
      move(enter, {}), settle(enter + .043, { ...target, scale: 100, opacity: 100, rotateY: 0 }),
      move(hold, {}), morph(leave, { ...to, opacity: 0 }),
    ]));
  };
  for (const [index, role] of ['chapter1-title', 'journey-filter', 'journey-cart-title'].entries()) {
    const source = layer(role);
    if (!source) continue;
    const [enter, hold, leave] = [[.236, .365, .42], [.386, .56, .607], [.595, .868, .916]][index];
    const geometry = [
      [500, tall ? 150 : 206, 840, 210],
      [500, tall ? 158 : 120, tall ? 255 : 140, 93],
      [tall ? 500 : 330, tall ? 108 : 234, tall ? 487 : 281, tall ? 95 : 111],
    ][index];
    const target = fitted(source, ...geometry);
    floating(role, target, enter, hold, leave, { y: target.y + 95, scale: 80 }, { y: target.y - 93, scale: 92 });
  }
  for (const [index, role] of ['journey-neighbor1', 'journey-neighbor2'].entries()) {
    const side = index ? 1 : -1;
    const target = fitted(layer(role), 500 + side * (tall ? 305 : 237), tall ? 556 : 545,
      tall ? 342 : 220, tall ? 374 : 510);
    floating(role, target, .418 + index * .009, .55 + index * .012, .613 + index * .009,
      { x: target.x - 145 * side, y: target.y + 60, scale: 68, rotateY: 37 * side },
      { x: target.x + 225 * side, rotateY: -33 * side, scale: 75 });
  }

  const total = layer('journey-total');
  const totalPose = focus(total, tall ? 500 : 737, tall ? 611 : 476, tall ? 828 : 289, tall ? 266 : 463);
  const open = { x: tall ? 500 : 737, y: tall ? 639 : 506, w: tall ? 808 : 310, h: tall ? 545 : 797 };
  const box = { x: tall ? cartPose.x : cartPose.x + cartPose.w / 2, y: tall ? 446 : cartPose.y,
    w: 33, h: 45, radius: 40, opacity: 0, scale: 75, rotate: 0, rotateY: -75, originX: 0 };
  const panel = {
    id: 'journey-delivery-panel', kind: 'rect', parent: '', fill: 'surface', clip: true, shadow: true,
    pose: box, keys: [
      move(.625, {}),
      ...playClip('hinge-panel', .638, .686, { ...box, rotateY: 0, opacity: 100 }, { ...totalPose, radius: 31 }),
      move(.713, {}), morph(.784, { ...open, radius: 31, rotateY: 0 }),
      move(.872, {}), morph(.929, { x: 573, y: 622, w: 210, h: 110, rotateY: 32, opacity: 0 }),
    ],
  };
  nodes.push(panel);
  nodes.push({
    ...image(total, { ...full, x: 500, y: 500 }, [
      move(.713, {}), morph(.784, { x: 500, y: 221, w: 987, h: 442 }),
    ]), parent: panel.id,
  });
  const delivery = ['journey-delivery-title', 'journey-field1', 'journey-field2', 'journey-field3', 'journey-order'];
  for (const [index, role] of delivery.entries()) {
    const target = { x: 500, y: [453, 546, 638, 730, 862][index], w: 815, h: [57, 82, 82, 82, 105][index] };
    const start = .723 + .011 * index;
    nodes.push({
      ...image(layer(role), { ...target, y: target.y - 109, opacity: 0, rotateX: -73, originY: 0 }, [
        move(start, { reveal: 0 }), settle(start + .034, { ...target, rotateX: 0, opacity: 100, reveal: 100 }),
      ]), parent: panel.id,
    });
  }

  for (const source of closing) {
    const geometry = source.role === 'brand' ? [tall ? 500 : 332, 245, 280, 116]
      : source.role === 'headline' ? [tall ? 500 : 340, tall ? 494 : 543, tall ? 848 : 514, tall ? 360 : 505]
      : [tall ? 500 : 765, tall ? 771 : 548, tall ? 650 : 285, 137];
    const target = fitted(source, ...geometry);
    nodes.push(image(source, { ...target, x: 577, y: 615, scale: 71, opacity: 0 }, [
      move(.887, {}), settle(.951, { ...target, scale: 100, opacity: 100 }),
    ]));
  }

  const events = [...intro.events.map(([fraction, ...cue]) => [fraction * introScale, ...cue]),
    [.252, 'whoosh', 51], [.29, 'pop', 54], [.38, 'swish', 55], [.423, 'click', 48],
    [.468, 'swish', 46], [.497, 'pop', 48], [.553, 'click', 59], [.577, 'whoosh', 62],
    [.637, 'pop', 56], [.687, 'click', 47], [.733, 'riser', 43],
    [.768, 'click', 45], [.78, 'click', 46], [.791, 'click', 45], [.808, 'pop', 54],
    [.887, 'whoosh', 49], [.951, 'pop', 48]];
  const chapters = [
    [0, 'site', 'opening', 'Lift the original Lapa interface'],
    [.11, 'detail', 'primary', 'Unfold the original subscription badges'],
    [.247, 'subscription', 'chapter1-item2', 'Carry the subscription card toward the shop'],
    [.386, 'catalog', 'journey-product', 'The category opens into the real product shelf'],
    [.563, 'cart', 'journey-cart-item', 'The selected pack flies into the cart without losing its identity'],
    [.714, 'delivery', 'journey-delivery-title', 'The cart total hinges open into the original delivery fields'],
    [.891, 'end', 'brand', 'Return to the original brand and shop button'],
  ];
  return { nodes, events, camera: intro.camera,
    boundaries: chapters.slice(1).map(([at]) => at),
    sections: chapters.map(([, id, focus, action]) => ({ id, focus, action })) };
}
