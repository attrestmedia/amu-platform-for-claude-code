import crypto from "crypto";
import {
  CHARACTER_REFERENCE_ANGLE_IMAGE_ROLES,
  CHARACTER_REFERENCE_FIT_IMAGE_ROLES,
  CHARACTER_REFERENCE_IDENTITY_IMAGE_ROLES,
  type CharacterReferenceImageRoleType,
} from "consts/app";

/**
 * 상품 이미지 variant 계약 (SSM-203).
 *
 * 모델컷·대표·추가·썸네일은 용도와 비율뿐 아니라 *어떤 참조가 몇 장 필요한가*가 서로 다르다.
 * 생성 진입·비용 고지·Smartstore payload 매핑이 각자 다른 기준을 갖지 않도록 여기서 한 번만 정의한다.
 *
 * DB·env에 의존하지 않는 순수 계약이다.
 */

export const COMMERCE_IMAGE_VARIANTS = ["model_cut", "representative", "additional", "thumbnail"] as const;
export type CommerceImageVariantType = (typeof COMMERCE_IMAGE_VARIANTS)[number];

/** Smartstore payload의 images[].role. null이면 스토어 payload에 실리지 않는 내부 자산이다. */
export type CommerceImagePayloadRoleType = "representative" | "detail";

export type CommerceImageReferenceSlotPolicy = {
  required: boolean;
  min: number;
  max: number;
};

export type CommerceImageVariantSpecType = {
  variant: CommerceImageVariantType;
  /** 생성 기본 비율. 사용자가 바꿀 수 있는 기본값이며 강제값이 아니다. */
  aspectRatio: string;
  /** Smartstore payload에서 차지하는 role. null이면 등록 payload에 포함하지 않는다. */
  payloadRole: CommerceImagePayloadRoleType | null;
  /** draft 하나에 이 variant로 적용할 수 있는 최대 장수. */
  maxPerDraft: number;
  productPhoto: CommerceImageReferenceSlotPolicy;
  modelKit: CommerceImageReferenceSlotPolicy;
  /** 포즈 프록시(무채색 마네킹) 참조. 정체성은 kit이, 자세는 이 프록시가 담당한다 (SSM-203). */
  poseProxy: CommerceImageReferenceSlotPolicy;
  /** 참조 이미지 총합 상한. 템플릿 inputPolicy.maxCount와 별개로 variant가 먼저 자른다. */
  totalReferenceMax: number;
};

/**
 * 대표 1장 + 추가 최대 9장은 네이버 커머스의 이미지 슬롯 구조를 그대로 따른 값이다.
 * 모델컷·썸네일은 내부 생성 자산이라 payload role이 없고, 선택 적용 단계에서 대표·추가로 승격된다.
 */
export const COMMERCE_IMAGE_VARIANT_SPECS: Record<CommerceImageVariantType, CommerceImageVariantSpecType> = {
  model_cut: {
    variant: "model_cut",
    aspectRatio: "3:4",
    payloadRole: null,
    maxPerDraft: 12,
    // 상품 사진 없이 모델컷을 만들면 옷이 아니라 상상한 옷이 나온다.
    productPhoto: { required: true, min: 1, max: 4 },
    modelKit: { required: true, min: 2, max: 6 },
    // 포즈 프록시는 선택이다. 넣으면 자세가 고정되고, 없으면 템플릿 지시에 맡긴다.
    poseProxy: { required: false, min: 0, max: 1 },
    totalReferenceMax: 10,
  },
  representative: {
    variant: "representative",
    aspectRatio: "1:1",
    payloadRole: "representative",
    maxPerDraft: 1,
    productPhoto: { required: true, min: 1, max: 3 },
    modelKit: { required: false, min: 0, max: 4 },
    poseProxy: { required: false, min: 0, max: 1 },
    totalReferenceMax: 7,
  },
  additional: {
    variant: "additional",
    aspectRatio: "1:1",
    payloadRole: "detail",
    maxPerDraft: 9,
    productPhoto: { required: true, min: 1, max: 3 },
    modelKit: { required: false, min: 0, max: 4 },
    poseProxy: { required: false, min: 0, max: 1 },
    totalReferenceMax: 7,
  },
  thumbnail: {
    variant: "thumbnail",
    aspectRatio: "1:1",
    payloadRole: null,
    maxPerDraft: 4,
    productPhoto: { required: true, min: 1, max: 2 },
    modelKit: { required: false, min: 0, max: 2 },
    // 썸네일은 배너용 크롭이라 자세를 따로 이식하지 않는다.
    poseProxy: { required: false, min: 0, max: 0 },
    totalReferenceMax: 4,
  },
};

export function isCommerceImageVariant(value: unknown): value is CommerceImageVariantType {
  return (COMMERCE_IMAGE_VARIANTS as readonly string[]).includes(String(value));
}

export function normalizeCommerceImageVariant(value: unknown): CommerceImageVariantType {
  return isCommerceImageVariant(value) ? value : "model_cut";
}

export function getCommerceImageVariantSpec(variant: unknown): CommerceImageVariantSpecType {
  return COMMERCE_IMAGE_VARIANT_SPECS[normalizeCommerceImageVariant(variant)];
}

/** apply-asset의 targetField ↔ variant 매핑. 두 계층이 서로 다른 이름을 쓰지 않게 한다. */
export function getCommerceImageVariantPayloadRole(variant: unknown): CommerceImagePayloadRoleType | null {
  return getCommerceImageVariantSpec(variant).payloadRole;
}

export function resolveCommerceImageVariantFromTargetField(targetField: unknown): CommerceImageVariantType | null {
  const field = String(targetField || "").trim().toLowerCase();
  if (field === "representative") return "representative";
  if (field === "detail") return "additional";
  return null;
}

/* ─────────────────────────────────────────────
 * 참조 번들
 * ───────────────────────────────────────────── */

export type CommerceImageReferenceKindType =
  | "product_photo"
  | "model_identity"
  | "pose_proxy"
  | "model_fit"
  | "model_angle";

export type CommerceImageReferenceItemType = {
  url: string;
  kind: CommerceImageReferenceKindType;
  /** 모델 참조일 때의 kit 역할. 상품 사진이면 비어 있다. */
  role?: CharacterReferenceImageRoleType;
  kitId?: string;
  /**
   * 참조 대상의 안정 식별자. 멱등 해시 재료다.
   *
   * private R2 슬롯의 url은 만료형 signed URL이라 요청마다 값이 달라진다. url을 해시하면
   * 같은 참조 조합인데도 멱등키가 매번 바뀌어 재시도가 중복 과금된다 (ASH-15 독립검토 2차).
   */
  assetId?: string;
  /** 서버가 private/public R2 바이트를 직접 읽을 때만 사용하는 내부 저장소 참조다. */
  storage?: CommerceImageReferenceStorageType;
};

export type CommerceImageReferenceStorageType = {
  driver: string;
  access: string;
  bucket: string;
  key: string;
  mimeType: string;
};

export type CommerceImageReferenceBundleType = {
  variant: CommerceImageVariantType;
  items: CommerceImageReferenceItemType[];
  productPhotoCount: number;
  modelReferenceCount: number;
  /** 포즈 프록시로 담긴 장수. 모델 참조 수와 따로 센다. */
  poseProxyCount: number;
  /** 상한 때문에 잘라낸 장수. 사용자에게 알려야 하는 값이다. */
  droppedCount: number;
  valid: boolean;
  errors: string[];
  /** 같은 참조 조합인지 판정하는 안정적 해시. 멱등키 재료로 쓴다. */
  referenceHash: string;
};

function toSafeUrl(value: unknown) {
  return String(value || "").trim();
}

function uniqueUrls(urls: unknown[]) {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of urls || []) {
    const url = toSafeUrl(raw);
    if (!url || seen.has(url)) continue;
    seen.add(url);
    out.push(url);
  }
  return out;
}

/** 모델 참조는 정체성 → 핏 → 각도 순으로 담는다. 상한에 걸려 잘릴 때 정체성이 먼저 살아남아야 한다. */
const MODEL_REFERENCE_ORDER: Array<{ roles: readonly CharacterReferenceImageRoleType[]; kind: CommerceImageReferenceKindType }> = [
  { roles: CHARACTER_REFERENCE_IDENTITY_IMAGE_ROLES, kind: "model_identity" },
  { roles: CHARACTER_REFERENCE_FIT_IMAGE_ROLES, kind: "model_fit" },
  { roles: CHARACTER_REFERENCE_ANGLE_IMAGE_ROLES, kind: "model_angle" },
];

export type CommerceImageReferenceKitInputType = {
  kitId: string;
  ready?: boolean;
  images?: Partial<Record<CharacterReferenceImageRoleType, CommerceImageReferenceSlotType | undefined>>;
};

export type CommerceImageReferenceSlotType = {
  url?: string;
  assetId?: string;
  driver?: string;
  access?: string;
  bucket?: string;
  key?: string;
  mimeType?: string;
};

function toReferenceStorage(slot?: CommerceImageReferenceSlotType): CommerceImageReferenceStorageType | undefined {
  const bucket = toSafeUrl(slot?.bucket);
  const key = toSafeUrl(slot?.key);
  if (!bucket || !key) return undefined;
  return {
    driver: toSafeUrl(slot?.driver),
    access: toSafeUrl(slot?.access),
    bucket,
    key,
    mimeType: toSafeUrl(slot?.mimeType),
  };
}

function referenceIdentityKeys(slot: CommerceImageReferenceSlotType, url: string, storage?: CommerceImageReferenceStorageType) {
  return [
    toSafeUrl(slot.assetId) ? `asset:${toSafeUrl(slot.assetId)}` : "",
    url ? `url:${url}` : "",
    storage ? `storage:${storage.driver}:${storage.access}:${storage.bucket}:${storage.key}` : "",
  ].filter(Boolean);
}

/**
 * 상품 사진과 모델 kit을 variant 정책에 맞춰 하나의 참조 번들로 합친다.
 *
 * - `ready=false`인 kit은 애초에 제외한다(SSM-202 acceptance와 같은 기준).
 * - 상한 초과는 오류가 아니라 절단이다. 대신 몇 장이 빠졌는지 돌려준다.
 * - 최소 미달은 오류다. 생성을 시작하면 코인만 쓰고 결과가 목적에 못 미친다.
 */
export function buildCommerceImageReferenceBundle(args: {
  variant: unknown;
  productPhotoUrls?: unknown[];
  kits?: CommerceImageReferenceKitInputType[];
  /** 포즈 프록시 자산 URL. `pose-reference-neutral-mannequin-proxy`로 만든 무채색 마네킹 컷이다. */
  poseProxyUrls?: unknown[];
}): CommerceImageReferenceBundleType {
  const variant = normalizeCommerceImageVariant(args.variant);
  const spec = COMMERCE_IMAGE_VARIANT_SPECS[variant];
  const errors: string[] = [];

  const allProductPhotos = uniqueUrls(args.productPhotoUrls || []);
  const productPhotos = allProductPhotos.slice(0, spec.productPhoto.max);

  const readyKits = (args.kits || []).filter((kit) => kit && kit.ready !== false);
  const modelRefs: CommerceImageReferenceItemType[] = [];
  const seenModelReferences = new Set<string>();
  for (const group of MODEL_REFERENCE_ORDER) {
    for (const role of group.roles) {
      for (const kit of readyKits) {
        const slot = kit.images?.[role];
        const url = toSafeUrl(slot?.url);
        const storage = toReferenceStorage(slot);
        const identityKeys = referenceIdentityKeys(slot || {}, url, storage);
        if (identityKeys.length === 0 || identityKeys.some((key) => seenModelReferences.has(key))) continue;
        identityKeys.forEach((key) => seenModelReferences.add(key));
        modelRefs.push({
          url,
          kind: group.kind,
          role,
          kitId: kit.kitId,
          assetId: toSafeUrl(slot?.assetId),
          ...(storage ? { storage } : {}),
        });
      }
    }
  }
  const allModelRefCount = modelRefs.length;
  const boundedModelRefs = modelRefs.slice(0, spec.modelKit.max);

  // 상품 사진·모델 참조와 같은 URL을 포즈 프록시로도 보내면 참조 슬롯을 두 번 먹는다. 그룹을 넘겨 제거한다.
  const claimedUrls = new Set<string>([...productPhotos, ...boundedModelRefs.map((item) => item.url)]);
  const allPoseProxies = uniqueUrls(args.poseProxyUrls || []).filter((url) => !claimedUrls.has(url));
  const poseProxies: CommerceImageReferenceItemType[] = allPoseProxies
    .slice(0, spec.poseProxy.max)
    .map((url) => ({ url, kind: "pose_proxy" as const }));

  if (spec.productPhoto.required && productPhotos.length < spec.productPhoto.min) {
    errors.push("product_photo_required");
  }
  if (spec.modelKit.required && boundedModelRefs.length < spec.modelKit.min) {
    errors.push("model_reference_min_not_met");
  }
  if (spec.poseProxy.required && poseProxies.length < spec.poseProxy.min) {
    errors.push("pose_proxy_required");
  }

  // 포즈 프록시는 정체성 다음, 핏·각도 앞에 둔다. 상한에 걸려 잘리는 것은 각도 커버리지 쪽이어야 한다.
  const identityRefs = boundedModelRefs.filter((item) => item.kind === "model_identity");
  const otherModelRefs = boundedModelRefs.filter((item) => item.kind !== "model_identity");
  const items = [
    ...productPhotos.map((url) => ({ url, kind: "product_photo" as const })),
    ...identityRefs,
    ...poseProxies,
    ...otherModelRefs,
  ].slice(0, spec.totalReferenceMax);

  const productPhotoCount = items.filter((item) => item.kind === "product_photo").length;
  const poseProxyCount = items.filter((item) => item.kind === "pose_proxy").length;
  const modelReferenceCount = items.length - productPhotoCount - poseProxyCount;

  // 총합 상한이 모델 참조를 최소 미만으로 깎아버린 경우도 미달로 본다.
  if (spec.modelKit.required && modelReferenceCount < spec.modelKit.min && !errors.includes("model_reference_min_not_met")) {
    errors.push("model_reference_min_not_met");
  }

  const droppedCount =
    allProductPhotos.length +
    allModelRefCount +
    allPoseProxies.length -
    productPhotoCount -
    modelReferenceCount -
    poseProxyCount;

  return {
    variant,
    items,
    productPhotoCount,
    modelReferenceCount,
    poseProxyCount,
    droppedCount: Math.max(0, droppedCount),
    valid: errors.length === 0,
    errors,
    referenceHash: buildCommerceImageReferenceHash(items),
  };
}

/**
 * 참조 조합의 안정 해시.
 *
 * **url을 재료로 쓰지 않는다** — private R2 슬롯은 만료형 signed URL이라 초 단위로 값이 바뀌고,
 * 그러면 같은 참조인데도 멱등키가 매번 달라져 재시도가 중복 과금된다. assetId가 있으면 그것을,
 * 없으면(상품 사진·포즈 프록시 같은 외부 URL) url을 쓴다 (ASH-15 독립검토 2차).
 */
export function buildCommerceImageReferenceHash(items: CommerceImageReferenceItemType[]) {
  const canonical = items
    .map((item) => {
      const storage = item.storage;
      const stableReference =
        String(item.assetId || "").trim() ||
        (storage ? `${storage.driver}:${storage.access}:${storage.bucket}:${storage.key}` : "") ||
        item.url;
      return `${item.kind}:${item.role || "-"}:${stableReference}`;
    })
    .join("\n");
  return crypto.createHash("sha256").update(canonical).digest("hex").slice(0, 32);
}

/* ─────────────────────────────────────────────
 * 멱등 — 실패 후 재시도가 중복 과금되지 않게 한다
 * ───────────────────────────────────────────── */

/**
 * 같은 draft revision · 같은 variant · 같은 참조 조합 · 같은 시도 회차는 하나의 생성이다.
 * attempt를 올리지 않은 재요청은 서버가 같은 키로 판정해 재과금을 막는다.
 */
export function buildCommerceImageGenerationIdempotencyKey(args: {
  draftId: string;
  draftRevision: number;
  variant: unknown;
  referenceHash: string;
  attempt?: number;
}) {
  const attempt = Number.isFinite(Number(args.attempt)) && Number(args.attempt) > 0 ? Number(args.attempt) : 1;
  const revision = Number.isFinite(Number(args.draftRevision)) ? Number(args.draftRevision) : 0;
  return [
    String(args.draftId || "").trim(),
    `r${revision}`,
    normalizeCommerceImageVariant(args.variant),
    String(args.referenceHash || "").trim() || "noref",
    `a${attempt}`,
  ].join(":");
}

/* ─────────────────────────────────────────────
 * Smartstore payload 매핑
 * ───────────────────────────────────────────── */

export type CommerceVariantAssetInputType = {
  variant: CommerceImageVariantType;
  url: string;
  assetId?: string;
  origin?: string;
  sortOrder?: number;
};

export type CommerceSmartstoreImageEntryType = {
  url: string;
  role: CommerceImagePayloadRoleType;
  sortOrder: number;
  assetId?: string;
  origin?: string;
};

/**
 * variant별로 선택한 자산을 Smartstore images 배열로 옮긴다.
 *
 * payload role이 없는 variant(모델컷·썸네일)는 내부 자산이라 제외한다.
 * 대표는 1장만 남고, 추가는 variant 상한까지만 실린다.
 */
export function mapCommerceVariantAssetsToSmartstoreImages(
  assets: CommerceVariantAssetInputType[],
): { images: CommerceSmartstoreImageEntryType[]; skipped: CommerceVariantAssetInputType[] } {
  const skipped: CommerceVariantAssetInputType[] = [];
  const representative: CommerceSmartstoreImageEntryType[] = [];
  const detail: CommerceSmartstoreImageEntryType[] = [];

  const sorted = [...(assets || [])].sort(
    (a, b) => (Number(a?.sortOrder ?? 0) || 0) - (Number(b?.sortOrder ?? 0) || 0),
  );

  for (const asset of sorted) {
    const url = toSafeUrl(asset?.url);
    const spec = getCommerceImageVariantSpec(asset?.variant);
    if (!url || !spec.payloadRole) {
      if (asset) skipped.push(asset);
      continue;
    }
    const bucket = spec.payloadRole === "representative" ? representative : detail;
    if (bucket.length >= spec.maxPerDraft) {
      skipped.push(asset);
      continue;
    }
    bucket.push({
      url,
      role: spec.payloadRole,
      sortOrder: bucket.length + 1,
      assetId: String(asset.assetId || "").trim() || undefined,
      origin: String(asset.origin || "").trim() || undefined,
    });
  }

  // 대표가 항상 먼저 오고, 추가 이미지의 정렬은 대표 다음부터 이어진다.
  const images = [
    ...representative,
    ...detail.map((entry, index) => ({ ...entry, sortOrder: representative.length + index + 1 })),
  ];
  return { images, skipped };
}
