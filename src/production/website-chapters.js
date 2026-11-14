export function capturedChapters(layers) {
  return [1, 2, 3].flatMap(number => {
    const id = 'chapter' + number;
    const title = layers.get(id + '-title');
    const cards = [1, 2, 3].map(i => layers.get(id + '-item' + i)).filter(Boolean);
    return title && cards.length >= 2 ? [{ id, title, cards }] : [];
  });
}

function cardTrack(layer, pose, keys, image) {
  return [{
    id: layer.role + '-frame', kind: 'rect', parent: '', fill: 'surface', clip: true, shadow: true,
    pose: { scale: 100, rotate: 0, radius: 26, opacity: 100, ...pose }, keys,
  }, {
    ...image(layer, { x: 500, y: 500, w: 942, h: 936 }, []),
    parent: layer.role + '-frame',
  }];
}

function slots(count, tall) {
  return Array.from({ length: count }, (_, i) => tall ?
    { x: 530, y: count === 2 ? 440 + i * 245 : 345 + i * 205 } :
    { x: Math.round(500 + (i - (count - 1) / 2) * (count === 2 ? 370 : 300)), y: 540 });
}

function chapterCards({ chapter, chapterIndex, tall, fitted, image, key, addCue, width, height }) {
  const { cards } = chapter;
  const positions = slots(cards.length, tall);
  const sequence = chapterIndex === 2;
  const nodes = [];
  if (sequence) {
    const first = positions[0], last = positions.at(-1);
    const track = tall ? { x: 66, y: Math.round((first.y + last.y) / 2), w: 12, h: last.y - first.y } :
      { x: Math.round((first.x + last.x) / 2), y: 784, w: last.x - first.x, h: 12 };
    const stops = positions.slice(1).map((position, i) => ({
      position, time: .40 + i * .23, draw: Math.round((i + 1) * 100 / (positions.length - 1)),
    }));
    nodes.push({
      id: chapter.id + '-route', kind: 'path', parent: '', fill: 'accent', stroke: 5,
      points: tall ? [{ x: 500, y: 0 }, { x: 500, y: 1000 }] : [{ x: 0, y: 500 }, { x: 1000, y: 500 }],
      pose: { ...track, scale: 100, rotate: 0, opacity: 0, radius: 0, draw: 0 },
      keys: [key(.16, { opacity: 100 }), ...stops.map(stop => key(stop.time, { draw: stop.draw })),
        key(.92, {}), key(1.065, { opacity: 0 })],
    });
    const dotAt = position => tall ? { x: 66, y: position.y } : { x: position.x, y: 784 };
    nodes.push({
      id: chapter.id + '-marker', kind: 'ellipse', parent: '', fill: 'accent',
      pose: { ...dotAt(first), w: 17, h: Math.round(17 * width / height), scale: 100, rotate: 0, opacity: 0, radius: 0 },
      keys: [key(.12, {}), key(.16, { opacity: 100 }),
        ...stops.map(stop => key(stop.time, dotAt(stop.position))),
        key(.92, {}), key(1.065, { opacity: 0, scale: 65 })],
    });
  }
  for (const [index, layer] of cards.entries()) {
    if (chapterIndex === 1) {
      // Keep the selected category front-on while neighbouring cards travel past it.
      const position = active => {
        const offset = index - active;
        const large = offset === 0;
        const geometry = fitted(layer, tall ? 500 : 500 + offset * 319, tall ? 540 + offset * 255 : large ? 520 : 565,
          tall ? (large ? 820 : 590) : (large ? 390 : 220), tall ? (large ? 300 : 168) : (large ? 480 : 276));
        return { ...geometry, rotateY: tall ? 0 : -22 * Math.sign(offset), opacity: large ? 100 : 64 };
      };
      const first = position(0);
      const start = .12 + index * .035;
      const travel = cards.slice(1).flatMap((_, i) => [
        key(.34 + i * .25, {}), key(.45 + i * .25, position(i + 1), 'ms-saas-launch-morph'),
      ]);
      nodes.push(...cardTrack(layer, { ...first, y: first.y + 132, opacity: 0, scale: 78 }, [
        key(start, {}), key(start + .13, { ...first, scale: 100 }, 'ms-saas-launch-out-front'),
        ...travel, key(.92, {}), key(1.065, { x: first.x - 280, opacity: 0 }),
      ], image));
      addCue(index === 0 ? .25 : .45 + (index - 1) * .25, index ? 'swish' : 'pop', 54);
      continue;
    }
    const slot = positions[index];
    const target = fitted(layer, slot.x, slot.y, tall ? 795 : cards.length === 2 ? 325 : 276, tall ? 172 : 372);
    const start = sequence ? .13 + index * .18 : .13 + index * .075;
    const settle = start + .16;
    const featured = index === Math.floor(cards.length / 2);
    const accentKeys = sequence ? [key(settle + .045, { scale: 108 }), key(settle + .095, { scale: 100 })] : [
      key(.49, {}), key(.63, {
        scale: featured ? (tall ? 130 : 147) : 84,
        x: tall || featured ? slot.x : index === 0 ? 146 : 854,
        y: !tall || featured ? slot.y : index === 0 ? slot.y - 28 : slot.y + 28,
      }, 'ms-saas-launch-morph'),
    ];
    nodes.push(...cardTrack(layer, { ...target, x: tall ? target.x + 60 : 500, y: target.y + 140,
      scale: 69, opacity: 0, rotateX: 36, originY: 900 }, [
      key(start, {}), key(settle, { ...target, scale: 100, opacity: 100, rotateX: 0 }, 'ms-saas-launch-out-front'),
      ...accentKeys, key(.92, {}), key(1.065, { opacity: 0, y: target.y - 140, scale: 90 }),
    ], image));
    addCue(settle, sequence ? 'click' : 'pop', 50 + index * 2);
  }
  if (chapterIndex === 0) addCue(.63, 'pop', 44);
  return nodes;
}

export function extendedWebsiteTracks({ chapters, closing, tall, width, height, fitted, image, move, makeIntro }) {
  const introEnd = .289;
  const outroStart = closing.length ? .885 : 1;
  const span = (outroStart - introEnd) / chapters.length;
  const introScale = introEnd / .785;
  const intro = makeIntro((fraction, ...args) => move(fraction * introScale, ...args));
  const nodes = [...intro.nodes];
  const events = intro.events.map(([fraction, ...cue]) => [fraction * introScale, ...cue]);
  const boundaries = [intro.boundaries[0] * introScale];
  const sections = [
    { id: 'site', focus: 'opening', action: 'The original website assembles into the hero card' },
    { id: 'detail', focus: 'primary', action: 'Badges detach from the captured card and unfold into features' },
  ];
  const retained = intro.retained;
  retained?.keys.push(move(introEnd - .008, {}), move(introEnd + .012, { opacity: 0, scale: 85 }));
  const transitions = [];
  for (const [index, chapter] of chapters.entries()) {
    const start = introEnd + span * index;
    const key = (fraction, ...args) => move(Math.min(1, start + span * fraction), ...args);
    const addCue = (fraction, kind, gain) => events.push([start + span * fraction, kind, gain]);
    boundaries.push(start);
    transitions.push(start);
    sections.push({ id: chapter.id, focus: chapter.title.role, action: chapter.title.text.slice(0, 200) });
    const title = fitted(chapter.title, 500, tall ? 141 : 190, tall ? 825 : 860, tall ? 152 : 187);
    nodes.push(image(chapter.title, { ...title, y: title.y + 70, opacity: 0, scale: 88 }, [
      key(.035, { reveal: 0 }), key(.185, { y: title.y, opacity: 100, scale: 100, reveal: 100 }, 'ms-saas-launch-out-front'),
      key(.92, {}), key(1.065, { y: title.y - 210, opacity: 0 }),
    ]));
    addCue(.14, 'swish', 41);
    nodes.push(...chapterCards({ chapter, chapterIndex: index, tall, fitted, image, key, addCue, width, height }));
  }
  if (closing.length) {
    boundaries.push(outroStart);
    transitions.push(outroStart);
    sections.push({ id: 'end', focus: closing[0].role, action: 'Resolve to the original brand and website button' });
    const stacked = tall || closing.length < 3;
    for (const [index, layer] of closing.entries()) {
      const headline = layer.role === 'headline';
      const brand = layer.role === 'brand';
      const x = stacked ? 500 : brand || headline ? 340 : 770;
      const y = stacked ? [245, 500, 745][index + (closing.length === 1 ? 1 : 0)] : brand ? 210 : headline ? 557 : 535;
      const target = fitted(layer, x, y, headline ? stacked ? 855 : 520 : stacked ? 635 : 295,
        headline ? stacked ? 350 : 530 : brand ? 117 : 147);
      const start = outroStart + .007 + index * .008;
      nodes.push(image(layer, { ...target, y: y + 78, opacity: 0, scale: 78 }, [
        move(start, {}), move(start + .023, { y, opacity: 100, scale: 100 }, 'ms-saas-launch-out-settle'),
      ]));
    }
    events.push([outroStart + .048, 'pop', 49]);
  } else {
    // Keep the last chapter visible through the final hold if there is no closing material.
    for (const node of nodes.filter(node => node.id.startsWith(chapters.at(-1).id + '-'))) node.keys.pop();
  }
  const wipeKeys = transitions.flatMap(at => {
    events.push([at, 'whoosh', 56]);
    return [move(at - .019, { x: -395, opacity: 0 }), move(at - .016, { opacity: 100 }),
      move(at, { x: 500 }), move(at + .021, { x: 1395 }), move(at + .023, { opacity: 0 })];
  });
  nodes.push({
    id: 'chapter-sweep', kind: 'rect', parent: '', fill: 'accent',
    pose: { x: -395, y: 500, w: 265, h: 1480, scale: 100, rotate: -9, opacity: 0, radius: 155 },
    keys: wipeKeys,
  });
  events.sort((a, b) => a[0] - b[0]);
  return { nodes, camera: intro.camera, boundaries, sections, events };
}
