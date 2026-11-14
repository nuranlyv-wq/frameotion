const rgb = hex => [1,3,5].map(index => Number.parseInt(hex.slice(index,index+2),16));
const isHex = color => typeof color === 'string' && /^#[0-9a-f]{6}$/i.test(color);

function luminance(hex) {
  return rgb(hex).map(value => value / 255)
    .map(value => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4)
    .reduce((total,value,index) => total + value * [.2126,.7152,.0722][index],0);
}

function contrast(a,b) {
  const x = luminance(a), y = luminance(b);
  return (Math.max(x,y) + .05) / (Math.min(x,y) + .05);
}

// Spread between the strongest and weakest channel: 0 for greys, 255 for a pure primary.
export const chroma = hex => Math.max(...rgb(hex)) - Math.min(...rgb(hex));

const bestInk = background => contrast(background,'#111111') >= contrast(background,'#ffffff')
  ? '#111111' : '#ffffff';

function blend(background, foreground, amount) {
  const ink = rgb(foreground);
  return '#' + rgb(background).map((value,index) => Math.round(value + (ink[index]-value)*amount)
    .toString(16).padStart(2,'0')).join('');
}

export function resolveInterfacePalette(appearance) {
  const background = isHex(appearance?.background) ? appearance.background : '#ffffff';
  const foreground = isHex(appearance?.foreground) && contrast(background,appearance.foreground) >= 4.5
    ? appearance.foreground : bestInk(background);
  // A control qualifies when it stands out from the page by lightness or, like a yellow button on a
  // pale page, by colour. Neutral controls that blend into the page stay excluded, so black-and-white sites remain neutral.
  const control = appearance?.controls?.find(({fill,ink}) =>
    isHex(fill) && isHex(ink) && contrast(fill,ink) >= 4.5 &&
    (contrast(background,fill) >= 2.5 || (chroma(fill) >= 60 && chroma(fill) - chroma(background) >= 40)));
  const accent = control?.fill ?? foreground;
  const onAccent = control?.ink ?? bestInk(accent);
  return {
    mode:luminance(background) >= .36 ? 'light' : 'dark',
    palette:{background,foreground,accent,onAccent,
      surface:blend(background,foreground,.07),muted:blend(background,foreground,.67)},
    ...(control && {sampledControl:control}),
  };
}
