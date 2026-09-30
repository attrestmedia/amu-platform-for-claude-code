"use client";

import { useState } from "react";
import { AlertTriangle, CheckCircle2, RefreshCw } from "lucide-react";
import { Badge, Button, Input, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@amu-labs/ui";
import { Lang, lang } from "components/module/i18n";
import fetchClient from "libs/api/fetchClient";
import { toErrorLike, toSafeString, toUnknownRecord, type UnknownRecord } from "utils/common/typeUtils";
import { toast } from "sonner";
import { REVIEW_PANEL_CARD_CLASS } from "./MarketingOpsConstants";

const API = "/marketing/analytics/ga";
const AMU_PROPERTY_IDS = "311756914, 488820875";

function sectionItems(section: unknown) {
  const data = toUnknownRecord(section).data;
  return Array.isArray(data) ? data.map(toUnknownRecord) : [];
}

function listNames(items: UnknownRecord[], ...keys: string[]) {
  return items
    .map((item) => keys.map((key) => toSafeString(item[key])).find(Boolean) || "")
    .filter(Boolean);
}

function statusLabel(value: unknown, purpose?: unknown) {
  const status = toSafeString(value);
  if (status === "configured" || status === "observed") return lang({ ko: "정상", en: "Ready" });
  if (status === "not_applicable") return lang({ ko: "해당 없음", en: "Not applicable" });
  if (status === "missing" && purpose === "promo_optional") return lang({ ko: "미설정(선택)", en: "Not set (optional)" });
  if (status === "missing" || status === "not_observed") return lang({ ko: "확인 필요", en: "Needs attention" });
  return lang({ ko: "확인 불가", en: "Unknown" });
}

export function GaConfigurationPanel({ universeId }: { universeId: string }) {
  const [propertyIds, setPropertyIds] = useState(universeId === "amu" ? AMU_PROPERTY_IDS : "");
  const [lookbackDays, setLookbackDays] = useState("28");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<UnknownRecord | null>(null);
  const [errorCode, setErrorCode] = useState("");

  const load = async () => {
    if (!universeId) return;
    try {
      setLoading(true);
      setErrorCode("");
      const response = await fetchClient.get(API, {
        params: {
          action: "configuration",
          universeId,
          propertyIds,
          eventLookbackDays: Number(lookbackDays),
        },
      });
      setResult(toUnknownRecord(response.data?.data));
    } catch (error) {
      const responseData = toUnknownRecord(toUnknownRecord(toErrorLike(error).response).data);
      const data = toUnknownRecord(responseData.data);
      setResult(Object.keys(data).length ? data : null);
      setErrorCode(toSafeString(responseData.error || data.error) || "ga_configuration_failed");
      toast.error(lang({ ko: "GA4 설정 조회에 실패했습니다.", en: "Failed to load GA4 configuration." }));
    } finally {
      setLoading(false);
    }
  };

  const properties = Array.isArray(result?.properties) ? result.properties.map(toUnknownRecord) : [];
  const accessibleProperties = Array.isArray(result?.accessibleProperties)
    ? result.accessibleProperties.map(toUnknownRecord)
    : [];
  const deniedPropertyIds = Array.isArray(result?.deniedPropertyIds)
    ? result.deniedPropertyIds.map(toSafeString).filter(Boolean)
    : [];
  const crossProperty = toUnknownRecord(result?.crossProperty);
  const measurementIds = Array.isArray(crossProperty.measurementIds)
    ? crossProperty.measurementIds.map(toSafeString).filter(Boolean)
    : [];

  return (
    <section className="space-y-4 border-b border-border pb-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="font-mono text-xs text-muted-text">01 · GA4 configuration inventory</p>
          <h4 className="text-base font-semibold text-primary-text">
            <Lang text={{ ko: "GA4 설정·권한 조회", en: "GA4 configuration and access" }} />
          </h4>
          <p className="mt-1 text-xs leading-5 text-secondary-text">
            <Lang
              text={{
                ko: "연결된 Google Analytics OAuth로 get_ga_configuration과 동일한 읽기 전용 설정 인벤토리를 조회합니다.",
                en: "Uses the connected Google Analytics OAuth to run the same read-only inventory as get_ga_configuration.",
              }}
            />
          </p>
          <p className="mt-1 text-xs leading-5 text-secondary-text">
            <Lang
              text={{
                ko: "프로모션 리포트(promo_performance)는 acquisition 역할 속성에서만 수집합니다. conversion 속성에는 프로모션 맞춤 측정기준 4종을 등록하지 않아도 됩니다.",
                en: "The promo_performance report runs only for acquisition properties. Conversion properties do not require the four promo custom dimensions.",
              }}
            />
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            value={propertyIds}
            onChange={(event) => setPropertyIds(event.target.value)}
            placeholder="311756914, 488820875"
            aria-label={lang({ ko: "GA4 속성 ID", en: "GA4 property IDs" })}
            className="min-w-64"
          />
          <Select value={lookbackDays} onValueChange={(value) => setLookbackDays(Array.isArray(value) ? value[0] || "28" : value)}>
            <SelectTrigger className="min-w-24"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="7">7d</SelectItem>
              <SelectItem value="28">28d</SelectItem>
              <SelectItem value="90">90d</SelectItem>
            </SelectContent>
          </Select>
          <Button size="sm" onClick={() => void load()} disabled={loading}>
            <RefreshCw className={`icon-xxs ${loading ? "animate-spin" : ""}`} />
            <Lang text={{ ko: "GA 설정 조회", en: "Load GA settings" }} />
          </Button>
        </div>
      </div>

      {errorCode ? (
        <div className="rounded-md border border-amber-300/60 bg-amber-50 p-3 text-xs text-amber-900">
          <p className="flex items-center gap-1 font-semibold"><AlertTriangle className="icon-xs" />{errorCode}</p>
          <p className="mt-1">
            {errorCode === "ga_property_not_accessible"
              ? lang({ ko: "연결 계정을 해당 GA4 속성의 속성 액세스 관리에 뷰어 이상으로 추가하세요.", en: "Add the connected account to the GA4 property with at least Viewer access." })
              : errorCode === "ga_oauth_reconnect_required"
                ? lang({ ko: "Google Analytics 연결에서 analytics.readonly 권한을 다시 허용하세요.", en: "Reconnect Google Analytics and grant analytics.readonly." })
                : lang({ ko: "연결 상태, 속성 ID, Google Analytics Admin/Data API 접근 상태를 확인하세요.", en: "Check the connection, property IDs, and Google Analytics Admin/Data API access." })}
          </p>
        </div>
      ) : null}

      {accessibleProperties.length ? (
        <div className={REVIEW_PANEL_CARD_CLASS}>
          <p className="text-xs font-semibold text-primary-text"><Lang text={{ ko: "접근 가능한 속성", en: "Accessible properties" }} /></p>
          <div className="mt-2 flex flex-wrap gap-2">
            {accessibleProperties.map((property) => (
              <Badge key={toSafeString(property.propertyId)} variant="outline">
                {toSafeString(property.displayName) || "GA4"} · {toSafeString(property.propertyId)}
              </Badge>
            ))}
          </div>
          {deniedPropertyIds.length ? <p className="mt-2 text-xs text-red-500">{lang({ ko: "접근 불가", en: "Inaccessible" })}: {deniedPropertyIds.join(", ")}</p> : null}
        </div>
      ) : null}

      {properties.length ? (
        <div className="grid gap-3 xl:grid-cols-2">
          {properties.map((property) => {
            const propertyId = toSafeString(property.propertyId);
            const readiness = toUnknownRecord(property.readiness);
            const propertyRole = toSafeString(property.propertyRole || readiness.propertyRole) || "default";
            const readinessStatus = toSafeString(readiness.status);
            const dimensions = sectionItems(property.customDimensions);
            const metrics = sectionItems(property.customMetrics);
            const keyEvents = sectionItems(property.keyEvents);
            const streams = Array.isArray(property.streamSettings) ? property.streamSettings.map(toUnknownRecord) : [];
            const requiredDimensions = Array.isArray(readiness.requiredCustomDimensions)
              ? readiness.requiredCustomDimensions.map(toUnknownRecord)
              : [];
            const requiredKeyEvents = Array.isArray(readiness.requiredKeyEvents)
              ? readiness.requiredKeyEvents.map(toUnknownRecord)
              : [];
            return (
              <article key={propertyId} className={REVIEW_PANEL_CARD_CLASS}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="font-semibold text-primary-text">{toSafeString(property.displayName) || propertyId}</p>
                    <p className="font-mono text-xxs text-muted-text">{propertyId} · role={propertyRole}</p>
                  </div>
                  <Badge variant="outline" className={readinessStatus === "ready" ? "text-green-600" : "text-amber-600"}>
                    {readinessStatus === "ready"
                      ? propertyRole === "acquisition"
                        ? lang({ ko: "획득 분석 준비", en: "Acquisition ready" })
                        : lang({ ko: "전환 분석 준비", en: "Conversion ready" })
                      : readinessStatus === "awaiting_data"
                        ? lang({ ko: "최근 이벤트 확인 필요", en: "Awaiting recent events" })
                        : lang({ ko: "설정 확인 필요", en: "Configuration needed" })}
                  </Badge>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
                  <p>{lang({ ko: "맞춤 측정기준", en: "Custom dimensions" })} <strong>{dimensions.length}</strong></p>
                  <p>{lang({ ko: "맞춤 측정항목", en: "Custom metrics" })} <strong>{metrics.length}</strong></p>
                  <p>{lang({ ko: "주요 이벤트", en: "Key events" })} <strong>{keyEvents.length}</strong></p>
                  <p>{lang({ ko: "데이터 스트림", en: "Data streams" })} <strong>{streams.length}</strong></p>
                </div>
                <div className="mt-3 space-y-2 text-xs">
                  <p className="font-medium text-primary-text"><Lang text={{ ko: "AMU 맞춤 측정기준", en: "AMU custom dimensions" }} /></p>
                  <div className="flex flex-wrap gap-1">
                    {requiredDimensions.map((item) => (
                      <Badge key={toSafeString(item.parameterName)} variant="outline">
                        {toSafeString(item.parameterName)} · {statusLabel(item.status, item.purpose)}
                      </Badge>
                    ))}
                  </div>
                  <p className="font-medium text-primary-text"><Lang text={{ ko: "AMU 주요 이벤트", en: "AMU key events" }} /></p>
                  <div className="flex flex-wrap gap-1">
                    {requiredKeyEvents.map((item) => (
                      <Badge key={toSafeString(item.eventName)} variant="outline">
                        {toSafeString(item.eventName)} · {statusLabel(item.configurationStatus)}/{statusLabel(item.collectionStatus)}
                      </Badge>
                    ))}
                  </div>
                </div>
                <details className="mt-3 text-xs text-secondary-text">
                  <summary className="cursor-pointer font-medium text-primary-text"><Lang text={{ ko: "조회된 설정 이름 보기", en: "Show configuration names" }} /></summary>
                  <p className="mt-2">{lang({ ko: "측정기준", en: "Dimensions" })}: {listNames(dimensions, "parameterName", "displayName").join(", ") || "-"}</p>
                  <p>{lang({ ko: "측정항목", en: "Metrics" })}: {listNames(metrics, "parameterName", "displayName").join(", ") || "-"}</p>
                  <p>{lang({ ko: "주요 이벤트", en: "Key events" })}: {listNames(keyEvents, "eventName").join(", ") || "-"}</p>
                  <p>Measurement ID: {streams.map((stream) => toSafeString(stream.measurementId)).filter(Boolean).join(", ") || "-"}</p>
                </details>
              </article>
            );
          })}
        </div>
      ) : result && !errorCode ? (
        <div className="flex items-center gap-2 rounded-md border border-border p-3 text-xs text-secondary-text">
          <CheckCircle2 className="icon-xs" /> <Lang text={{ ko: "조회 가능한 속성 설정이 없습니다.", en: "No queryable property configuration was found." }} />
        </div>
      ) : null}

      {measurementIds.length ? (
        <p className="text-xs text-secondary-text">{lang({ ko: "교차 속성 Measurement ID", en: "Cross-property Measurement IDs" })}: {measurementIds.join(", ")}</p>
      ) : null}
    </section>
  );
}
