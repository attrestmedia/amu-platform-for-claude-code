import { useCallback } from "react";
import { usePromptStore } from "store/chat";
import { logger } from "utils/log";
import type { IExtendedNpcData } from "types/game";
import fetchClient from "libs/api/fetchClient";
import { pickArray, toUnknownRecord, pickString } from "utils/common/typeUtils";

/**
 * @docHint
 * @purpose usePromptData 훅 클라이언트 로직 캡슐화
 * @process 상태/이펙트/구독 구성  API 호출/스토어 연동  재사용 동작 제공
 * @domain ai
 * @scope global
 */

type ArchiveDailySummary = { date?: unknown; summary?: unknown };

export function usePromptData(_character: IExtendedNpcData | null, _universeId: string | null) {
  const setArchiveContext = usePromptStore((state) => state.setArchiveContext);

  const loadArchiveContext = useCallback(
    async (_userId: string, personaId: string, userPersonaId: string) => {
      try {
        const { data: archiveData } = await fetchClient.get<unknown>("/conversations/archive", {
          params: {
            personaId,
            userPersonaId,
            ...(_universeId ? { universeId: _universeId } : {}),
            limit: 100,
          },
        });
        const dailySummaries = pickArray<ArchiveDailySummary>(toUnknownRecord(archiveData).dailySummaries);
        const recentSummaries = dailySummaries
          .slice(-100)
          .map((summary) => `[${pickString(summary?.date)}] ${pickString(summary?.summary)}`)
          .join("\n");

        const archiveContext = recentSummaries ? `\n\n=== 이전 대화 요약 ===\n${recentSummaries}\n` : "";
        setArchiveContext(archiveContext);
        logger.log("아카이브 컨텍스트 로드 완료");
        return;
      } catch (error) {
        logger.warn("아카이브 데이터 로드 실패:", error);
      }

      setArchiveContext("");
    },
    [setArchiveContext, _universeId],
  );

  return { loadArchiveContext };
}
