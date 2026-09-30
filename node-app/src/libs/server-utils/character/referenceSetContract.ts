import {
  CHARACTER_REFERENCE_ANGLE_IMAGE_ROLES,
  CHARACTER_REFERENCE_FIT_IMAGE_ROLES,
  CHARACTER_REFERENCE_IDENTITY_IMAGE_ROLES,
  CHARACTER_REFERENCE_IMAGE_ROLES,
  CHARACTER_REFERENCE_REQUIRED_IMAGE_ROLES,
  type CharacterReferenceImageRoleType,
} from "consts/app";
import { toUnknownRecord, type UnknownRecord } from "utils/common/typeUtils";

/**
 * 모델 레퍼런스 킷의 순수 판정 로직.
 *
 * DB·env에 의존하지 않는 계약만 담는다. repo는 저장만 담당하고 판정은 여기서 한다
 * (SSM-201 commerceWorkflowContract와 같은 분리).
 */

type Role = CharacterReferenceImageRoleType;

const REQUIRED_IMAGE_ROLES = CHARACTER_REFERENCE_REQUIRED_IMAGE_ROLES as readonly Role[];
const OPTIONAL_IMAGE_ROLES = CHARACTER_REFERENCE_IMAGE_ROLES.filter(
  (role) => !(REQUIRED_IMAGE_ROLES as readonly string[]).includes(role),
) as readonly Role[];
const IDENTITY_IMAGE_ROLES = CHARACTER_REFERENCE_IDENTITY_IMAGE_ROLES as readonly Role[];
const FIT_IMAGE_ROLES = CHARACTER_REFERENCE_FIT_IMAGE_ROLES as readonly Role[];
const ANGLE_IMAGE_ROLES = CHARACTER_REFERENCE_ANGLE_IMAGE_ROLES as readonly Role[];

function toSafeString(value: unknown) {
  return String(value || "").trim();
}

export function normalizeCharacterReferenceSpec(spec?: UnknownRecord) {
  const raw = spec || {};
  return {
    heightImpression: toSafeString(raw.heightImpression),
    bodyType: toSafeString(raw.bodyType),
    skinTone: toSafeString(raw.skinTone),
    hair: toSafeString(raw.hair),
    faceShape: toSafeString(raw.faceShape),
    mood: toSafeString(raw.mood),
    poseRules: toSafeString(raw.poseRules),
    stylingRules: toSafeString(raw.stylingRules),
    negativeRules: toSafeString(raw.negativeRules),
    promptText: toSafeString(raw.promptText),
  };
}

/**
 * 슬롯이 실제 객체를 가리키는지 판정한다.
 *
 * private R2 자산은 저장 시점에 `storage.url`이 지워지므로(imageGenRepo의 private 전환),
 * url 하나로 판정하면 붙일 수 있는 자산이 "이미지 없음"이 된다. 저장소 참조(bucket+key)도
 * 같은 자격의 포인터로 본다 — 표시 URL은 읽는 시점에 해석한다 (ASH-15).
 */
export function hasCharacterReferenceImageRef(image: UnknownRecord) {
  if (toSafeString(image.url)) return true;
  return Boolean(toSafeString(image.bucket) && toSafeString(image.key));
}

export function normalizeCharacterReferenceImages(images?: UnknownRecord) {
  const out: UnknownRecord = {};
  const raw = images || {};
  CHARACTER_REFERENCE_IMAGE_ROLES.forEach((role, index) => {
    const image = toUnknownRecord(raw[role]);
    if (!hasCharacterReferenceImageRef(image)) return;
    out[role] = {
      role,
      url: toSafeString(image.url),
      assetId: toSafeString(image.assetId),
      source: toSafeString(image.source) || "manual",
      // R2 단일 저장소 계약: 바이트가 아니라 driver/access/bucket/key 참조를 남긴다 (media-storage.md §4).
      driver: toSafeString(image.driver),
      access: toSafeString(image.access),
      bucket: toSafeString(image.bucket),
      key: toSafeString(image.key),
      mimeType: toSafeString(image.mimeType),
      width: Number(image.width || 0) || undefined,
      height: Number(image.height || 0) || undefined,
      sha256: toSafeString(image.sha256),
      sortOrder: Number(image.sortOrder || index + 1) || index + 1,
    };
  });
  return out;
}

/**
 * patch의 images로 킷 이미지 맵을 **전체 치환**한다. 역할별 병합이 아니다 —
 * patch에 없는 역할은 삭제된다(종전 `normalize(patch.images)`와 같은 의미론).
 *
 * 다만 저장소 참조는 patch가 정할 수 없다. 슬롯의 bucket/key는 표시 URL 서명 입력이 되므로,
 * 입력값을 보존하면 유니버스 편집 권한만 가진 사용자가 임의 객체의 서명 URL을 받아낼 수 있다.
 * 저장소 참조를 쓰는 정당한 경로는 자산 조회와 universe/scope 검증을 거치는 attach-image 하나다 (ASH-15 P0-1).
 */
export function replaceCharacterReferenceImagesFromPatch(currentImages?: UnknownRecord, patchImages?: UnknownRecord) {
  const current = normalizeCharacterReferenceImages(currentImages);
  const incoming = toUnknownRecord(patchImages);
  const merged: UnknownRecord = {};

  CHARACTER_REFERENCE_IMAGE_ROLES.forEach((role) => {
    const next = toUnknownRecord(incoming[role]);
    if (!Object.keys(next).length) return;
    const stored = toUnknownRecord(current[role]);
    merged[role] = {
      ...next,
      // 같은 역할에 이미 저장된 참조만 승계한다. 입력값은 버린다.
      driver: toSafeString(stored.driver),
      access: toSafeString(stored.access),
      bucket: toSafeString(stored.bucket),
      key: toSafeString(stored.key),
    };
  });

  return normalizeCharacterReferenceImages(merged);
}

function hasRoleImage(images: UnknownRecord, role: Role) {
  return hasCharacterReferenceImageRef(toUnknownRecord(images[role]));
}

/**
 * 축 하나의 충족 상태를 만든다. 축은 "역할이 몇 개 있는가"가 아니라
 * "그 판단을 할 수 있는가"를 뜻하므로, 필요한 역할이 전부 있어야 satisfied다.
 */
function buildAxisState(images: UnknownRecord, roles: readonly Role[]) {
  const presentRoles = roles.filter((role) => hasRoleImage(images, role));
  const missingRoles = roles.filter((role) => !hasRoleImage(images, role));
  return { satisfied: missingRoles.length === 0, presentRoles, missingRoles };
}

export function buildCharacterReferenceSetQuality(images?: UnknownRecord, spec?: UnknownRecord) {
  const normalizedImages = normalizeCharacterReferenceImages(images);
  const normalizedSpec = normalizeCharacterReferenceSpec(spec);
  const missingRoles = REQUIRED_IMAGE_ROLES.filter((role) => !hasRoleImage(normalizedImages, role));
  const requiredImageCount = REQUIRED_IMAGE_ROLES.length - missingRoles.length;
  const optionalImageCount = OPTIONAL_IMAGE_ROLES.filter((role) => hasRoleImage(normalizedImages, role)).length;

  // 정체성·핏·각도 세 축으로 완성도를 판정한다 (SSM-202).
  // 정체성: 클로즈업 단독은 전신 생성에서 얼굴이 축소될 때 눈·코 비례가 흔들린다.
  //         원거리 얼굴 스케일과 한 쌍일 때만 축을 충족으로 본다.
  // 핏: 헤드리스 정면 전신은 얼굴 없이 핏·기장만 판단하는 기준컷이다.
  const axes = {
    identity: buildAxisState(normalizedImages, IDENTITY_IMAGE_ROLES),
    fit: buildAxisState(normalizedImages, FIT_IMAGE_ROLES),
    angle: buildAxisState(normalizedImages, ANGLE_IMAGE_ROLES),
  };

  const warnings: string[] = [];
  if (!toSafeString(normalizedSpec.promptText)) warnings.push("model_spec_prompt_required");
  if (!hasRoleImage(normalizedImages, "distanceFaceScale")) warnings.push("identity_pair_recommended");
  if (!hasRoleImage(normalizedImages, "headlessFrontBody")) warnings.push("fit_reference_recommended");
  if (!hasRoleImage(normalizedImages, "leftFullBody")) warnings.push("left_reference_recommended");
  if (!hasRoleImage(normalizedImages, "rightFullBody")) warnings.push("right_reference_recommended");
  if (!hasRoleImage(normalizedImages, "backFullBody")) warnings.push("back_reference_recommended");

  // 차단 조건은 기존과 동일하게 유지한다. 새 역할을 필수로 올리면 이미 ready였던 kit이
  // 일괄 blocked로 떨어져 모델컷 생성이 멈춘다.
  const blocked = missingRoles.length > 0 || !toSafeString(normalizedSpec.promptText);
  const satisfiedAxisCount = [axes.identity, axes.fit, axes.angle].filter((axis) => axis.satisfied).length;
  const readinessLevel = blocked
    ? "blocked"
    : satisfiedAxisCount >= 3
      ? "complete"
      : satisfiedAxisCount > 0
        ? "recommended"
        : "minimum";

  return {
    ready: !blocked,
    readinessLevel,
    missingRoles,
    warnings,
    requiredImageCount,
    optionalImageCount,
    axes,
    lastCheckedAt: new Date(),
  };
}
