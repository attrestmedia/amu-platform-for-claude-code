import { SMARTSTORE_POSE_MANNEQUIN_PROXY_TEMPLATE_KEY } from "consts/app";
import type { CommerceImageVariantSpecType, CommerceImageVariantType } from "libs/server-utils/commerce/commerceImageVariantContract";

/**
 * variant의 화면 표기와 apply 대상 매핑 (SSM-203).
 *
 * 값(variant 목록·상한·참조 정책)의 정본은 서버의 `commerceImageVariantContract`다.
 * 여기에는 사용자에게 보이는 문구와 apply-asset이 받는 `targetField`만 둔다.
 */

export type SmartstoreImageVariantValueType = CommerceImageVariantType;

export type SmartstoreImageVariantOptionType = {
  value: SmartstoreImageVariantValueType;
  /** apply-asset의 targetField. 대표·추가는 Smartstore payload role, 내부 자산은 variant 그대로다. */
  targetField: "representative" | "detail" | "model_cut" | "thumbnail";
  label: { ko: string; en: string };
  helper: { ko: string; en: string };
};

export const SMARTSTORE_IMAGE_VARIANT_OPTIONS: SmartstoreImageVariantOptionType[] = [
  {
    value: "model_cut",
    targetField: "model_cut",
    label: { ko: "모델컷", en: "Model cut" },
    helper: {
      ko: "상품 사진 + 전용 모델로 착장컷을 만듭니다. 모델 참조가 필요합니다.",
      en: "Outfit shots from the product photo and your store model. Requires model references.",
    },
  },
  {
    value: "representative",
    targetField: "representative",
    label: { ko: "대표 이미지", en: "Representative" },
    helper: {
      ko: "목록·검색에 노출되는 대표 1장입니다.",
      en: "The single image shown in listings and search.",
    },
  },
  {
    value: "additional",
    targetField: "detail",
    label: { ko: "추가 이미지", en: "Additional" },
    helper: {
      ko: "상세 갤러리에 들어가는 보조 이미지입니다. 최대 9장.",
      en: "Supporting images in the detail gallery. Up to 9.",
    },
  },
  {
    value: "thumbnail",
    targetField: "thumbnail",
    label: { ko: "썸네일", en: "Thumbnail" },
    helper: {
      ko: "배너·소셜에 쓰는 내부 자산입니다. 스토어에는 등록되지 않습니다.",
      en: "Internal asset for banners and social. Not registered to the store.",
    },
  },
];

/** preflight가 돌려주는 참조 오류 코드의 사용자 문구. */
export const SMARTSTORE_IMAGE_VARIANT_REFERENCE_ERROR_TEXT: Record<string, { ko: string; en: string }> = {
  product_photo_required: {
    ko: "상품 사진이 필요합니다. 상세 이미지에 상품 사진을 먼저 올려주세요.",
    en: "A product photo is required. Upload one to the detail images first.",
  },
  model_reference_min_not_met: {
    ko: "모델 참조가 부족합니다. 전용 모델에서 얼굴 클로즈업과 원거리 얼굴 스케일을 먼저 채워주세요.",
    en: "Not enough model references. Fill the face close-up and distance face scale in the model kit first.",
  },
  pose_proxy_required: {
    ko: "포즈 참조가 필요합니다. 포즈 참조 만들기에서 마네킹 프록시 컷을 먼저 만들어주세요.",
    en: "A pose reference is required. Create a mannequin proxy shot first.",
  },
};

/**
 * 포즈 참조 단계 (SSM-203).
 *
 * 정체성은 전용 모델 kit이, 자세는 이 무채색 마네킹 프록시가 담당한다. 프록시 컷을 만든 뒤
 * 모델컷 생성의 참조로 함께 넣으면 "원하는 자세 + 우리 모델"이 성립한다.
 *
 * 이 템플릿은 `smartstore-product-image` 그룹의 멤버가 아니므로 그룹 스코프로는 목록에 뜨지 않는다.
 * 그래서 포즈 참조 단계에서만 그룹 스코프 대신 이 키 하나로 허용 목록을 좁혀 연다.
 */
export const SMARTSTORE_POSE_PROXY_TEMPLATE_KEYS: readonly string[] = [SMARTSTORE_POSE_MANNEQUIN_PROXY_TEMPLATE_KEY];

/** 모델 일관성 수동 검수 항목의 화면 문구. id의 정본은 서버 계약(`commerceModelConsistencyContract`)이다. */
export const SMARTSTORE_MODEL_CONSISTENCY_ITEM_TEXT: Record<string, { ko: string; en: string }> = {
  same_person: {
    ko: "전용 모델과 같은 사람으로 보인다",
    en: "Looks like the same person as the store model",
  },
  outfit_items_match: {
    ko: "착장 아이템 구성이 상품 사진과 같다",
    en: "The outfit items match the product photo",
  },
  garment_length_match: {
    ko: "기장·실루엣이 상품 사진과 같다 (미디/미니 등)",
    en: "Length and silhouette match the product photo",
  },
  color_material_match: {
    ko: "색과 소재 표현이 상품 사진과 같다",
    en: "Color and material read the same as the product photo",
  },
  no_equipment_intrusion: {
    ko: "조명 장비·스탠드·워터마크 같은 이물이 없다",
    en: "No lighting gear, stands, or watermarks crept in",
  },
  anatomy_ok: {
    ko: "손·발·비율에 왜곡이 없다",
    en: "Hands, feet, and proportions are not distorted",
  },
  framing_ok: {
    ko: "잘림과 여백이 이 용도에 맞다",
    en: "Cropping and margins suit this purpose",
  },
};

export type SmartstoreImagePreflightType = {
  variant: SmartstoreImageVariantValueType;
  spec: CommerceImageVariantSpecType;
  draftRevision: number;
  idempotencyKey: string;
  blockedKits: Array<{ kitId: string; name: string }>;
  consistency: {
    gateRequired: boolean;
    usedModelReference: boolean;
    requiredItemIds: string[];
  };
  reference: {
    valid: boolean;
    errors: string[];
    productPhotoCount: number;
    modelReferenceCount: number;
    poseProxyCount: number;
    droppedCount: number;
    referenceHash: string;
    items: Array<{ url: string; kind: string; role?: string; kitId?: string }>;
  };
};
