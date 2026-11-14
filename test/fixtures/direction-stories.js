// Hand-written director plans for renderer checks and demos. They stand in for the model's answer and
// go through the same path as one: normalizeSemanticTreatment → compileLaunch → renderLaunch.
// The copy of each story is limited to what its source evidence states.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root = path.dirname(path.dirname(path.dirname(fileURLToPath(import.meta.url))));

const directions = (first, second) => [
  {id: 'chosen', route: 'continuous', ...first},
  {id: 'other', route: 'montage', ...second},
];

// Forma: an online booking service described by the user. Landscape, base look.
// Links: the hero line becomes the field's headline (type), the pressed button becomes the next scene's space (dive).
const forma = {
  settings: {style: 'saas-launch', width: 1920, height: 1080, fps: 30, frames: 480, pace: 'calm'},
  source: {
    kind: 'description', nameHint: 'Forma', assets: [],
    evidence: [{id: 'D1', source: 'user-description', text: 'Forma — сервис онлайн-записи. Клиент выбирает удобное время; запись подтверждается автоматически. Напоминание приходит за день до визита.'}],
    brand: {interfacePalette: {background: '#F6F5F2', foreground: '#1B1B1F', surface: '#FFFFFF', muted: '#77767C', accent: '#3B5BFF', onAccent: '#FFFFFF'}},
  },
  plan: {
    brand: 'Forma',
    directions: directions({
      idea: 'Слова «Выберите время» становятся полем записи, а нажатая кнопка — местом, где запись уже подтверждена.',
      opening: 'Крупная строка «Выберите время».', signature: 'Камера въезжает в нажатую кнопку, внутри неё — подтверждение.',
      look: 'Светлое поле, один синий акцент.',
      creative: {approach: 'product-action', subject: 'Кнопка «Записаться»', change: 'Нажатая кнопка заполняет кадр и становится экраном подтверждения.', meaning: 'После нажатия всё происходит само.', evidenceId: 'D1'},
    }, {
      idea: 'Три коротких утверждения о записи сменяют друг друга.', opening: 'Слово «Запись».',
      signature: 'Строки сменяются на склейках.', look: 'Крупная типографика.',
      creative: {approach: 'editorial-contrast', subject: 'Заголовок', change: 'Строка меняется от выбора к подтверждению.', meaning: 'Запись занимает секунды.', evidenceId: 'D1'},
    }),
    selected: 'chosen', rationale: 'Въезд в кнопку показывает причину и следствие без подписи.', signatureBeat: 'result',
    beats: [
      {id: 'ask', purpose: 'Зритель понимает, что делает сам: выбирает время.', action: 'Строка поднимается по словам.', landing: 'Слово «время» выделено.',
        handoff: 'Эта же строка станет заголовком поля.', energy: 6, move: 'word-lift', text: 'Выберите время',
        visual: {scene: 'hero', keyPhrase: 'время', evidenceId: 'D1', focus: 'Слово «время»', feeling: 'Просто', rhythm: 'quick'}},
      {id: 'pick', purpose: 'Выбор времени — одно действие.', action: 'В поле набирается время, курсор нажимает кнопку.', landing: 'Кнопка сменилась отметкой.',
        handoff: 'Камера въезжает в отметку нажатой кнопки.', energy: 7, move: 'interface',
        visual: {scene: 'input', label: 'Вторник, 11:30', action: 'Записаться', detail: 'Ваш визит', evidenceId: 'D1',
          link: 'type', focus: 'Кнопка «Записаться»', feeling: 'Уверенно'}},
      {id: 'result', purpose: 'После нажатия сервис всё делает сам.', action: 'Внутри цвета кнопки линия ведёт от подтверждения к напоминанию.', landing: 'Оба этапа видны на одной линии.',
        handoff: 'После паузы склейка на название.', energy: 8, move: 'type', text: 'Дальше всё само',
        visual: {scene: 'list', presentation: 'sequence', keyPhrase: 'само', evidenceId: 'D1', link: 'dive',
          focus: 'Линия между этапами', feeling: 'Спокойно', rhythm: 'hold', backdrop: 'flat',
          items: [{title: 'Запись подтверждена', subtitle: 'Автоматически', icon: 'check'},
            {title: 'Напоминание', subtitle: 'За день до визита', icon: 'calendar'}]}},
      {id: 'close', purpose: 'Название и обещание.', action: 'Название поднимается из-под маски.', landing: 'Название и строка стоят.',
        handoff: '', energy: 4, move: 'type', text: 'Онлайн-запись',
        visual: {scene: 'brand', evidenceId: 'D1', focus: 'Название', feeling: 'Ясно'}},
    ],
  },
};

// Lapa: the saved capture of lapa.az from an earlier real run. Portrait, playful look, a different chain:
// a clicked word becomes a mark (text → shape), the camera dives into that mark, the pressed button
// stays in place across the cut and grows into the feature card, and the card carries into the address.
function lapa() {
  const file = path.join(root, 'runs/launch-20261110081401-gldr/source.json');
  if (!fs.existsSync(file)) return null;
  return {
    settings: {style: 'saas-launch', width: 1080, height: 1920, fps: 30, frames: 540, pace: 'calm', artDirection: 'playful'},
    source: JSON.parse(fs.readFileSync(file, 'utf8')),
    plan: {
      brand: 'Лапа',
      directions: directions({
        idea: 'Слово «Корм» становится отпечатком лапы, внутри которого оформляется подписка.',
        opening: 'Строка «Корм приедет сам».', signature: 'Клик превращает слово «Корм» в знак лапы, камера въезжает в него.',
        look: 'Чёрно-белая палитра сайта, упругие появления.',
        creative: {approach: 'visual-metaphor', subject: 'Слово «Корм»', change: 'Слово превращается в знак лапы и раскрывается в поле подписки.', meaning: 'Корм и подписка — одно действие.', evidenceId: 'WF5'},
      }, {
        idea: 'Запрос в поле превращается в ежемесячную доставку.', opening: 'Поле с запросом.',
        signature: 'Строки подписки приходят после нажатия.', look: 'Карточки на светлом поле.',
        creative: {approach: 'product-action', subject: 'Поле подписки', change: 'Запрос сменяется шагами подписки.', meaning: 'Корм больше не нужно искать.', evidenceId: 'WF2'},
      }),
      selected: 'chosen', rationale: 'Знак из слова связывает название продукта с действием.', signatureBeat: 'hook',
      beats: [
        {id: 'hook', purpose: 'Обещание: корм приезжает сам.', action: 'Курсор нажимает слово «Корм», оно становится знаком лапы.', landing: 'Знак стоит в строке.',
          handoff: 'Камера въезжает в знак лапы.', energy: 7, move: 'word-click', text: 'Корм приедет сам',
          visual: {scene: 'hero', evidenceId: 'WF5', wordClick: {word: 'Корм', shape: 'ellipse', mark: 'paw'}, focus: 'Слово «Корм»', feeling: 'Игриво'}},
        {id: 'order', purpose: 'Выбор корма — первый шаг подписки.', action: 'Внутри знака набирается запрос, курсор нажимает «Выбрать».', landing: 'Отметка показывает выбранный корм.',
          handoff: 'Отметка остаётся на месте и вырастает в карточку.', energy: 7, move: 'interface', text: 'Выберите корм',
          visual: {scene: 'input', label: 'корм для кошки', action: 'Выбрать', detail: 'Подписка', evidenceId: 'WF2',
            link: 'dive', focus: 'Кнопка «Выбрать»', feeling: 'Легко'}},
        {id: 'monthly', purpose: 'Дальше корм привозят раз в месяц.', action: 'Отметка вырастает в карточку доставки.', landing: 'Карточка читается.',
          handoff: 'Карточка сжимается в адрес сайта.', energy: 6, move: 'type', text: 'Дальше привозим сами',
          visual: {scene: 'feature', label: 'Раз в месяц', detail: 'Можно приостановить', icon: 'calendar', evidenceId: 'WF5',
            link: 'match', focus: 'Карточка «Раз в месяц»', feeling: 'Надёжно'}},
        {id: 'close', purpose: 'Название и адрес.', action: 'Название поднимается, карточка стала адресом.', landing: 'Название и адрес стоят.',
          handoff: '', energy: 4, move: 'type', text: 'Подписка на корм',
          visual: {scene: 'brand', evidenceId: 'WF5', link: 'carry', focus: 'Название', feeling: 'Ясно'}},
      ],
    },
  };
}

// Show scenes: the product's capability staged with objects. Three products' worth of different mechanics.
const beat = (id, scene, fields, visual) => ({id, purpose: fields.purpose, action: fields.action, landing: fields.landing,
  handoff: fields.handoff ?? '', energy: fields.energy ?? 6, move: fields.move ?? 'type', ...(fields.text && {text: fields.text}),
  visual: {scene, ...visual}});
const shown = (idea, creative, beats, signatureBeat, brand) => ({
  brand,
  directions: directions({idea, opening: 'Крупная строка.', signature: creative.change, look: 'Палитра продукта.', creative},
    {idea: 'Строки сменяют друг друга.', opening: 'Слово.', signature: 'Строки сменяются на склейках.', look: 'Крупная типографика.',
      creative: {approach: 'editorial-contrast', subject: 'Заголовок', change: 'Строка меняется на склейке.', meaning: 'Коротко и ясно.', evidenceId: creative.evidenceId}}),
  selected: 'chosen', rationale: 'Возможность продукта видна без подписи.', signatureBeat, beats,
});

// Lapa subscription: the food becomes a courier and rides across the city to the customer's door.
function lapaDelivery() {
  const base = lapa();
  if (!base) return null;
  return {
    settings: {style: 'saas-launch', width: 1920, height: 1080, fps: 30, frames: 510, pace: 'calm'}, source: base.source,
    plan: shown('Корм сам становится курьером и едет по городу к двери.',
      {approach: 'visual-metaphor', subject: 'Пакет корма', change: 'Пакет корма превращается в курьера и доезжает по маршруту до дома.', meaning: 'Подписка привозит корм без участия хозяина.', evidenceId: 'WF5'}, [
        beat('hook', 'hero', {purpose: 'Обещание: корм приезжает сам.', action: 'Строка поднимается по словам.', landing: 'Слово «сам» выделено.', handoff: 'Строка станет заголовком поля.', move: 'word-lift', text: 'Корм приедет сам', energy: 6},
          {keyPhrase: 'сам', evidenceId: 'WF5', focus: 'Слово «сам»', feeling: 'Легко'}),
        beat('order', 'input', {purpose: 'Подписка оформляется один раз.', action: 'Набирается запрос, курсор нажимает «Оформить».', landing: 'Кнопка сменилась отметкой.', handoff: 'Камера въезжает в отметку.', move: 'interface', energy: 6},
          {label: 'корм для кошки', action: 'Оформить', detail: 'Подписка', evidenceId: 'WF5', link: 'type', focus: 'Кнопка «Оформить»', feeling: 'Просто'}),
        beat('ride', 'show', {purpose: 'Дальше корм привозят без напоминаний.', action: 'Пакет становится курьером и едет по карте к дому.', landing: 'Курьер у дома, статус «Раз в месяц».', handoff: 'Склейка на название.', text: 'Привозим по Баку', energy: 8},
          {evidenceId: 'WF12', link: 'dive', focus: 'Курьер на маршруте', feeling: 'Спокойно',
            show: {kind: 'journey', subject: {label: 'Корм', icon: 'bag'}, carrier: 'courier', to: {label: 'Ваш адрес', icon: 'home'}, result: 'Раз в месяц'}}),
        beat('close', 'brand', {purpose: 'Название и адрес.', action: 'Название поднимается.', landing: 'Название стоит.', text: 'Подписка на корм', energy: 4},
          {evidenceId: 'WF5', focus: 'Название', feeling: 'Ясно'}),
      ], 'ride', 'Лапа'),
  };
}

// Lapa as a whole: separate pet services end up in one place.
function lapaAll() {
  const base = lapa();
  if (!base) return null;
  return {
    settings: {style: 'saas-launch', width: 1080, height: 1920, fps: 30, frames: 420, pace: 'calm', artDirection: 'playful'}, source: base.source,
    plan: shown('Разрозненные заботы о питомце слетаются в одно место.',
      {approach: 'spatial-discovery', subject: 'Четыре сервиса', change: 'Магазин, клиники, груминг и советы слетаются в один знак.', meaning: 'Всё нужное владельцу — в одном месте.', evidenceId: 'WF15'}, [
        beat('hook', 'hero', {purpose: 'Обещание: всё для питомца.', action: 'Строка поднимается.', landing: 'Строка читается.', handoff: 'Склейка на сервисы.', move: 'word-lift', text: 'Всё для питомца', energy: 6},
          {keyPhrase: 'Всё', evidenceId: 'WF15', focus: 'Слово «Всё»', feeling: 'Тепло'}),
        beat('all', 'show', {purpose: 'Четыре разных заботы собраны вместе.', action: 'Сервисы появляются по кругу и слетаются в центр.', landing: 'Один знак с названием.', handoff: 'Камера въезжает в знак.', energy: 8},
          {evidenceId: 'WF15', focus: 'Центр', feeling: 'Собранно',
            show: {kind: 'gather', parts: [{label: 'Зоомагазин', icon: 'cart'}, {label: 'Ветклиники', icon: 'heart'}, {label: 'Груминг', icon: 'star'}, {label: 'Советы 24/7', icon: 'chat'}],
              whole: {label: 'Лапа', icon: 'paw'}, result: 'В одном месте'}}),
        beat('close', 'brand', {purpose: 'Название и адрес.', action: 'Название поднимается.', landing: 'Название стоит.', text: 'С доставкой по Баку', energy: 4},
          {evidenceId: 'WF12', link: 'dive', focus: 'Название', feeling: 'Ясно'}),
      ], 'all', 'Лапа'),
  };
}

// Lapa subscription seen in time instead of space: the same food comes round every month.
function lapaMonthly() {
  const base = lapa();
  if (!base) return null;
  return {
    settings: {style: 'saas-launch', width: 1920, height: 1080, fps: 30, frames: 420, pace: 'calm'}, source: base.source,
    plan: shown('Корм ходит по кругу и возвращается каждый месяц.',
      {approach: 'visual-metaphor', subject: 'Пакет корма', change: 'Пакет проходит круг и отмечает каждый месяц.', meaning: 'Подписка повторяется сама.', evidenceId: 'WF5'}, [
        beat('hook', 'hero', {purpose: 'Обещание.', action: 'Строка поднимается.', landing: 'Строка читается.', handoff: 'Склейка на круг.', move: 'word-lift', text: 'Оформите один раз', energy: 6},
          {keyPhrase: 'один раз', evidenceId: 'WF5', focus: 'Слова «один раз»', feeling: 'Просто'}),
        beat('round', 'show', {purpose: 'Корм приезжает каждый месяц.', action: 'Пакет едет по кругу и зажигает месяцы.', landing: 'В центре — «Раз в месяц».', handoff: 'Склейка на название.', text: 'Дальше привозим сами', energy: 8},
          {evidenceId: 'WF5', focus: 'Пакет на круге', feeling: 'Ровно',
            show: {kind: 'cycle', subject: {label: 'Корм', icon: 'bag'}, result: 'Раз в месяц'}}),
        beat('close', 'brand', {purpose: 'Название и адрес.', action: 'Название поднимается.', landing: 'Название стоит.', text: 'Подписка на корм', energy: 4},
          {evidenceId: 'WF5', focus: 'Название', feeling: 'Ясно'}),
      ], 'round', 'Лапа'),
  };
}

// Smeta: an invoicing service described by the user. Nothing rides through a city here: a document crosses to a client.
const smeta = {
  settings: {style: 'saas-launch', width: 1920, height: 1080, fps: 30, frames: 480, pace: 'calm', artDirection: 'clean'},
  source: {kind: 'description', nameHint: 'Смета', assets: [],
    evidence: [{id: 'D1', source: 'user-description', text: 'Смета — сервис счетов для фрилансеров. Вы вводите сумму и клиента, сервис формирует счёт и отправляет его на почту клиента. Когда клиент оплатил, статус счёта меняется на «Оплачен».'}],
    brand: {interfacePalette: {background: '#FBFAF7', foreground: '#17181C', surface: '#EFEDE8', muted: '#7A7A80', accent: '#0E9F6E', onAccent: '#FFFFFF'}}},
  plan: shown('Счёт сам становится письмом и доходит до клиента.',
    {approach: 'product-action', subject: 'Счёт', change: 'Счёт превращается в письмо, доходит до клиента и получает статус «Оплачен».', meaning: 'После суммы сервис всё делает сам.', evidenceId: 'D1'}, [
      beat('sum', 'input', {purpose: 'Нужна только сумма.', action: 'Набирается сумма, курсор нажимает «Создать».', landing: 'Кнопка сменилась отметкой.', handoff: 'Камера въезжает в отметку.', move: 'interface', text: 'Введите сумму', energy: 6},
        {label: '15 000', action: 'Создать', detail: 'Сумма счёта', evidenceId: 'D1', focus: 'Кнопка «Создать»', feeling: 'Просто'}),
      beat('send', 'show', {purpose: 'Счёт уходит клиенту и оплачивается.', action: 'Счёт становится письмом и летит к клиенту.', landing: 'У клиента статус «Оплачен».', handoff: 'Склейка на название.', text: 'Счёт уходит сам', energy: 8},
        {evidenceId: 'D1', link: 'dive', focus: 'Письмо на пути', feeling: 'Уверенно',
          show: {kind: 'journey', subject: {label: 'Счёт', icon: 'doc'}, carrier: 'mail', to: {label: 'Клиент', icon: 'person'}, result: 'Оплачен'}}),
      beat('close', 'brand', {purpose: 'Название.', action: 'Название поднимается.', landing: 'Название стоит.', text: 'Счета для фрилансеров', energy: 4},
        {evidenceId: 'D1', focus: 'Название', feeling: 'Ясно'}),
    ], 'send', 'Смета'),
};

// A coffee roastery: one thing is made in stages.
const roastery = {
  settings: {style: 'saas-launch', width: 1920, height: 1080, fps: 30, frames: 450, pace: 'calm'},
  source: {kind: 'description', nameHint: 'Зерно', assets: [],
    evidence: [{id: 'D1', source: 'user-description', text: 'Зерно — обжарочная. Обжариваем зелёное зерно в день заказа, пакуем и отправляем курьером. Есть подписка: свежая пачка каждые две недели.'}],
    brand: {interfacePalette: {background: '#F5EFE6', foreground: '#2A1D15', surface: '#E8DDCC', muted: '#8A7767', accent: '#B4541F', onAccent: '#FFFFFF'}}},
  plan: shown('Зерно проходит путь от зелёного до отправленной пачки.',
    {approach: 'product-action', subject: 'Зерно', change: 'Зелёное зерно обжаривается, становится пачкой и уезжает с курьером.', meaning: 'Кофе обжарен под заказ.', evidenceId: 'D1'}, [
      beat('hook', 'hero', {purpose: 'Обещание свежести.', action: 'Строка поднимается.', landing: 'Строка читается.', handoff: 'Склейка на процесс.', move: 'word-lift', text: 'Обжарено в день заказа', energy: 6},
        {keyPhrase: 'в день заказа', evidenceId: 'D1', focus: 'Слова «в день заказа»', feeling: 'Свежо'}),
      beat('roast', 'show', {purpose: 'Каждая пачка проходит все этапы после заказа.', action: 'Жетон прыгает по этапам и меняет знак.', landing: 'Пачка у курьера.', handoff: 'Склейка на название.', energy: 8},
        {evidenceId: 'D1', focus: 'Жетон на этапе', feeling: 'Ремесло',
          show: {kind: 'process', stages: [{label: 'Зелёное зерно', icon: 'bean'}, {label: 'Обжарка', icon: 'flame'}, {label: 'Пачка', icon: 'bag'}, {label: 'Курьер', icon: 'courier'}], result: 'В день заказа'}}),
      beat('close', 'brand', {purpose: 'Название.', action: 'Название поднимается.', landing: 'Название стоит.', text: 'Свежая пачка каждые две недели', energy: 4},
        {evidenceId: 'D1', focus: 'Название', feeling: 'Ясно'}),
    ], 'roast', 'Зерно'),
};

// An SMM agency: one post goes out to several channels.
const agency = {
  settings: {style: 'saas-launch', width: 1920, height: 1080, fps: 30, frames: 420, pace: 'calm', artDirection: 'playful'},
  source: {kind: 'description', nameHint: 'Волна', assets: [],
    evidence: [{id: 'D1', source: 'user-description', text: 'Волна — SMM-агентство. Готовим контент-план и публикуем посты в Instagram, Telegram и TikTok по расписанию. Каждый месяц присылаем отчёт по охватам.'}],
    brand: {interfacePalette: {background: '#FFFFFF', foreground: '#14122B', surface: '#EEEDF8', muted: '#77759A', accent: '#6C4DF6', onAccent: '#FFFFFF'}}},
  plan: shown('Один пост расходится по всем площадкам сразу.',
    {approach: 'spatial-discovery', subject: 'Пост', change: 'Пост из центра разлетается по трём площадкам.', meaning: 'Агентство публикует везде само.', evidenceId: 'D1'}, [
      beat('hook', 'hero', {purpose: 'Обещание.', action: 'Строка поднимается.', landing: 'Строка читается.', handoff: 'Склейка на пост.', move: 'word-lift', text: 'Один пост — все площадки', energy: 6},
        {keyPhrase: 'все площадки', evidenceId: 'D1', focus: 'Слова «все площадки»', feeling: 'Бодро'}),
      beat('post', 'show', {purpose: 'Публикация уходит на три площадки.', action: 'Копии поста летят по лучам.', landing: 'Три площадки отмечены.', handoff: 'Склейка на название.', energy: 8},
        {evidenceId: 'D1', focus: 'Пост в центре', feeling: 'Размах',
          show: {kind: 'spread', subject: {label: 'Пост', icon: 'megaphone'}, parts: [{label: 'Instagram', icon: 'image'}, {label: 'Telegram', icon: 'chat'}, {label: 'TikTok', icon: 'phone'}], result: 'По расписанию'}}),
      beat('close', 'brand', {purpose: 'Название.', action: 'Название поднимается.', landing: 'Название стоит.', text: 'Отчёт по охватам каждый месяц', energy: 4},
        {evidenceId: 'D1', focus: 'Название', feeling: 'Ясно'}),
    ], 'post', 'Волна'),
};

const roasteryTransform = structuredClone(roastery);
roasteryTransform.plan.beats[1].visual.show = {kind: 'transform', stages: [
  {label: 'Зелёное зерно', icon: 'bean', form: 'tile'}, {label: 'Обжарка', icon: 'flame', form: 'tile'},
  {label: 'Пачка', icon: 'bag', form: 'box'}, {label: 'Курьер', icon: 'courier', form: 'tile'},
], result: 'В день заказа'};
roasteryTransform.plan.beats[1].action = 'Один предмет меняет знак и становится объёмной пачкой перед доставкой.';

const formaWipes = structuredClone(forma);
formaWipes.settings = {...forma.settings,frames:450,pace:'dynamic'};
formaWipes.plan.signatureBeat = 'confirmed';
Object.assign(formaWipes.plan.directions[0], {idea:'Выбор времени становится подтверждением и напоминанием через возвратную полосу.',
  signature:'Одна полоса возвращается и раскрывает следующее состояние записи.'});
const {text: _wipeText, ...wipeBeat} = forma.plan.beats[0];
formaWipes.plan.beats = [
  ['choose','Выберите время','clock'], ['confirmed','Запись подтверждена','check'],
  ['reminder','Напомним за день','calendar'], ['close','Онлайн-запись','check'],
].map(([id,label,icon],index) => ({...wipeBeat,id,move:'type',action:`Показать: ${label}`,landing:label,
  handoff:index < 3 ? 'Полоса возвращается с новым состоянием' : '',
  visual:{scene:index === 3 ? 'brand' : 'feature',label,icon,evidenceId:'D1',rhythm:'quick',
    ...(index && {link:'wipe',wipeGroup:'booking-flow',wipeFrames:8})}}));

export const STORIES = {forma, get lapa() { return lapa(); }, smeta, roastery, agency, 'roastery-transform': roasteryTransform, 'forma-wipes':formaWipes,
  get 'lapa-delivery'() { return lapaDelivery(); }, get 'lapa-all'() { return lapaAll(); }, get 'lapa-monthly'() { return lapaMonthly(); }};

// The same plan as the director wrote it before links existed: no link, focus or feeling.
// The same story with a scene's headline removed, as the model often writes a show.
export function withoutText(plan, id) {
  return {...plan, beats: plan.beats.map(beat => { const {text, ...rest} = beat; return beat.id === id ? rest : beat; })};
}

export function withoutLinks(plan) {
  return {...plan, beats: plan.beats.map(beat => {
    const {link, focus, feeling, rhythm, presentation, ...visual} = beat.visual;
    return {...beat, visual};
  })};
}
