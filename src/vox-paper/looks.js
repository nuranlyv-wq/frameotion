// Working art directions, informed by editorial explainers; these are our preset
// names, not an official taxonomy or an affiliation with Vox Media.
export const VOX_LOOKS=Object.freeze([
  {id:'paper',name:'Живая бумага',detail:'Фактура, сгибы и отрывы',description:'Тёплый лист, печатная типографика и физические переходы.',colors:['#f0eadd','#a92c28','#23211d']},
  {id:'editorial-collage',name:'Редакционный коллаж',detail:'Фото, вырезки и слои',description:'Фотографии с бумажной кромкой, цветные вырезки, подписи и крупный набор.',colors:['#ede8dc','#eac443','#b33d32']},
  {id:'archive-dossier',name:'Архивное досье',detail:'Документы и фотоплёнка',description:'Монохромные фотографии, машинописные заметки, контактные отпечатки и красные пометки.',colors:['#d9d1bf','#222725','#9b3b32']},
  {id:'atlas',name:'Атлас',detail:'Карты и маршруты',description:'Картографическая сетка, условные районы, маршруты и выноски. Демонстрационная схема не изображает реальную географию.',colors:['#e3e9de','#427f80','#d88442']},
  {id:'infographic',name:'Инфографика',detail:'Связи, схемы и сравнения',description:'Чёткая сетка, диаграммы и причинные связи. Демонстрационные схемы не содержат статистических утверждений.',colors:['#f6f4e8','#223b45','#dfb831']},
].map(look=>Object.freeze({...look,colors:Object.freeze(look.colors)})));
export function voxLook(id='paper') {
  const look=VOX_LOOKS.find(value=>value.id===id);
  if(!look)throw new RangeError(`Unknown Vox look: ${id}`);
  return look;
}
