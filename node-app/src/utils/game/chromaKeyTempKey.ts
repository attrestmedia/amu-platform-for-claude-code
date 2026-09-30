export const CHROMA_KEY_TEMP_PREFIX = "game/chroma-key/temp";

export function buildChromaKeyTempPrefix(gameAssetId: string): string {
  return `${CHROMA_KEY_TEMP_PREFIX}/${gameAssetId}`;
}

export function isChromaKeyTempKeyForAsset(gameAssetId: string, key: string): boolean {
  if (!gameAssetId || !key || key.startsWith("/")) return false;

  const prefix = `${buildChromaKeyTempPrefix(gameAssetId)}/`;
  if (!key.startsWith(prefix)) return false;

  return key.split("/").every((segment) => segment !== "" && segment !== "..");
}
