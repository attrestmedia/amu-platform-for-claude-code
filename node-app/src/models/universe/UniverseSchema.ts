import { Schema, type Document, type Query, type Model, type UpdateQuery } from "mongoose";
import type { IUniverse } from "types/game";
import type { UnknownRecord } from "utils/common/typeUtils";

type UniverseValidatorContext = {
  getUpdate?: () => UpdateQuery<IUniverseDocument> | null;
  get?: (path: string) => unknown;
};

type ValidatorErrorProps = { value: unknown; path: string };

/**
 * @docHint
 * @purpose MongoDB 스키마 정의
 * @process 주요 필드(ko, en, maxTotal, dailyCreateLimit, pid, role) 및 인덱스/기본값 선언
 * @domain universe
 * @scope db_schema
 */

// 다국어 설명 스키마
const UniverseDescriptionSchema = new Schema(
  {
    ko: { type: String, required: true },
    en: { type: String, required: true },
  },
  { _id: false } // 서브도큐먼트에 별도 ID 생성 안함
);

// 페르소나 생성 제한 스키마
const PersonaLimitSchema = new Schema(
  {
    maxTotal: { type: Number, min: 0 },
    dailyCreateLimit: { type: Number, min: 0 },
  },
  { _id: false }
);

// NPC 정보 스키마
const NpcInfoSchema = new Schema(
  {
    pid: { type: String, required: true }, // 페르소나 ID
    role: { type: String, required: false }, // 역할 (예: "sales_master", "guide")
    isDefaultForStage: { type: Boolean, default: false }, // 스테이지 기본 NPC 여부
    profiles: { type: [String], default: [] },
  },
  { _id: false }
);

// 스테이지 정보 스키마
const StageInfoSchema = new Schema(
  {
    stageId: { type: String, required: true },
    stageName: { type: String, required: true },
    isDefault: { type: Boolean, default: false },
    mode: { type: String },
    layoutVersion: { type: String },
    usageType: {
      type: String,
      enum: ["game", "commerce", "both"],
    },
  },
  { _id: false }
);

// 스테이지 고정 설정 스키마
const FixedStageSchema = new Schema(
  {
    x: { type: Number, default: 0 }, // 수평 축 스테이지 수 (0이면 무한)
    y: { type: Number, default: 0 }, // 수직 축 스테이지 수 (0이면 무한)
  },
  { _id: false }
);

// 유니버스 월렛 스키라
const WalletMembershipSchema = new Schema(
  {
    coins: { type: Number, default: 0, min: 0 },
    expiresAt: { type: Date },
    lastChargedAt: { type: Date },
    billingMode: { type: String, enum: ["calendar", "anniversary"], default: "anniversary" },
    renewableAt: { type: Date },
    expiryNoticeSentAt: { type: Date },
    pendingRenewal: {
      type: new Schema(
        {
          orderId: { type: String, required: true },
          coins: { type: Number, required: true, min: 0 },
          startsAt: { type: Date, required: true },
          expiresAt: { type: Date, required: true },
          renewableAt: { type: Date, required: true },
        },
        { _id: false },
      ),
      default: undefined,
    },
  },
  { _id: false }
);

const WalletChargedSchema = new Schema(
  {
    coins: { type: Number, default: 0, min: 0 },
  },
  { _id: false }
);

const WalletPaymentReceiptSchema = new Schema(
  {
    operationId: { type: String, required: true },
    orderId: { type: String, required: true },
    purpose: { type: String, enum: ["coin_pack", "subscription"], required: true },
    creditedCoins: { type: Number, min: 1, required: true },
    appliedAt: { type: Date, required: true },
  },
  { _id: false },
);

const WalletUsageReceiptSchema = new Schema(
  {
    operationId: { type: String, required: true },
    sourceOperationId: { type: String },
    kind: { type: String, enum: ["deduction", "compensation"], required: true },
    coins: { type: Number, min: 1, required: true },
    walletDebit: {
      bonusCoins: { type: Number, min: 0, default: 0 },
      membershipCoins: { type: Number, min: 0, default: 0 },
      chargedCoins: { type: Number, min: 0, default: 0 },
    },
    appliedAt: { type: Date, required: true },
  },
  { _id: false },
);

const WalletSchema = new Schema(
  {
    membership: { type: WalletMembershipSchema, default: () => ({ coins: 0 }) },
    charged: { type: WalletChargedSchema, default: () => ({ coins: 0 }) },
    accessState: { type: String, enum: ["active", "suspended", "closed"], default: "suspended" },
    lastQualifyingActivityAt: { type: Date },
    closedAt: { type: Date },
    closureNoticeSentAt: { type: Date },
    closureCompletedNoticeSentAt: { type: Date },
    paymentReceipts: {
      type: [WalletPaymentReceiptSchema],
      default: [],
      validate: {
        validator: (rows: unknown[]) => rows.length <= 512,
        message: "wallet payment receipt capacity exceeded",
      },
    },
    refundReceipts: {
      type: [WalletPaymentReceiptSchema],
      default: [],
      validate: {
        validator: (rows: unknown[]) => rows.length <= 512,
        message: "wallet refund receipt capacity exceeded",
      },
    },
    usageReceipts: {
      type: [WalletUsageReceiptSchema],
      default: [],
      validate: {
        validator: (rows: unknown[]) => rows.length <= 512,
        message: "wallet usage receipt capacity exceeded",
      },
    },
  },
  { _id: false }
);

// 유니버스 인터페이스 (Mongoose Document 확장)
export interface IUniverseDocument extends Document, Omit<IUniverse, "id"> {
  // Document는 이미 _id를 가지고 있으므로 id를 제외하고 IUniverse 상속
  id: string; // 명시적으로 id 필드 정의 (커스텀 ID 사용)
}

// 유니버스 스키마 정의
export const UniverseSchema = new Schema<IUniverseDocument>(
  {
    id: {
      type: String,
      required: true,
    },
    name: {
      type: String,
      required: true,
    },
    description: {
      type: UniverseDescriptionSchema,
      required: true,
    },
    logo: { type: String, default: "" },
    thumbnail: {
      type: String,
      required: true,
    },
    type: {
      type: String,
      enum: ["game", "commerce"],
      required: true,
      default: "game",
    },
    fixed: {
      type: FixedStageSchema,
      default: () => ({ x: 0, y: 0 }), // 기본값은 무한 스테이지
    },
    enabled: {
      type: Boolean,
      default: true,
      index: true,
    },
    hideDisplay: {
      type: Boolean,
      default: false,
      index: true, // 홈 목록 필터링 빈도 고려
    },
    order: {
      type: Number,
      default: 0,
      index: true,
    },
    npcs: {
      type: [NpcInfoSchema],
      default: [],
    },
    stages: {
      type: [StageInfoSchema],
      default: [],
    },
    typeSpecific: {
      type: Schema.Types.Mixed,
      default: {},
    },
    commerceAdmins: {
      type: [String],
      default: [],
      validate: {
        validator: function (this: UniverseValidatorContext, admins: unknown) {
          // 1) 타입 가드
          if (admins == null) return true;
          if (!Array.isArray(admins)) return false;
          if (admins.length === 0) return true;

          // 2) 업데이트/도큐먼트 컨텍스트별 type 추론
          let docType: string | undefined;

          // update(query) 컨텍스트: this.getUpdate()에서 $set.type 우선 사용
          if (typeof this?.getUpdate === "function") {
            const u = (this.getUpdate() || {}) as UnknownRecord;
            const set = ((u.$set as UnknownRecord | undefined) ?? u) as UnknownRecord;
            docType = typeof set.type === "string" ? (set.type as string) : undefined;
          }

          // document 컨텍스트: this.get("type")
          if (!docType && typeof this?.get === "function") {
            const t = this.get("type");
            if (typeof t === "string") docType = t;
          }

          // 3) type이 'game'으로 명확할 때만 차단
          if (docType === "game") {
            return admins.length === 0;
          }

          // 4) 이메일 형식 검증
          const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
          return (admins as string[]).every((email) => typeof email === "string" && re.test(email.trim()));
        },
        message: function (this: UniverseValidatorContext, props: ValidatorErrorProps) {
          let docType: string | undefined;
          if (typeof this?.getUpdate === "function") {
            const u = (this.getUpdate() || {}) as UnknownRecord;
            const set = ((u.$set as UnknownRecord | undefined) ?? u) as UnknownRecord;
            docType = typeof set.type === "string" ? (set.type as string) : undefined;
          }
          if (!docType && typeof this?.get === "function") {
            const t = this.get("type");
            if (typeof t === "string") docType = t;
          }
          if (docType === "game" && Array.isArray(props.value) && (props.value as unknown[]).length > 0) {
            return "commerceAdmins: 게임 타입 유니버스는 관리자를 지정할 수 없습니다.";
          }
          return "commerceAdmins: 유효하지 않은 이메일 형식이 포함되어 있습니다. 각 이메일은 'user@example.com' 형식이어야 합니다.";
        },
      },
    },
    billingOwnerEmail: {
      type: String,
      trim: true,
      lowercase: true,
      validate: {
        validator: (value: unknown) => value == null || value === "" || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value)),
        message: "billingOwnerEmail: 유효한 이메일 형식이어야 합니다.",
      },
    },
    wallet: {
      type: WalletSchema,
      default: undefined,
    },
    personaLimits: {
      type: PersonaLimitSchema,
      default: undefined,
    },
  },
  {
    timestamps: true,
    collection: "universes",
  }
);

// 인덱스 설정
UniverseSchema.index({ enabled: 1, order: 1 });
UniverseSchema.index({ id: 1 }, { unique: true });
UniverseSchema.index({ type: 1 }); // 타입별 조회 최적화
UniverseSchema.index({ "stages.stageId": 1, "stages.stageName": 1 });
UniverseSchema.index({ type: 1, "wallet.membership.coins": -1 });
UniverseSchema.index({ type: 1, "wallet.charged.coins": -1 });
UniverseSchema.index({ type: 1, billingOwnerEmail: 1 });

// 업데이트 전 교차 필드 정리
UniverseSchema.pre("findOneAndUpdate", async function (
  this: Query<unknown, IUniverseDocument> & { model: Model<IUniverseDocument> },
  next,
) {
  try {
    const u = (this.getUpdate() || {}) as UnknownRecord;
    const set = ((u.$set as UnknownRecord | undefined) ?? u) as UnknownRecord;

    // id 업데이트는 절대 허용금지(충돌 및 키 변경 방지)
    if (set && "id" in set) {
      delete set.id;
    }
    if (u.$set && typeof u.$set === "object" && u.$set !== null && "id" in (u.$set as UnknownRecord)) {
      delete (u.$set as UnknownRecord).id;
    }

    // commerceAdmins 정규화
    if (Array.isArray(set.commerceAdmins)) {
      set.commerceAdmins = (set.commerceAdmins as unknown[])
        .filter((e): e is string => typeof e === "string")
        .map((e) => e.trim())
        .filter(Boolean);
    }
    if (typeof set.billingOwnerEmail === "string") {
      set.billingOwnerEmail = set.billingOwnerEmail.trim().toLowerCase();
    }

    // type 추론 및 game 타입 보호 로직
    let docType: string | undefined = typeof set.type === "string" ? (set.type as string) : undefined;
    if (!docType) {
      const q = this.getQuery() || {};
      const cur = await this.model.findOne(q).select("type").lean<{ type?: string }>();
      docType = cur?.type;
    }
    if (docType === "game") {
      if (Array.isArray(set.commerceAdmins) && (set.commerceAdmins as unknown[]).length > 0) {
        set.commerceAdmins = [];
      }
      if (set.wallet) {
        set.wallet = undefined;
      }
      if (set.billingOwnerEmail) {
        set.billingOwnerEmail = undefined;
      }
    }

    // 업데이트 객체 재설정
    if (u.$set) {
      u.$set = set;
      this.setUpdate(u as UpdateQuery<IUniverseDocument>); // $setOnInsert 등 기존 연산자 유지
    } else {
      this.setUpdate({ $set: set } as UpdateQuery<IUniverseDocument>); // $set만 없던 경우에 한해 생성
    }

    next();
  } catch (err) {
    next(err as Error);
  }
});
