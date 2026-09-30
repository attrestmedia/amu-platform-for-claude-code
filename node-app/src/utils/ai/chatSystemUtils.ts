import { isPersonaMoodType, PERSONA_MOOD_TYPES } from "consts/game";
import type { PersonaMoodType, IChatMessage, IMessage, SystemCodeLikeType } from "types/ai";
import { createTextHash } from "../common";
import { logger } from "../log";

/**
 * @docHint
 * @purpose chatSystemUtils 유틸 기능 제공
 * @process 입력 정규화  변환  보조 처리 제공
 * @domain ai
 * @scope shared
 */

// 현재 분위기 랜덤으로 가져오기
export const getRandomMoodType = (): PersonaMoodType => {
  return PERSONA_MOOD_TYPES[Math.floor(Math.random() * PERSONA_MOOD_TYPES.length)];
};

// 채팅 히스토리에서 중복된 마지막 사용자 메시지를 제거하고 시스템 메시지를 분리
export function processAndCleanHistory(
  history: IMessage[] | null | undefined,
  currentMessage: string,
  logPrefix: string,
  options?: { ignoreSystem?: boolean },
): {
  systemMessage: string | null;
  processedHistory: IMessage[];
} {
  let systemMessage: string | null = null;
  let processedHistory: IMessage[] = [];

  if (!history || history.length === 0) {
    return { systemMessage, processedHistory };
  }

  // 원본 배열을 변경하지 않기 위해 복사
  let historyClone = [...history];

  // 마지막 항목이 user이고 content가 현재 message와 동일하면 제거
  const lastMessage = historyClone[historyClone.length - 1];
  if (lastMessage && lastMessage.role === "user" && lastMessage.content === currentMessage) {
    historyClone = historyClone.slice(0, -1); // 마지막 항목 제거
    logger.log(`[API] ${logPrefix}: 중복된 사용자 메시지 제거됨`, {
      removedMessage: lastMessage.content,
      currentMessage: currentMessage,
    });
  }

  logger.log(`[API] ${logPrefix} processedHistory:`, historyClone);

  // 서버 authoritative 모드
  // - 클라이언트 system 주입은 무조건 무시/제거
  if (options?.ignoreSystem) {
    processedHistory = historyClone.filter((m) => m && m.role !== "system");
    systemMessage = null;
  } else {
    processedHistory = historyClone;
  }

  return { systemMessage, processedHistory };
}

// 친밀도 증가량 계산 (useChat과 messageStore에서 공통 사용)
// - conversations > relationship의 친밀도: 실제 대화를 진행한 두 캐릭터의 친밀도
// - users > UserPersonas 또는 Uersonas의  친밀도: 유저와 해당 캐릭터와의 친밀도

// 친밀도 증가량 계산 함수
export function calculateIntimacyIncrease(
  messageLength: number,
  isFirstInteraction: boolean,
  systemCode?: SystemCodeLikeType[],
): number {
  // 1. 기본 친밀도 증가량
  let baseIncrease = 0.5;

  // 2. 메시지 길이에 따른 보너스
  if (messageLength > 50) {
    baseIncrease += 0.5;
  }

  // 3. 첫 상호작용 보너스 (0.5 ~ 2)
  if (isFirstInteraction) {
    baseIncrease += Math.random() * 0.5 + 2;
  }

  // 4. systemCode에 따른 친밀도 조정
  if (systemCode && Array.isArray(systemCode)) {
    let systemCodeModifier = 0;

    systemCode.forEach((code) => {
      switch (code) {
        case "good":
          systemCodeModifier += 1.5; // 매우 긍정적 반응
          break;
        case "positive":
          systemCodeModifier += 0.5; // 긍정적 반응
          break;
        case "negative":
          systemCodeModifier -= 0.5; // 부정적 반응
          break;
        case "end-chat":
          systemCodeModifier -= 3.0; // 대화 경고 (매우 부정적)
          break;
        case "end-force":
          systemCodeModifier -= 10.0; // 즉시 대화 종료 (완전히 부정적)
          break;
      }
    });

    baseIncrease += systemCodeModifier;
  }

  logger.log("calculateIntimacyIncrease:", {
    baseIncrease,
    systemCode,
    systemCodeType: typeof systemCode,
    systemCodeIsArray: Array.isArray(systemCode),
  });

  return baseIncrease;
}

// 시스템 코드에서 mood type을 파싱하는 함수
export function extractMoodKey(systemCodes: readonly SystemCodeLikeType[] | readonly string[]): PersonaMoodType | null {
  if (!Array.isArray(systemCodes) || systemCodes.length === 0) return null;

  for (let i = systemCodes.length - 1; i >= 0; i--) {
    const raw = String(systemCodes[i] ?? "")
      .trim()
      .toLowerCase();
    if (!raw) continue;
    if (raw.length > 64) continue;

    if (!raw.startsWith("mood-")) continue;
    const candidate = raw.slice(5);

    if (isPersonaMoodType(candidate)) return candidate;
  }
  return null;
}

// talk 모드 전용: 정렬 + 중복 제거 함수
export const normalizeForTalk = (list: IChatMessage[] | null | undefined): IChatMessage[] => {
  if (!Array.isArray(list) || list.length === 0) return [];

  // 안정 정렬 (timestamp -> 기존 인덱스)
  const withIndex = list.map((m, i) => ({ ...m, _i: i }));
  withIndex.sort((a, b) => {
    const at = a.timestamp ? new Date(a.timestamp).getTime() : Number.MAX_SAFE_INTEGER;
    const bt = b.timestamp ? new Date(b.timestamp).getTime() : Number.MAX_SAFE_INTEGER;
    return at === bt ? a._i - b._i : at - bt;
  });

  // 중복 제거 (id 우선, 없으면 텍스트 해시)
  const seen = new Set<string>();
  const unique: IChatMessage[] = [];
  for (const m of withIndex) {
    const key = m.id || `${m.isUser ? "u" : "a"}-${createTextHash(m.text || "")}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(m);
  }
  return unique;
};
