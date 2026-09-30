/**
 * @docHint
 * @purpose Commerce variant 이미지 생성에 필요한 모델 참조를 private R2에서 서버 payload로 전달
 * @process 번들 모델 슬롯 선택  저장소 참조·MIME·크기 검증  R2 바이트 읽기  provider 입력 형식 반환
 * @domain commerce.model-reference
 * @scope server-utils
 */
import "server-only";

import type { BaseImageType } from "types/app/service";
import { getR2ObjectBuffer } from "libs/server-utils/storage/r2Storage";
import type {
  CommerceImageReferenceBundleType,
  CommerceImageReferenceItemType,
} from "./commerceImageVariantContract";

export const COMMERCE_MODEL_REFERENCE_MAX_BYTES = 12 * 1024 * 1024;
export const COMMERCE_MODEL_REFERENCE_MIME_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);

type ReadR2Object = (params: { bucket: string; key: string }) => Promise<Buffer | null>;

export class CommerceModelReferenceDeliveryError extends Error {
  readonly code = "model_reference_not_delivered";

  constructor(reason: string) {
    super(reason);
    this.name = "CommerceModelReferenceDeliveryError";
  }
}

function normalizeMimeType(value: unknown) {
  return String(value || "").split(";", 1)[0].trim().toLowerCase().replace("image/jpg", "image/jpeg");
}

function modelReferenceItems(items: CommerceImageReferenceItemType[]) {
  return items.filter((item) => item.kind.startsWith("model_"));
}

/**
 * Variant 계약이 강제된 요청의 모델 참조를 서버 바이트로 materialize 한다.
 * URL만 있는 레거시 슬롯은 서버가 신뢰할 수 있는 R2 저장소 참조가 아니므로 fail-closed 한다.
 */
export async function materializeCommerceModelReferenceImages(
  items: CommerceImageReferenceItemType[],
  options?: { readObject?: ReadR2Object },
): Promise<BaseImageType[]> {
  const readObject = options?.readObject || getR2ObjectBuffer;
  return await Promise.all(
    modelReferenceItems(items).map(async (item) => {
      const storage = item.storage;
      if (!storage || storage.driver !== "r2" || !storage.bucket || !storage.key) {
        throw new CommerceModelReferenceDeliveryError("model_reference_storage_missing");
      }

      const mimeType = normalizeMimeType(storage.mimeType);
      if (!COMMERCE_MODEL_REFERENCE_MIME_TYPES.has(mimeType)) {
        throw new CommerceModelReferenceDeliveryError("model_reference_mime_invalid");
      }

      const buffer = await readObject({ bucket: storage.bucket, key: storage.key });
      if (!buffer || buffer.length === 0) {
        throw new CommerceModelReferenceDeliveryError("model_reference_object_missing");
      }
      if (buffer.length > COMMERCE_MODEL_REFERENCE_MAX_BYTES) {
        throw new CommerceModelReferenceDeliveryError("model_reference_object_too_large");
      }

      return { mimeType, data: buffer.toString("base64") };
    }),
  );
}

export async function resolveCommerceModelReferenceImages(args: {
  enforceVariant: boolean;
  bundle: CommerceImageReferenceBundleType;
  clientModelImages?: BaseImageType[];
  readObject?: ReadR2Object;
}): Promise<BaseImageType[] | undefined> {
  if (!args.enforceVariant) return args.clientModelImages;
  return materializeCommerceModelReferenceImages(args.bundle.items, { readObject: args.readObject });
}
