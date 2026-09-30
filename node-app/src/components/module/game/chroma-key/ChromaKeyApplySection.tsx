/**
 * ChromaKey v2 — Apply Section UI (CK-402)
 *
 * 로컬 0코인 처리 / AI fallback 확인 / 적용·커밋 진행 상태를 표시한다.
 *
 * @domain game.asset-pipeline.chroma-key
 * @scope browser
 */

import { AlertTriangle, CheckCircle, Loader2, ShieldAlert } from "lucide-react";
import { Lang } from "components/module/i18n";
import { Button } from "@amu-labs/ui";
import type { ChromaKeyOptionsType } from "types/game/chroma-key";
import type { ChromaKeyApplyState } from "./useChromaKeyApply";

export type ChromaKeyApplySectionProps = {
  state: ChromaKeyApplyState;
  options: ChromaKeyOptionsType;
  disabled?: boolean;
  onApplyLocal: (options: ChromaKeyOptionsType) => void;
  onConfirmFallback: (options: ChromaKeyOptionsType) => void;
  onDeclineFallback: () => void;
  onAbort?: () => void;
  onReset: () => void;
};

export function ChromaKeyApplySection({
  state,
  options,
  disabled,
  onApplyLocal,
  onConfirmFallback,
  onDeclineFallback,
  onAbort,
  onReset,
}: ChromaKeyApplySectionProps) {
  const busy = disabled || state.phase === "applying" || state.phase === "committing";

  return (
    <section className="flex flex-col gap-3" aria-label="Chroma Key Apply" style={{ minHeight: 44 }}>
      {/* 로컬 0코인 적용 (pass/warn 상태) */}
      {!state.needsFallback && state.phase === "idle" ? (
        <Button
          variant="primary"
          size="sm"
          className="w-full min-h-11"
          disabled={busy}
          onClick={() => onApplyLocal(options)}
        >
          <CheckCircle className="size-4" aria-hidden />
          <Lang text={{ ko: "서버에 적용 (0코인)", en: "Apply on server (0 coins)" }} />
        </Button>
      ) : null}

      {/* AI fallback 필요 */}
      {state.needsFallback && !state.fallbackPending && state.phase !== "done" ? (
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-3">
          <p className="mb-2 flex items-center gap-1.5 text-xs font-medium text-destructive">
            <ShieldAlert className="size-4" aria-hidden />
            <Lang
              text={{
                ko: "로컬 크로마키 품질이 충분하지 않습니다. AI 배경 제거 fallback을 사용하시겠습니까?",
                en: "Local chroma key quality is insufficient. Use AI background removal fallback?",
              }}
            />
          </p>
          {state.previewResult?.evaluation?.reason ? (
            <p className="mb-2 text-xs text-secondary-text">
              <Lang text={{ ko: "사유", en: "Reason" }} />: {state.previewResult.evaluation.reason}
            </p>
          ) : null}
          <div className="flex gap-2">
            <Button
              variant="destructive"
              size="sm"
              className="flex-1 min-h-11"
              disabled={busy}
              onClick={() => onConfirmFallback(options)}
            >
              <AlertTriangle className="size-4" aria-hidden />
              <Lang text={{ ko: "AI fallback 적용 (코인 차감)", en: "Apply AI fallback (coins)" }} />
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="flex-1 min-h-11"
              disabled={busy}
              onClick={onDeclineFallback}
            >
              <Lang text={{ ko: "취소", en: "Cancel" }} />
            </Button>
          </div>
        </div>
      ) : null}

      {/* Applying */}
      {state.phase === "applying" ? (
        <div className="flex items-center gap-2 rounded-lg border border-primary/40 bg-primary/10 px-3 py-2 text-xs">
          <Loader2 className="size-4 motion-safe:animate-spin" aria-hidden />
          <span>
            <Lang text={{ ko: "서버에서 크로마키 처리 중...", en: "Processing chroma key on server..." }} />
          </span>
          {onAbort ? (
            <Button variant="ghost" size="sm" className="ml-auto min-h-11 text-xs" onClick={onAbort}>
              <Lang text={{ ko: "취소", en: "Cancel" }} />
            </Button>
          ) : null}
        </div>
      ) : null}

      {/* Committing */}
      {state.phase === "committing" ? (
        <div className="flex items-center gap-2 rounded-lg border border-primary/40 bg-primary/10 px-3 py-2 text-xs">
          <Loader2 className="size-4 motion-safe:animate-spin" aria-hidden />
          <span>
            <Lang text={{ ko: "R2에 저장 중...", en: "Saving to R2..." }} />
          </span>
        </div>
      ) : null}

      {/* Done */}
      {state.phase === "done" ? (
        <div className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-2">
          <p className="flex items-center gap-1.5 text-xs font-medium text-emerald-700 dark:text-emerald-400">
            <CheckCircle className="size-4" aria-hidden />
            <Lang text={{ ko: "크로마키 적용 완료", en: "Chroma key applied" }} />
          </p>
          {state.applyResponse ? (
            <p className="mt-1 text-xs text-secondary-text">
              <Lang text={{ ko: "처리 방법", en: "Method" }} />: {state.applyResponse.method}
              {state.applyResponse.coins > 0 ? ` (${state.applyResponse.coins} coins)` : " (0 coins)"}
            </p>
          ) : null}
          <Button variant="outline" size="sm" className="mt-2 w-full min-h-11 text-xs" onClick={onReset}>
            <Lang text={{ ko: "다시 편집", en: "Edit again" }} />
          </Button>
        </div>
      ) : null}

      {/* Error */}
      {state.phase === "error" ? (
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive" role="alert">
          <p className="font-medium">
            <Lang text={{ ko: "적용 실패", en: "Apply failed" }} />
          </p>
          {state.error ? <p className="mt-1">{state.error}</p> : null}
          <Button variant="outline" size="sm" className="mt-2 w-full min-h-11 text-xs" onClick={onReset}>
            <Lang text={{ ko: "다시 시도", en: "Retry" }} />
          </Button>
        </div>
      ) : null}
    </section>
  );
}
