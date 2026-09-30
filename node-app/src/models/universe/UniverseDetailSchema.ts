import { Schema, type Document } from "mongoose";
import type { IUniverseDetail } from "types/game";

type ProductDocLike = { priceType?: string };

/**
 * @docHint
 * @purpose MongoDB 스키마 정의
 * @process 주요 필드(id, title, image, imageFit, itemType, priceType) 및 인덱스/기본값 선언
 * @domain universe
 * @scope db_schema
 */

// 상품 정보 스키마
const ProductSchema = new Schema(
  {
    id: { type: String, required: true },
    title: { type: String, required: true },
    image: { type: String, required: true },
    imageFit: { type: String, enum: ["cover", "contain"], default: "contain" },
    itemType: { type: String, enum: ["product", "service"], default: "product", index: true },
    priceType: { type: String, enum: ["fixed", "range", "text"], default: "fixed" },
    price: {
      type: Number,
      required: function (this: ProductDocLike) {
        // priceType이 fixed일 때만 필수
        return this.priceType === "fixed";
      },
    },
    priceMin: { type: Number }, // range
    priceMax: { type: Number }, // range
    priceText: { type: String, default: "" }, // text
    summary: { type: String, required: true },
    detail: { type: String, default: "" },
    specs: { type: Schema.Types.Mixed, default: {} }, // 제품 스펙
    url: { type: String }, // 외부 링크 (선택사항)
    category: { type: String }, // 카테고리
    inStock: { type: Boolean, default: true }, // 재고 상태
    order: { type: Number, default: 0, index: true }, // 상품 배치 순서
  },
  { _id: false }
);

// 커머스 설정 스키마
const CommerceSettingsSchema = new Schema(
  {
    blockSize: {
      width: { type: Number, default: 80 },
      height: { type: Number, default: 80 },
    },
  },
  { _id: false }
);

// 게임 설정 스키마
const GameSettingsSchema = new Schema(
  {
    mapSize: {
      width: { type: Number, default: 1600 },
      height: { type: Number, default: 1200 },
    },
    spawnPoint: {
      x: { type: Number, default: 100 },
      y: { type: Number, default: 100 },
    },
    obstacles: { type: Schema.Types.Mixed, default: {} },
    roads: { type: Schema.Types.Mixed, default: {} },
  },
  { _id: false }
);

// FAQ 서브 스키마
const StoreFaqSchema = new Schema(
  {
    q: { type: String, required: true },
    a: { type: String, required: true },
  },
  { _id: false }
);

const StoreExternalLinkSchema = new Schema(
  {
    label: { type: String, default: "" },
    url: { type: String, default: "" },
  },
  { _id: false }
);

// StoreKnowledge 스키마
const StoreKnowledgeSchema = new Schema(
  {
    brand: {
      headline: { type: String, default: "" },
      intro: { type: String, default: "" },
      philosophy: { type: String, default: "" },
      productCategories: { type: [String], default: [] },
      features: { type: [String], default: [] },
      externalStores: { type: [StoreExternalLinkSchema], default: [] },
    },
    support: {
      hours: { type: String, default: "" },
      outsideHoursMessage: { type: String, default: "" },
      consultationTopics: { type: [String], default: [] },
      contact: {
        csPhone: { type: String, default: "" },
        csEmail: { type: String, default: "" },
        kakao: { type: String, default: "" },
      },
    },
    shipping: {
      courier: { type: String, default: "" },
      baseFee: { type: String, default: "" },
      freeShippingThreshold: { type: String, default: "" },
      cutoffTime: { type: String, default: "" },
      averageLeadTime: { type: String, default: "" },
      trackingGuide: { type: String, default: "" },
      notes: { type: [String], default: [] },
    },
    returns: {
      windowDays: { type: String, default: "" },
      customerFee: { type: String, default: "" },
      freeCases: { type: [String], default: [] },
      customerPaysCases: { type: [String], default: [] },
      unavailableCases: { type: [String], default: [] },
      processSteps: { type: [String], default: [] },
      refundGuide: { type: String, default: "" },
    },
    warranty: {
      summary: { type: String, default: "" },
      period: { type: String, default: "" },
      exclusions: { type: [String], default: [] },
    },
    care: {
      instructions: { type: [String], default: [] },
    },
    faq: { type: [StoreFaqSchema], default: [] },
    updatedAt: { type: String }, // ISO 문자열 저장
  },
  { _id: false }
);

const StorefrontContentSchema = new Schema(
  {
    topNotice: { type: String, default: "" },
    hero: {
      eyebrow: { type: String, default: "" },
      title: { type: String, default: "" },
      subtitle: { type: String, default: "" },
      body: { type: String, default: "" },
      primaryCta: { type: String, default: "" },
      secondaryCta: { type: String, default: "" },
      imageUrl: { type: String, default: "" },
    },
    sections: {
      featuredTitle: { type: String, default: "" },
      featuredSubtitle: { type: String, default: "" },
      helpEyebrow: { type: String, default: "" },
      helpTitle: { type: String, default: "" },
      catalogTitle: { type: String, default: "" },
      catalogSubtitle: { type: String, default: "" },
      searchPlaceholder: { type: String, default: "" },
    },
    infoButtons: {
      shipping: { type: String, default: "" },
      returns: { type: String, default: "" },
      faq: { type: String, default: "" },
      contact: { type: String, default: "" },
      care: { type: String, default: "" },
    },
    footer: {
      title: { type: String, default: "" },
      body: { type: String, default: "" },
      storeGuideButton: { type: String, default: "" },
      moreStoresButton: { type: String, default: "" },
    },
  },
  { _id: false }
);

const VoiceConfigSchema = new Schema(
  {
    defaultSttProvider: { type: String, enum: ["openai", "google", "qwen"] },
    defaultSttModel: { type: String },
    defaultTtsProvider: { type: String, enum: ["openai", "google", "elevenlabs"] },
    defaultTtsModel: { type: String },
    defaultTtsSpeed: { type: Number, min: 0.25, max: 4, default: 1.2 },
    defaultLocale: { type: String },
    autoplayAssistant: { type: Boolean, default: true },
    voiceSyncDisplay: { type: Boolean, default: true },
    maxInputSeconds: { type: Number, default: 60 },
  },
  { _id: false }
);

const ChatModelPolicySchema = new Schema(
  {
    selectionMode: { type: String, enum: ["free", "locked"], default: "free" },
    defaultProvider: { type: String },
    defaultModelName: { type: String },
    allowedModels: {
      type: [
        new Schema(
          {
            provider: { type: String, required: true },
            modelName: { type: String, required: true },
          },
          { _id: false },
        ),
      ],
      default: [],
    },
  },
  { _id: false },
);

const SmartStoreConfigSchema = new Schema(
  {
    storefrontOpen: { type: Boolean, default: false },
    updatedAt: { type: String, default: "" },
  },
  { _id: false }
);

// 메타데이터 스키마
const MetadataSchema = new Schema(
  {
    brandKnowledgeKey: { type: String }, // promptStore에서 사용할 브랜드 지식 키
    defaultSalesPersonaType: {
      type: String,
      enum: [
        "SAVVY_SALESPERSON",
        "PERSUASIVE_SALESMAN",
        "STRATEGIC_MARKETER",
        "CUSTOMER_SUPPORT_SPECIALIST",
        "HOMESHOPPING_HOST",
      ],
      default: "SAVVY_SALESPERSON",
    },
    chatEnabled: { type: Boolean, default: true },
    voiceEnabled: { type: Boolean, default: false },
    voiceConfig: { type: VoiceConfigSchema, default: undefined },
    chatModelPolicy: { type: ChatModelPolicySchema, default: undefined },
    multilingualSupport: { type: Boolean, default: true },
    customPrompts: { type: [String], default: [] }, // 커스텀 프롬프트들
    storeKnowledge: { type: StoreKnowledgeSchema, default: undefined }, // 상점 지식 정보
    storefrontContent: { type: StorefrontContentSchema, default: undefined }, // 공개 스토어 화면 카피
    smartStore: { type: SmartStoreConfigSchema, default: undefined }, // 스마트스토어 공개 설정
  },
  { _id: false }
);

// 유니버스별 상세 데이터 인터페이스 (IUniverseDetail 재사용)
// IUniverseDetail 인터페이스를 확장하여 중복 제거 및 타입 일관성 확보
export interface IUniverseDetailDocument extends Document, IUniverseDetail {
  // IUniverseDetail이 이미 모든 필요한 필드를 포함하므로 추가 정의 불필요
  // createdAt, updatedAt은 timestamps: true 옵션으로 자동 생성
}

// 유니버스별 상세 데이터 스키마
export const UniverseDetailSchema = new Schema<IUniverseDetailDocument>(
  {
    universeId: {
      type: String,
      required: true,
    },
    products: {
      type: [ProductSchema],
      default: [],
    },
    settings: {
      commerce: CommerceSettingsSchema,
      game: GameSettingsSchema,
    },
    metadata: {
      type: MetadataSchema,
      default: () => ({}),
    },
  },
  {
    timestamps: true,
    // 동적 컬렉션 이름은 database/universeDetail.ts에서 처리
  }
);

// 유니버스 ID 인덱스
UniverseDetailSchema.index({ universeId: 1 }, { unique: true });
