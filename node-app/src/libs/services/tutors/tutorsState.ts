import { TUTORS_MAX_SELECTED } from "consts/app";
import {
  DEFAULT_TUTOR_CONVERSATION_LEVEL,
  DEFAULT_TUTOR_GOAL_TYPE,
  isTutorConversationLevel,
  isTutorGoalType,
  normalizeTutorConversationLevel,
  normalizeTutorGoalType,
} from "consts/tutors";
import type { ITutorsState, ITutorsSelectedPersona, ITutorsKnowledgeSource } from "types/app";
import { normalizeTutorChatDates } from "utils/app/tutorsEditPolicy";
import { toUnknownRecord, pickString } from "utils/common/typeUtils";

/**
 * @docHint
 * @purpose 모듈 기능 제공
 * @process 핵심 로직 수행  필요한 값 노출
 * @domain tutors_policy
 * @scope shared_server_logic
 */

export const buildDefaultTutorsState = (): ITutorsState => ({
  selected: [],
  settings: {
    operationMode: "guided",
    correctionLevel: "light",
    includeKnowledgeDefault: true,
    goalType: DEFAULT_TUTOR_GOAL_TYPE,
    conversationLevel: DEFAULT_TUTOR_CONVERSATION_LEVEL,
  },
  knowledgeSources: [],
});

const MAX_ID_LEN = 128;
const SAFE_ID_RE = /^[a-zA-Z0-9_-]+$/;
function normalizeSafeId(v: unknown) {
  const s = pickString(v);
  if (!s) return "";
  if (s.length > MAX_ID_LEN) return "";
  if (s.startsWith("$")) return ""; // mongo injection style guard
  if (s.includes(".")) return ""; // mongo path injection style guard
  if (!SAFE_ID_RE.test(s)) return "";
  return s;
}

const safeIso = (v: unknown, fallback: string) => {
  const s = typeof v === "string" ? v : "";
  const d = s ? new Date(s) : null;
  return d && !isNaN(d.getTime()) ? d.toISOString() : fallback;
};

function minIso(a?: string, b?: string) {
  const ta = a ? new Date(a).getTime() : NaN;
  const tb = b ? new Date(b).getTime() : NaN;
  if (!Number.isFinite(ta)) return b;
  if (!Number.isFinite(tb)) return a;
  return ta <= tb ? a : b;
}
function maxIso(a?: string, b?: string) {
  const ta = a ? new Date(a).getTime() : NaN;
  const tb = b ? new Date(b).getTime() : NaN;
  if (!Number.isFinite(ta)) return b;
  if (!Number.isFinite(tb)) return a;
  return ta >= tb ? a : b;
}

const normalizeSelectedPersona = (raw: unknown, nowIso: string): ITutorsSelectedPersona | null => {
  const r = toUnknownRecord(raw);
  const personaId = normalizeSafeId(r.personaId);
  const universeId = normalizeSafeId(r.universeId);
  if (!personaId || !universeId) return null;

  const selectedAt = safeIso(r.selectedAt, nowIso);
  const firstChatAt = r.firstChatAt ? safeIso(r.firstChatAt, selectedAt) : undefined;
  const lockedUntil = r.lockedUntil ? safeIso(r.lockedUntil, nowIso) : undefined;
  const lockReason = typeof r.lockReason === "string" ? r.lockReason.trim().slice(0, 64) : undefined;
  const chatDates = normalizeTutorChatDates(r.chatDates);
  const accessKind = r.accessKind === "gift" ? "gift" : r.accessKind === "owner" ? "owner" : undefined;
  const giftGrantId = normalizeSafeId(r.giftGrantId);

  return {
    personaId,
    universeId,
    ...(accessKind ? { accessKind } : {}),
    ...(giftGrantId ? { giftGrantId } : {}),
    selectedAt,
    firstChatAt,
    lockedUntil,
    lockReason,
    chatDates,
  };
};

function mergeSelectedConservatively(items: ITutorsSelectedPersona[]) {
  const map = new Map<string, ITutorsSelectedPersona>();
  const order: string[] = [];

  for (const it of items) {
    const k = it.personaId;
    const prev = map.get(k);
    if (!prev) {
      map.set(k, it);
      order.push(k);
      continue;
    }

    // 락 관련은 보수적 유지(우회 방지)
    const merged: ITutorsSelectedPersona = {
      personaId: k,
      universeId: prev.universeId || it.universeId,
      accessKind: prev.accessKind || it.accessKind,
      giftGrantId: prev.giftGrantId || it.giftGrantId,
      selectedAt: (minIso(prev.selectedAt, it.selectedAt) || prev.selectedAt) as string,
      firstChatAt: minIso(prev.firstChatAt, it.firstChatAt) || prev.firstChatAt || it.firstChatAt,
      lockedUntil: maxIso(prev.lockedUntil, it.lockedUntil) || prev.lockedUntil || it.lockedUntil,
      lockReason: prev.lockReason || it.lockReason,
      chatDates: normalizeTutorChatDates([...(prev.chatDates || []), ...(it.chatDates || [])]),
    };
    map.set(k, merged);
  }

  return order.map((k) => map.get(k)!).filter(Boolean);
}

const genId = () => `ks_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
const normalizeKnowledgeSource = (raw: unknown, nowIso: string): ITutorsKnowledgeSource | null => {
  const r = toUnknownRecord(raw);
  const url = pickString(r.url);
  if (!url) return null;

  const idCandidate = pickString(r.id);
  const id = idCandidate || genId();
  const title = typeof r.title === "string" ? r.title.trim() : undefined;

  const enabled = typeof r.enabled === "boolean" ? r.enabled : true;
  const active = typeof r.active === "boolean" ? r.active : enabled;

  const createdAt = safeIso(r.createdAt, nowIso);
  const updatedAt = safeIso(r.updatedAt, nowIso);

  return { id, url, title, enabled, active, createdAt, updatedAt };
};

export type TutorsStateSettingsValidation =
  | { valid: true }
  | {
      valid: false;
      field: "conversationLevel" | "goalType";
      errorCode: "TUTORS_STATE_CONVERSATION_LEVEL_INVALID" | "TUTORS_STATE_GOAL_TYPE_INVALID";
    };

/** POST에서만 엄격하게 적용하고, GET 정규화는 아래의 호환 기본값 경로를 사용한다. */
export const validateTutorsStateSettings = (raw: unknown): TutorsStateSettingsValidation => {
  const body = toUnknownRecord(raw);
  const settings = toUnknownRecord(body.settings);
  const conversationLevel =
    typeof settings.conversationLevel === "string"
      ? settings.conversationLevel.trim()
      : settings.conversationLevel;
  const goalType = typeof settings.goalType === "string" ? settings.goalType.trim() : settings.goalType;

  if (
    Object.prototype.hasOwnProperty.call(settings, "conversationLevel") &&
    !isTutorConversationLevel(conversationLevel)
  ) {
    return {
      valid: false,
      field: "conversationLevel",
      errorCode: "TUTORS_STATE_CONVERSATION_LEVEL_INVALID",
    };
  }

  if (Object.prototype.hasOwnProperty.call(settings, "goalType") && !isTutorGoalType(goalType)) {
    return { valid: false, field: "goalType", errorCode: "TUTORS_STATE_GOAL_TYPE_INVALID" };
  }

  return { valid: true };
};

export const isTutorsPersonaLocked = (p: ITutorsSelectedPersona, now = Date.now()) => {
  if (!p.firstChatAt) return false;
  if (!p.lockedUntil) return true;

  const t = new Date(p.lockedUntil).getTime();
  if (!Number.isFinite(t)) return true; // 파싱 실패면 잠금
  return t > now;
};

export const normalizeTutorsState = (raw: unknown): ITutorsState => {
  const base = buildDefaultTutorsState();
  const nowIso = new Date().toISOString();
  const r = toUnknownRecord(raw);
  const settings = toUnknownRecord(r.settings);
  const state: ITutorsState = {
    ...base,
    ...r,
    selected: Array.isArray(r.selected)
      ? (r.selected
          .map((p: unknown) => normalizeSelectedPersona(p, nowIso))
          .filter(Boolean) as ITutorsSelectedPersona[])
      : [],
    knowledgeSources: Array.isArray(r.knowledgeSources)
      ? (r.knowledgeSources
          .map((s: unknown) => normalizeKnowledgeSource(s, nowIso))
          .filter(Boolean) as ITutorsKnowledgeSource[])
      : [],
    settings: {
      operationMode: settings.operationMode === "free" ? "free" : "guided",
      correctionLevel:
        settings.correctionLevel === "none" || settings.correctionLevel === "strict"
          ? settings.correctionLevel
          : "light",
      includeKnowledgeDefault:
        typeof settings.includeKnowledgeDefault === "boolean"
          ? settings.includeKnowledgeDefault
          : base.settings.includeKnowledgeDefault,
      conversationLevel: normalizeTutorConversationLevel(
        settings.conversationLevel,
        DEFAULT_TUTOR_CONVERSATION_LEVEL,
      ),
      goalType: normalizeTutorGoalType(settings.goalType, DEFAULT_TUTOR_GOAL_TYPE),
    },
  };

  // 중복 personaId 병합(락 보수 유지) + max 5 제한
  state.selected = mergeSelectedConservatively(state.selected);

  // 최대 5명 제한
  if (state.selected.length > TUTORS_MAX_SELECTED) state.selected = state.selected.slice(0, TUTORS_MAX_SELECTED);

  return state;
};

export const removeTutorFromTutorsState = (raw: unknown, personaId: string): ITutorsState => {
  const state = normalizeTutorsState(raw);
  return {
    ...state,
    selected: state.selected.filter((item) => item.personaId !== personaId),
  };
};

// “선택만 했을 때는 교체 가능, 대화 시작 후부터 잠금” 정책 구현
// - nextSelected(최대 5)를 서버에서 검증/적용 시 사용
export const applyTutorsSelection = (
  prev: ITutorsSelectedPersona[],
  nextSelected: Array<
    Pick<ITutorsSelectedPersona, "personaId" | "universeId"> &
      Partial<Pick<ITutorsSelectedPersona, "accessKind" | "giftGrantId">>
  >,
  nowIso: string
): ITutorsSelectedPersona[] => {
  const prevMap = new Map(prev.map((p) => [p.personaId, p]));
  const nextIds = new Set(nextSelected.map((p) => p.personaId));

  // 1) 제거 검증(잠긴 건 제거 불가)
  for (const p of prev) {
    if (!nextIds.has(p.personaId) && isTutorsPersonaLocked(p)) {
      throw new Error("LOCKED_PERSONA_CANNOT_BE_REMOVED");
    }
  }

  // 잠긴 튜터는 universeId 변경도 불가 (personaId 동일 + universeId 바꿔치기 방지)
  for (const n of nextSelected) {
    const existed = prevMap.get(n.personaId);
    if (!existed) continue;
    if (isTutorsPersonaLocked(existed) && existed.universeId !== n.universeId) {
      throw new Error("LOCKED_PERSONA_UNIVERSE_IMMUTABLE");
    }
  }

  // 2) 재구성(기존 메타 유지 + 신규는 selectedAt 부여)
  const result: ITutorsSelectedPersona[] = nextSelected.slice(0, TUTORS_MAX_SELECTED).map((n) => {
    const existed = prevMap.get(n.personaId);
    return existed
      ? {
          ...existed,
          universeId: n.universeId,
          accessKind: n.accessKind || existed.accessKind,
          giftGrantId: n.giftGrantId || existed.giftGrantId,
        } // universeId는 “실제 소속 유니버스” 유지
      : {
          personaId: n.personaId,
          universeId: n.universeId,
          ...(n.accessKind ? { accessKind: n.accessKind } : {}),
          ...(n.giftGrantId ? { giftGrantId: n.giftGrantId } : {}),
          selectedAt: nowIso,
        };
  });

  return result;
};
