/**
 * @docHint
 * @purpose 캐릭터 이미지 출처·sourceType·업로드 소유권을 서버에서 판정
 * @process 자산 출처 정규화  sourceType 호환 확인  uid 소유 여부 확인
 * @domain game.character
 * @scope server-policy
 */

export type CharacterSourceAssetOrigin = "upload" | "generated";

export function resolveCharacterSourceAssetOrigin(asset: { provider?: unknown; sourceService?: unknown }): CharacterSourceAssetOrigin {
  return asset.provider === "user-upload" || asset.sourceService === "upload" ? "upload" : "generated";
}

export function isCharacterSourceTypeCompatible(sourceType: string, origin: CharacterSourceAssetOrigin) {
  return origin === "upload" ? sourceType === "upload" : sourceType !== "upload";
}

export function isCharacterUploadSourceOwner(asset: { uid?: unknown; scope?: unknown }, uid: string) {
  const ownerUid = typeof asset.uid === "string" ? asset.uid.trim() : "";
  const requestedUid = uid.trim();
  return asset.scope === "user" && Boolean(requestedUid) && ownerUid === requestedUid;
}
