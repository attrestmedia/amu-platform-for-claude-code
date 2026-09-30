import mongoose, { Schema } from "mongoose";
import type { IUpdateUserData } from "types/user";
import { USER_ROLES, USER_ACCOUNT_TYPE } from "consts/auth";
import { QWEN_MODEL_STUDIO_CONSENT_PURPOSE_IDS, VOICE_DATA_CONSENT_PURPOSE_ID } from "consts/legal/voiceDataConsent";

/**
 * @docHint
 * @purpose MongoDB 스키마 정의
 * @process 주요 필드(uid, userEmail, provider, providerAccountId, uid, linkedAt) 및 인덱스/기본값 선언
 * @domain user
 * @scope db_schema
 */

export type IUserDocument = IUpdateUserData & mongoose.Document;

const WalletPaymentReceiptSchema = new mongoose.Schema(
  {
    operationId: { type: String, required: true },
    orderId: { type: String, required: true },
    purpose: { type: String, enum: ["coin_pack", "subscription"], required: true },
    creditedCoins: { type: Number, min: 1, required: true },
    appliedAt: { type: Date, required: true },
  },
  { _id: false },
);

const WalletUsageReceiptSchema = new mongoose.Schema(
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

const UserSchema: Schema = new mongoose.Schema<IUserDocument>(
  {
    uid: { type: String, required: true, unique: true },
    userEmail: { type: String, required: true, index: true },

    providers: [
      new mongoose.Schema(
        {
          provider: { type: String, required: true }, // 예: "google" | "kakao" | "naver"
          providerAccountId: { type: String, required: true }, // 각 제공자 내 계정 식별자
          uid: { type: String, required: true }, // 해당 소셜 계정 기반 uid (ex. "google:1234")
          linkedAt: { type: Date, default: Date.now },
        },
        { _id: false }
      ),
    ],

    accountStatus: {
      type: String,
      enum: ["active", "deletion_pending", "deleted"],
      default: "active",
      index: true,
    },
    deletionRequestedAt: { type: Date },
    policyConsents: [
      new mongoose.Schema(
        {
          policyId: { type: String, enum: ["terms", "privacy"], required: true },
          version: { type: String, required: true },
          agreedAt: { type: Date, required: true },
          method: {
            type: String,
            enum: [
              "magazine_signup",
              "magazine_social_signup",
              "platform_email_signup",
              "platform_social_signup",
              "policy_reconsent",
            ],
            required: true,
          },
          provider: { type: String },
        },
        { _id: false },
      ),
    ],
    purposeConsents: [
      new mongoose.Schema(
        {
          purposeId: { type: String, enum: [VOICE_DATA_CONSENT_PURPOSE_ID, ...QWEN_MODEL_STUDIO_CONSENT_PURPOSE_IDS], required: true },
          version: { type: String, required: true },
          linkedPrivacyVersion: { type: String },
          agreedAt: { type: Date, required: true },
          method: {
            type: String,
            enum: ["purpose_consent", "purpose_reconsent"],
            required: true,
          },
          revokedAt: { type: Date },
        },
        { _id: false },
      ),
    ],

    loginStats: {
      firstLogin: { type: Date },
      lastLogin: { type: Date },
      lastIp: { type: String },
      lastUserAgent: { type: String },
      lastDevice: { type: String },
      totalLogins: { type: Number, default: 0 },
      consecutiveDays: { type: Number, default: 0 },
      lastLoginDate: { type: Date },
      recentLoginDates: [{ type: Date }], // 최근 30일간의 로그인 날짜
    },

    // 사용자 정보 필드 추가
    userInfo: {
      name: { type: String },
      age: { type: Number },
      birthdate: { type: String },
      gender: { type: String },
      interests: { type: String },
      language: { type: String, enum: ["ko", "en"], default: "ko" },
      profileImageUrl: { type: String, default: "" },
    },

    // 유니버스별 선택 캐릭터 정보
    selectedPersonas: {
      type: Object,
      default: {},
    },

    // 페르소나 정보
    personas: {
      type: Object,
      default: {},
    },

    // 유저 페르소나 정보
    userPersonas: {
      type: Object,
      default: {},
    },

    gameStats: {
      type: Object,
      default: {},
    },

    inventory: {
      type: Object,
      default: {},
    },

    // 지갑/구독 메타
    wallet: {
      bonus: {
        coins: { type: Number, default: 0 }, // 가입 이벤트 등 무상 코인(유상 코인과 분리)
      },
      membership: {
        coins: { type: Number, default: 0 }, // 멤버십 코인 잔액
        expiresAt: { type: Date }, // 소멸 시각(매월 말 or 결제일 + 1개월-1일 23:59:59)
        lastChargedAt: { type: Date }, // 최근 멤버십 충전 시각
        billingMode: { type: String, enum: ["calendar", "anniversary"], default: "anniversary" },
      },
      charged: {
        coins: { type: Number, default: 0 }, // 충전 코인 잔액(소멸 없음)
      },
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

    subscription: {
      active: { type: Boolean, default: false },
      stageCount: { type: Number, default: 1 }, // 구독에 포함된 스테이지 수
      planAmount: { type: Number, default: 0 }, // 월 청구 금액(원)
      currentPeriodStart: { type: Date },
      currentPeriodEnd: { type: Date },
      lastPaidAt: { type: Date },
      cancelAtPeriodEnd: { type: Boolean, default: false },
    },

    lastAccessedUniverse: { type: String, default: "" },

    roles: {
      type: [String],
      enum: Object.values(USER_ROLES),
      default: [USER_ROLES.SUBSCRIBER],
    },

    // 계정 등급 추가
    accountType: {
      type: String,
      enum: Object.values(USER_ACCOUNT_TYPE),
      default: USER_ACCOUNT_TYPE.FREE,
    },

    // NPC 이용 통계 추가
    npcStats: {
      totalInteractions: { type: Number, default: 0 },
      uniqueNpcsInteracted: { type: Number, default: 0 },
      lastInteractedNpcId: { type: String, default: "" },
    },
  },
  {
    timestamps: true, // 생성 및 수정 시간 자동 관리
    strict: false, // 추가 필드 허용
  }
);
UserSchema.index({ userEmail: 1 }, { name: "idx_user_email", background: true });
UserSchema.index({ userEmailLower: 1 }, { unique: true, sparse: true, background: true, name: "uniq_email_lower" });
UserSchema.index(
  { "providers.uid": 1 },
  { unique: true, partialFilterExpression: { "providers.uid": { $exists: true } } }
);

// 이메일 대소문자 불일치 방지용 보조 키
// 빠르고 안전한 매칭을 위해 저장 시 소문자 변환 키를 만들어 둠
UserSchema.add({ userEmailLower: { type: String, index: true } });
type UserDocLike = {
  userEmail?: string;
  userEmailLower?: string;
  accountType?: string;
  wallet?: { bonus?: { coins?: number }; charged?: { coins?: number } };
};
UserSchema.pre("save", function (next) {
  const doc = this as unknown as UserDocLike;
  if (doc.userEmail) {
    doc.userEmailLower = String(doc.userEmail).toLowerCase();
  }
  next();
});
UserSchema.pre("save", function (next) {
  try {
    const doc = this as unknown as UserDocLike;
    // 안전 가드
    const charged = Math.max(0, doc?.wallet?.charged?.coins || 0);
    const curr = doc.accountType;

    // 관리자 부여 등급은 보호
    if (curr === USER_ACCOUNT_TYPE.PREMIUM || curr === USER_ACCOUNT_TYPE.ENTERPRISE) {
      return next();
    }

    const nextType = charged > 0 ? USER_ACCOUNT_TYPE.PRO : USER_ACCOUNT_TYPE.FREE;

    if (curr !== nextType) {
      doc.accountType = nextType;
    }
    next();
  } catch (err) {
    next(err as Error);
  }
});

export { UserSchema };
