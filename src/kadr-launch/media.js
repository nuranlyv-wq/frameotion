export const isVisualAsset=asset=>['logo','screenshot','illustration'].includes(asset.kind);
export function imageAssetIds(score) {
  return [...new Set(score.elements.flatMap(element=>[
    element.assetId,element.fold?.assetId,element.mesh?.assetId,
    ...(element.formTrack?.keys??[]).map(key=>key.assetId),
    ...(element.stage?.nodes??[]).map(node=>node.assetId),
  ]).filter(Boolean))];
}
