import { isPresetOfCategory, type CameraPresetKey, type EmphasisPresetKey, type EnterPresetKey, type TransitionPresetKey } from "./presets";
import { MOTION_TOKENS, MOTION_TOKENS_VERSION } from "./tokens";

/**
 * `interactive-article.v1` — 인터랙티브 아티클 전용 리소스 계약.
 *
 * 인터랙티브 아티클은 `/magazine/{slug}` 기사를 그대로 재생하지 않는다.
 * 특정 원문 기사를 **기반(source)** 으로 삼되, 인터랙티브 경험용으로 완전히 재구성한 리소스를 쓴다.
 *  - `source` 는 원문 추적용 메타데이터일 뿐, 렌더 입력이 아니다.
 *  - 의미(Beat)와 표현(Scene)을 분리한다. 같은 Beat 를 Story·Hero·홈 카드가 재사용한다.
 *  - Scene 은 검증된 프리셋 키만 조합한다. 리소스에 코드·CSS·URL 직접 참조를 넣지 않는다
 *    (이미지는 `assets` 표의 assetId 로만 참조).
 *
 * 설계 근거: motion-story-runtime-design-and-implementation-plan.md §4.1 (editorial-story.v2 초안)을
 * 인터랙티브 아티클 전용 리소스로 옮긴 것이다.
 */

export const INTERACTIVE_ARTICLE_CONTRACT_TYPE = "amu-interactive-article" as const;
export const INTERACTIVE_ARTICLE_SCHEMA_VERSION = "interactive-article.v1" as const;

export const STORY_BEAT_ROLES = ["hook", "context", "problem", "insight", "evidence", "example", "turn", "takeaway", "cta"] as const;
export const STORY_SCENE_LAYOUTS = ["cover", "statement", "image_text", "quote", "data", "comparison", "outro"] as const;
export const STORY_TEXT_REVEALS = ["none", "line", "word", "fade"] as const;
export const INTERACTIVE_ARTICLE_STATUSES = ["draft", "ready", "published", "retired"] as const;
export const CLAIM_STATUSES = ["measured", "sourced", "hypothesis", "prohibited"] as const;
export const HOME_CARD_TIERS = ["standard", "motion", "signature"] as const;
export const SOURCE_ARTICLE_KINDS = ["app_content", "wp_post"] as const;

export type StoryBeatRole = (typeof STORY_BEAT_ROLES)[number];
export type StorySceneLayout = (typeof STORY_SCENE_LAYOUTS)[number];
export type StoryTextReveal = (typeof STORY_TEXT_REVEALS)[number];
export type InteractiveArticleStatus = (typeof INTERACTIVE_ARTICLE_STATUSES)[number];
export type ClaimStatus = (typeof CLAIM_STATUSES)[number];
export type HomeCardTier = (typeof HOME_CARD_TIERS)[number];

export type StoryBeat = {
  beatId: string;
  role: StoryBeatRole;
  headline?: string;
  body: string[];
  importance: 1 | 2 | 3 | 4 | 5;
  /** 원문 기사의 anchor(블록 ID·섹션 ID). 수치·인용은 여기서만 가져온다 */
  sourceRefs: string[];
};

export type DataFigure = {
  label: string;
  value: number;
  unit?: string;
  /** 소수점 자릿수 0~3 */
  precision?: number;
  /** measured · sourced 만 허용. hypothesis · prohibited 는 검증에서 거부 */
  claimStatus: ClaimStatus;
  sourceRefs: string[];
};

export type StoryScene = {
  sceneId: string;
  beatIds: string[];
  layout: StorySceneLayout;
  visual?: {
    assetId?: string;
    /** visual-runtime allowlist 의 primitive. 쓰면 fallbackAssetId 필수 */
    primitiveKey?: string;
    fallbackAssetId?: string;
    camera?: CameraPresetKey;
  };
  /** layout = data | comparison 전용 */
  data?: { figures: DataFigure[] };
  text: {
    reveal: StoryTextReveal;
    enter?: EnterPresetKey;
    emphasis?: EmphasisPresetKey;
    maxLines?: number;
  };
  timing: {
    preRollMs: number;
    durationMs: number;
    holdMs: number;
  };
  transitionOut?: TransitionPresetKey;
};

export type InteractiveArticleAsset = {
  assetId: string;
  /** 정적 번들 경로(`/...`) 또는 R2 공개 URL */
  src: string;
  alt: string;
  width: number;
  height: number;
};

export type StorySurfaceRef = { sceneIds: string[] };

export type InteractiveArticleSurfaces = {
  /** 전체 경험 (9:16 Story 플레이어) */
  story: StorySurfaceRef;
  /** 아티클 진입부 Hero — 1회 재생 */
  hero?: StorySurfaceRef;
  /** 홈(/) 시그니처 카드 — 루프 */
  homeCard?: StorySurfaceRef & { tier: HomeCardTier };
  /** 영상 export 대상 (후속) — published 에서만 허용 */
  short?: StorySurfaceRef & { format: "9:16"; maxDurationMs: number };
};

export type InteractiveArticleResource = {
  contractType: typeof INTERACTIVE_ARTICLE_CONTRACT_TYPE;
  schemaVersion: typeof INTERACTIVE_ARTICLE_SCHEMA_VERSION;
  articleId: string;
  slug: string;
  status: InteractiveArticleStatus;
  revision: string;
  createdAt: string;
  updatedAt: string;
  /** 기반 원문 기사 (추적용 메타데이터) */
  source: { kind: (typeof SOURCE_ARTICLE_KINDS)[number]; ref: string; title: string };
  title: string;
  summary: string;
  motionTokensVersion: typeof MOTION_TOKENS_VERSION;
  assets: InteractiveArticleAsset[];
  beats: StoryBeat[];
  scenes: StoryScene[];
  sceneOrder: string[];
  surfaces: InteractiveArticleSurfaces;
};

export type InteractiveArticleSurfaceKey = keyof InteractiveArticleSurfaces;

export const INTERACTIVE_ARTICLE_LIMITS = {
  maxTitleLength: 120,
  maxSummaryLength: 300,
  maxLineLength: 220,
  maxLinesPerBeat: 12,
  maxBeats: 40,
  maxScenes: 40,
  maxFigures: 4,
  maxPreRollMs: 5000,
  minDurationMs: 500,
  maxDurationMs: MOTION_TOKENS.scene.maxDurationMs,
  maxHoldMs: 10_000,
  maxLines: 8,
} as const;

// ---------------------------------------------------------------------------
// 검증
// ---------------------------------------------------------------------------

export type InteractiveArticleParseResult =
  | { ok: true; resource: InteractiveArticleResource }
  | { ok: false; errors: string[] };

type Json = Record<string, unknown>;

const ID_PATTERN = /^[a-z0-9][a-z0-9._:-]{0,95}$/;
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const ISO_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/;
const URL_LIKE = /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i;

class Checker {
  readonly errors: string[] = [];

  fail(path: string, message: string) {
    this.errors.push(`${path}: ${message}`);
  }

  object(value: unknown, path: string, required: readonly string[], optional: readonly string[] = []): value is Json {
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
      this.fail(path, "객체여야 한다");
      return false;
    }
    const allowed = new Set([...required, ...optional]);
    for (const key of Object.keys(value)) {
      if (!allowed.has(key)) this.fail(`${path}.${key}`, "알 수 없는 필드");
    }
    for (const key of required) {
      if (!(key in value)) this.fail(`${path}.${key}`, "필수 필드 누락");
    }
    return true;
  }

  string(value: unknown, path: string, { max = 500, pattern, allowEmpty = false }: { max?: number; pattern?: RegExp; allowEmpty?: boolean } = {}): value is string {
    if (typeof value !== "string") {
      this.fail(path, "문자열이어야 한다");
      return false;
    }
    if (!allowEmpty && value.trim().length === 0) {
      this.fail(path, "빈 문자열 금지");
      return false;
    }
    if (value.length > max) {
      this.fail(path, `${max}자 이하여야 한다`);
      return false;
    }
    if (pattern && !pattern.test(value)) {
      this.fail(path, `형식 불일치 (${pattern.source})`);
      return false;
    }
    return true;
  }

  int(value: unknown, path: string, min: number, max: number): value is number {
    if (typeof value !== "number" || !Number.isInteger(value) || value < min || value > max) {
      this.fail(path, `${min}~${max} 정수여야 한다`);
      return false;
    }
    return true;
  }

  finite(value: unknown, path: string): value is number {
    if (typeof value !== "number" || !Number.isFinite(value)) {
      this.fail(path, "유한한 숫자여야 한다");
      return false;
    }
    return true;
  }

  oneOf<T extends string>(value: unknown, path: string, options: readonly T[]): value is T {
    if (typeof value !== "string" || !(options as readonly string[]).includes(value)) {
      this.fail(path, `허용값: ${options.join(" | ")}`);
      return false;
    }
    return true;
  }

  array(value: unknown, path: string, min: number, max: number): value is unknown[] {
    if (!Array.isArray(value)) {
      this.fail(path, "배열이어야 한다");
      return false;
    }
    if (value.length < min || value.length > max) {
      this.fail(path, `항목 수 ${min}~${max}`);
      return false;
    }
    return true;
  }

  stringArray(value: unknown, path: string, min: number, max: number, itemMax = 200): value is string[] {
    if (!this.array(value, path, min, max)) return false;
    let ok = true;
    value.forEach((item, index) => {
      if (!this.string(item, `${path}[${index}]`, { max: itemMax })) ok = false;
    });
    return ok;
  }

  unique(values: string[], path: string) {
    const seen = new Set<string>();
    for (const value of values) {
      if (seen.has(value)) this.fail(path, `중복 ID: ${value}`);
      seen.add(value);
    }
  }
}

function checkBeat(c: Checker, value: unknown, path: string) {
  if (!c.object(value, path, ["beatId", "role", "body", "importance", "sourceRefs"], ["headline"])) return;
  const L = INTERACTIVE_ARTICLE_LIMITS;
  c.string(value.beatId, `${path}.beatId`, { max: 96, pattern: ID_PATTERN });
  c.oneOf(value.role, `${path}.role`, STORY_BEAT_ROLES);
  if (value.headline !== undefined) c.string(value.headline, `${path}.headline`, { max: L.maxLineLength });
  c.stringArray(value.body, `${path}.body`, 1, L.maxLinesPerBeat, L.maxLineLength);
  c.int(value.importance, `${path}.importance`, 1, 5);
  c.stringArray(value.sourceRefs, `${path}.sourceRefs`, 0, 20, 200);
}

function checkFigure(c: Checker, value: unknown, path: string) {
  if (!c.object(value, path, ["label", "value", "claimStatus", "sourceRefs"], ["unit", "precision"])) return;
  c.string(value.label, `${path}.label`, { max: 80 });
  c.finite(value.value, `${path}.value`);
  if (value.unit !== undefined) c.string(value.unit, `${path}.unit`, { max: 16 });
  if (value.precision !== undefined) c.int(value.precision, `${path}.precision`, 0, 3);
  if (c.oneOf(value.claimStatus, `${path}.claimStatus`, CLAIM_STATUSES) && value.claimStatus !== "measured" && value.claimStatus !== "sourced") {
    c.fail(`${path}.claimStatus`, "수치 장면에는 measured · sourced claim 만 쓸 수 있다");
  }
  c.stringArray(value.sourceRefs, `${path}.sourceRefs`, 1, 10, 200);
}

function checkScene(c: Checker, value: unknown, path: string, assetIds: Set<string>) {
  if (!c.object(value, path, ["sceneId", "beatIds", "layout", "text", "timing"], ["visual", "data", "transitionOut"])) return;
  const L = INTERACTIVE_ARTICLE_LIMITS;
  c.string(value.sceneId, `${path}.sceneId`, { max: 96, pattern: ID_PATTERN });
  c.stringArray(value.beatIds, `${path}.beatIds`, 1, 4, 96);
  const layoutOk = c.oneOf(value.layout, `${path}.layout`, STORY_SCENE_LAYOUTS);

  if (value.visual !== undefined && c.object(value.visual, `${path}.visual`, [], ["assetId", "primitiveKey", "fallbackAssetId", "camera"])) {
    const visual = value.visual;
    for (const key of ["assetId", "fallbackAssetId"] as const) {
      const assetId = visual[key];
      if (assetId === undefined) continue;
      if (!c.string(assetId, `${path}.visual.${key}`, { max: 96 })) continue;
      if (URL_LIKE.test(assetId)) c.fail(`${path}.visual.${key}`, "URL 금지 — assets 표의 assetId 로 참조한다");
      else if (!assetIds.has(assetId)) c.fail(`${path}.visual.${key}`, `assets 에 없는 assetId: ${assetId}`);
    }
    if (visual.primitiveKey !== undefined) {
      c.string(visual.primitiveKey, `${path}.visual.primitiveKey`, { max: 64, pattern: ID_PATTERN });
      if (visual.fallbackAssetId === undefined) c.fail(`${path}.visual.fallbackAssetId`, "primitiveKey 사용 시 필수");
    }
    if (visual.camera !== undefined && !isPresetOfCategory(visual.camera, "camera")) c.fail(`${path}.visual.camera`, "camera.* 프리셋이어야 한다");
  }

  const isDataLayout = value.layout === "data" || value.layout === "comparison";
  if (value.data !== undefined) {
    if (layoutOk && !isDataLayout) c.fail(`${path}.data`, "layout 이 data · comparison 일 때만 허용");
    if (c.object(value.data, `${path}.data`, ["figures"])) {
      const figures = value.data.figures;
      if (c.array(figures, `${path}.data.figures`, 1, L.maxFigures)) {
        figures.forEach((figure, index) => checkFigure(c, figure, `${path}.data.figures[${index}]`));
        if (value.layout === "comparison" && figures.length !== 2) c.fail(`${path}.data.figures`, "comparison 은 수치 2개");
      }
    }
  } else if (layoutOk && isDataLayout) {
    c.fail(`${path}.data`, "data · comparison layout 은 data 필수");
  }

  if (c.object(value.text, `${path}.text`, ["reveal"], ["enter", "emphasis", "maxLines"])) {
    const text = value.text;
    c.oneOf(text.reveal, `${path}.text.reveal`, STORY_TEXT_REVEALS);
    if (text.enter !== undefined && !isPresetOfCategory(text.enter, "enter")) c.fail(`${path}.text.enter`, "enter.* 프리셋이어야 한다");
    if (text.emphasis !== undefined && !isPresetOfCategory(text.emphasis, "emph")) c.fail(`${path}.text.emphasis`, "emph.* 프리셋이어야 한다");
    if (text.emphasis === "emph.number-count" && !isDataLayout) c.fail(`${path}.text.emphasis`, "number-count 는 data · comparison 전용");
    if (text.maxLines !== undefined) c.int(text.maxLines, `${path}.text.maxLines`, 1, L.maxLines);
  }

  if (c.object(value.timing, `${path}.timing`, ["preRollMs", "durationMs", "holdMs"])) {
    c.int(value.timing.preRollMs, `${path}.timing.preRollMs`, 0, L.maxPreRollMs);
    c.int(value.timing.durationMs, `${path}.timing.durationMs`, L.minDurationMs, L.maxDurationMs);
    c.int(value.timing.holdMs, `${path}.timing.holdMs`, 0, L.maxHoldMs);
  }

  if (value.transitionOut !== undefined && !isPresetOfCategory(value.transitionOut, "trans")) c.fail(`${path}.transitionOut`, "trans.* 프리셋이어야 한다");
}

function checkAsset(c: Checker, value: unknown, path: string) {
  if (!c.object(value, path, ["assetId", "src", "alt", "width", "height"])) return;
  c.string(value.assetId, `${path}.assetId`, { max: 96, pattern: ID_PATTERN });
  if (c.string(value.src, `${path}.src`, { max: 500 })) {
    const src = value.src;
    if (!src.startsWith("/") && !src.startsWith("https://")) c.fail(`${path}.src`, "정적 경로(/...) 또는 https URL 만 허용");
    if (src.startsWith("//")) c.fail(`${path}.src`, "프로토콜 상대 URL 금지");
  }
  c.string(value.alt, `${path}.alt`, { max: 200, allowEmpty: true });
  c.int(value.width, `${path}.width`, 1, 8192);
  c.int(value.height, `${path}.height`, 1, 8192);
}

function checkSurfaceRef(c: Checker, value: unknown, path: string, extraRequired: readonly string[], sceneIds: Set<string>): value is Json {
  if (!c.object(value, path, ["sceneIds", ...extraRequired])) return false;
  if (c.stringArray(value.sceneIds, `${path}.sceneIds`, 1, INTERACTIVE_ARTICLE_LIMITS.maxScenes, 96)) {
    c.unique(value.sceneIds, `${path}.sceneIds`);
    for (const id of value.sceneIds) if (!sceneIds.has(id)) c.fail(`${path}.sceneIds`, `없는 sceneId: ${id}`);
  }
  return true;
}

/** Scene 한 개의 표면 점유 길이 — 루프 피로 규칙은 durationMs + holdMs 기준이다 (설계 §4.1). */
function loopBudgetMs(scene: StoryScene) {
  return scene.timing.durationMs + scene.timing.holdMs;
}

function totalMs(scene: StoryScene) {
  return scene.timing.preRollMs + scene.timing.durationMs + scene.timing.holdMs;
}

function checkIntegrity(c: Checker, resource: InteractiveArticleResource) {
  const beatIds = new Set(resource.beats.map((beat) => beat.beatId));
  const sceneById = new Map(resource.scenes.map((scene) => [scene.sceneId, scene]));

  resource.scenes.forEach((scene, index) => {
    for (const beatId of scene.beatIds) if (!beatIds.has(beatId)) c.fail(`scenes[${index}].beatIds`, `없는 beatId: ${beatId}`);
  });

  const order = resource.sceneOrder;
  if (order.length !== resource.scenes.length || order.some((id) => !sceneById.has(id))) {
    c.fail("sceneOrder", "scenes 의 sceneId 를 빠짐없이 한 번씩 나열해야 한다");
  }

  const cardLike = (key: "homeCard" | "hero") => {
    const surface = resource.surfaces[key];
    if (!surface) return;
    if (surface.sceneIds.length > MOTION_TOKENS.card.maxScenes) c.fail(`surfaces.${key}.sceneIds`, `최대 ${MOTION_TOKENS.card.maxScenes}개`);
    const budget = surface.sceneIds.reduce((sum, id) => sum + (sceneById.get(id) ? loopBudgetMs(sceneById.get(id) as StoryScene) : 0), 0);
    if (budget > MOTION_TOKENS.card.maxLoopMs) c.fail(`surfaces.${key}`, `durationMs + holdMs 합계 ${budget}ms > ${MOTION_TOKENS.card.maxLoopMs}ms`);
  };
  cardLike("homeCard");
  cardLike("hero");

  const short = resource.surfaces.short;
  if (short) {
    if (resource.status !== "published") c.fail("surfaces.short", "status=published 인 리소스만 가질 수 있다");
    const total = short.sceneIds.reduce((sum, id) => sum + (sceneById.get(id) ? totalMs(sceneById.get(id) as StoryScene) : 0), 0);
    if (total > short.maxDurationMs) c.fail("surfaces.short", `총 길이 ${total}ms > maxDurationMs ${short.maxDurationMs}ms`);
  }
}

/**
 * 인터랙티브 아티클 리소스를 엄격하게 검증한다. 알 수 없는 필드·범위 초과·깨진 참조를 모두 거부한다.
 * 정적 번들 리소스도 공개 표면에 내보내기 전에 반드시 이 함수를 통과해야 한다 (fail-closed).
 */
export function parseInteractiveArticle(input: unknown): InteractiveArticleParseResult {
  const c = new Checker();
  const L = INTERACTIVE_ARTICLE_LIMITS;
  const required = [
    "contractType", "schemaVersion", "articleId", "slug", "status", "revision", "createdAt", "updatedAt",
    "source", "title", "summary", "motionTokensVersion", "assets", "beats", "scenes", "sceneOrder", "surfaces",
  ] as const;
  if (!c.object(input, "$", required)) return { ok: false, errors: c.errors };
  const v = input;

  if (v.contractType !== INTERACTIVE_ARTICLE_CONTRACT_TYPE) c.fail("$.contractType", `"${INTERACTIVE_ARTICLE_CONTRACT_TYPE}" 이어야 한다`);
  if (v.schemaVersion !== INTERACTIVE_ARTICLE_SCHEMA_VERSION) c.fail("$.schemaVersion", `"${INTERACTIVE_ARTICLE_SCHEMA_VERSION}" 이어야 한다`);
  if (v.motionTokensVersion !== MOTION_TOKENS_VERSION) c.fail("$.motionTokensVersion", `지원 버전: ${MOTION_TOKENS_VERSION}`);
  c.string(v.articleId, "$.articleId", { max: 96, pattern: ID_PATTERN });
  c.string(v.slug, "$.slug", { max: 96, pattern: SLUG_PATTERN });
  c.oneOf(v.status, "$.status", INTERACTIVE_ARTICLE_STATUSES);
  c.string(v.revision, "$.revision", { max: 64 });
  c.string(v.createdAt, "$.createdAt", { max: 40, pattern: ISO_PATTERN });
  c.string(v.updatedAt, "$.updatedAt", { max: 40, pattern: ISO_PATTERN });
  c.string(v.title, "$.title", { max: L.maxTitleLength });
  c.string(v.summary, "$.summary", { max: L.maxSummaryLength });

  if (c.object(v.source, "$.source", ["kind", "ref", "title"])) {
    c.oneOf(v.source.kind, "$.source.kind", SOURCE_ARTICLE_KINDS);
    c.string(v.source.ref, "$.source.ref", { max: 200 });
    c.string(v.source.title, "$.source.title", { max: 300 });
  }

  const assetIds = new Set<string>();
  if (c.array(v.assets, "$.assets", 0, 60)) {
    v.assets.forEach((asset, index) => checkAsset(c, asset, `$.assets[${index}]`));
    const ids = v.assets.map((asset) => (asset as Json)?.assetId).filter((id): id is string => typeof id === "string");
    c.unique(ids, "$.assets");
    ids.forEach((id) => assetIds.add(id));
  }

  if (c.array(v.beats, "$.beats", 1, L.maxBeats)) {
    v.beats.forEach((beat, index) => checkBeat(c, beat, `$.beats[${index}]`));
    c.unique(v.beats.map((beat) => String((beat as Json)?.beatId)), "$.beats");
  }

  const sceneIds = new Set<string>();
  if (c.array(v.scenes, "$.scenes", 1, L.maxScenes)) {
    v.scenes.forEach((scene, index) => checkScene(c, scene, `$.scenes[${index}]`, assetIds));
    const ids = v.scenes.map((scene) => String((scene as Json)?.sceneId));
    c.unique(ids, "$.scenes");
    ids.forEach((id) => sceneIds.add(id));
  }

  if (c.stringArray(v.sceneOrder, "$.sceneOrder", 1, L.maxScenes, 96)) c.unique(v.sceneOrder, "$.sceneOrder");

  if (c.object(v.surfaces, "$.surfaces", ["story"], ["hero", "homeCard", "short"])) {
    const s = v.surfaces;
    checkSurfaceRef(c, s.story, "$.surfaces.story", [], sceneIds);
    if (s.hero !== undefined) checkSurfaceRef(c, s.hero, "$.surfaces.hero", [], sceneIds);
    if (s.homeCard !== undefined && checkSurfaceRef(c, s.homeCard, "$.surfaces.homeCard", ["tier"], sceneIds)) {
      c.oneOf(s.homeCard.tier, "$.surfaces.homeCard.tier", HOME_CARD_TIERS);
    }
    if (s.short !== undefined && checkSurfaceRef(c, s.short, "$.surfaces.short", ["format", "maxDurationMs"], sceneIds)) {
      if (s.short.format !== "9:16") c.fail("$.surfaces.short.format", '"9:16" 이어야 한다');
      c.int(s.short.maxDurationMs, "$.surfaces.short.maxDurationMs", 1000, MOTION_TOKENS.short.maxDurationMs);
    }
  }

  if (c.errors.length > 0) return { ok: false, errors: c.errors };
  const resource = input as unknown as InteractiveArticleResource;
  checkIntegrity(c, resource);
  return c.errors.length > 0 ? { ok: false, errors: c.errors } : { ok: true, resource };
}

// ---------------------------------------------------------------------------
// 조회 헬퍼
// ---------------------------------------------------------------------------

export function getSurfaceScenes(resource: InteractiveArticleResource, surface: InteractiveArticleSurfaceKey): StoryScene[] {
  const ref = resource.surfaces[surface];
  if (!ref) return [];
  const byId = new Map(resource.scenes.map((scene) => [scene.sceneId, scene]));
  const ids = surface === "story" ? resource.sceneOrder.filter((id) => ref.sceneIds.includes(id)) : ref.sceneIds;
  return ids.map((id) => byId.get(id)).filter((scene): scene is StoryScene => Boolean(scene));
}

/**
 * Beat 텍스트 지문 (FNV-1a 32bit). 내레이션 `sourceTextVersion` 과 대조해 불일치하면 내레이션 없이 재생한다.
 */
export function computeStoryTextHash(beats: readonly StoryBeat[]): string {
  let hash = 0x811c9dc5;
  const input = beats.map((beat) => [beat.beatId, beat.role, beat.headline ?? "", ...beat.body].join("\u001f")).join("\u001e");
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return `fnv1a-${hash.toString(16).padStart(8, "0")}`;
}
