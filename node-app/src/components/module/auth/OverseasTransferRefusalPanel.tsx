"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@amu-labs/ui";
import { Lang, lang } from "components/module/i18n";

/**
 * @docHint
 * @purpose 계정 설정의 ElevenLabs 국외 이전 거부·철회 UI와 거부 효과 안내
 * @process 상태 조회(GET) → 거부(POST)/철회(DELETE) → 성공 응답 확인 후에만 상태 반영, 실패 시 오류·재시도 표시
 * @domain privacy
 * @scope account-ui
 */

const PROCESSOR_KEY = "ai.elevenlabs.default" as const;
const STATUS_URL = `/api/account/overseas-transfer-refusal?processorKey=${PROCESSOR_KEY}`;

type RefusalStatus = {
  processorKey: typeof PROCESSOR_KEY;
  refused: boolean;
  updatedAt: string | null;
};

function parseRefusalStatus(payload: unknown): RefusalStatus | null {
  if (!payload || typeof payload !== "object") return null;

  const response = payload as { ok?: unknown; data?: unknown };
  if (response.ok !== true || !response.data || typeof response.data !== "object") return null;

  const data = response.data as Record<string, unknown>;
  if (
    data.processorKey !== PROCESSOR_KEY ||
    typeof data.refused !== "boolean" ||
    (typeof data.updatedAt !== "string" && data.updatedAt !== null)
  ) {
    return null;
  }

  return {
    processorKey: PROCESSOR_KEY,
    refused: data.refused,
    updatedAt: data.updatedAt,
  };
}

export default function OverseasTransferRefusalPanel() {
  const [status, setStatus] = useState<RefusalStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const requestStatus = useCallback(async () => {
    const response = await fetch(STATUS_URL, { credentials: "include", cache: "no-store" });
    const payload = (await response.json().catch(() => null)) as unknown;
    const nextStatus = parseRefusalStatus(payload);
    if (!response.ok || !nextStatus) throw new Error("OVERSEAS_TRANSFER_REFUSAL_UNAVAILABLE");
    return nextStatus;
  }, []);

  const loadStatus = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      setStatus(await requestStatus());
    } catch {
      setError(lang({
        ko: "거부 설정을 불러오지 못했습니다. 연결을 확인한 뒤 다시 시도해 주세요.",
        en: "We could not load this setting. Check your connection and try again.",
      }));
    } finally {
      setLoading(false);
    }
  }, [requestStatus]);

  useEffect(() => {
    let active = true;

    const loadInitialStatus = async () => {
      try {
        const nextStatus = await requestStatus();
        if (active) setStatus(nextStatus);
      } catch {
        if (active) {
          setError(lang({
            ko: "거부 설정을 불러오지 못했습니다. 연결을 확인한 뒤 다시 시도해 주세요.",
            en: "We could not load this setting. Check your connection and try again.",
          }));
        }
      } finally {
        if (active) setLoading(false);
      }
    };

    void loadInitialStatus();
    return () => {
      active = false;
    };
  }, [requestStatus]);

  const updateRefusal = async () => {
    if (!status || saving) return;

    const method = status.refused ? "DELETE" : "POST";
    setSaving(true);
    setError(null);

    try {
      const response = await fetch(STATUS_URL, {
        method,
        credentials: "include",
        cache: "no-store",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ processorKey: PROCESSOR_KEY }),
      });
      const payload = (await response.json().catch(() => null)) as unknown;
      const nextStatus = parseRefusalStatus(payload);
      if (!response.ok || !nextStatus) throw new Error("OVERSEAS_TRANSFER_REFUSAL_UNAVAILABLE");
      setStatus(nextStatus);
    } catch {
      setError(lang({
        ko: "거부 설정을 저장하지 못했습니다. 잠시 후 다시 시도해 주세요.",
        en: "We could not save this setting. Please try again shortly.",
      }));
    } finally {
      setSaving(false);
    }
  };

  const busy = loading || saving;

  return (
    <section
      className="rounded-2xl border border-border bg-surface p-5 sm:p-6"
      aria-labelledby="overseas-transfer-refusal-title"
      aria-busy={busy}
    >
      <h2 id="overseas-transfer-refusal-title" className="font-semibold">
        <Lang text={{ ko: "ElevenLabs 국외 이전 거부", en: "Refuse transfer to ElevenLabs (overseas)" }} />
      </h2>
      <p className="mt-3 text-sm leading-relaxed text-secondary-text">
        <Lang
          text={{
            ko: "음성 기능의 일부는 미국의 Eleven Labs Inc.(ElevenLabs)로 개인정보를 이전해 처리합니다. 국외 이전을 거부하면 그 이후 ElevenLabs를 이용하는 음성 합성·음성 전사 기능을 이용할 수 없습니다. ElevenLabs를 이용하지 않는 텍스트 대화와 음성 입력은 계속 이용할 수 있습니다. 이미 생성된 음성은 그대로 유지되며, 공개 철회나 삭제를 원하면 개인정보 보호책임자에게 요청해 주세요.",
            en: "Some voice features transfer personal information to Eleven Labs Inc. (ElevenLabs) in the United States. If you refuse this overseas transfer, voice synthesis and transcription that use ElevenLabs will be unavailable from then on. Text conversations and voice input that do not use ElevenLabs remain available. Audio that has already been generated is kept; to unpublish or delete it, please contact our privacy officer.",
          }}
        />
      </p>

      <div className="mt-4 space-y-3">
        <p className="min-h-5 text-sm font-medium" role="status" aria-live="polite">
          {loading ? (
            <Lang text={{ ko: "거부 설정을 확인하고 있습니다.", en: "Checking your refusal setting." }} />
          ) : status ? (
            status.refused ? (
              <Lang text={{ ko: "현재 거부 중", en: "Currently refused" }} />
            ) : (
              <Lang text={{ ko: "현재 허용 중", en: "Currently allowed" }} />
            )
          ) : null}
        </p>
        <Button
          variant="outline"
          className="min-h-11"
          onClick={() => {
            if (status) void updateRefusal();
            else void loadStatus();
          }}
          disabled={busy}
          aria-busy={busy}
          loading={busy}
        >
          {status ? (
            status.refused ? (
              <Lang text={{ ko: "거부 철회", en: "Withdraw refusal" }} />
            ) : (
              <Lang text={{ ko: "국외 이전 거부", en: "Refuse transfer" }} />
            )
          ) : loading ? (
            <Lang text={{ ko: "설정 확인 중", en: "Checking setting" }} />
          ) : (
            <Lang text={{ ko: "다시 시도", en: "Try again" }} />
          )}
        </Button>
      </div>
      {error ? <p className="mt-3 text-sm text-destructive" role="alert">{error}</p> : null}
    </section>
  );
}
