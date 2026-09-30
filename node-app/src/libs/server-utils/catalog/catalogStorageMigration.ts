import "server-only";

import { isUnknownRecord } from "utils/common";

/**
 * 기존 /shoplink 상대 URL은 실제 파일을 복사하지 않고 전송 모델에서만 이전 대상으로 표시한다.
 * R2 메타데이터가 있는 항목은 r2 상태를 명시하며 원본 DB 객체를 변경하지 않는다.
 */
export function normalizeCatalogImageForTransport(value: unknown) {
  if (!isUnknownRecord(value)) return value;
  const storage = isUnknownRecord(value.storage) ? value.storage : {};

  if (storage.driver === "r2") {
    return { ...value, storage: { ...storage, migrationState: "r2" } };
  }

  const src = String(value.src || "").trim();
  if (src.startsWith("/shoplink/")) {
    return {
      ...value,
      storage: {
        ...storage,
        driver: "local",
        url: src,
        migrationState: "migration-required",
      },
    };
  }

  return value;
}

export function normalizeCatalogCategoryForTransport(value: unknown) {
  if (!isUnknownRecord(value)) return value;
  return {
    ...value,
    list: Array.isArray(value.list) ? value.list.map(normalizeCatalogImageForTransport) : [],
  };
}
