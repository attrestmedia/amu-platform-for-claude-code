export const GAME_ENTITIES = {
  // NPC 행동 패턴 타입
  BEHAVIOR_TYPES: ["wander", "follow", "patrol", "stationary", "random"] as const,

  // 블록 타입
  BLOCK_TYPES: ["square", "vertical", "horizontal"] as const,

  // 방향 타입
  // - ISO 매칭: left => 북서(NW), right => 남동(SE), up => 북동(NE), down => 남서(SW)
  DIRECTIONS: ["left", "right", "up", "down"] as const,

  // 게임 오브젝트 타입
  OBJECT_TYPES: {
    NPC: "npc",
    OBSTACLE: "obstacle",
    PROTAGONIST: "protagonist",
  },

  // 블록 역할 타입
  BLOCK_ROLES: {
    PASS: "pass", // 통과 가능한 블록
    HEAL: "heal", // 치유 블록
    TRAP: "trap", // 함정 블록
  },
};

// 유저 친밀도 타입별 단계 설정
export const INTIMACY_LEVEL_TYPES = [
  "soulmate", // 소울메이트 - 영혼의 동반자 수준의 깊은 유대감
  "best_friend", // 절친 - 절친한 친구 관계
  "close_friend", // 가까운 친구 - 가깝고 편안한 친구 관계
  "friend", // 가벼운 친구 - 가깝고 편안한 친구 관계
  "acquaintance", // 지인 - 일상적으로 알고 지내는 사이
  "familiar_face", // 호감 - 서서히 가까워지는 관계
  "stranger", // 낯선 사람 - 거의 알지 못하는 낯선 사이
] as const;
export const INTIMACY_LEVEL_MAP = {
  soulmate: {
    level: 900,
    color: "pink",
  },
  best_friend: {
    level: 700,
    color: "purple",
  },
  close_friend: {
    level: 400,
    color: "blue",
  },
  friend: {
    level: 200,
    color: "green",
  },
  acquaintance: {
    level: 100,
    color: "teal",
  },
  familiar_face: {
    level: 50,
    color: "orange",
  },
  stranger: {
    level: 10,
    color: "gray",
  },
};
export type IntimacyLevelType = (typeof INTIMACY_LEVEL_TYPES)[number];
export const intimacyLevelHelper = (level: number) => {
  if (level >= INTIMACY_LEVEL_MAP.soulmate.level) return "soulmate";
  else if (level >= INTIMACY_LEVEL_MAP.best_friend.level) return "best_friend";
  else if (level >= INTIMACY_LEVEL_MAP.close_friend.level) return "close_friend";
  else if (level >= INTIMACY_LEVEL_MAP.friend.level) return "friend";
  else if (level >= INTIMACY_LEVEL_MAP.acquaintance.level) return "acquaintance";
  else if (level >= INTIMACY_LEVEL_MAP.familiar_face.level) return "familiar_face";
  else return "stranger";
};

// 페르소나 무드 타입
export const PERSONA_MOOD_TYPES = [
  "neutral", // 중립적이고 평범한
  "confident", // 자신감과 신뢰감있는
  "calm", // 차분하고 안정감있는
  "passionate", // 열정적이고 에너지 넘치는
  "mysterious", // 신비롭고 호기심을 자극하는
  "optimistic", // 긍정적이고 밝은
  "intellectual", // 지적이고 깊이 있는
  "charismatic", // 카리스마와 리더십있는
  "cheerful", // 유쾌하고 즐거운
  "anxious", // 불안하고 긴장된
  "sensitive", // 예민하고 섬세한
  "aloof", // 차갑고 거리감 있는
  "distracted", // 산만하고 집중력이 떨어지는
  "lethargic", // 무기력하고 에너지가 부족한
  "cynical", // 시니컬하고 냉소적인
  "irritable", // 불쾌하고 짜증스러운
] as const;
export type PersonaMoodType = (typeof PERSONA_MOOD_TYPES)[number];

export const PERSONA_MOOD_COLOR_MAP: Record<PersonaMoodType, string> = {
  neutral: "gray",
  confident: "blue",
  calm: "teal",
  passionate: "rose",
  mysterious: "purple",
  optimistic: "yellow",
  intellectual: "indigo",
  charismatic: "orange",
  cheerful: "pink",
  anxious: "amber",
  sensitive: "fuchsia",
  aloof: "cyan",
  distracted: "lime",
  lethargic: "stone",
  cynical: "slate",
  irritable: "red",
} as const;

// string 입력을 받아 유효한 PersonaMoodType이면 반환, 아니면 null
export const personaMoodTypeHelper = (value: unknown): PersonaMoodType | null => {
  const v = String(value ?? "").trim();
  return (PERSONA_MOOD_TYPES as readonly string[]).includes(v) ? (v as PersonaMoodType) : null;
};

export const isPersonaMoodType = (value: unknown): value is PersonaMoodType => {
  const v = String(value ?? "").trim();
  return (PERSONA_MOOD_TYPES as readonly string[]).includes(v);
};
