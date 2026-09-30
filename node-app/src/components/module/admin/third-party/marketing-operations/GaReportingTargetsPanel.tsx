"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { RefreshCw } from "lucide-react";
import { Badge, Button, Checkbox, Preloader } from "@amu-labs/ui";
import { Lang, lang } from "components/module/i18n";
import fetchClient from "libs/api/fetchClient";
import {
  AMU_GA_REPORTING_TARGETS,
  type GaReportingTarget,
} from "libs/marketing/analytics/gaReportingTargetsContract";
import { toErrorLike, toSafeString, toUnknownRecord } from "utils/common/typeUtils";
import { toast } from "sonner";

const API = "/marketing/analytics/ga";

type GaPropertyOption = {
  propertyId: string;
  name: string;
};

function parseTargets(value: unknown): GaReportingTarget[] {
  return (Array.isArray(value) ? value : []).flatMap((entry) => {
    const row = toUnknownRecord(entry);
    const propertyId = toSafeString(row.propertyId);
    if (!propertyId) return [];
    return [{
      propertyId,
      propertyKey: toSafeString(row.propertyKey),
      role: toSafeString(row.role),
      label: toSafeString(row.label),
      enabled: row.enabled !== false,
      primary: row.primary === true,
    }];
  });
}

function parseProperties(value: unknown): GaPropertyOption[] {
  return (Array.isArray(value) ? value : []).flatMap((entry) => {
    const row = toUnknownRecord(entry);
    const propertyId = toSafeString(row.propertyId);
    return propertyId ? [{ propertyId, name: toSafeString(row.name) || propertyId }] : [];
  });
}

export function GaReportingTargetsPanel({ universeId }: { universeId: string }) {
  const [properties, setProperties] = useState<GaPropertyOption[]>([]);
  const [targets, setTargets] = useState<GaReportingTarget[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errorCode, setErrorCode] = useState("");

  const load = useCallback(async () => {
    if (!universeId) return;
    try {
      setLoading(true);
      setErrorCode("");
      const response = await fetchClient.get(API, { params: { action: "targets", universeId } });
      const data = toUnknownRecord(response.data?.data);
      const nextTargets = parseTargets(data.reportingTargets);
      setProperties(parseProperties(data.availableProperties));
      setTargets(nextTargets);
      setSelectedIds(nextTargets.filter((target) => target.enabled).map((target) => target.propertyId));
    } catch (error) {
      const data = toUnknownRecord(toUnknownRecord(toErrorLike(error).response).data);
      setProperties([]);
      setTargets([]);
      setSelectedIds([]);
      setErrorCode(toSafeString(data.error) || "ga_reporting_targets_load_failed");
    } finally {
      setLoading(false);
    }
  }, [universeId]);

  useEffect(() => {
    // 연결 계정의 접근 가능 속성과 유니버스 보고 대상을 화면 진입 시 동기화한다.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);

  const toggle = (propertyId: string, checked: boolean) => {
    setSelectedIds((current) => checked
      ? Array.from(new Set([...current, propertyId]))
      : current.filter((value) => value !== propertyId));
  };

  const save = async () => {
    if (!selectedIds.length) {
      toast.error(lang({ ko: "성과를 수집할 GA4 속성을 하나 이상 선택하세요.", en: "Select at least one GA4 property." }));
      return;
    }
    const existingById = new Map(targets.map((target) => [target.propertyId, target]));
    const amuDefaults = new Map(AMU_GA_REPORTING_TARGETS.map((target) => [target.propertyId, target]));
    const propertyById = new Map(properties.map((property) => [property.propertyId, property]));
    const existingPrimary = targets.find((target) => target.primary && selectedSet.has(target.propertyId))?.propertyId;
    const primaryPropertyId = existingPrimary || selectedIds[0];
    const reportingTargets = selectedIds.map((propertyId) => {
      const source = existingById.get(propertyId) || (universeId === "amu" ? amuDefaults.get(propertyId) : undefined);
      return {
        propertyId,
        propertyKey: source?.propertyKey || `property_${propertyId}`,
        role: source?.role || "default",
        label: source?.label || propertyById.get(propertyId)?.name || propertyId,
        enabled: true,
        primary: propertyId === primaryPropertyId,
      };
    });
    try {
      setSaving(true);
      await fetchClient.post(API, { action: "update_targets", universeId, reportingTargets });
      toast.success(lang({ ko: "GA4 다중 보고 대상을 저장했습니다.", en: "Saved GA4 reporting targets." }));
      await load();
    } catch (error) {
      const data = toUnknownRecord(toUnknownRecord(toErrorLike(error).response).data);
      const code = toSafeString(data.error) || "ga_reporting_targets_update_failed";
      setErrorCode(code);
      toast.error(`${lang({ ko: "GA4 운영 대상 저장 실패", en: "Failed to save GA4 targets" })}: ${code}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="mt-4 rounded-lg border border-border bg-background/60 p-4 text-primary-text">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold"><Lang text={{ ko: "GA4 다중 보고 대상", en: "GA4 reporting targets" }} /></p>
          <p className="mt-1 text-xs leading-5 text-secondary-text">
            <Lang text={{
              ko: "OAuth 계정은 하나만 연결하고, 성과 수집 속성은 여러 개 선택합니다. 매거진과 앱 데이터는 propertyKey로 분리 저장됩니다.",
              en: "Connect one OAuth account and select multiple properties. Magazine and app data remain separated by propertyKey.",
            }} />
          </p>
        </div>
        <Button size="xs" variant="outline" onClick={() => void load()} disabled={loading || saving}>
          <RefreshCw className={loading ? "icon-xxs animate-spin" : "icon-xxs"} />
          <Lang text={{ ko: "목록 새로고침", en: "Refresh" }} />
        </Button>
      </div>

      {loading && !properties.length ? <Preloader variant="spin" size="sm" container className="py-5" /> : null}
      {errorCode ? (
        <p className="mt-3 rounded-md border border-amber-300/60 bg-amber-50 p-3 text-xs text-amber-800">
          {errorCode === "ga_oauth_reconnect_required"
            ? lang({ ko: "먼저 Google Analytics 계정을 연결하고 초기 대표 속성을 선택하세요.", en: "Connect Google Analytics and select an initial primary property first." })
            : `${lang({ ko: "운영 대상 조회 실패", en: "Could not load reporting targets" })}: ${errorCode}`}
        </p>
      ) : null}

      {properties.length ? (
        <div className="mt-3 space-y-2">
          {properties.map((property) => {
            const target = targets.find((item) => item.propertyId === property.propertyId);
            return (
              <label key={property.propertyId} className="flex cursor-pointer items-center gap-3 rounded-md border border-border px-3 py-2">
                <Checkbox
                  checked={selectedSet.has(property.propertyId)}
                  onCheckedChange={(checked) => toggle(property.propertyId, checked === true)}
                  aria-label={`${property.name} (${property.propertyId})`}
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{property.name}</span>
                  <span className="font-mono text-xxs text-muted-text">{property.propertyId}</span>
                </span>
                {target?.propertyKey ? <Badge variant="outline">{target.propertyKey}</Badge> : null}
                {target?.primary ? <Badge variant="outlinePrimary"><Lang text={{ ko: "대표", en: "Primary" }} /></Badge> : null}
              </label>
            );
          })}
          <div className="flex justify-end pt-1">
            <Button size="sm" onClick={() => void save()} disabled={saving || loading || !selectedIds.length}>
              <Lang text={{ ko: "보고 대상 저장", en: "Save targets" }} />
            </Button>
          </div>
        </div>
      ) : null}
    </section>
  );
}

export default GaReportingTargetsPanel;
