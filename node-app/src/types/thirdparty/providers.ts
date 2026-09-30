// provider 추가 시 `credentials.ts -> getCredentialStatus()`에도 반영
export type MarketingCredentialProviderType =
  | "instagram"
  | "linkedin"
  | "naver_blog"
  | "naver_ads"
  | "google_ads"
  | "google_analytics"
  | "naver_datalab"
  | "slack"
  | "email"
  | "agent";

export type CredentialProviderType =
  | "naver"
  | "gitlab"
  | "threads"
  | MarketingCredentialProviderType;

export const MarketingCredentialProviderEnums: MarketingCredentialProviderType[] = [
  "instagram",
  "linkedin",
  "naver_blog",
  "naver_ads",
  "google_ads",
  "google_analytics",
  "naver_datalab",
  "slack",
  "email",
  "agent",
];

export const CredentialProviderEnums: CredentialProviderType[] = [
  "naver",
  "gitlab",
  "threads",
  ...MarketingCredentialProviderEnums,
];
