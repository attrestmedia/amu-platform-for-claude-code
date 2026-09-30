"use client";

import { useCallback, useEffect, useState } from "react";
import { Button, Input, Preloader, Switch } from "@amu-labs/ui";
import { Lang, lang } from "components/module/i18n";
import fetchClient from "libs/api/fetchClient";
import { normalizeGaMeasurementId } from "libs/marketing/analytics/gaMeasurementIdContract";
import { toSafeString, toUnknownRecord } from "utils/common/typeUtils";
import { toast } from "sonner";

type TrackingSource = "universe" | "legacy_credential" | "default";

export function MarketingAnalyticsSettingsPanel({ universeId }: { universeId: string }) {
  const [measurementId, setMeasurementId] = useState("");
  const [trackingEnabled, setTrackingEnabled] = useState(true);
  const [source, setSource] = useState<TrackingSource>("default");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!universeId) return;
    try {
      setLoading(true);
      const response = await fetchClient.get(`/universe/${encodeURIComponent(universeId)}/marketing/tracking`);
      const data = toUnknownRecord(response.data?.data);
      setMeasurementId(toSafeString(data.measurementId));
      setTrackingEnabled(data.trackingEnabled !== false);
      setSource(
        data.source === "universe" || data.source === "legacy_credential"
          ? data.source
          : "default",
      );
    } catch {
      toast.error(lang({ ko: "GA 추적 설정을 불러오지 못했습니다.", en: "Could not load GA tracking settings." }));
    } finally {
      setLoading(false);
    }
  }, [universeId]);

  useEffect(
    function loadTrackingSettingsOnUniverseChange() {
      // 외부 API 응답으로 폼 상태를 동기화한다.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      void load();
    },
    [load],
  );

  const save = async () => {
    const normalized = normalizeGaMeasurementId(measurementId);
    if (!normalized) {
      toast.error(lang({ ko: "올바른 GA4 Measurement ID를 입력해 주세요.", en: "Enter a valid GA4 Measurement ID." }));
      return;
    }

    try {
      setSaving(true);
      await fetchClient.post(`/universe/${encodeURIComponent(universeId)}/marketing/tracking`, {
        measurementId: normalized,
        trackingEnabled,
      });
      setMeasurementId(normalized);
      setSource("universe");
      toast.success(lang({ ko: "유니버스 마케팅 추적 설정을 저장했습니다.", en: "Universe marketing tracking settings saved." }));
    } catch {
      toast.error(lang({ ko: "GA 추적 설정을 저장하지 못했습니다.", en: "Could not save GA tracking settings." }));
    } finally {
      setSaving(false);
    }
  };

  const sourceLabel = source === "universe"
    ? lang({ ko: "유니버스 마케팅 설정", en: "Universe marketing settings" })
    : source === "legacy_credential"
      ? lang({ ko: "레거시 자격증명(저장 시 이관)", en: "Legacy credential (migrated on save)" })
      : lang({ ko: "플랫폼 기본값", en: "Platform default" });

  return (
    <section className="mt-3 rounded-lg border border-border bg-background/60 p-4 text-primary-text">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold">
            <Lang text={{ ko: "브라우저 GA4 추적 설정", en: "Browser GA4 tracking" }} />
          </h3>
          <p className="mt-1 text-xs leading-5 text-secondary-text">
            <Lang
              text={{
                ko: "Measurement ID는 비밀값이 아니며 선택한 유니버스의 마케팅 설정에 저장됩니다.",
                en: "The Measurement ID is not secret and is stored in the selected universe's marketing settings.",
              }}
            />
          </p>
        </div>
        {loading ? <Preloader variant="spin" size="sm" /> : <span className="text-xs text-secondary-text">{sourceLabel}</span>}
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
        <div>
          <label className="mb-1 block text-xs text-secondary-text">GA4 Measurement ID</label>
          <Input
            value={measurementId}
            onChange={(event) => setMeasurementId(event.target.value)}
            placeholder="G-XXXXXXXXXX"
            autoComplete="off"
          />
        </div>
        <Button size="sm" onClick={save} disabled={loading || saving || !universeId}>
          {saving ? <Preloader variant="spin" size="sm" /> : <Lang text={{ ko: "설정 저장", en: "Save settings" }} />}
        </Button>
      </div>

      <label className="mt-3 flex items-center justify-between gap-3 rounded-md bg-surface px-3 py-2 text-sm">
        <span>
          <span className="block font-medium"><Lang text={{ ko: "브라우저 이벤트 추적", en: "Browser event tracking" }} /></span>
          <span className="block text-xxs text-secondary-text">
            <Lang text={{ ko: "꺼져 있으면 Root Layout에 gtag를 주입하지 않습니다.", en: "When off, gtag is not injected by the root layout." }} />
          </span>
        </span>
        <Switch checked={trackingEnabled} onCheckedChange={setTrackingEnabled} />
      </label>
    </section>
  );
}

export default MarketingAnalyticsSettingsPanel;
