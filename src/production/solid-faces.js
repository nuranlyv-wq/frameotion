// An extruded box with the product face at z = 0. Both renderers share the same geometry.
export function solidFaces(width, height, depth, radius, front, back) {
  const center = -depth / 2;
  const face = (id, left, top, w, h, transform, background, borderRadius = 0) => ({
    id,
    style: { position: 'absolute', left, top, width: w, height: h, transform,
      background, borderRadius, backfaceVisibility: 'hidden', pointerEvents: 'none' },
  });
  return [
    face('front', 0, 0, width, height, 'translateZ(0)', front, radius),
    face('back', 0, 0, width, height, `translateZ(${-depth}px) rotateY(180deg)`, back, radius),
    face('right', width + center, 0, depth, height, `translateZ(${center}px) rotateY(90deg)`,
      `linear-gradient(90deg, ${back}, ${front})`),
    face('left', center, 0, depth, height, `translateZ(${center}px) rotateY(-90deg)`,
      `linear-gradient(90deg, ${front}, ${back})`),
    face('bottom', 0, height + center, width, depth, `translateZ(${center}px) rotateX(-90deg)`, back),
    face('top', 0, center, width, depth, `translateZ(${center}px) rotateX(90deg)`,
      `linear-gradient(0deg, ${front}, ${back})`),
  ];
}
