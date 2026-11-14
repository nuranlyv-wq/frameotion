import {access,readFile} from 'node:fs/promises';
import path from 'node:path';
import {ROOT} from '../config.js';
import {registerBrandAsset} from '../production/brand-assets.js';
import {TOGGLE_SETTLE_FRAMES} from './kinetic.js';

export const PRODUCT_FLOW_IDS = {
  card: 'product-card', photo: 'product-photo', price: 'product-price',
  toggle: 'product-toggle', status: 'product-status', cart: 'product-cart-title',
};
const labels = {
  ru: {status: 'Подписка выбрана', cart: 'Корзина', subscription: 'Подписка'},
  en: {status: 'Subscription selected', cart: 'Cart', subscription: 'Subscription'},
  az: {status: 'Abunəlik seçildi', cart: 'Səbət', subscription: 'Abunəlik'},
};
export const productSubscriptionLabel = (language = 'ru') => labels[language].subscription;
const packDir = path.join(ROOT, 'assets/website-journeys/lapa');
const manifest = path.join(packDir, 'manifest.json');
const isRecordedPage = url => ['lapa.az', 'www.lapa.az'].includes(url.hostname) && url.pathname === '/';

export async function hasRecordedProductDemo(url) {
  if (!isRecordedPage(url)) return false;
  try {
    await Promise.all([access(manifest),access(path.join(ROOT,'assets/fonts/Montserrat/Montserrat_800ExtraBold.ttf'))]);
    return true;
  } catch { return false; }
}

// The storefront is client-rendered. Reuse the recorded photo and verified
// shelf/cart match, then draw the interactive layers from the launch score.
export async function importProductFlow(source, language) {
  const url = new URL(source.url);
  if (!isRecordedPage(url)) return null;
  let pack;
  try {
    pack = JSON.parse(await readFile(manifest, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
  const photo = pack.layers.find(layer => layer.role === 'journey-photo');
  const shelf = pack.layers.find(layer => layer.role === 'journey-product');
  const cart = pack.layers.find(layer => layer.role === 'journey-cart-item');
  const priceOf = layer => layer?.text.match(/\d+(?:[.,]\d{2})?\s*₼/u)?.[0].replace(/\s*₼/u, ' ₼');
  const price = priceOf(shelf);
  if (!photo || !price || priceOf(cart) !== price) throw new Error('Product source has no matching shelf and cart price');
  const asset = await registerBrandAsset({
    file: path.join(packDir, photo.file), source: photo.sourceUrl, name: photo.role, kind: 'screenshot',
  });
  const evidence = [
    {id: 'PRODUCT-SHELF', source: shelf.sourceUrl, text: shelf.text},
    {id: 'PRODUCT-CART', source: cart.sourceUrl, text: cart.text},
  ];
  return {
    asset: {...asset, role: 'product-photo', evidenceId: evidence[0].id},
    evidence,
    productFlow: {
      ids: {...PRODUCT_FLOW_IDS, name: 'product-name'}, photoAssetId: asset.id, name: photo.text, price,
      labels: labels[language], shelfEvidenceId: evidence[0].id, cartEvidenceId: evidence[1].id,
      provenance: 'recorded-public-shop',
    },
  };
}

const normalize = text => text?.trim().replace(/\s+/gu, ' ').normalize('NFC');

export function productFlowMilestones(score, flow) {
  const byId = id => score.elements.find(element => element.id === id);
  const {card, photo, price, toggle, status, cart} = PRODUCT_FLOW_IDS;
  const states = score.shapes.find(shape => shape.id === card)?.states;
  if (!states || ![photo, price, toggle, status, cart].every(byId)) return null;
  const last = states.at(-1);
  return {
    card, photo, price, toggle, status, cart,
    ...(flow?.ids?.name && {name: flow.ids.name}),
    actionFrame: byId(toggle).changeAt,
    switchSettledFrame: byId(toggle).changeAt + TOGGLE_SETTLE_FRAMES,
    statusFrame: byId(status).start,
    statusSettledFrame: byId(status).start + byId(status).enterFrames,
    handoffFrame: last.frame,
    cartLandingFrame: last.frame + last.duration,
    cartTitleFrame: byId(cart).start,
    cartTitleSettledFrame: byId(cart).start + byId(cart).enterFrames,
  };
}

export function productFlowIssues(score, flow, shapes, elements) {
  const issues = [];
  const {card, photo, price, toggle, status, cart} = PRODUCT_FLOW_IDS;
  const surface = shapes.get(card);
  const image = elements.get(photo), amount = elements.get(price), control = elements.get(toggle);
  const confirmation = elements.get(status), title = elements.get(cart);
  const isText = (element, copy) => ['text', 'pill'].includes(element?.kind) &&
    normalize(element.text) === normalize(copy) && !element.wordSwap && !element.textRing &&
    element.enter !== 'spiral' && !element.motion?.some(key => key.opacity !== 100);
  if (!surface) issues.push(`Use one persistent shape named ${card} as the product and cart surface`);
  if (image?.kind !== 'image' || image.assetId !== flow.photoAssetId) issues.push(`${photo}: use the recorded product photo`);
  if (!isText(amount, flow.price)) issues.push(`${price}: render the exact captured price "${flow.price}" as its own text or pill`);
  const nameId = flow.ids?.name;
  if (nameId) {
    const name = elements.get(nameId);
    if (!isText(name, flow.name) || name.kind !== 'text' || name.attachTo !== card ||
        name.start !== 0 || name.end !== score.frames || name.enter !== 'none') {
      issues.push(`${nameId}: keep the exact product name "${flow.name}" as a separate, fully visible text layer on the card`);
    }
  }
  for (const layer of [image, amount]) {
    if (!layer) continue;
    if (layer.attachTo !== card || layer.start !== 0 || layer.end !== score.frames || layer.enter !== 'none' ||
        layer.motion?.some(key => key.opacity !== 100)) {
      issues.push(`${layer.id}: keep this same fully opaque layer on ${card} for the whole film; use enter=none`);
    }
  }
  if (score.elements.some(element => element.kind === 'image' && element.id !== photo)) {
    issues.push('Only the isolated product photo may be used as an image in this layered flow');
  }
  if (control?.kind !== 'toggle' || control.on !== true || control.attachTo !== card) {
    issues.push(`${toggle}: attach a separate off-to-on toggle to ${card}`);
  }
  if (!isText(confirmation, flow.labels.status)) issues.push(`${status}: render the exact separate status "${flow.labels.status}"`);
  if (!isText(title, flow.labels.cart)) issues.push(`${cart}: render the exact final heading "${flow.labels.cart}"`);
  for (const element of score.elements) {
    if ([status, cart].includes(element.id)) continue;
    const copies = [element.text, ...(element.wordSwap?.variants.map(variant =>
      element.wordSwap.before + variant.text + element.wordSwap.after) ?? [])];
    if (copies.some(copy => [flow.labels.status, flow.labels.cart].map(normalize).includes(normalize(copy)))) {
      issues.push(`${element.id}: status and cart copy belong only to their dedicated layers`);
    }
  }
  const timing = productFlowMilestones(score);
  if (!timing) return issues;
  if (timing.statusFrame <= timing.switchSettledFrame) {
    issues.push(`${status}: start after the switch settles at frame ${timing.switchSettledFrame}`);
  }
  if (timing.handoffFrame < timing.statusSettledFrame || timing.cartTitleFrame < timing.statusSettledFrame + 12 ||
      timing.cartTitleFrame < timing.handoffFrame || timing.cartLandingFrame > timing.cartTitleSettledFrame) {
    issues.push('Settle the status, then morph the same card into the cart row; start the cart title during or after the morph and finish it after the card lands');
  }
  if (title.end !== score.frames || timing.cartTitleSettledFrame > score.frames - 30) {
    issues.push(`${cart}: hold the settled cart title through the last 30 frames`);
  }
  const from = surface.states.at(-2).box, to = surface.states.at(-1).box;
  if (from.w === to.w && from.h === to.h) issues.push(`${card}: change width or height for the cart-row landing`);
  return issues;
}
