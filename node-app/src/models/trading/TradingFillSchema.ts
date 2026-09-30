import { Schema, type Document } from "mongoose";

/**
 * @docHint
 * @purpose Private Trade Lab — trading_fills (체결 내역)
 * @process providerTradeId unique  side/price/volume  stream vs REST 구분
 * @domain trading
 * @scope private-trade-lab
 *
 * 설계 정본: 통합 보고서 §7.2 컬렉션 목록.
 *
 * WebSocket myOrder 이벤트에서 trade_uuid가 있는 경우(trade state) 체결로 기록한다.
 * providerTradeId(trade_uuid)에 unique index를 걸어 중복 체결을 DB 레벨에서 차단한다.
 * 동일한 체결이 스트림과 REST 재조정에서 중복 수신되어도 1건만 남는다.
 */

export interface ITradingFillDocument extends Document {
  provider: "upbit" | "toss_securities";
  /** 업비트 trade_uuid, 토스 체결번호 */
  providerTradeId: string;
  /** 주문의 providerOrderId (uuid) */
  providerOrderId: string;
  /** 클라이언트가 부여한 주문 식별자 */
  clientOrderId: string | null;
  symbol: string;
  side: "buy" | "sell";
  /** 체결 가격 — 문자열 (부동소수 금지) */
  price: string;
  /** 체결 수량 — 문자열 */
  quantity: string;
  /** 체결 금액 = price × quantity — 문자열 */
  funds: string;
  /** 수수료 — 문자열 */
  fee: string;
  /** 메이커/테이커 여부 */
  isMaker: boolean | null;
  /** 체결 시각 (거래소 기준) */
  tradedAt: Date;
  /** 데이터 출처: stream(WebSocket) / rest(REST 재조정) */
  source: "stream" | "rest";
  createdAt: Date;
}

export const TradingFillSchema = new Schema<ITradingFillDocument>(
  {
    provider: { type: String, required: true, enum: ["upbit", "toss_securities"] },
    providerTradeId: { type: String, required: true },
    providerOrderId: { type: String, required: true },
    clientOrderId: { type: String, default: null },
    symbol: { type: String, required: true },
    side: { type: String, required: true, enum: ["buy", "sell"] },
    price: { type: String, required: true },
    quantity: { type: String, required: true },
    funds: { type: String, required: true },
    fee: { type: String, required: true },
    isMaker: { type: Boolean, default: null },
    tradedAt: { type: Date, required: true },
    source: { type: String, required: true, enum: ["stream", "rest"] },
  },
  { timestamps: true },
);

/** providerTradeId는 provider 내에서 유일해야 한다 (중복 체결 방지) */
TradingFillSchema.index({ provider: 1, providerTradeId: 1 }, { unique: true });
/** providerOrderId로 체결 목록 조회가 빈번하다 */
TradingFillSchema.index({ provider: 1, providerOrderId: 1 });
/** symbol + tradedAt 범위로 P&L 집계 */
TradingFillSchema.index({ provider: 1, symbol: 1, tradedAt: 1 });
