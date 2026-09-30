"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Activity, Power, Settings2, Wallet } from "lucide-react";
import { Button, Input, Preloader, Switch } from "@amu-labs/ui";
import { Lang, lang } from "components/module/i18n";
import { DECISION_POINT_REGISTRY } from "consts/decision/decisionPointRegistry";
import { SERVICE_KEYS, type ServiceKey } from "consts/system/serviceAvailability";
import {
  validateJevRuntimeControlsPatch,
  type JevRuntimeControls,
  type JevRuntimeControlsPatch,
} from "consts/system/jevRuntimeControls";
import { fetchJevControls, patchJevControls, type JevControlsSnapshot } from "libs/api/admin/jevControls";
import { logger } from "utils/log";

type NumberFieldProps = {
  id: string;
  label: { ko: string; en: string };
  value: number;
  min: number;
  max?: number;
  step?: number;
  disabled: boolean;
  onChange: (value: number) => void;
};

function NumberField({ id, label, value, min, max, step = 1, disabled, onChange }: NumberFieldProps) {
  return (
    <label htmlFor={id} className="flex min-w-0 flex-col gap-1">
      <span className="text-xs font-medium text-secondary-text"><Lang text={label} /></span>
      <Input
        id={id}
        type="number"
        size="sm"
        min={min}
        max={max}
        step={step}
        disabled={disabled}
        value={Number.isFinite(value) ? value : ""}
        onChange={(event) => onChange(event.currentTarget.value === "" ? Number.NaN : Number(event.currentTarget.value))}
      />
    </label>
  );
}

function ToggleRow({
  title,
  description,
  checked,
  disabled,
  onChange,
  ariaLabel,
}: {
  title: { ko: string; en: string };
  description?: { ko: string; en: string };
  checked: boolean;
  disabled: boolean;
  onChange: (checked: boolean) => void;
  ariaLabel: { ko: string; en: string };
}) {
  return (
    <div className="flex min-h-16 items-center justify-between gap-4 border-b border-border/70 px-4 py-3 last:border-b-0">
      <div className="min-w-0">
        <span className="text-sm font-medium text-primary-text"><Lang text={title} /></span>
        {description ? <p className="mt-0.5 text-xxs leading-4 text-secondary-text"><Lang text={description} /></p> : null}
      </div>
      <Switch checked={checked} disabled={disabled} onCheckedChange={onChange} aria-label={lang(ariaLabel)} />
    </div>
  );
}

function mergeDraft(current: JevRuntimeControlsPatch, next: JevRuntimeControlsPatch): JevRuntimeControlsPatch {
  return {
    ...current,
    ...next,
    services: { ...current.services, ...next.services },
    decisionPoints: {
      ...current.decisionPoints,
      ...Object.fromEntries(
        Object.entries(next.decisionPoints || {}).map(([id, value]) => [
          id,
          { ...current.decisionPoints?.[id], ...value },
        ]),
      ),
    },
    circuit: { ...current.circuit, ...next.circuit },
  };
}

function resolveDraftControls(controls: JevRuntimeControls, draft: JevRuntimeControlsPatch): JevRuntimeControls {
  return {
    ...controls,
    ...draft,
    services: { ...controls.services, ...draft.services },
    decisionPoints: {
      ...controls.decisionPoints,
      ...Object.fromEntries(
        Object.entries(draft.decisionPoints || {}).map(([id, value]) => [
          id,
          { ...controls.decisionPoints[id], ...value },
        ]),
      ),
    },
    circuit: { ...controls.circuit, ...draft.circuit },
  };
}

const SERVICE_LABELS: Partial<Record<ServiceKey, { ko: string; en: string }>> = {
  "gen-studio": { ko: "Gen Studio", en: "Gen Studio" },
  tutors: { ko: "Tutors", en: "Tutors" },
  play: { ko: "Play", en: "Play" },
  "marketing-oops": { ko: "Marketing Oops", en: "Marketing Oops" },
  store: { ko: "Store", en: "Store" },
  drawing: { ko: "Drawing", en: "Drawing" },
  "scrape-links": { ko: "Scrape Links", en: "Scrape Links" },
  "search-images": { ko: "Search Images", en: "Search Images" },
  "motion-studio": { ko: "Motion Studio", en: "Motion Studio" },
  "school-lunch-food-map": { ko: "School Lunch Food Map", en: "School Lunch Food Map" },
};

export function JevRuntimeControlsPanel() {
  const [snapshot, setSnapshot] = useState<JevControlsSnapshot | null>(null);
  const [draft, setDraft] = useState<JevRuntimeControlsPatch>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const next = await fetchJevControls();
      setSnapshot(next);
      setDraft({});
      setError(next.readable
        ? ""
        : next.recoverable
          ? lang({
            ko: "저장된 JEV 설정이 손상돼 판단 호출이 차단된 상태입니다. 코드 기본값(모두 꺼짐)으로 복구한 뒤 다시 설정할 수 있습니다.",
            en: "Stored JEV controls are corrupted, so decision calls are blocked. Restore code defaults (all off), then configure again.",
          })
          : lang({ ko: "설정을 읽을 수 없습니다. 안전을 위해 편집이 잠겼습니다.", en: "Controls are unreadable. Editing is locked for safety." }));
    } catch (loadError) {
      logger.error("[JevRuntimeControlsPanel] 조회 실패", loadError);
      setSnapshot({ readable: false, recoverable: false, controls: null });
      setError(lang({ ko: "JEV 런타임 제어를 불러오지 못했습니다.", en: "Could not load JEV runtime controls." }));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(function loadOnMount() {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  const controls = useMemo(() => {
    if (!snapshot?.readable || !snapshot.controls) return null;
    return resolveDraftControls(snapshot.controls, draft);
  }, [snapshot, draft]);

  const updateDraft = (patch: JevRuntimeControlsPatch) => {
    setDraft((current) => mergeDraft(current, patch));
    setError("");
    setNotice("");
  };

  const updateService = (service: string, enabled: boolean) => {
    updateDraft({ services: { [service]: { enabled } } });
  };

  const updatePoint = (id: string, patch: Partial<JevRuntimeControls["decisionPoints"][string]>) => {
    updateDraft({ decisionPoints: { [id]: patch } });
  };

  const save = async () => {
    if (!controls) return;
    if (!reason.trim()) {
      setError(lang({ ko: "변경 사유를 입력해 주세요.", en: "Enter a reason for this change." }));
      return;
    }
    if (Object.keys(draft).length === 0) {
      setError(lang({ ko: "저장할 변경사항이 없습니다.", en: "There are no changes to save." }));
      return;
    }
    const validation = validateJevRuntimeControlsPatch(draft);
    if (!validation.valid) {
      setError(lang({ ko: validation.error, en: validation.error }));
      return;
    }

    setSaving(true);
    setError("");
    setNotice("");
    try {
      const next = await patchJevControls({ patch: validation.patch, reason: reason.trim() });
      setSnapshot(next);
      setDraft({});
      if (!next.readable) {
        setError(lang({ ko: "설정 저장 후 다시 읽을 수 없습니다. 편집이 잠겼습니다.", en: "Controls became unreadable after saving. Editing is locked." }));
      } else {
        setNotice(lang({ ko: "저장했습니다.", en: "Saved." }));
      }
    } catch (saveError) {
      logger.error("[JevRuntimeControlsPanel] 저장 실패", saveError);
      setError(lang({ ko: "저장하지 못했습니다. 다시 읽어 상태를 확인해 주세요.", en: "Save failed. Reload controls to confirm their state." }));
    } finally {
      setSaving(false);
    }
  };

  const recover = async () => {
    if (!reason.trim()) {
      setError(lang({ ko: "변경 사유를 입력해 주세요.", en: "Enter a reason for this change." }));
      return;
    }

    setSaving(true);
    setError("");
    setNotice("");
    try {
      const next = await patchJevControls({
        patch: { providerEnabled: false },
        reason: reason.trim(),
      });
      setSnapshot(next);
      setDraft({});
      if (!next.readable) {
        setError(lang({ ko: "설정 저장 후 다시 읽을 수 없습니다. 편집이 잠겼습니다.", en: "Controls became unreadable after saving. Editing is locked." }));
      } else {
        setNotice(lang({ ko: "코드 기본값으로 복구했습니다.", en: "Restored code defaults." }));
      }
    } catch (recoverError) {
      logger.error("[JevRuntimeControlsPanel] 복구 실패", recoverError);
      setError(lang({ ko: "복구하지 못했습니다. 다시 불러와 상태를 확인해 주세요.", en: "Recovery failed. Reload controls to confirm their state." }));
    } finally {
      setSaving(false);
    }
  };

  if (loading || !snapshot) return <Preloader variant="spin" size="lg" container />;

  if (!controls) {
    return (
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
        <p role="alert" className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-3 text-sm text-danger">
          {error || lang({ ko: "설정을 읽을 수 없어 편집이 잠겼습니다.", en: "Controls are unreadable, so editing is locked." })}
        </p>
        {snapshot.recoverable ? (
          <>
            <label htmlFor="jev-recovery-reason" className="flex flex-col gap-1">
              <span className="text-xs font-semibold text-primary-text"><Lang text={{ ko: "복구 사유 (필수)", en: "Recovery reason (required)" }} /></span>
              <Input
                id="jev-recovery-reason"
                size="sm"
                value={reason}
                disabled={saving || loading}
                onChange={(event) => {
                  setReason(event.currentTarget.value);
                  setError("");
                }}
                placeholder={lang({ ko: "예: 손상된 설정을 기본값으로 복구", en: "e.g. Restore corrupted controls to defaults" })}
              />
            </label>
            <Button size="sm" loading={saving} disabled={saving || loading} onClick={() => void recover()}>
              <Lang text={{ ko: "코드 기본값으로 복구", en: "Restore code defaults" }} />
            </Button>
          </>
        ) : null}
        <Button size="sm" variant="outline" disabled={loading} onClick={() => void load()}>
          <Lang text={{ ko: "다시 불러오기", en: "Reload controls" }} />
        </Button>
      </div>
    );
  }

  const disabled = saving || loading;

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
      <p className="rounded-lg border border-primary/20 bg-primary/5 px-3 py-3 text-xs leading-5 text-secondary-text">
        <Lang text={{
          ko: "기본값은 모두 꺼짐입니다. 판단 지점은 코드 레지스트리에 등록된 것만 켤 수 있으며, 호출 실패는 항상 Standard 경로로 돌아갑니다.",
          en: "All defaults are off. Only DecisionPoints registered in the code registry can be enabled, and every call failure returns to the Standard path.",
        }} />
      </p>

      {error ? <p role="alert" className="rounded-lg bg-danger/10 px-3 py-2 text-xs text-danger">{error}</p> : null}
      {notice ? <p role="status" className="rounded-lg bg-primary/5 px-3 py-2 text-xs text-secondary-text">{notice}</p> : null}

      <label htmlFor="jev-change-reason" className="flex flex-col gap-1">
        <span className="text-xs font-semibold text-primary-text"><Lang text={{ ko: "변경 사유 (필수)", en: "Change reason (required)" }} /></span>
        <Input
          id="jev-change-reason"
          size="sm"
          value={reason}
          disabled={disabled}
          onChange={(event) => setReason(event.currentTarget.value)}
          placeholder={lang({ ko: "예: 승인된 rollout 조정", en: "e.g. Approved rollout adjustment" })}
        />
      </label>

      <section className="rounded-xl border border-border bg-surface">
        <header className="flex items-center gap-2 border-b border-border/70 px-4 py-3">
          <Power className="h-4 w-4 text-danger" aria-hidden />
          <h3 className="text-sm font-semibold text-primary-text"><Lang text={{ ko: "호출 활성화", en: "Call activation" }} /></h3>
        </header>
        <ToggleRow
          title={{ ko: "전체 차단 (kill switch)", en: "Kill switch" }}
          description={{ ko: "켜면 모든 JEV 호출을 즉시 차단합니다.", en: "Blocks every JEV call immediately when enabled." }}
          checked={controls.killSwitch}
          disabled={disabled}
          onChange={(checked) => updateDraft({ killSwitch: checked })}
          ariaLabel={{ ko: "JEV 전체 차단", en: "JEV kill switch" }}
        />
        <ToggleRow
          title={{ ko: "TypeSafe provider 활성", en: "TypeSafe provider enabled" }}
          description={{ ko: "전역 provider 게이트입니다. 기본값은 꺼짐입니다.", en: "Global provider gate. It is off by default." }}
          checked={controls.providerEnabled}
          disabled={disabled}
          onChange={(checked) => updateDraft({ providerEnabled: checked })}
          ariaLabel={{ ko: "JEV provider 활성", en: "JEV provider enabled" }}
        />
      </section>

      <section className="rounded-xl border border-border bg-surface">
        <header className="flex items-center gap-2 border-b border-border/70 px-4 py-3">
          <Activity className="h-4 w-4 text-primary" aria-hidden />
          <h3 className="text-sm font-semibold text-primary-text"><Lang text={{ ko: "서비스별 활성화", en: "Service enablement" }} /></h3>
        </header>
        {SERVICE_KEYS.map((service) => (
          <ToggleRow
            key={service}
            title={SERVICE_LABELS[service] || { ko: service, en: service }}
            checked={controls.services[service]?.enabled === true}
            disabled={disabled}
            onChange={(checked) => updateService(service, checked)}
            ariaLabel={{ ko: `${service} JEV 활성`, en: `${service} JEV enabled` }}
          />
        ))}
        <ToggleRow
          title={{ ko: "Platform", en: "Platform" }}
          checked={controls.services.platform?.enabled === true}
          disabled={disabled}
          onChange={(checked) => updateService("platform", checked)}
          ariaLabel={{ ko: "Platform JEV 활성", en: "Platform JEV enabled" }}
        />
      </section>

      <section className="rounded-xl border border-border bg-surface">
        <header className="flex items-center gap-2 border-b border-border/70 px-4 py-3">
          <Settings2 className="h-4 w-4 text-primary" aria-hidden />
          <h3 className="text-sm font-semibold text-primary-text"><Lang text={{ ko: "판단 지점", en: "DecisionPoints" }} /></h3>
        </header>
        {DECISION_POINT_REGISTRY.length === 0 ? (
          <p className="px-4 py-3 text-xs leading-5 text-secondary-text">
            <Lang text={{ ko: "등록된 판단 지점 없음. 운영 지점은 후속 작업에서 코드 레지스트리에 등록됩니다.", en: "No DecisionPoints are registered. Operational points will be added to the code registry in a follow-up task." }} />
          </p>
        ) : DECISION_POINT_REGISTRY.map((point) => {
          const pointControls = controls.decisionPoints[point.id] || {
            enabled: false,
            rolloutPercent: 0,
            threshold: null,
          };
          const thresholdId = `jev-point-threshold-${point.id}`;
          return (
            <div key={point.id} className="border-b border-border/70 px-4 py-3 last:border-b-0">
              <ToggleRow
                title={{ ko: `${point.id} · ${point.service}`, en: `${point.id} · ${point.service}` }}
                description={{ ko: `${point.primitive} · ${point.effectClass}`, en: `${point.primitive} · ${point.effectClass}` }}
                checked={pointControls.enabled}
                disabled={disabled}
                onChange={(checked) => updatePoint(point.id, { enabled: checked })}
                ariaLabel={{ ko: `${point.id} 활성`, en: `${point.id} enabled` }}
              />
              <div className="grid grid-cols-1 gap-3 pt-3 sm:grid-cols-2">
                <NumberField
                  id={`jev-point-rollout-${point.id}`}
                  label={{ ko: "Rollout (%)", en: "Rollout (%)" }}
                  value={pointControls.rolloutPercent}
                  min={0}
                  max={100}
                  disabled={disabled}
                  onChange={(rolloutPercent) => updatePoint(point.id, { rolloutPercent })}
                />
                <label htmlFor={thresholdId} className="flex min-w-0 flex-col gap-1">
                  <span className="text-xs font-medium text-secondary-text"><Lang text={{ ko: "Threshold (0~1, 비움은 코드 기본값)", en: "Threshold (0–1, blank uses code default)" }} /></span>
                  <Input
                    id={thresholdId}
                    type="number"
                    size="sm"
                    min={0}
                    max={1}
                    step={0.01}
                    disabled={disabled}
                    value={pointControls.threshold === null ? "" : pointControls.threshold}
                    onChange={(event) => updatePoint(point.id, {
                      threshold: event.currentTarget.value === "" ? null : Number(event.currentTarget.value),
                    })}
                    placeholder={lang({ ko: "코드 기본값", en: "Code default" })}
                  />
                </label>
              </div>
            </div>
          );
        })}
      </section>

      <section className="rounded-xl border border-border bg-surface">
        <header className="flex items-center gap-2 border-b border-border/70 px-4 py-3">
          <Wallet className="h-4 w-4 text-primary" aria-hidden />
          <h3 className="text-sm font-semibold text-primary-text"><Lang text={{ ko: "요청·비용 상한", en: "Request and cost limits" }} /></h3>
        </header>
        <p className="px-4 pt-3 text-xs leading-5 text-secondary-text">
          <Lang text={{ ko: "daily COGS 상한 0은 호출 차단입니다. 이 작업은 실제 사용량 계량을 추가하지 않으며, 기본값 0은 유지됩니다.", en: "A daily COGS cap of 0 blocks calls. This task does not add live usage metering, and the default remains 0." }} />
        </p>
        <div className="grid grid-cols-1 gap-3 px-4 py-3 sm:grid-cols-2">
          <label htmlFor="jev-model-pin" className="flex min-w-0 flex-col gap-1">
            <span className="text-xs font-medium text-secondary-text"><Lang text={{ ko: "Model pin", en: "Model pin" }} /></span>
            <Input id="jev-model-pin" size="sm" value={controls.modelPin} disabled={disabled}
              onChange={(event) => updateDraft({ modelPin: event.currentTarget.value })} />
          </label>
          <NumberField id="jev-timeout-ms" label={{ ko: "Timeout (ms)", en: "Timeout (ms)" }} value={controls.timeoutMs}
            min={200} max={10000} disabled={disabled} onChange={(timeoutMs) => updateDraft({ timeoutMs })} />
          <NumberField id="jev-response-bytes" label={{ ko: "최대 응답 크기 (bytes)", en: "Maximum response size (bytes)" }}
            value={controls.maxResponseBytes} min={1024} max={1048576} disabled={disabled}
            onChange={(maxResponseBytes) => updateDraft({ maxResponseBytes })} />
          <NumberField id="jev-daily-cogs" label={{ ko: "일일 COGS 상한 (USD)", en: "Daily COGS cap (USD)" }}
            value={controls.dailyCogsUsdCap} min={0} step={0.01} disabled={disabled}
            onChange={(dailyCogsUsdCap) => updateDraft({ dailyCogsUsdCap })} />
        </div>
      </section>

      <section className="rounded-xl border border-border bg-surface">
        <header className="border-b border-border/70 px-4 py-3">
          <h3 className="text-sm font-semibold text-primary-text"><Lang text={{ ko: "Circuit 설정", en: "Circuit settings" }} /></h3>
        </header>
        <div className="grid grid-cols-1 gap-3 px-4 py-3 sm:grid-cols-3">
          <NumberField id="jev-circuit-failure-threshold" label={{ ko: "실패 횟수", en: "Failure threshold" }}
            value={controls.circuit.failureThreshold} min={1} disabled={disabled}
            onChange={(failureThreshold) => updateDraft({ circuit: { failureThreshold } })} />
          <NumberField id="jev-circuit-failure-window" label={{ ko: "실패 창 (초)", en: "Failure window (seconds)" }}
            value={controls.circuit.failureWindowSeconds} min={10} disabled={disabled}
            onChange={(failureWindowSeconds) => updateDraft({ circuit: { failureWindowSeconds } })} />
          <NumberField id="jev-circuit-open" label={{ ko: "Open 유지 (초)", en: "Open duration (seconds)" }}
            value={controls.circuit.openSeconds} min={10} disabled={disabled}
            onChange={(openSeconds) => updateDraft({ circuit: { openSeconds } })} />
        </div>
      </section>

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button size="sm" variant="outline" disabled={disabled || Object.keys(draft).length === 0}
          onClick={() => { setDraft({}); setError(""); setNotice(""); }}>
          <Lang text={{ ko: "변경 취소", en: "Discard changes" }} />
        </Button>
        <Button size="sm" loading={saving} disabled={disabled || Object.keys(draft).length === 0} onClick={() => void save()}>
          <Lang text={{ ko: "설정 저장", en: "Save controls" }} />
        </Button>
      </div>
    </div>
  );
}
