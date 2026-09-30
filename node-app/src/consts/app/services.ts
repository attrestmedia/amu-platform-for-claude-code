// ----- Universe Services -----
export const UNIVERSE_NAMESPACE_KEY = "npc_chat" as const;
export const COMMERCE_NAMESPACE_KEY = "commerce_ai" as const;

// ----- Gen Studio -----
export const IMAGE_STUDIO_NAMESPACE_KEY = "image_studio" as const;
export const IMAGE_STUDIO_COMMERCE_NAMESPACE_KEY = "image_studio_commerce" as const;
export const IMAGE_STUDIO_USER_PROMPTS_KEY = "lab/user_image_prompts" as const;
export const IMAGE_STUDIO_DATA_ROOT = "/apps/gen-studio" as const;
export const GEN_STUDIO_CUSTOM_PROMPT_TEMPLATE_KEY = "__gen_studio_custom_prompt__" as const;
// 커스텀 프롬프트 템플릿 키를 사용자에게 노출할 때의 표시 라벨
export const GEN_STUDIO_CUSTOM_PROMPT_TEMPLATE_LABEL = "Custom Template" as const;

// 템플릿 키를 표시용 라벨로 변환 — 커스텀 키는 고정 라벨, 그 외는 제목/키 순으로 폴백
export function resolveGenStudioTemplateLabel(templateKey?: string | null, fallbackTitle?: string | null): string {
  const key = String(templateKey ?? "").trim();
  if (key === GEN_STUDIO_CUSTOM_PROMPT_TEMPLATE_KEY) return GEN_STUDIO_CUSTOM_PROMPT_TEMPLATE_LABEL;
  return String(fallbackTitle ?? "").trim() || key;
}
export const GEN_STUDIO_REALISTIC_CHARACTER_REFERENCE_TEMPLATE_KEY = "realistic-character-reference-profile" as const;
export const GEN_STUDIO_REALISTIC_CHARACTER_TYPE_VARIABLE_KEY = "character_type" as const;
export const GEN_STUDIO_REALISTIC_CHARACTER_REQUIRED_VARIABLE_KEYS = [
  GEN_STUDIO_REALISTIC_CHARACTER_TYPE_VARIABLE_KEY,
] as const;
export const IMAGE_USAGE_TIP_MAX = 140;
export const MAX_GEN_STUDIO_TEMPLATE_GROUP_ITEMS = 100;
export const OPEN_GEN_STUDIO_MANAGEMENT_EVENT = "amu:open-gen-studio-management" as const;
export type GenStudioManagementTabType =
  | "image"
  | "content"
  | "bookmarks"
  | "content-bookmarks"
  | "extra-prompts";
export const USER_CREATION_LIBRARY_PATH = "/library" as const;
export const STUDIO_GENERATION_SOURCE_SERVICE_VALUES = [
  "gen-studio",
  "tutors",
  "store",
  "play",
  "mini-app",
  "marketing",
  "admin",
  "agent",
  "upload",
  "unknown",
] as const;
export const STUDIO_GENERATION_SOURCE_SERVICE_LABELS = {
  "gen-studio": { ko: "Gen Studio", en: "Gen Studio" },
  tutors: { ko: "Tutors", en: "Tutors" },
  store: { ko: "Store", en: "Store" },
  play: { ko: "Play", en: "Play" },
  "mini-app": { ko: "미니앱", en: "Mini Apps" },
  marketing: { ko: "마케팅", en: "Marketing" },
  admin: { ko: "관리자 도구", en: "Admin Tools" },
  agent: { ko: "에이전트", en: "Agent" },
  upload: { ko: "직접 업로드", en: "Uploaded" },
  unknown: { ko: "이전 생성", en: "Legacy" },
} as const;

export const CONTENT_STUDIO_NAMESPACE_KEY = "content_studio" as const;
export const CONTENT_STUDIO_USER_PROMPTS_KEY = "lab/user_content_prompts" as const;
export const CONTENT_PLATFORM_CUSTOM_VALUE = "__custom__" as const;
export const CONTENT_PLATFORM_OPTIONS = [
  "instagram",
  "threads",
  "linkedin",
  "x",
  "youtube",
  "blog",
  CONTENT_PLATFORM_CUSTOM_VALUE,
] as const;
export const CONTENT_LENGTH_CUSTOM_VALUE = "__custom__" as const;
export const CONTENT_LENGTH_PRESET_OPTIONS = [
  "threads: 2-4문장",
  "linkedin: 800-1200자",
  "blog: 1500-2500자",
  "instagram: 3-5문장 + 해시태그",
] as const;
export const CONTENT_OUTPUT_FORMAT_OPTIONS = ["markdown/mermaid", "json"] as const;
export const DEFAULT_CONTENT_OUTPUT_FORMAT = "markdown/mermaid" as const;

// ----- The Tutors -----
export const TUTORS_NAMESPACE_KEY = "tutors" as const;
export const TUTORS_MAX_SELECTED = 5;
export const TUTORS_BLOCKED_KEYS = new Set(["__proto__", "prototype", "constructor"]);
export const TUTORS_HUMAN_PROFILE_TEMPLATE_GROUP_KEY = "tutors-profile-human" as const;
export const TUTORS_MONSTER_PROFILE_TEMPLATE_GROUP_KEY = "tutors-profile-monster" as const;
export const TUTORS_CONVERSATION_HINT_TEMPLATE_KEY = "conversation_hint" as const;

// system 백그라운드 서비스가 호출하는 admin 전용(노출 범위=어드민) 콘텐츠 템플릿 허용목록.
// 사용자가 카탈로그에서 직접 고르지 않고 서버 기능이 호출하는 admin 템플릿만 등록한다.
// (allowlist 외 admin 템플릿은 user-facing 라우트에서 계속 public 전용으로만 조회되어 노출되지 않는다.)
export const SYSTEM_BACKGROUND_CONTENT_TEMPLATE_KEYS: ReadonlySet<string> = new Set([
  TUTORS_CONVERSATION_HINT_TEMPLATE_KEY,
]);
export const SMARTSTORE_PRODUCT_IMAGE_TEMPLATE_GROUP_KEY = "smartstore-product-image" as const;
// 콘텐츠 템플릿 그룹 — 어드민에서 그룹 생성 시 중앙 관리가 활성화되고, 미존재 시 코드 fallback 유지 (fail-soft)
export const SMARTSTORE_PRODUCT_CONTENT_TEMPLATE_GROUP_KEY = "smartstore-product-content" as const;
export const CHARACTER_REFERENCE_KIT_TEMPLATE_KEY = "smartstore-model-reference-kit-v1" as const;
export const CHARACTER_REFERENCE_KIT_TEMPLATE_VERSION = 3 as const;
// 템플릿 v3의 자유 입력 변수명. v2까지 쓰던 "model_reference_spec"은 templateText에 존재하지 않아
// PresetDetail bootstrap의 변수 필터에서 탈락했고, 킷 스펙이 프롬프트에 주입되지 않았다 (SSM-202).
export const CHARACTER_REFERENCE_SPEC_VARIABLE_KEY = "모델스펙" as const;
export const CHARACTER_REFERENCE_REQUIRED_VARIABLE_KEYS = [
  CHARACTER_REFERENCE_SPEC_VARIABLE_KEY,
] as const;

/** 포즈만 전달하는 무채색 프록시 템플릿. 정체성은 kit이, 자세는 이 프록시가 담당한다 (SSM-203 입력). */
export const SMARTSTORE_POSE_MANNEQUIN_PROXY_TEMPLATE_KEY = "pose-reference-neutral-mannequin-proxy" as const;

// ----- Image 관련 -----
export const MAX_BASE_FILE_BYTES = 10 * 1024 * 1024; // 업로드 10MB 제한
