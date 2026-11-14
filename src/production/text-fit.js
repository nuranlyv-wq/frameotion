// The browser supplies actual glyph and layout measurements through fits.
export function fitFontSize(preferred, minimum, fits) {
  if (fits(preferred)) return { size: preferred, fits: true };
  if (!fits(minimum)) return { size: minimum, fits: false };
  let low = Math.ceil(minimum * 4);
  let high = Math.floor(preferred * 4);
  while (low <= high) {
    const candidate = Math.floor((low + high) / 2);
    if (fits(candidate / 4)) low = candidate + 1;
    else high = candidate - 1;
  }
  return { size: Math.max(minimum, high / 4), fits: true };
}
