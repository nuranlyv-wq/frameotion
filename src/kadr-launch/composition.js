const MIN_EDGE = 4;
export const MIN_VISIBLE_ALPHA = .18;

export function projectedBox(box, matrix, scaleX, scaleY) {
  const {x, y, w, h} = box;
  const points = [[x,y],[x+w,y],[x+w,y+h],[x,y+h]].map(([x,y]) => {
    const point = matrix.transformPoint({x,y});
    return {x:point.x / scaleX, y:point.y / scaleY};
  });
  return {
    left: Math.min(...points.map(p => p.x)),
    right: Math.max(...points.map(p => p.x)),
    top: Math.min(...points.map(p => p.y)),
    bottom: Math.max(...points.map(p => p.y)),
    points,
  };
}

function axes(points) {
  return [points[1],points[3]].map(point => {
    const x = point.x - points[0].x, y = point.y - points[0].y;
    const length = Math.hypot(x,y);
    return {x:x / length,y:y / length};
  });
}

function projection(points, axis) {
  const values = points.map(p => p.x * axis.x + p.y * axis.y);
  return {min:Math.min(...values),max:Math.max(...values)};
}

function sharesInkSpace(a, b) {
  // Screen AABBs are a fast filter. Rotated actors can have overlapping AABBs while their painted rectangles are apart.
  return [...axes(a.points),...axes(b.points)].every(axis => {
    const x = projection(a.points,axis), y = projection(b.points,axis);
    return Math.min(x.max,y.max) - Math.max(x.min,y.min) >= MIN_EDGE;
  });
}

function intersection(a, b) {
  return {left: Math.max(a.left,b.left), right: Math.min(a.right,b.right),
    top: Math.max(a.top,b.top), bottom: Math.min(a.bottom,b.bottom)};
}

function area(box) {
  return Math.max(0, box.right - box.left) * Math.max(0, box.bottom - box.top);
}

const pixels = number => Number(number.toFixed(2));
const frameNumber = number => Number(number.toFixed(4));
const roundedBox = ({left,right,top,bottom}) => ({left:pixels(left),right:pixels(right),top:pixels(top),bottom:pixels(bottom)});

export function compositionAudit(width, height) {
  const viewport = {left:0, top:0, right:width, bottom:height};
  const observations = new Map();
  let samples = 0;

  function observe(key, seen, frame, issue, severity) {
    const previous = observations.get(key);
    if (!previous) {
      observations.set(key, {issue, severity, firstFrame:frame, lastFrame:frame, affectedFrames:1});
    } else {
      if (!seen.has(key)) previous.affectedFrames++;
      previous.lastFrame = frame;
      if (severity > previous.severity) Object.assign(previous, {issue, severity});
    }
    seen.add(key);
  }

  function sample(frame, scene, layers) {
    samples++;
    const seen = new Set();
    const visible = [];
    for (const layer of layers) {
      const box = layer.bounds;
      const clipped = intersection(box, viewport);
      const total = area(box), inFrame = area(clipped);
      if (!inFrame) continue;
      visible.push({...layer, clipped, area:inFrame});
      const clippedFraction = 1 - inFrame / total;
      const cropPx = Math.max(clipped.left - box.left, clipped.top - box.top,
        box.right - clipped.right, box.bottom - clipped.bottom);
      // Full-bleed background surfaces are allowed. Shadows and strokes are excluded from the geometry.
      const fullBleed = layer.background && inFrame >= width * height * .98;
      if (cropPx >= MIN_EDGE && clippedFraction >= .015 && !fullBleed && !layer.allowCrop) {
        observe('crop:' + layer.id, seen, frame, {
          code:'composition_crop', target:layer.id, scene, frame,
          cropPx:pixels(cropPx), bounds:roundedBox(box),
        }, clippedFraction);
      }
    }

    for (const [index, a] of visible.entries()) {
      for (let i = index + 1; i < visible.length; i++) {
        const b = visible[i];
        if (a.id === b.id || a.parent === b.id || b.parent === a.id) continue;
        if (a.occludes?.includes(b.id) || b.occludes?.includes(a.id)) continue;
        // An authored surface painted underneath later content cannot occlude
        // that content. Its partial growth is a background reveal, not a collision.
        // Later surfaces and all image/text pairs still undergo the full check.
        if(a.underlay && a.background)continue;
        // Decorative primitives may form one control, chart or icon. Check overlaps involving content.
        if (!a.content && !b.content) continue;
        const overlap = intersection(a.clipped, b.clipped);
        const w = overlap.right - overlap.left, h = overlap.bottom - overlap.top;
        if (w < MIN_EDGE || h < MIN_EDGE) continue;
        const covered = w * h / Math.min(a.area, b.area);
        if (covered < .10) continue;
        if (!sharesInkSpace(a.bounds,b.bounds)) continue;
        // A background drawn under fully contained content is normal UI construction.
        if (a.background && axes(a.bounds.points).every(axis => {
          const parent = projection(a.bounds.points,axis), child = projection(b.bounds.points,axis);
          return parent.min <= child.min + 2 && parent.max >= child.max - 2;
        })) continue;
        const ids = [a.id,b.id].sort();
        observe('overlap:' + ids.join(':'), seen, frame, {
          code:'composition_overlap', target:a.id, related:b.id, scene, frame,
          overlapPx:[pixels(w),pixels(h)], bounds:roundedBox(a.bounds), relatedBounds:roundedBox(b.bounds),
        }, covered);
      }
    }
  }

  function report() {
    const issues = [...observations.values()].sort((a,b) => b.severity - a.severity ||
      b.affectedFrames - a.affectedFrames || a.firstFrame - b.firstFrame)
      .map(({issue, firstFrame, lastFrame, affectedFrames}) => ({
        ...issue, frame:frameNumber(issue.frame), firstFrame:frameNumber(firstFrame),
        lastFrame:frameNumber(lastFrame), affectedFrames,
      }));
    return {samples, issues};
  }

  return {sample, report};
}
