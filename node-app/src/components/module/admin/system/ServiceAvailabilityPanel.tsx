"use client";

import { useMemo, useState } from "react";
import { AppWindow, Blocks, LockKeyhole, Radio } from "lucide-react";
import { Input, Switch } from "@amu-labs/ui";
import { Lang, lang } from "components/module/i18n";
import { SERVICE_DEFINITIONS, type ServiceDefinition, type ServiceKey } from "consts/system/serviceAvailability";
import { patchServiceAvailability } from "libs/api/admin/serviceAvailability";
import { useServiceAvailability } from "components/module/service";
import { logger } from "utils/log";

function ServiceRow({
  service,
  enabled,
  saving,
  disabled,
  onToggle,
}: {
  service: ServiceDefinition;
  enabled: boolean;
  saving: boolean;
  disabled: boolean;
  onToggle: (key: ServiceKey, enabled: boolean) => void;
}) {
  return (
    <div className="flex min-h-16 items-center justify-between gap-4 border-b border-border/70 px-4 py-3 last:border-b-0">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-semibold text-primary-text">{service.label}</span>
          <span
            className={
              enabled
                ? "rounded-full bg-emerald-500/10 px-2 py-0.5 text-xxs font-semibold text-emerald-700"
                : "rounded-full bg-muted px-2 py-0.5 text-xxs font-semibold text-secondary-text"
            }
          >
            {enabled ? "ON" : "OFF"}
          </span>
        </div>
        <p className="mt-1 text-xs leading-5 text-secondary-text">
          <Lang text={service.description} />
        </p>
      </div>
      <Switch
        checked={enabled}
        disabled={disabled || saving}
        onCheckedChange={(checked) => onToggle(service.key, checked)}
        aria-label={lang({ ko: `${service.label} 사용자 공개 상태`, en: `${service.label} public availability` })}
      />
    </div>
  );
}

export function ServiceAvailabilityPanel() {
  const { services, replaceServices } = useServiceAvailability();
  const [changeReason, setChangeReason] = useState("");
  const [savingKey, setSavingKey] = useState<ServiceKey | null>(null);
  const [error, setError] = useState("");

  const grouped = useMemo(
    () => ({
      service: SERVICE_DEFINITIONS.filter((item) => item.group === "service"),
      "mini-app": SERVICE_DEFINITIONS.filter((item) => item.group === "mini-app"),
    }),
    [],
  );

  const handleToggle = async (key: ServiceKey, enabled: boolean) => {
    const reason = changeReason.trim();
    if (!reason) {
      setError(lang({ ko: "변경 사유를 먼저 입력해 주세요.", en: "Enter a change reason first." }));
      return;
    }

    setSavingKey(key);
    setError("");
    try {
      const nextServices = await patchServiceAvailability({ key, enabled, reason });
      replaceServices(nextServices);
    } catch (nextError) {
      logger.error("[ServiceAvailabilityPanel] 공개 상태 저장 실패", nextError);
      setError(
        lang({ ko: "서비스 공개 상태를 저장하지 못했습니다.", en: "Failed to save service availability." }),
      );
    } finally {
      setSavingKey(null);
    }
  };

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
      <section className="rounded-xl border border-border bg-surface p-4">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <LockKeyhole className="h-5 w-5" aria-hidden />
          </span>
          <div>
            <h2 className="font-semibold">
              <Lang text={{ ko: "사용자 공개 상태", en: "Public availability" }} />
            </h2>
            <p className="mt-1 text-xs leading-5 text-secondary-text">
              <Lang
                text={{
                  ko: "OFF로 전환하면 일반 사용자 메뉴와 직접 경로에서 접근이 제한됩니다. 통합 관리자는 개선·검증을 위해 계속 사용할 수 있습니다.",
                  en: "OFF hides the item and blocks its public route. Platform administrators retain access for improvements and verification.",
                }}
              />
            </p>
          </div>
        </div>

        <label className="mt-4 block text-sm font-medium" htmlFor="service-availability-reason">
          <Lang text={{ ko: "변경 사유", en: "Change reason" }} />
        </label>
        <Input
          id="service-availability-reason"
          className="mt-2"
          value={changeReason}
          onChange={(event) => setChangeReason(event.target.value)}
          placeholder={lang({
            ko: "예: 공개 전 기능 안정화 및 콘텐츠 보강",
            en: "Example: stabilization and content improvements before launch",
          })}
        />
        <p className="mt-2 text-xs text-secondary-text">
          <Lang text={{ ko: "모든 변경은 관리자와 사유를 포함해 감사 로그에 기록됩니다.", en: "Every change is recorded with the administrator and reason." }} />
        </p>
      </section>

      {error ? (
        <div role="alert" className="rounded-xl border border-danger/30 bg-danger/5 px-4 py-3 text-sm text-danger">
          {error}
        </div>
      ) : null}

      <section className="overflow-hidden rounded-xl border border-border bg-surface">
        <div className="flex items-center gap-2 border-b border-border bg-muted/30 px-4 py-3">
          <AppWindow className="h-4 w-4 text-primary" aria-hidden />
          <h3 className="text-sm font-semibold">
            <Lang text={{ ko: "주요 서비스", en: "Main services" }} />
          </h3>
        </div>
        {grouped.service.map((service) => (
          <ServiceRow
            key={service.key}
            service={service}
            enabled={services[service.key]}
            saving={savingKey === service.key}
            disabled={Boolean(savingKey) || !changeReason.trim()}
            onToggle={handleToggle}
          />
        ))}
      </section>

      <section className="overflow-hidden rounded-xl border border-border bg-surface">
        <div className="flex items-center gap-2 border-b border-border bg-muted/30 px-4 py-3">
          <Blocks className="h-4 w-4 text-primary" aria-hidden />
          <h3 className="text-sm font-semibold">
            <Lang text={{ ko: "유용한 앱", en: "Utility apps" }} />
          </h3>
        </div>
        {grouped["mini-app"].map((service) => (
          <ServiceRow
            key={service.key}
            service={service}
            enabled={services[service.key]}
            saving={savingKey === service.key}
            disabled={Boolean(savingKey) || !changeReason.trim()}
            onToggle={handleToggle}
          />
        ))}
      </section>

      <div className="flex items-center gap-2 rounded-xl border border-border/70 bg-muted/20 px-4 py-3 text-xs text-secondary-text">
        <Radio className="h-4 w-4 shrink-0 text-primary" aria-hidden />
        <Lang
          text={{
            ko: "열려 있는 사용자 화면은 최대 60초 이내 또는 창 포커스 복귀 시 새 상태를 반영합니다.",
            en: "Open user sessions refresh within 60 seconds or when the window regains focus.",
          }}
        />
      </div>
    </div>
  );
}
