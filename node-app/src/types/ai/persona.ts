import type { ISpeechVoiceProfile } from "./chat";

// 페르소나 무드 타입
export type PersonaMoodType =
  | "neutral" // 중립적 - 감정 기복이 크지 않은 평범한 상태
  | "confident" // 자신감 - 주변 사람들에게 신뢰감을 주고, 리더로 보임
  | "calm" // 차분함 - 편안함과 심리적 안정감을 제공
  | "passionate" // 열정적 - 강한 끌림을 주어 함께하고 싶게 만듦
  | "mysterious" // 신비로움 - 호기심을 자극하고 묘한 인상을 남김
  | "optimistic" // 긍정적 - 분위기를 띄우고 기분 좋게 만듦
  | "intellectual" // 지적임 - 깊이 있는 인상을 주고 판단력을 인정받음
  | "charismatic" // 카리스마 - 리더십과 통제력을 가지며 주변을 압도
  | "cheerful" // 유쾌함 - 팀워크에 유리하고 관계 형성에 도움
  | "anxious" // 불안함 - 긴장감을 높여 함께 있으면 불안해짐
  | "sensitive" // 예민함 - 말 걸기 껄끄럽고 함께 있으면 피로함
  | "aloof" // 차가움 - 거리감을 주어 친해지기 어려움
  | "distracted" // 산만함 - 집중이 어렵고 피로감을 느낌
  | "lethargic" // 무기력함 - 에너지가 소진되는 느낌을 줌
  | "cynical" // 시니컬 - 마음을 열기 어렵고 거부감을 느낌
  | "irritable"; // 불쾌함 - 방어적 분위기를 조성하고 멀어지려 함

// 페르소나 타입 (인간 / 몬스터)
export type PersonaType = "human" | "monster";
export type PersonaVisibilityType = "private" | "unlisted" | "public";
export type PersonaEditPolicyType = "owner-only" | "admin-only";
export type PersonaForkPolicyType = "fork-on-use";
export type PersonaStatusType = "active" | "archived" | "blocked";
export type TutorsPersonaAccessKind = "owner" | "gift";

export interface ITutorsPersonaAccess {
  kind: TutorsPersonaAccessKind;
  grantId?: string;
  grantStatus?: "pending" | "accepted" | "rejected" | "revoked";
  sourceOwnerId?: string;
  recipientActorId?: string;
  canEdit: boolean;
  canUse: boolean;
}

// 스프라이트 방향 키 (base 4방향 — 스크린 방향 => 아이소 대각 별칭)
// - left => north-west (NW)
// - up => north-east (NE)
// - right => south-east (SE)
// - down => south-west (SW)
export type PersonaSpriteBaseDirection = "left" | "right" | "up" | "down";

// 스프라이트 대각 방향 키 (시트 v2 전용 — 스크린 대각 => 아이소 cardinal)
// - down-left => west (W)
// - up-left => north (N)
// - up-right => east (E)
// - down-right => south (S)
export type PersonaSpriteDiagonalDirection = "down-left" | "up-left" | "up-right" | "down-right";

// 스프라이트 방향 키 (에셋 계약 v2 = base 4 + 대각 4)
export type PersonaSpriteDirection = PersonaSpriteBaseDirection | PersonaSpriteDiagonalDirection;

export interface IPersonaSpriteAnimation {
  row: number;
  frames: number[];
}

// 방향별 애니메이션 메타 맵
// - base 4방향은 필수 (v1 레거시 시트 호환), 대각 4방향은 directionCount=8 시트에서만 존재
// - 행 순서 규격은 권고값이며, 런타임 행 매핑은 항상 이 메타(row/frames)가 권위
export type PersonaSpriteAnimationMap = Record<PersonaSpriteBaseDirection, IPersonaSpriteAnimation> &
  Partial<Record<PersonaSpriteDiagonalDirection, IPersonaSpriteAnimation>>;

export interface IPersonaSpriteResource {
  url: string;
  frameWidth: number;
  frameHeight: number;
  columns: number;
  rows: number;

  // 시트 방향 수 (에셋 계약 v2 / D1)
  // - 4 (기본값/미지정 = v1 레거시 시트): 대각 입력은 렌더링 시 가장 가까운 base 방향으로 수렴
  // - 8: 대각 전용 행(row 4~7) 사용
  directionCount?: 4 | 8;

  fps?: number;
  idleFps?: number;
  idleDirection?: PersonaSpriteDirection;
  animations: PersonaSpriteAnimationMap;

  // 동작 시트 자체의 재생 정책. 기본 걷기 시트는 기존 fps/idleFps 계약을 그대로 사용한다.
  loop?: boolean;
}

export interface IPersonaSprite extends IPersonaSpriteResource {
  // 기본 걷기 외 선택 동작. 각 동작은 같은 8방향 메타 계약을 독립적으로 가진다.
  // 런타임은 필요한 상황에서 action key를 선택하며, 미지원 런타임은 기존 기본 시트만 사용한다.
  actions?: Record<string, IPersonaSpriteResource>;
}

// 페르소나 기본 데이터

// 페르소나 프로필 이미지 인터페이스
export interface IPersonaProfileMap {
  default: string[];
  [variant: string]: string[];
}

/** Tutors 공개 랜딩 갤러리에 노출하는 최소 읽기 전용 데이터. */
export interface PublicTutorGalleryItemType {
  pid: string;
  name: string;
  imageUrl: string;
}

export interface IPersonaAuthorProfile {
  displayName?: string;
}

// 페르소나 능력치
export interface IPersonaAbility {
  level: number; // 0 ~ 999
  xp: number; // 0 ~ 100
  hp: number; // 0 ~ 200
  mp: number; // 0 ~ 200
  iq: number; // 50 ~ 150
  eq: number; // 50 ~ 150
  luck: number; // 0 ~ 100
  mood?: PersonaMoodType;
  intimacy?: number; // 0 ~ 999
  ownership?: boolean; // 해당 캐릭터에 대한 영구 소유권
  extra?: Record<string, unknown>; // 필요 시 확장 옵션
}

// 유저별 페르소나 아이템 (캐릭터 카드용)
export interface IPersonaItem extends IPersonaAbility {
  // 페르소나 식별자
  pid: string;
  displayName?: string;
  isUnlocked?: boolean;
  firstInteraction?: string; // ISO string
  lastInteraction?: string; // ISO string
  totalInteractions?: number;
  hasArtifact?: boolean;
  isNewCharacter?: boolean;
}

export interface IPersonaBase {
  pid: string; // 고유 ID
  personaType: PersonaType;

  // 공통 프로필 정보
  name: string;
  age?: string;
  appearance?: string; // 외모
  background?: string; // 배경 정보
  personality?: string; // 성격
  speechStyle?: string; // 텍스트 응답 말투/어투 규칙
  summary?: string; // 요약 정보

  // 프로필 & 스프라이트 정보
  profiles: IPersonaProfileMap;
  sprite?: IPersonaSprite | null;

  // 연결 메타 정보
  systemPersonaKey?: string;
  /** 생성 당시 선택한 System Persona revision. 기존 문서는 prompt 동적 fallback을 유지한다. */
  systemPersonaRevision?: number;
  universeId?: string;
  /** UniverseNarrativeRuleset이 의미를 정의하는 정규 종족 ID. legacy species 표시 문자열과 분리한다. */
  speciesId?: string;

  // 사용자/공유 정책 메타
  ownerId?: string;
  instanceOwnerId?: string;
  visibility?: PersonaVisibilityType;
  editPolicy?: PersonaEditPolicyType;
  forkPolicy?: PersonaForkPolicyType;
  status?: PersonaStatusType;
  version?: number;
  isTemplate?: boolean;
  sourcePersonaId?: string;
  sourceVersion?: number;
  sourceOwnerId?: string;
  derivedFromSystemPersonaKey?: string;
  lastSyncedAt?: string;
  authorProfile?: IPersonaAuthorProfile | null;
  voiceProfile?: ISpeechVoiceProfile | null;
  credits?: {
    originalName?: string;
    originalOwnerId?: string;
    originalPersonaId?: string;
  } | null;
  tutorsAccess?: ITutorsPersonaAccess;
  createdAt?: string | Date;
  updatedAt?: string | Date;
}

export interface IPersona extends IPersonaBase {
  // 인간형 페르소나 정보
  gender?: string;
  nationality?: string;
  job?: string;
  language?: string; // 페르소나가 구사할 수 있는 언어들
  values?: string; // 페르소나의 가치관
  preferences?: string; // 페르소나가 좋아하는 것들

  // Tutors 전용 정보
  tutorIntro?: string;
  /** Tutors와 Play가 공유하는 서사적 역할. 학습 평가 mechanics를 포함하지 않는다. */
  sharedRoleIdentity?: Record<string, unknown> | null;
  tutorsPolicy?: Record<string, unknown> | null;
  tutorsUi?: Record<string, unknown> | null;
  tutorGoalBlueprint?: Record<string, unknown> | null;
  tutorBehaviorAxes?: Record<string, unknown> | null;
  narrativeGenesis?: Record<string, unknown> | null;

  // 몬스터형 페르소나 정보
  species?: string; // 종 또는 몬스터 타입
  habitat?: string; // 서식지
  threatLevel?: string; // 위험도 등급
  specialAbilities?: string; // 특수 능력
  artifact?: string; // 소환물
}

// =========================
// Persona UI Types
// =========================
export type PersonaFormBaseType = IPersona & { _id?: string };
export type PersonaFormValuesType = IPersona;
