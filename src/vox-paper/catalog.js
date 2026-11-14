export const PAPER_TECHNIQUES = [
  ['page-turn', 'Перелистывание', 'Переход к следующей мысли', 'sheet', 2.8],
  ['calendar-tear', 'Срыв листа', 'Освобождение от переплёта', 'sheet', 2.8],
  ['crumple', 'Смять и раскрыть', 'Новая печать появляется при раскрытии', 'sheet', 3.2],
  ['half-fold', 'Сгиб пополам', 'Спрятать и снова открыть часть листа', 'fold', 2.8],
  ['gate-fold', 'Створки', 'Два края сходятся над содержимым', 'fold', 2.8],
  ['accordion', 'Гармошка', 'Лист сжимается по постоянным сгибам', 'fold', 2.8],
  ['map-fold', 'Сложить карту', 'Два последовательных сгиба', 'fold', 3.2],
  ['corner-peel', 'Отогнуть угол', 'Подсказка под уголком листа', 'fold', 2.8],
  ['roll', 'Свернуть в рулон', 'Сохранить лист в свёрнутой форме', 'sheet', 2.8],
  ['scroll', 'Свиток', 'Свернуть оба края к центру', 'sheet', 2.8],
  ['tear-split', 'Разорвать лист', 'Разрыв распространяется по общей кромке', 'tear', 2.8],
  ['strip-tear', 'Оторвать полосу', 'Отделить часть, сохранив остальную печать', 'tear', 2.8],
  ['window-cut', 'Вырезать окно', 'Открыть следующий слой сквозь лист', 'cut', 2.8],
  ['hole-punch', 'Круглый вырез', 'Круглая высечка с выпадающим фрагментом', 'cut', 2.8],
  ['phrase-swap', 'Заменить фразу', 'Остальная строка сохраняет положение', 'type', 3.2],
  ['rising-scrap', 'Поднять вырезку', 'Вход снизу, короткое удержание, уход вниз', 'collage', 2.8],
  ['collage', 'Собрать коллаж', 'Фрагменты образуют одну композицию', 'collage', 3.2],
  ['tape-peel', 'Отклеить ленту', 'Полупрозрачная лента изгибается при отрыве', 'detail', 2.8],
  ['label-peel', 'Снять наклейку', 'Отрыв начинается с края этикетки', 'detail', 2.8],
  ['stamp', 'Поставить штамп', 'Прижим оставляет неровный оттиск', 'print', 2.8],
  ['marker', 'Выделить маркером', 'След растёт под напечатанным словом', 'print', 2.8],
].map(([id, name, purpose, family, duration]) => Object.freeze({id, name, purpose, family, duration}));
export function technique(id) {
  const value = PAPER_TECHNIQUES.find(item => item.id === id);
  if (!value) throw new RangeError(`Unknown paper technique: ${id}`);
  return value;
}
export function validateAction(action) {
  technique(action?.technique);
  if (!Number.isFinite(action.start ?? 0)) throw new TypeError('action.start must be finite');
  if (!Number.isFinite(action.duration) || action.duration <= 0) throw new RangeError('action.duration must be positive');
  if (action.technique === 'crumple' && action.duration < 2) throw new RangeError('Crumple needs four 0.5-second poses');
  if (action.direction !== undefined && !['forward', 'reverse'].includes(action.direction)) throw new RangeError('Invalid paper direction');
  if (action.technique === 'crumple' && action.direction === 'reverse') throw new RangeError('Crumple uses its own symmetric pose sequence');
  if (action.region !== undefined && (!Array.isArray(action.region) || action.region.length !== 4 || !action.region.every(Number.isFinite)
    || action.region[0] >= action.region[2] || action.region[1] >= action.region[3])) throw new RangeError('region must be [left, bottom, right, top]');
  return action;
}
