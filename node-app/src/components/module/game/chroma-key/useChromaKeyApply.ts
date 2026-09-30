/**
 * ChromaKey v2 — Apply flow hook (CK-402)
 *
 * 로컬 preview → 서버 apply → commit 흐름을 관리한다.
 * 품질 실패 시 AI fallback 확인을 요구하며, 확인 전까지 provider 호출을 방지한다.
 *
 * @domain game.asset-pipeline.chroma-key
 * @scope browser
 */

import { useCallback, useRef, useState } from "react";
import { toast } from "sonner";
import { lang } from "components/module/i18n";
import { applyChromaKey, commitChromaKey } from "libs/api/game";
import type { ChromaKeyApplyAction, ChromaKeyApplyResponse, ChromaKeyCommitResponse } from "libs/api/game";
import type { ChromaKeyOptionsType } from "types/game/chroma-key";
import type { ChromaKeyPreviewResult } from "utils/game/chromaKeyBrowserAdapter";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ChromaKeyApplyPhase = "idle" | "preview" | "applying" | "committing" | "done" | "error";

export type ChromaKeyApplyState = {
  phase: ChromaKeyApplyPhase;
  previewResult: ChromaKeyPreviewResult | null;
  applyResponse: ChromaKeyApplyResponse["data"] | null;
  commitResponse: ChromaKeyCommitResponse["data"] | null;
  error: string | null;
  needsFallback: boolean;
  fallbackPending: boolean;
};

export function useChromaKeyApply(gameAssetId: string, expectedSourceSha?: string) {
  const [state, setState] = useState<ChromaKeyApplyState>({
    phase: "idle", previewResult: null, applyResponse: null,
    commitResponse: null, error: null, needsFallback: false, fallbackPending: false,
  });
  const optionsRef = useRef<ChromaKeyOptionsType | null>(null);
  const abortRef = useRef(false);

  const handlePreviewResult = useCallback((result: ChromaKeyPreviewResult | null) => {
    if (!result) return;
    const verdict = result.evaluation?.verdict;
    const needsFallback = verdict === "fail" || verdict === "fallback";
    setState((prev) => ({
      ...prev, phase: needsFallback ? "idle" : prev.phase,
      previewResult: result, needsFallback, fallbackPending: false,
    }));
  }, []);

  const applyAndCommit = useCallback(
    async (options: ChromaKeyOptionsType, action: ChromaKeyApplyAction) => {
      optionsRef.current = options;
      abortRef.current = false;
      setState((prev) => ({ ...prev, phase: "applying", error: null, applyResponse: null, commitResponse: null }));
      try {
        const applyResponse = await applyChromaKey({ gameAssetId, action, options, expectedSourceSha });
        if (!applyResponse.data) throw new Error(applyResponse.error || "apply_failed");
        const applyRes = applyResponse.data;
        setState((prev) => ({ ...prev, applyResponse: applyRes }));
        if (abortRef.current) return;

        const tempStorageKey = applyRes.tempResult?.storageKey;
        if (!tempStorageKey) throw new Error("temp_storage_key_missing");

        setState((prev) => ({ ...prev, phase: "committing" }));
        const commitResponse = await commitChromaKey({
          gameAssetId, tempStorageKey,
          sourceSha256: applyRes.sourceSha256, outputSha256: applyRes.outputSha256,
          options, method: applyRes.method, engineVersion: applyRes.engineVersion,
          quality: applyRes.quality, evaluation: applyRes.evaluation,
          inputWidth: applyRes.sourceWidth, inputHeight: applyRes.sourceHeight,
        });
        if (!commitResponse.data) throw new Error(commitResponse.error || "commit_failed");

        const coins = applyRes.coins || 0;
        setState((prev) => ({ ...prev, phase: "done", commitResponse: commitResponse.data, fallbackPending: false }));
        toast.success(
          coins > 0
            ? lang({ ko: `${coins}코인으로 AI 배경 제거 완료`, en: `AI background removal done (${coins} coins)` })
            : lang({ ko: "로컬 크로마키 적용 완료 (0코인)", en: "Local chroma key applied (0 coins)" }),
        );
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        setState((prev) => ({ ...prev, phase: "error", error: msg }));
        toast.error(lang({ ko: `적용 실패: ${msg}`, en: `Apply failed: ${msg}` }));
      }
    },
    [expectedSourceSha, gameAssetId],
  );

  const applyLocal = useCallback((o: ChromaKeyOptionsType) => { void applyAndCommit(o, "local-only"); }, [applyAndCommit]);
  const confirmFallback = useCallback((o: ChromaKeyOptionsType) => {
    setState((prev) => ({ ...prev, fallbackPending: true }));
    void applyAndCommit(o, "ai-fallback");
  }, [applyAndCommit]);
  const declineFallback = useCallback(() => {
    setState((prev) => ({ ...prev, fallbackPending: false, needsFallback: false, phase: "idle" }));
  }, []);
  const abort = useCallback(() => { abortRef.current = true; setState((prev) => ({ ...prev, phase: "idle", error: null })); }, []);
  const reset = useCallback(() => {
    abortRef.current = false;
    setState({ phase: "idle", previewResult: null, applyResponse: null, commitResponse: null, error: null, needsFallback: false, fallbackPending: false });
  }, []);

  return { state, handlePreviewResult, applyLocal, confirmFallback, declineFallback, abort, reset, optionsRef };
}
