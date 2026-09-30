"use client";

import { useCallback, useState } from "react";
import { Database, RefreshCw } from "lucide-react";
import { Badge, Button, Input, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@amu-labs/ui";
import { Lang, lang } from "components/module/i18n";
import fetchClient from "libs/api/fetchClient";
import { toErrorLike, toSafeString, toUnknownRecord, type UnknownRecord } from "utils/common/typeUtils";
import { toast } from "sonner";
import { REVIEW_PANEL_CARD_CLASS } from "./MarketingOpsConstants";

const API = "/marketing/analytics/ga";
const VIEW_OPTIONS = [
  { value: "channel_contribution", ko: "채널 기여", en: "Channel contribution" },
  { value: "template_funnel", ko: "템플릿 퍼널", en: "Template funnel" },
  { value: "page_traffic", ko: "페이지 트래픽", en: "Page traffic" },
  { value: "promo_performance", ko: "프로모션 슬롯", en: "Promo slots" },
];

function metricText(metrics: unknown) {
  return Object.entries(toUnknownRecord(metrics))
    .filter(([, value]) => typeof value === "number" || typeof value === "string")
    .slice(0, 6)
    .map(([key, value]) => `${key} ${Number.isFinite(Number(value)) ? Number(value).toLocaleString("ko-KR", { maximumFractionDigits: 2 }) : value}`)
    .join(" · ");
}

function extractFailure(error: unknown) {
  const responseData = toUnknownRecord(toUnknownRecord(toErrorLike(error).response).data);
  const data = toUnknownRecord(responseData.data);
  return {
    code: toSafeString(responseData.error || data.error) || "ga_request_failed",
    data,
  };
}

export function GaPerformancePanel({ universeId }: { universeId: string }) {
  const [view, setView] = useState("channel_contribution");
  const [days, setDays] = useState("28");
  const [propertyId, setPropertyId] = useState("");
  const [loading, setLoading] = useState(false);
  const [collecting, setCollecting] = useState(false);
  const [data, setData] = useState<UnknownRecord | null>(null);
  const [collectResult, setCollectResult] = useState<UnknownRecord | null>(null);
  const [errorCode, setErrorCode] = useState("");

  const load = useCallback(async () => {
    if (!universeId) return;
    try {
      setLoading(true);
      setErrorCode("");
      const response = await fetchClient.get(API, {
        params: { action: "performance", universeId, view, days: Number(days), propertyId },
      });
      setData(toUnknownRecord(response.data?.data));
    } catch (error) {
      const failure = extractFailure(error);
      setErrorCode(failure.code);
      toast.error(lang({ ko: "저장된 GA4 성과 조회에 실패했습니다.", en: "Failed to load stored GA4 performance." }));
    } finally {
      setLoading(false);
    }
  }, [days, propertyId, universeId, view]);

  const collect = async (dryRun: boolean) => {
    if (!universeId) return;
    try {
      setCollecting(true);
      setErrorCode("");
      const response = await fetchClient.post(API, {
        action: "collect",
        universeId,
        dryRun,
        propertyId: propertyId || undefined,
        ...(dryRun ? { reportKey: "page_traffic" } : {}),
      });
      const result = toUnknownRecord(response.data?.data);
      setCollectResult(result);
      const results = Array.isArray(result.results) ? result.results.map(toUnknownRecord) : [];
      const skippedCount = results.filter((item) => item.skipped === true).length;
      if (skippedCount > 0) {
        toast.warning(
          lang({
            ko: `기본 GA4 성과 수집 완료 · 선택 리포트 ${skippedCount}건 건너뜀`,
            en: `Core GA4 collection completed · ${skippedCount} optional report(s) skipped`,
          }),
        );
      } else {
        toast.success(
          dryRun
            ? lang({ ko: "GA4 읽기 연결 테스트가 완료되었습니다.", en: "GA4 read-only connection test completed." })
            : lang({ ko: "GA4 성과 스냅샷을 수집했습니다.", en: "GA4 performance snapshots collected." }),
        );
      }
      if (!dryRun) await load();
    } catch (error) {
      const failure = extractFailure(error);
      setErrorCode(failure.code);
      setCollectResult(failure.data);
      toast.error(`${lang({ ko: "GA4 수집 실패", en: "GA4 collection failed" })}: ${failure.code}`);
    } finally {
      setCollecting(false);
    }
  };

  const items = Array.isArray(data?.items) ? data.items.map(toUnknownRecord) : [];
  const collectionResults = Array.isArray(collectResult?.results) ? collectResult.results.map(toUnknownRecord) : [];

  return (
    <section className="space-y-4 border-b border-border pb-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="font-mono text-xs text-muted-text">02 · GA4 performance snapshots</p>
          <h4 className="text-base font-semibold text-primary-text">
            <Lang text={{ ko: "GA4 마케팅 성과", en: "GA4 marketing performance" }} />
          </h4>
          <p className="mt-1 text-xs leading-5 text-secondary-text">
            <Lang
              text={{
                ko: "연결된 Google Analytics 자격증명으로 읽기 테스트·스냅샷 수집을 실행하고 저장된 롤업을 조회합니다.",
                en: "Tests and collects with the connected Google Analytics credential, then reads stored rollups.",
              }}
            />
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Select value={view} onValueChange={(value) => setView(Array.isArray(value) ? value[0] || "channel_contribution" : value)}>
            <SelectTrigger className="min-w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              {VIEW_OPTIONS.map((option) => <SelectItem key={option.value} value={option.value}><Lang text={{ ko: option.ko, en: option.en }} /></SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={days} onValueChange={(value) => setDays(Array.isArray(value) ? value[0] || "28" : value)}>
            <SelectTrigger className="min-w-24"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="7">7d</SelectItem>
              <SelectItem value="28">28d</SelectItem>
              <SelectItem value="90">90d</SelectItem>
            </SelectContent>
          </Select>
          <Input
            value={propertyId}
            onChange={(event) => setPropertyId(event.target.value.replace(/^properties\//, ""))}
            placeholder={lang({ ko: "속성 ID(선택)", en: "Property ID (optional)" })}
            className="w-40"
          />
          <Button size="sm" variant="outline" onClick={() => void load()} disabled={loading || collecting}>
            <RefreshCw className={`icon-xxs ${loading ? "animate-spin" : ""}`} />
            <Lang text={{ ko: "저장 성과 조회", en: "Load stored data" }} />
          </Button>
          <Button size="sm" variant="outline" onClick={() => void collect(true)} disabled={loading || collecting}>
            <Database className="icon-xxs" />
            <Lang text={{ ko: "읽기 연결 테스트", en: "Test read access" }} />
          </Button>
          <Button size="sm" onClick={() => void collect(false)} disabled={loading || collecting}>
            <RefreshCw className={`icon-xxs ${collecting ? "animate-spin" : ""}`} />
            <Lang text={{ ko: "GA 성과 수집", en: "Collect GA performance" }} />
          </Button>
        </div>
      </div>

      {errorCode ? (
        <div className="rounded-md border border-amber-300/60 bg-amber-50 p-3 text-xs text-amber-900">
          <p className="font-semibold">{errorCode}</p>
          <p className="mt-1">
            {errorCode === "ga_credential_not_configured"
              ? lang({ ko: "Google Analytics 연결과 GA4 운영 대상 선택을 완료하세요.", en: "Connect Google Analytics and select a GA4 property." })
              : errorCode === "ga_collect_disabled"
                ? lang({ ko: "GA 성과 수집 설정이 비활성화되어 있습니다. OAuth 연결을 다시 확인하세요.", en: "GA collection is disabled. Check the OAuth connection." })
                : lang({ ko: "GA4 속성 접근 권한, analytics.readonly scope와 속성 ID를 확인하세요.", en: "Check GA4 property access, analytics.readonly, and the property ID." })}
          </p>
        </div>
      ) : null}

      {collectionResults.length ? (
        <div className={REVIEW_PANEL_CARD_CLASS}>
          <p className="text-xs font-semibold text-primary-text"><Lang text={{ ko: "최근 수집 결과", en: "Latest collection result" }} /></p>
          <div className="mt-2 flex flex-wrap gap-2">
            {collectionResults.map((item, index) => (
              <Badge key={`${toSafeString(item.propertyId)}-${toSafeString(item.reportKey)}-${index}`} variant="outline">
                {toSafeString(item.propertyId)} · {toSafeString(item.reportKey)} · {toSafeString(item.error)
                  || (item.skipped === true
                    ? lang({ ko: "선택 설정 미완료로 건너뜀", en: "Skipped: optional setup incomplete" })
                    : `${Number(item.rows || 0)} rows`)}
              </Badge>
            ))}
          </div>
        </div>
      ) : null}

      <div className={REVIEW_PANEL_CARD_CLASS}>
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs font-semibold text-primary-text"><Lang text={{ ko: "저장된 성과", en: "Stored performance" }} /> · {items.length.toLocaleString("ko-KR")} rows</p>
          <p className="font-mono text-xxs text-muted-text">{toSafeString(data?.dateFrom)}</p>
        </div>
        {items.length ? (
          <div className="mt-3 max-h-80 overflow-auto">
            <table className="w-full min-w-[42rem] text-left text-xs">
              <thead className="border-b border-border text-muted-text">
                <tr><th className="py-2"><Lang text={{ ko: "날짜", en: "Date" }} /></th><th><Lang text={{ ko: "속성", en: "Property" }} /></th><th>entity</th><th>metrics</th></tr>
              </thead>
              <tbody>
                {items.slice(0, 100).map((item, index) => (
                  <tr key={`${toSafeString(item.date)}-${toSafeString(item.entityId)}-${index}`} className="border-b border-border/60">
                    <td className="py-2">{toSafeString(item.date)}</td>
                    <td>{toSafeString(item.propertyId || item.propertyKey) || "-"}</td>
                    <td className="max-w-52 truncate font-mono text-xxs">{toSafeString(item.entityId)}</td>
                    <td>{metricText(item.metrics) || "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="mt-2 text-xs text-secondary-text">
            <Lang text={{ ko: "저장된 GA4 성과가 없습니다. 읽기 연결 테스트 후 성과 수집을 실행하세요.", en: "No stored GA4 performance. Test access, then collect performance." }} />
          </p>
        )}
      </div>
    </section>
  );
}
