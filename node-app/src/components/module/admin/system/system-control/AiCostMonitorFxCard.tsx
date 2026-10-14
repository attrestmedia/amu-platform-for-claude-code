/**
 * @docHint
 * @purpose 비용 모니터의 승인 환율과 읽기 전용 Frankfurter 관측을 비교해 표시한다
 * @process 기준·관측 metadata와 각 환율에서 계산한 마진을 읽기 전용 카드로 렌더링한다
 * @domain admin-system
 * @scope component
 */

import { Lang, lang } from "components/module/i18n";
import type { AiCostMonitorFx, AiCostMonitorMargin } from "types/ai";

const numberFormatter = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 });
const percentFormatter = new Intl.NumberFormat("en-US", { style: "percent", maximumFractionDigits: 2 });
const dateFormatter = new Intl.DateTimeFormat("ko-KR", { dateStyle: "medium", timeStyle: "short" });

function formatNumber(value: number | null) {
  return value === null ? "—" : numberFormatter.format(value);
}

function formatPercent(value: number | null) {
  if (value === null) return "—";
  return `${value > 0 ? "+" : ""}${percentFormatter.format(value)}`;
}

function formatDate(value: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : dateFormatter.format(date);
}

function unavailableReason(reason: string) {
  const messages: Record<string, { ko: string; en: string }> = {
    FX_TIMEOUT: { ko: "환율 조회 시간이 초과됐습니다.", en: "The FX request timed out." },
    FX_HTTP_ERROR: { ko: "환율 제공처가 요청을 처리하지 못했습니다.", en: "The FX source returned an HTTP error." },
    FX_INVALID_RESPONSE: { ko: "환율 제공처의 응답을 확인할 수 없습니다.", en: "The FX source returned an invalid response." },
    FX_NETWORK_ERROR: { ko: "네트워크 연결을 확인할 수 없습니다.", en: "The FX source could not be reached." },
  };
  return messages[reason] || messages.FX_NETWORK_ERROR;
}

function MarginValue({ label, margin }: { label: { ko: string; en: string }; margin: AiCostMonitorMargin }) {
  const detail = margin.status === "unavailable"
    ? { ko: "확인된 정산 자료가 부족합니다.", en: "Covered settlement data is unavailable." }
    : margin.status === "partial"
      ? { ko: "확인된 정산분 기준", en: "Based on covered settlements" }
      : { ko: "확인된 정산 기준", en: "Based on covered settlements" };

  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted-foreground"><Lang text={label} /></dt>
      <dd className="mt-1 break-words text-lg font-semibold tabular-nums">{formatPercent(margin.marginRate)}</dd>
      <dd className="mt-0.5 break-words text-xs text-muted-foreground"><Lang text={detail} /></dd>
    </div>
  );
}

export function AiCostMonitorFxCard({
  fx,
  baselineMargin,
}: {
  fx: AiCostMonitorFx;
  baselineMargin: AiCostMonitorMargin;
}) {
  const observed = fx.observed;
  const observedUnavailable = observed.status === "unavailable";

  return (
    <section className="min-w-0 rounded-lg border border-border bg-background p-4" aria-labelledby="cost-monitor-fx-title">
      <div className="min-w-0">
        <h3 id="cost-monitor-fx-title" className="text-sm font-semibold">
          <Lang text={{ ko: "환율 참고 정보", en: "FX reference" }} />
        </h3>
        <p className="mt-1 break-words text-xs text-muted-foreground">
          <Lang text={{ ko: "환율 관측은 표시와 참고 마진 계산에만 사용합니다.", en: "The observation is shown for reference and margin comparison only." }} />
        </p>
      </div>

      <dl className="mt-4 grid min-w-0 grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2">
        <div className="min-w-0">
          <dt className="text-xs text-muted-foreground"><Lang text={{ ko: "승인 기준 환율", en: "Approved baseline rate" }} /></dt>
          <dd className="mt-1 break-words text-lg font-semibold tabular-nums">
            {formatNumber(fx.baseline.value)} <span className="text-sm font-normal">KRW / USD</span>
          </dd>
          <dd className="mt-0.5 break-words text-xs text-muted-foreground">
            {fx.baseline.reviewedAt || "—"} · {fx.baseline.source || lang({ ko: "출처 미기록", en: "Source not recorded" })}
            {fx.baseline.provisional ? ` · ${lang({ ko: "환율 잠정값", en: "Provisional FX rate" })}` : ""}
          </dd>
        </div>

        <div className="min-w-0">
          <dt className="text-xs text-muted-foreground"><Lang text={{ ko: "최신 관측 환율", en: "Latest observed rate" }} /></dt>
          {observedUnavailable ? (
            <>
              <dd className="mt-1 break-words text-sm" role="status" aria-live="polite">
                <Lang text={unavailableReason(observed.reason)} />
              </dd>
              <dd className="mt-0.5 break-words text-xs text-muted-foreground">
                {formatDate(observed.fetchedAt)} · {lang({ ko: "Frankfurter v2 혼합 참고 환율", en: "Frankfurter v2 blended reference rate" })}
              </dd>
            </>
          ) : (
            <>
              <dd className="mt-1 break-words text-lg font-semibold tabular-nums">
                {formatNumber(observed.rate)} <span className="text-sm font-normal">KRW / USD</span>
              </dd>
              <dd className="mt-0.5 break-words text-xs text-muted-foreground">
                {observed.rateDate} · {formatDate(observed.fetchedAt)} · {lang({ ko: "Frankfurter v2 혼합 참고 환율", en: "Frankfurter v2 blended reference rate" })}
              </dd>
            </>
          )}
        </div>
      </dl>

      <dl className="mt-4 grid min-w-0 grid-cols-1 gap-x-6 gap-y-4 border-t border-border pt-3 sm:grid-cols-3">
        <div className="min-w-0">
          <dt className="text-xs text-muted-foreground"><Lang text={{ ko: "기준 대비 차이", en: "Change from baseline" }} /></dt>
          <dd className="mt-1 break-words text-lg font-semibold tabular-nums">{formatPercent(fx.deltaRatio)}</dd>
        </div>
        <MarginValue label={{ ko: "기준 환율 마진", en: "Margin at baseline" }} margin={baselineMargin} />
        <MarginValue label={{ ko: "관측 환율 마진", en: "Margin at observation" }} margin={fx.marginAtObserved} />
      </dl>

      <p className="mt-4 break-words border-t border-border pt-3 text-xs text-muted-foreground">
        <Lang text={{ ko: "판매가는 승인된 manifest 변경으로만 바뀝니다.", en: "Selling prices change only through an approved manifest update." }} />
      </p>
    </section>
  );
}
