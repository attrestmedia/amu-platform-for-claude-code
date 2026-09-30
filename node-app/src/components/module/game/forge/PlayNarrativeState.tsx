"use client";

import { useCallback, useEffect, useState } from "react";
import { Lang, lang } from "components/module/i18n";

type PlayNarrativeBundle = {
  activated: boolean;
  state: {
    version: number;
    activeArcIds: string[];
    activeBeatIds: string[];
    completedBeatIds: string[];
    flags: Record<string, unknown>;
    relationAffinity: Record<string, number>;
  } | null;
};

/**
 * @docHint
 * @purpose Play 파일럿 서사 상태(Story Arc·Beat·관계 수치) 표시 UI
 * @process 상태 조회  발견 activation  서버 판정 결과 표시  중복 submit 방지  aria-live 안내
 * @domain play-narrative
 * @scope client
 */

const RELATION_LABELS: Record<string, { ko: string; en: string }> = {
  "tu-scholar": { ko: "리네(학자)", en: "Rine (scholar)" },
  "tu-pioneer": { ko: "카이(개척자)", en: "Kai (pioneer)" },
  "tu-warden": { ko: "그로르(감시자)", en: "Gror (warden)" },
};

export function PlayNarrativeState() {
  const [bundle, setBundle] = useState<PlayNarrativeBundle | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [announcement, setAnnouncement] = useState("");

  const fetchNarrativeBundle = useCallback(async () => {
    try {
      const response = await fetch("/api/play/narrative/discovery", { cache: "no-store" });
      const json = (await response.json()) as { ok?: boolean; data?: PlayNarrativeBundle };
      return json.ok && json.data ? json.data : null;
    } catch {
      // 조회 실패 시 상태 없음으로 유지 (재시도 버튼 제공)
      return null;
    }
  }, []);

  useEffect(() => {
    let mounted = true;
    void fetchNarrativeBundle().then((nextBundle) => {
      if (mounted && nextBundle) setBundle(nextBundle);
    });
    return () => {
      mounted = false;
    };
  }, [fetchNarrativeBundle]);

  const activate = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const idempotencyKey = `ooc051-activate-${Date.now()}`;
      const response = await fetch("/api/play/narrative/discovery", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "activate", idempotencyKey }),
      });
      const json = (await response.json()) as { ok?: boolean; errorCode?: string };
      if (!json.ok) {
        setError(
          json.errorCode === "NARRATIVE_CONSENT_REQUIRED"
            ? lang({ ko: "서사 수집 동의가 필요합니다. 계정 설정에서 동의 후 다시 시도해 주세요.", en: "Narrative consent is required. Enable it in account settings and retry." })
            : lang({ ko: "활성화에 실패했습니다. 잠시 후 다시 시도해 주세요.", en: "Activation failed. Please try again shortly." }),
        );
        return;
      }
      setAnnouncement(lang({ ko: "서사 아크가 활성화되었습니다.", en: "Story arc activated." }));
      const nextBundle = await fetchNarrativeBundle();
      if (nextBundle) setBundle(nextBundle);
    } catch {
      setError(lang({ ko: "네트워크 오류가 발생했습니다.", en: "A network error occurred." }));
    } finally {
      setBusy(false);
    }
  }, [busy, fetchNarrativeBundle]);

  return (
    <section className="rounded-2xl border border-border bg-surface p-5" aria-labelledby="play-narrative-state-title">
      <h2 id="play-narrative-state-title" className="text-lg font-bold text-primary-text">
        <Lang text={{ ko: "서사 진행 상태", en: "Story progress" }} />
      </h2>
      <p aria-live="polite" className="sr-only">
        {announcement}
      </p>
      {!bundle ? (
        <p className="mt-2 text-sm text-secondary-text">
          <Lang text={{ ko: "상태를 불러오지 못했습니다.", en: "Could not load the story state." }} />
        </p>
      ) : !bundle.activated ? (
        <div className="mt-3 space-y-3">
          <p className="text-sm leading-6 text-secondary-text">
            <Lang
              text={{
                ko: "봉인 게이트의 미스터리 아크가 아직 시작되지 않았습니다. 첫 발견을 기록하려면 활성화하세요.",
                en: "The sealed-gate mystery arc has not started. Activate it to record your first discovery.",
              }}
            />
          </p>
          <button
            type="button"
            onClick={activate}
            disabled={busy}
            className="inline-flex h-11 items-center justify-center rounded-default bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-50"
          >
            <Lang text={{ ko: busy ? "활성화 중..." : "미스터리 아크 시작", en: busy ? "Activating..." : "Start the mystery arc" }} />
          </button>
        </div>
      ) : (
        <div className="mt-3 space-y-3 text-sm">
          <p className="text-secondary-text">
            <Lang text={{ ko: "활성 아크: 봉인 게이트의 미스터리", en: "Active arc: The sealed-gate mystery" }} />
            <span className="ml-1 text-xs">v{bundle.state?.version ?? 0}</span>
          </p>
          <p>
            <Lang text={{ ko: "완료한 발견", en: "Completed discoveries" }} />:{" "}
            {(bundle.state?.completedBeatIds || []).length > 0 ? (
              <span>{(bundle.state?.completedBeatIds || []).join(", ")}</span>
            ) : (
              <Lang text={{ ko: "아직 없음", en: "none yet" }} />
            )}
          </p>
          <ul className="space-y-1">
            {Object.entries(bundle.state?.relationAffinity || {}).map(([characterId, value]) => (
              <li key={characterId} className="text-secondary-text">
                {RELATION_LABELS[characterId] ? <Lang text={RELATION_LABELS[characterId]} /> : characterId}
                : <span className="font-semibold text-primary-text">{value > 0 ? `+${value}` : value}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {error ? (
        <p role="alert" className="mt-3 text-sm text-red-600">
          {error}
        </p>
      ) : null}
    </section>
  );
}
