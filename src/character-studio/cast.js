// Appearance is independent from the voice/slot identity and shared by all styles.
export const CHARACTER_LIBRARY = Object.freeze([
  {id:'anna',name:'Анна',gender:'female',appearance:0,detail:'Каре и круглые очки',skin:'#eeb392',shirt:'#9ace4c'},
  {id:'lev',name:'Лев',gender:'male',appearance:1,detail:'Волнистые волосы',skin:'#bc795b',shirt:'#3d8d65'},
  {id:'mira',name:'Мира',gender:'female',appearance:2,detail:'Два пучка',skin:'#e6b892',shirt:'#e59c53'},
  {id:'nikita',name:'Никита',gender:'male',appearance:3,detail:'Кудри и борода',skin:'#a46d50',shirt:'#4f87a8'},
  {id:'artem',name:'Артём',gender:'male',appearance:4,detail:'Пробор и прямоугольные очки',skin:'#edc5a3',shirt:'#c27b4f'},
  {id:'oleg',name:'Олег',gender:'male',appearance:5,detail:'Бритая голова и усы',skin:'#d89f7e',shirt:'#8872a5'},
  {id:'sofia',name:'София',gender:'female',appearance:6,detail:'Хвост и серьги-кольца',skin:'#e2ad8c',shirt:'#bf6575'},
].map(Object.freeze));
export function characterAvatar(id) {
  const avatar=CHARACTER_LIBRARY.find(item=>item.id===id);
  if(!avatar)throw new RangeError(`Unknown character avatar: ${id}`);
  return avatar;
}
export function replaceAvatar(person,id) {
  const avatar=characterAvatar(id);
  return {...person,avatarId:avatar.id,appearance:avatar.appearance,skin:avatar.skin};
}
