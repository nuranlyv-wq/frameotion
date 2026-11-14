// Who makes films here and what their business visibly does. The director reads this to recognise the
// kind of product in front of it and to reach for a way of showing it that fits; it is a guide, not a rule.
// `shows` lists the show mechanics that usually fit, most characteristic first (see SHOWS in techniques.js).
export const AUDIENCES = [
  {id: 'roastery', title: 'Обжарщики кофе и крафтовые производители', does: 'turn a raw ingredient into a finished product, often sold by subscription',
    shows: ['process', 'cycle', 'journey'], props: 'bean, flame, bag, cup'},
  {id: 'venue', title: 'Кофейни, рестораны, бары, пекарни', does: 'prepare an order and hand it over at the counter or deliver it',
    shows: ['process', 'journey', 'gather'], props: 'cup, bag, clock, pin'},
  {id: 'shop', title: 'Маркетплейсы и интернет-магазины', does: 'bring many sellers or goods into one place and deliver the order',
    shows: ['gather', 'journey', 'cycle'], props: 'cart, bag, box, courier, home'},
  {id: 'delivery', title: 'Доставка, логистика, такси', does: 'move a thing or a person from one address to another',
    shows: ['journey', 'process'], props: 'box, courier, car, pin, home'},
  {id: 'dev-studio', title: 'Студии сайтов, приложений и автоматизаций', does: 'take a brief through design and code to a launched product, or wire one trigger to many actions',
    shows: ['process', 'spread', 'gather'], props: 'doc, brush, code, screen, phone, bolt'},
  {id: 'creative', title: 'Креативные, брендинговые и продакшн-студии', does: 'turn an idea into a visual identity or a film',
    shows: ['process', 'spread'], props: 'chat, brush, image, star'},
  {id: 'smm', title: 'SMM, маркетинг и PR-агентства', does: 'send one message out to several channels and audiences, on a schedule',
    shows: ['spread', 'cycle', 'process'], props: 'megaphone, image, person, chart, calendar'},
  {id: 'saas', title: 'B2B-сервисы: CRM, счета, аналитика, документы', does: 'take a record from the user and carry it to a client, a report or a status',
    shows: ['journey', 'gather', 'process'], props: 'doc, mail, person, chart, check'},
  {id: 'booking', title: 'Запись и услуги: салоны, клиники, фитнес, ремонт', does: 'turn a chosen time into a confirmed visit and remind about it',
    shows: ['process', 'cycle'], props: 'calendar, clock, check, person'},
  {id: 'education', title: 'Курсы, школы, репетиторы', does: 'lead a learner through lessons to a skill',
    shows: ['process', 'cycle', 'gather'], props: 'doc, screen, star, person'},
  {id: 'fintech', title: 'Платежи, банки, учёт', does: 'move money from payer to payee and keep the record',
    shows: ['journey', 'spread', 'cycle'], props: 'card, coin, person, doc, check'},
  {id: 'property', title: 'Недвижимость, аренда, путешествия', does: 'narrow many options down to the one that fits',
    shows: ['gather', 'journey'], props: 'home, pin, search, star'},
  {id: 'events', title: 'Мероприятия и билеты', does: 'take a visitor from an invitation to a seat',
    shows: ['process', 'spread'], props: 'calendar, person, star, pin'},
  {id: 'app', title: 'Мобильные приложения и сообщества', does: 'put several everyday tasks into one place in the phone',
    shows: ['gather', 'spread'], props: 'phone, chat, person, heart'},
];

export const audienceBrief = () => AUDIENCES.map(({id, does, shows, props}) =>
  `- ${id}: they ${does}. Usually shown as ${shows.join(', ')}; typical props: ${props}.`).join('\n');
