export const TUTOR_REGISTRATION_LOCK_CONFIRM_TEXT = {
  ko: "페르소나 등록 후에는 이름, 타입, 유니버스, 기본 성격 프리셋을 수정할 수 없습니다. 소개/외형/정체성/학습 운영 정보는 설정 화면에서 이름 확인 후 편집할 수 있습니다. 이 설정으로 등록할까요?",
  en: "After registering this persona, name, type, universe, and base persona preset cannot be edited. Intro, appearance, identity, and learning settings can be edited after confirming the tutor name in settings. Register with these settings?",
} as const;

export const TUTOR_PERMANENTLY_LOCKED_FIELDS = [
  "pid",
  "personaType",
  "universeId",
  "systemPersonaKey",
  "name",
  "ownerId",
  "instanceOwnerId",
  "visibility",
  "editPolicy",
  "forkPolicy",
  "status",
  "isTemplate",
  "sourcePersonaId",
  "sourceVersion",
  "sourceOwnerId",
  "derivedFromSystemPersonaKey",
  "credits",
] as const;

const TUTORS_SAFE_POLICY_KEYS = [
  "operationMode",
  "correctionStrength",
  "strict",
  "answerStyle",
  "targetLanguage",
  "conversationLevel",
  "goalType",
  "learningGoal",
  "topic",
  "knowledgeSources",
] as const;

const TUTORS_SAFE_UI_KEYS = ["defaultViewMode", "autoAiResponse", "subtitle", "conversationHint"] as const;

function safeObj(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function pickSafeKeys<T extends readonly string[]>(value: unknown, keys: T) {
  const obj = safeObj(value);
  const out: Record<string, unknown> = {};
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) out[key] = obj[key];
  }
  return out;
}

export function mergeAllowedTutorsPolicy(existing: unknown, next: unknown) {
  return {
    ...safeObj(existing),
    ...pickSafeKeys(next, TUTORS_SAFE_POLICY_KEYS),
  };
}

export function mergeAllowedTutorsUi(existing: unknown, next: unknown) {
  return {
    ...safeObj(existing),
    ...pickSafeKeys(next, TUTORS_SAFE_UI_KEYS),
  };
}

export function getKstDateKey(value: Date | string | number = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const kst = new Date(date.getTime() + 9 * 60 * 60 * 1000);
  const yyyy = kst.getUTCFullYear();
  const mm = String(kst.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(kst.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

export function normalizeTutorChatDates(input: unknown, limit = 60) {
  const arr = Array.isArray(input) ? input : [];
  return Array.from(
    new Set(arr.map((item) => String(item || "").trim()).filter((item) => /^\d{4}-\d{2}-\d{2}$/.test(item))),
  )
    .sort()
    .slice(-limit);
}

function dateKeyToUtcTime(dateKey: string) {
  const [y, m, d] = dateKey.split("-").map((v) => Number(v));
  if (!y || !m || !d) return NaN;
  return Date.UTC(y, m - 1, d);
}

export function computeConsecutiveTutorChatDays(chatDates: unknown) {
  const dates = normalizeTutorChatDates(chatDates);
  if (!dates.length) return 0;

  const set = new Set(dates);
  let cursor = dateKeyToUtcTime(dates[dates.length - 1]);
  if (!Number.isFinite(cursor)) return 0;

  let count = 0;
  while (set.has(new Date(cursor).toISOString().slice(0, 10))) {
    count += 1;
    cursor -= 24 * 60 * 60 * 1000;
  }
  return count;
}

function comparable(value: unknown) {
  if (value === undefined || value === null) return "";
  return JSON.stringify(value);
}

export function resolveTutorEditRequirement(existing: Record<string, unknown>, next: Record<string, unknown>) {
  const immutableFields: string[] = [];

  for (const field of TUTOR_PERMANENTLY_LOCKED_FIELDS) {
    if (comparable(existing[field]) !== comparable(next[field])) immutableFields.push(field);
  }

  return { immutableFields };
}
