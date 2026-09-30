export const PLATFORM_CREDENTIAL_ENVIRONMENTS = ["development", "production"] as const;
export type PlatformCredentialEnvironment = (typeof PLATFORM_CREDENTIAL_ENVIRONMENTS)[number];

export const PLATFORM_CREDENTIAL_STATUSES = ["pending", "active", "disabled", "revoked"] as const;
export type PlatformCredentialStatus = (typeof PLATFORM_CREDENTIAL_STATUSES)[number];

export const PLATFORM_CREDENTIAL_VERIFICATION_STATUSES = ["unverified", "valid", "invalid"] as const;
export type PlatformCredentialVerificationStatus = (typeof PLATFORM_CREDENTIAL_VERIFICATION_STATUSES)[number];

// DB 스키마 enum·관리 화면 그룹·정의 목록이 모두 이 배열을 근거로 삼는다.
// 카테고리 목록을 여러 파일에 문자열로 복제하면 한 곳만 빠져도 저장 시점에야 터진다.
export const PLATFORM_CREDENTIAL_CATEGORIES = ["ai", "integration", "messaging", "stock_image", "trading"] as const;
export type PlatformCredentialCategory = (typeof PLATFORM_CREDENTIAL_CATEGORIES)[number];

export const QWEN_ENDPOINT_KINDS = ["qwencloud_payg", "model_studio_singapore_payg"] as const;
export type QwenEndpointKind = (typeof QWEN_ENDPOINT_KINDS)[number];
export const QWEN_LEGACY_ENDPOINT_KIND: QwenEndpointKind = "qwencloud_payg";
export const QWEN_DEFAULT_ENDPOINT_KIND: QwenEndpointKind = "model_studio_singapore_payg";
export const QWEN_MODEL_STUDIO_MIGRATION_REASON = "MODEL_STUDIO_SINGAPORE_PAYG_CONTRACT" as const;

export type PlatformCredentialPayload = Record<string, string>;

export type QwenCredentialMigrationEligibility = {
  eligible: boolean;
  reasonCode:
    | "no_qwen_credential"
    | "source_status_not_migratable"
    | "source_already_claimed"
    | "source_payload_unavailable"
    | "source_kind_not_legacy"
    | "ready";
  sourceVersion?: number;
};

export type PlatformCredentialFieldOption = {
  value: string;
  label: { ko: string; en: string };
};

export type PlatformCredentialFieldDefinition = {
  key: string;
  label: { ko: string; en: string };
  secret: boolean;
  placeholder?: string;
  options?: readonly PlatformCredentialFieldOption[];
};

export type PlatformCredentialDefinition = {
  key: string;
  provider: string;
  category: PlatformCredentialCategory;
  label: { ko: string; en: string };
  description: { ko: string; en: string };
  fields: readonly PlatformCredentialFieldDefinition[];
  /** 이 provider는 공식 비과금 검증 수단이 없어 관리 UI의 verify action을 제공하지 않는다. */
  verificationUnavailable?: boolean;
  /** 인증 조회가 성공해도 출시/법무 계약이 닫혀 있는 동안에는 활성 전환을 허용하지 않는다. */
  activationUnavailable?: boolean;
  /**
   * 카드에 상시 노출하는 주의 문구. **저장·검증·활성 상태와 무관한 고정 안내**만 담는다.
   * 상태 표기는 배지와 `active vN · latest vN · CODE` 줄이 이미 담당한다 (rules/platform-credentials.md §1).
   *
   * 용도: "키를 활성화해도 기능이 켜지지 않는다"처럼 화면의 토글만 봐서는 알 수 없는 계약을 알린다.
   */
  notice?: { ko: string; en: string };
  /** 특정 자격증명의 비활성 결과가 공통 문구와 다를 때 사용하는 확인 문구. */
  disableConfirmation?: { ko: string; en: string };
};

export type PlatformCredentialStatusItem = {
  credentialKey: string;
  environment: PlatformCredentialEnvironment;
  activeVersion?: number;
  latestVersion?: number;
  latestStatus?: PlatformCredentialStatus;
  latestVerificationStatus?: PlatformCredentialVerificationStatus;
  configuredFields: string[];
  resetAt?: string;
  updatedAt?: string;
  lastVerifiedAt?: string;
  lastVerificationCode?: string;
  qwenMigrationEligibility?: QwenCredentialMigrationEligibility;
};
