// Профили динамичности. Одни и те же числа используются тремя слоями:
//  1) режиссёру (в промпте — как ограничения по сценам, плотности, переходам),
//  2) валидатору (жёсткие границы плана),
//  3) движку рендера (amp/speed/stagger/камера/музыка применяются детерминированно,
//     поэтому один и тот же план при смене динамичности выглядит и звучит иначе).
// «Средняя» — ориентир: ролик Google v2.
export const PROFILES = {
  calm: {
    id: 'calm',
    label: 'Спокойная',
    bpm: 84,
    speed: 0.8,          // множитель скорости анимаций (длительности делятся на speed)
    amp: 0.65,           // амплитуда движения: смещения, овершуты, масштабные «удары»
    stagger: 1.5,        // множитель задержек между элементами
    sceneSec: [3.4, 5.0],
    eventsPerSec: [0.9, 1.7],
    totalSec: [11, 15],
    transitions: {
      allowed: ['cut', 'crossfade', 'push', 'iris', 'wipe', 'zoom_into'],
      minDur: 0.5, maxDur: 0.9, defaultType: 'crossfade', defaultDur: 0.7,
    },
    camera: { punch: 0.15, shake: 0, beat: 0, drift: 0.006 },
    zoomDur: [0.7, 1.3],
    ambient: 0.6,        // фоновая подвижность: скорость фона, колебания, мерцание частиц
    music: { intensity: 0.5, snapDiv: 1 },   // snapDiv: деления доли при привязке событий к биту
    sfxGain: 0.8,
  },
  medium: {
    id: 'medium',
    label: 'Средняя',
    bpm: 104,
    speed: 1.0,
    amp: 1.0,
    stagger: 1.0,
    sceneSec: [2.4, 3.6],
    eventsPerSec: [1.5, 2.6],
    totalSec: [10, 14],
    transitions: {
      allowed: ['cut', 'crossfade', 'push', 'iris', 'wipe', 'zoom_through', 'slice', 'zoom_into'],
      minDur: 0.3, maxDur: 0.6, defaultType: 'push', defaultDur: 0.45,
    },
    camera: { punch: 0.5, shake: 0.35, beat: 0.004, drift: 0.006 },
    zoomDur: [0.55, 1.0],
    ambient: 1.0,
    music: { intensity: 0.75, snapDiv: 2 },
    sfxGain: 1.0,
  },
  high: {
    id: 'high',
    label: 'Высокая',
    bpm: 128,
    speed: 1.35,
    amp: 1.45,
    stagger: 0.6,
    sceneSec: [1.4, 2.4],
    eventsPerSec: [2.4, 4.2],
    totalSec: [9, 13],
    transitions: {
      allowed: ['cut', 'crossfade', 'flash_cut', 'push', 'wipe', 'zoom_through', 'slice', 'iris', 'zoom_into'],
      minDur: 0.0, maxDur: 0.35, defaultType: 'zoom_through', defaultDur: 0.25,
    },
    camera: { punch: 1, shake: 1, beat: 0.012, drift: 0.006 },
    zoomDur: [0.35, 0.7],
    ambient: 1.8,
    music: { intensity: 1, snapDiv: 4 },
    sfxGain: 1.15,
  },
};

export const DYNAMISM_IDS = Object.keys(PROFILES);
// Длина ролика: общий диапазон (с), максимальный расход прогона (USD) и грубая оценка стоимости Opus для интерфейса.
export const LENGTHS = {
  short:    { id: 'short',    label: '15 с', totalSec: null,       maxRunUSD: 1.0, estUSD: '0,1–0,3' },
  standard: { id: 'standard', label: '30 с', totalSec: [26, 36],   maxRunUSD: 2.5, estUSD: '0,5–1,5' },
  long:     { id: 'long',     label: '60 с', totalSec: [50, 62],   maxRunUSD: 4.5, estUSD: '1–3' },
};
export const totalRange = (P, length) => (LENGTHS[length]?.totalSec) || P.totalSec;
export const getProfile = (id) => PROFILES[id] || PROFILES.medium;

// Человекочитаемая сводка для промпта режиссёра.
export function profileBrief(p) {
  const fmt = (r) => `${r[0]}–${r[1]}`;
  return [
    `dynamism=${p.id} (${p.label})`,
    `scene duration ${fmt(p.sceneSec)} s; total duration ${fmt(p.totalSec)} s`,
    `event density ${fmt(p.eventsPerSec)} events/s (events = element entrances, text beats, dots, cards, cues)`,
    `transitions: allowed [${p.transitions.allowed.join(', ')}], duration ${p.transitions.minDur}–${p.transitions.maxDur} s`,
    `music ${p.bpm} bpm; engine applies motion amplitude x${p.amp}, speed x${p.speed}, stagger x${p.stagger}, camera punch ${p.camera.punch}, beat pulse ${p.camera.beat}, ambient motion x${p.ambient}`,
  ].join('\n');
}
