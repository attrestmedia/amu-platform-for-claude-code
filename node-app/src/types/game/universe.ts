import type { WalletType } from "../payment";
import type { UnknownRecord } from "utils/common/typeUtils";
import type { IStageDoc, IStageInfo } from "./stage-doc";

export type UniverseType = "game" | "commerce";
export type UniverseBasePath = "play" | "store";

export interface IUniverseRouteConfig {
  preferredBasePath?: UniverseBasePath;
}

export interface ICommerceShowroomConfig {
  enabled?: boolean;
  opensAt?: string;
  closesAt?: string;
}

export interface IUniverseVoiceConfig {
  defaultSttProvider?: "openai" | "google" | "qwen";
  defaultSttModel?: string;
  defaultTtsProvider?: "openai" | "google" | "elevenlabs";
  defaultTtsModel?: string;
  defaultTtsSpeed?: number;
  defaultLocale?: string;
  autoplayAssistant?: boolean;
  voiceSyncDisplay?: boolean;
  maxInputSeconds?: number;
}

export interface IUniverseChatModelPolicy {
  selectionMode?: "free" | "locked";
  defaultProvider?: string;
  defaultModelName?: string;
  allowedModels?: Array<{ provider: string; modelName: string }>;
}

export interface IUniverseSmartStoreConfig {
  storefrontOpen?: boolean;
  updatedAt?: string;
}

export interface IUniverseMarketingAnalyticsConfig {
  measurementId?: string;
  trackingEnabled?: boolean;
  reportingTargets?: IUniverseGaReportingTarget[];
}

export interface IUniverseGaReportingTarget {
  propertyId: string;
  propertyKey: string;
  role: string;
  label: string;
  enabled: boolean;
  primary: boolean;
}

export interface IUniverseMarketingConfig {
  analytics?: IUniverseMarketingAnalyticsConfig;
}

export interface IUniverse {
  id: string; // 유니버스 아이디
  name: string; // 유니버스 이름
  // 유니버스 설명
  description: {
    ko: string;
    en: string;
  };
  logo?: string;
  thumbnail: string;
  type: UniverseType;

  // 스테이지 고정 설정 (무한 스테이지 모드 결정)
  fixed: {
    x: number; // 수평 축 스테이지 수 (0이면 무한)
    y: number; // 수직 축 스테이지 수 (0이면 무한)
  };

  enabled: boolean;
  hideDisplay: boolean;
  order: number;
  npcs?: INpcInfo[];
  stages?: IStageInfo[];
  typeSpecific?: UnknownRecord & {
    routing?: IUniverseRouteConfig;
    showroom?: ICommerceShowroomConfig;
    marketing?: IUniverseMarketingConfig;
  };

  // 커머스 타입일 경우에만 유효한 속성들
  billingOwnerEmail?: string; // 결제·환불 책임자
  commerceAdmins?: string[]; // 커머스 타입 유니버스 관리자 아이디 (이메일)
  wallet?: WalletType;

  personaLimits?: {
    maxTotal?: number; // 전체 생성 가능 페르소나 수
    dailyCreateLimit?: number; // 하루 생성 가능 페르소나 수
  };

  createdAt?: Date;
  updatedAt?: Date;
}

// NPC 정보 인터페이스
export interface INpcInfo {
  pid: string;
  role?: string;
  isDefaultForStage?: boolean;
  profiles?: string[]; // NPC 배경 프로필 이미지 목록
}

// 상품 정보 인터페이스
export interface IProduct {
  id: string;
  title: string;
  image: string;
  imageFit?: "cover" | "contain";
  itemType?: "product" | "service";
  priceType?: "fixed" | "range" | "text";
  price?: number; // fixed(단일가)일 때
  priceMin?: number; // range일 때
  priceMax?: number; // range일 때
  priceText?: string; // text일 때 (예: "협의", "문의")
  summary: string;
  detail?: string;
  specs?: UnknownRecord;
  url?: string;
  category?: string;
  inStock?: boolean;
  order?: number;
}

// 커머스 설정 인터페이스
export interface ICommerceSettings {
  blockSize?: { width?: number | "auto"; height?: number | "auto" };
}

// 게임 설정 인터페이스
export interface IGameSettings {
  mapSize?: { width: number; height: number };
  spawnPoint?: { x: number; y: number };
  obstacles?: UnknownRecord;
  roads?: UnknownRecord;
}

// 스토어 정보/지식 인터페이스
export interface IStoreExternalLink {
  label: string;
  url: string;
}

export interface IStoreKnowledge {
  brand?: {
    headline?: string;
    intro?: string;
    philosophy?: string;
    productCategories?: string[];
    features?: string[];
    externalStores?: IStoreExternalLink[];
  };
  support?: {
    hours?: string;
    outsideHoursMessage?: string;
    consultationTopics?: string[];
    contact?: {
      csPhone?: string;
      csEmail?: string;
      kakao?: string;
    };
  };
  shipping?: {
    courier?: string;
    baseFee?: string;
    freeShippingThreshold?: string;
    cutoffTime?: string;
    averageLeadTime?: string;
    trackingGuide?: string;
    notes?: string[];
  };
  returns?: {
    windowDays?: string;
    customerFee?: string;
    freeCases?: string[];
    customerPaysCases?: string[];
    unavailableCases?: string[];
    processSteps?: string[];
    refundGuide?: string;
  };
  warranty?: {
    summary?: string;
    period?: string;
    exclusions?: string[];
  };
  care?: {
    instructions?: string[];
  };
  faq?: Array<{ q: string; a: string }>;
  updatedAt?: string;
}

export interface IStorefrontContent {
  topNotice?: string;
  hero?: {
    eyebrow?: string;
    title?: string;
    subtitle?: string;
    body?: string;
    primaryCta?: string;
    secondaryCta?: string;
    imageUrl?: string;
  };
  sections?: {
    featuredTitle?: string;
    featuredSubtitle?: string;
    helpEyebrow?: string;
    helpTitle?: string;
    catalogTitle?: string;
    catalogSubtitle?: string;
    searchPlaceholder?: string;
  };
  infoButtons?: {
    shipping?: string;
    returns?: string;
    faq?: string;
    contact?: string;
    care?: string;
  };
  footer?: {
    title?: string;
    body?: string;
    storeGuideButton?: string;
    moreStoresButton?: string;
  };
}

// 메타데이터 인터페이스
export interface IUniverseMetadata {
  brandKnowledgeKey?: string;
  defaultSalesPersonaType?: string;
  chatEnabled?: boolean;
  voiceEnabled?: boolean;
  voiceConfig?: IUniverseVoiceConfig;
  chatModelPolicy?: IUniverseChatModelPolicy;
  multilingualSupport?: boolean;
  storeKnowledge?: IStoreKnowledge;
  storefrontContent?: IStorefrontContent;
  smartStore?: IUniverseSmartStoreConfig;
  customPrompts?: string[];
}

// 유니버스 상세 정보 인터페이스
export interface IUniverseDetail {
  universeId: string;
  products?: IProduct[];
  settings?: {
    commerce?: ICommerceSettings;
    game?: IGameSettings;
  };
  metadata?: IUniverseMetadata;
  createdAt?: Date;
  updatedAt?: Date;
}

// API 응답 타입들
export interface IUniverseResponse {
  success: boolean;
  data: IUniverse[];
  totalCount: number;
}

export interface IUniverseDetailResponse {
  success: boolean;
  data: IUniverseDetail;
}

export interface IStageDefinitionResponse {
  success: boolean;
  data: IStageDoc;
  message?: string;
}

// 캐릭터 해석 결과 인터페이스
export interface IResolvedCharacters {
  userCharacter?: {
    pid: string;
    sourcePath: string;
  };
  npcCharacters: Array<{
    pid: string;
    role: string;
    sourcePath: string;
    isDefault: boolean;
  }>;
}

// 스테이지 에셋 검증 결과
export interface IStageAssetValidation {
  validAssets: string[];
  invalidAssets: string[];
}

// 스테이지 에셋 프리로드 결과
export interface IStageAssetPreload {
  loaded: string[];
  failed: string[];
}
