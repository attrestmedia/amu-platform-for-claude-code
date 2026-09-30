import { Schema, type Document } from "mongoose";
import type { TradingAssetClass, TradingProvider } from "types/trading/adapter";
import type { PlatformCredentialKey } from "consts/secure/platformCredentials";

/**
 * @docHint
 * @purpose Private Trade Lab — trading_connections (거래소 연결 상태 + 키 만료 감시)
 * @process provider별 연결 상태  credentialRef  keyExpiresAt  invalidReason
 * @domain trading
 * @scope private-trade-lab
 *
 * 설계 정본: 통합 보고서 §7.2 컬렉션 목록 · §4.2 · HR2.
 *
 * ownerUserId는 1개로 고정한다(HR3 — 다중 계정 기능을 만들지 않는다).
 * status가 invalid면 auto(무인) 실행에 올릴 수 없다. invalidReason으로
 * WITHDRAWAL_PERMISSION(출금 권한 보유)·KEY_EXPIRED·KEY_EXPIRING_SOON·KEY_STATUS_UNVERIFIED를 구분한다.
 */

export const TRADING_CONNECTION_STATUSES = ["active", "invalid"] as const;
export type TradingConnectionStatus = (typeof TRADING_CONNECTION_STATUSES)[number];

export interface ITradingConnectionDocument extends Document {
  ownerUserId: string;
  provider: TradingProvider;
  assetClass: TradingAssetClass;
  /** 자격증명 원문은 platform_credentials(SecureVault 암호화)에 있고 여기는 참조만 */
  credentialRef: PlatformCredentialKey;
  status: TradingConnectionStatus;
  invalidReason?: string;
  /** 업비트 키 만료일(KST). getKeyStatus()로 주기 갱신 */
  keyExpiresAt?: Date;
  /** 키 상태(만료·권한)를 마지막으로 확인한 시각 */
  lastKeyStatusCheckedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export const TradingConnectionSchema = new Schema<ITradingConnectionDocument>(
  {
    ownerUserId: { type: String, required: true, index: true },
    provider: { type: String, required: true, enum: ["toss_securities", "upbit"] },
    assetClass: { type: String, required: true, enum: ["equity", "crypto"] },
    credentialRef: { type: String, required: true },
    status: { type: String, required: true, enum: TRADING_CONNECTION_STATUSES, default: "active", index: true },
    invalidReason: { type: String, default: "" },
    keyExpiresAt: { type: Date, default: undefined },
    lastKeyStatusCheckedAt: { type: Date, default: undefined },
  },
  { timestamps: true },
);

/** provider×assetClass당 연결은 하나(다중 계정 미지원, HR3) */
TradingConnectionSchema.index({ provider: 1, assetClass: 1 }, { unique: true });
