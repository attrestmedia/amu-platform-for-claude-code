import "server-only";

import type { TradingProviderAdapter } from "types/trading/adapter";
import { logger } from "utils/log";

/**
 * @docHint
 * @purpose Private Trade Lab — trading_instruments 동기화 (TL-201)
 * @process 어댑터 listInstruments 호출  provider·symbol upsert  미존재 마켓 비활성화  로그 기록
 * @domain trading
 * @scope private-trade-lab
 *
 * 설계 정본: 통합 보고서 §7.1 · §7.2.
 * 호가 단위·최소 주문금액은 업비트가 예고 없이 바꾸므로 주기적으로 갱신한다.
 * 이 함수는 trade-worker에서 호출하거나 크론 API 라우트로 트리거된다.
 */

const MODEL_NAME = "TradingInstrument";

async function getModel() {
  const { TradingInstrumentSchema } = await import("models/trading");
  const mongoose = await import("mongoose");
  return mongoose.models[MODEL_NAME] ?? mongoose.model(MODEL_NAME, TradingInstrumentSchema);
}

/**
 * listInstruments 결과를 trading_instruments 컬렉션에 upsert한다.
 * - 신규·변경 마켓 → upsert + lastSyncedAt 갱신
 * - 어댑터가 반환하지 않은 기존 마켓 → tradable: false (상장 폐지 등)
 * - CAUTION 종목 → warning: true, tradable: false
 *
 * @returns { inserted, updated, deactivated } — 처리 건수
 */
export async function syncTradingInstruments(
  adapter: TradingProviderAdapter,
): Promise<{ inserted: number; updated: number; deactivated: number }> {
  const instruments = await adapter.listInstruments();
  const Model = await getModel();

  const syncedAt = new Date();
  const syncedSymbols = new Set<string>();
  let inserted = 0;
  let updated = 0;

  for (const inst of instruments) {
    syncedSymbols.add(inst.symbol);

    const doc: Partial<Record<string, unknown>> = {
      provider: inst.provider,
      symbol: inst.symbol,
      baseAsset: inst.baseAsset,
      quoteAsset: inst.quoteAsset,
      quantityScale: inst.quantityScale,
      priceScale: inst.priceScale,
      tickSize: inst.tickSize,
      minOrderAmount: inst.minOrderAmount,
      warning: inst.warning,
      tradable: inst.tradable,
      assetClass: inst.assetClass,
      lastSyncedAt: syncedAt,
    };

    const existing = await Model.findOne({
      provider: inst.provider,
      symbol: inst.symbol,
    }).lean();

    if (!existing) {
      await Model.create(doc);
      inserted++;
    } else {
      await Model.updateOne(
        { provider: inst.provider, symbol: inst.symbol },
        { $set: doc },
      );
      updated++;
    }
  }

  // 어댑터에 없는 기존 마켓은 비활성화
  const deactivateResult = await Model.updateMany(
    { provider: adapter.provider, symbol: { $nin: [...syncedSymbols] }, tradable: true },
    { $set: { tradable: false, lastSyncedAt: syncedAt } },
  );
  const deactivated = deactivateResult.modifiedCount ?? 0;

  logger.info("[syncInstruments] trading_instruments 동기화 완료", {
    provider: adapter.provider,
    inserted,
    updated,
    deactivated,
    total: syncedSymbols.size,
  });

  return { inserted, updated, deactivated };
}
