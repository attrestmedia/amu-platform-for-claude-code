"use client";

import { useCallback, useEffect, useState } from "react";
import { Mic, Power, Wallet } from "lucide-react";
import { Button, Input, Preloader, Switch } from "@amu-labs/ui";
import { Lang, lang } from "components/module/i18n";
import { SPEECH_CATALOG_PROVIDER_TYPES, type SpeechCatalogProviderType } from "consts/ai";
import {
  SPEECH_BUDGET_OWNERS,
  SPEECH_BUDGET_REQUIRED_PROVIDERS,
  type SpeechBudgetLimits,
  type SpeechBudgetOwnerType,
  type SpeechRuntimeControls,
} from "consts/system/speechRuntimeControls";
import { fetchSpeechControls, patchSpeechControls, type SpeechControlsSnapshot } from "libs/api/admin/speechControls";
import { logger } from "utils/log";

/**
 * @docHint
 * @purpose EL-204 speech 런타임 제어(kill switch·provider 활성·지출 상한) 어드민 패널
 * @process 서버 권위 조회  변경 사유 입력  PATCH  감사 로그 기록
 * @domain system-control
 * @scope admin
 *
 * 정책 정본: node-app `rules/runtime-configurable-constants.md` — 운영 중 조정되는 값은
 * 코드 상수가 아니라 DB에 두고 어드민 UI로 갱신한다. 코드의 값은 폴백 기본값이지 운영값이 아니다.
 *
 * **세 상태를 화면에서도 구분한다.** 빈 칸 = 미확정(강제하지 않음), `0` = 차단, 그 외 = 상한.
 * 빈 칸과 0을 같은 것으로 보이게 만들면 "안 쓰기로 했다"와 "아직 안 정했다"가 뒤섞인다.
 */

const OWNER_LABELS: Record<SpeechBudgetOwnerType, { ko: string; en: string }> = {
  magazine: { ko: "매거진 내레이션", en: "Magazine narration" },
  tutors: { ko: "Tutors", en: "Tutors" },
  play: { ko: "Play", en: "Play" },
  internal: { ko: "내부 테스트·Voice 선정", en: "Internal test & voice selection" },
};

const CAP_FIELDS = [
  { key: "perRequestUsdCap", label: { ko: "건당", en: "Per request" } },
  { key: "dailyUsdCap", label: { ko: "일", en: "Daily" } },
  { key: "monthlyUsdCap", label: { ko: "월", en: "Monthly" } },
] as const satisfies readonly { key: keyof SpeechBudgetLimits; label: { ko: string; en: string } }[];

/** 빈 문자열은 `null`(미확정)이고 "0"은 0(차단)이다. 둘을 같은 값으로 접지 않는다. */
function parseCapInput(raw: string): number | null | undefined {
  const value = raw.trim();
  if (!value) return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return undefined;
  return parsed;
}

function capToInput(value: number | null) {
  return value === null ? "" : String(value);
}

function CapRow({
  title,
  hint,
  limits,
  draft,
  disabled,
  onChange,
}: {
  title: React.ReactNode;
  hint?: React.ReactNode;
  limits: SpeechBudgetLimits;
  draft: Partial<Record<keyof SpeechBudgetLimits, string>>;
  disabled: boolean;
  onChange: (field: keyof SpeechBudgetLimits, value: string) => void;
}) {
  return (
    <div className="border-b border-border/70 px-4 py-3 last:border-b-0">
      <div className="mb-2 min-w-0">
        <span className="text-sm font-semibold text-primary-text">{title}</span>
        {hint ? <p className="mt-0.5 text-xxs leading-4 text-secondary-text">{hint}</p> : null}
      </div>
      <div className="grid grid-cols-3 gap-2">
        {CAP_FIELDS.map((field) => {
          const inputId = `speech-cap-${String(title)}-${field.key}`;
          const current = draft[field.key] ?? capToInput(limits[field.key]);
          return (
            <label key={field.key} htmlFor={inputId} className="flex flex-col gap-1">
              <span className="text-xxs text-secondary-text">
                <Lang text={field.label} /> (USD)
              </span>
              <Input
                id={inputId}
                size="sm"
                inputMode="decimal"
                disabled={disabled}
                value={current}
                onChange={(event) => onChange(field.key, event.target.value)}
                placeholder={lang({ ko: "미확정", en: "Unset" })}
              />
            </label>
          );
        })}
      </div>
    </div>
  );
}

export function SpeechRuntimeControlsPanel() {
  const [snapshot, setSnapshot] = useState<SpeechControlsSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [globalDraft, setGlobalDraft] = useState<Partial<Record<keyof SpeechBudgetLimits, string>>>({});
  const [ownerDraft, setOwnerDraft] = useState<
    Partial<Record<SpeechBudgetOwnerType, Partial<Record<keyof SpeechBudgetLimits, string>>>>
  >({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setSnapshot(await fetchSpeechControls());
      setError("");
    } catch (nextError) {
      logger.error("[SpeechRuntimeControlsPanel] 조회 실패", nextError);
      setError(lang({ ko: "speech 런타임 제어를 불러오지 못했습니다.", en: "Could not load speech runtime controls." }));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(function loadOnMount() {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  const requireReason = () => {
    const trimmed = reason.trim();
    if (!trimmed) {
      setError(lang({ ko: "변경 사유를 먼저 입력해 주세요.", en: "Enter a change reason first." }));
      return null;
    }
    return trimmed;
  };

  const submit = async (patch: Partial<SpeechRuntimeControls>) => {
    const trimmedReason = requireReason();
    if (!trimmedReason) return;
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const next = await patchSpeechControls({
        patch,
        reason: trimmedReason,
        fallbackRoutable: snapshot?.providerRoutable,
      });
      setSnapshot(next);
      setGlobalDraft({});
      setOwnerDraft({});
      setNotice(lang({ ko: "저장했습니다.", en: "Saved." }));
    } catch (nextError) {
      logger.error("[SpeechRuntimeControlsPanel] 저장 실패", nextError);
      setError(lang({ ko: "저장하지 못했습니다.", en: "Failed to save." }));
      await load();
    } finally {
      setSaving(false);
    }
  };

  const submitBudget = async () => {
    if (!snapshot) return;
    const budget: Partial<SpeechBudgetLimits> = {};
    for (const field of CAP_FIELDS) {
      const raw = globalDraft[field.key];
      if (raw === undefined) continue;
      const parsed = parseCapInput(raw);
      if (parsed === undefined) {
        setError(lang({ ko: "상한은 0 이상의 숫자이거나 비워 두어야 합니다.", en: "Caps must be ≥ 0 or empty." }));
        return;
      }
      budget[field.key] = parsed;
    }

    const budgetByOwner: Partial<Record<SpeechBudgetOwnerType, Partial<SpeechBudgetLimits>>> = {};
    for (const owner of SPEECH_BUDGET_OWNERS) {
      const drafted = ownerDraft[owner];
      if (!drafted) continue;
      const limits: Partial<SpeechBudgetLimits> = {};
      for (const field of CAP_FIELDS) {
        const raw = drafted[field.key];
        if (raw === undefined) continue;
        const parsed = parseCapInput(raw);
        if (parsed === undefined) {
          setError(lang({ ko: "상한은 0 이상의 숫자이거나 비워 두어야 합니다.", en: "Caps must be ≥ 0 or empty." }));
          return;
        }
        limits[field.key] = parsed;
      }
      if (Object.keys(limits).length > 0) budgetByOwner[owner] = limits;
    }

    if (Object.keys(budget).length === 0 && Object.keys(budgetByOwner).length === 0) {
      setError(lang({ ko: "변경된 상한이 없습니다.", en: "No cap changes to save." }));
      return;
    }
    await submit({
      ...(Object.keys(budget).length > 0 ? { budget: budget as SpeechBudgetLimits } : {}),
      ...(Object.keys(budgetByOwner).length > 0
        ? { budgetByOwner: budgetByOwner as SpeechRuntimeControls["budgetByOwner"] }
        : {}),
    });
  };

  if (loading || !snapshot) return <Preloader variant="spin" size="lg" container />;
  const { controls, providerRoutable } = snapshot;

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
      <label htmlFor="speech-change-reason" className="flex flex-col gap-1">
        <span className="text-xs font-semibold text-primary-text">
          <Lang text={{ ko: "변경 사유 (필수)", en: "Change reason (required)" }} />
        </span>
        <Input
          id="speech-change-reason"
          size="sm"
          value={reason}
          disabled={saving}
          onChange={(event) => setReason(event.target.value)}
          placeholder={lang({ ko: "예: EL-004 승인 상한 반영", en: "e.g. Apply approved EL-004 caps" })}
        />
      </label>

      {error ? (
        <p role="alert" className="rounded-lg bg-danger/10 px-3 py-2 text-xs text-danger">
          {error}
        </p>
      ) : null}
      {notice ? (
        <p role="status" className="rounded-lg bg-primary/5 px-3 py-2 text-xs text-secondary-text">
          {notice}
        </p>
      ) : null}

      <section className="rounded-xl border border-border bg-surface">
        <div className="flex items-center justify-between gap-4 px-4 py-3">
          <div className="flex min-w-0 items-start gap-3">
            <Power className="mt-0.5 h-5 w-5 shrink-0 text-danger" aria-hidden />
            <div className="min-w-0">
              <span className="text-sm font-semibold text-primary-text">
                <Lang text={{ ko: "전체 차단 (kill switch)", en: "Kill switch" }} />
              </span>
              <p className="mt-0.5 text-xxs leading-4 text-secondary-text">
                <Lang
                  text={{
                    ko: "켜면 provider 활성 여부와 무관하게 모든 음성 호출이 즉시 차단됩니다.",
                    en: "Blocks every speech call immediately, regardless of provider state.",
                  }}
                />
              </p>
            </div>
          </div>
          <Switch
            checked={controls.killSwitch}
            disabled={saving}
            onCheckedChange={(checked) => void submit({ killSwitch: checked })}
            aria-label={lang({ ko: "음성 전체 차단", en: "Speech kill switch" })}
          />
        </div>
      </section>

      <section className="rounded-xl border border-border bg-surface">
        <header className="flex items-center gap-2 border-b border-border/70 px-4 py-3">
          <Mic className="h-4 w-4 text-primary" aria-hidden />
          <h3 className="text-sm font-semibold text-primary-text">
            <Lang text={{ ko: "Provider 활성", en: "Provider enablement" }} />
          </h3>
        </header>
        {SPEECH_CATALOG_PROVIDER_TYPES.map((provider: SpeechCatalogProviderType) => {
          const routable = Boolean(providerRoutable[provider]);
          return (
            <div
              key={provider}
              className="flex items-center justify-between gap-4 border-b border-border/70 px-4 py-3 last:border-b-0"
            >
              <div className="min-w-0">
                <span className="text-sm font-medium text-primary-text">{provider}</span>
                {!routable ? (
                  <p className="mt-0.5 text-xxs leading-4 text-secondary-text">
                    <Lang
                      text={{
                        ko: "라우팅 가능한 검증 모델이 없어 켤 수 없습니다. 코드 정책이 상한입니다.",
                        en: "No verified routable model, so it cannot be enabled. Code policy is the ceiling.",
                      }}
                    />
                  </p>
                ) : null}
              </div>
              <Switch
                checked={Boolean(controls.providerEnabled[provider])}
                disabled={saving || !routable}
                onCheckedChange={(checked) =>
                  void submit({ providerEnabled: { ...controls.providerEnabled, [provider]: checked } })
                }
                aria-label={lang({ ko: `${provider} 활성 상태`, en: `${provider} enabled state` })}
              />
            </div>
          );
        })}
      </section>

      <section className="rounded-xl border border-border bg-surface">
        <header className="flex items-center gap-2 border-b border-border/70 px-4 py-3">
          <Wallet className="h-4 w-4 text-primary" aria-hidden />
          <h3 className="text-sm font-semibold text-primary-text">
            <Lang text={{ ko: "지출 상한 (정가 기준 USD)", en: "Spend caps (list-price USD)" }} />
          </h3>
        </header>
        <p className="px-4 pt-3 text-xxs leading-5 text-secondary-text">
          <Lang
            text={{
              ko: "빈 칸은 미확정이며 강제하지 않습니다. 0은 차단이고 견적이 0이어도 막습니다. Grant로 현금 지출이 0이어도 상한은 정가로 계산합니다.",
              en: "Blank means unset and is not enforced. 0 blocks, even for a zero estimate. Caps are computed at list price even while the grant makes cash cost zero.",
            }}
          />
          {" "}
          <Lang
            text={{
              ko: `상한 미확정이면 호출이 차단되는 provider: ${SPEECH_BUDGET_REQUIRED_PROVIDERS.join(", ")}`,
              en: `Providers blocked while caps are unset: ${SPEECH_BUDGET_REQUIRED_PROVIDERS.join(", ")}`,
            }}
          />
        </p>
        <CapRow
          title={<Lang text={{ ko: "조직 전체", en: "Organization-wide" }} />}
          hint={
            <Lang
              text={{
                ko: "owner 배분과 무관하게 항상 함께 적용됩니다. 배분 합계와 일치할 필요는 없습니다.",
                en: "Always applied alongside owner caps. It need not equal the sum of allocations.",
              }}
            />
          }
          limits={controls.budget}
          draft={globalDraft}
          disabled={saving}
          onChange={(field, value) => setGlobalDraft((current) => ({ ...current, [field]: value }))}
        />
        {SPEECH_BUDGET_OWNERS.map((owner) => (
          <CapRow
            key={owner}
            title={<Lang text={OWNER_LABELS[owner]} />}
            limits={controls.budgetByOwner[owner]}
            draft={ownerDraft[owner] || {}}
            disabled={saving}
            onChange={(field, value) =>
              setOwnerDraft((current) => ({ ...current, [owner]: { ...(current[owner] || {}), [field]: value } }))
            }
          />
        ))}
        <div className="flex justify-end gap-2 px-4 py-3">
          <Button size="sm" variant="outline" disabled={saving} onClick={() => void load()}>
            <Lang text={{ ko: "되돌리기", en: "Reset" }} />
          </Button>
          <Button size="sm" loading={saving} disabled={saving} onClick={() => void submitBudget()}>
            <Lang text={{ ko: "상한 저장", en: "Save caps" }} />
          </Button>
        </div>
      </section>
    </div>
  );
}
