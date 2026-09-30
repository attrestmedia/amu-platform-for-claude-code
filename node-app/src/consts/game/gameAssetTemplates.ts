import type { ImageProviderType } from "types/ai";
import type { PromptItemExtendedType } from "types/app";
import { OPENAI_GPT_IMAGE_FLARE_MODEL, OPENAI_GPT_IMAGE_SUNBURST_MODEL } from "consts/ai";

export const AMU_GAME_SPRITE_GOOGLE_MODEL = "gemini-3.1-flash-image-preview";

export const GAME_ASSET_TEMPLATE_KEYS = {
  characterSprite: "amu-game-character-sprite-v1",
  npcPortrait: "amu-game-npc-portrait-v1",
  stageTileset: "amu-game-stage-tileset-v1",
  propBuildingSheet: "amu-game-prop-building-sheet-v1",
  characterSpriteAnchorV2: "amu-game-character-sprite-anchor-v2",
  characterBible5DirV3: "amu-game-character-bible-5dir-v3",
  characterSpriteBase4V2: "amu-game-character-sprite-base4-v2",
  characterSpriteDiagonal4V2: "amu-game-character-sprite-diagonal4-v2",
  characterSpriteDirectionV3: "amu-game-character-sprite-direction-v3",
  boundaryTilesetV2: "amu-game-boundary-tileset-v2",
  worldObjectSingle: "amu-game-world-object-single-v1",
  worldGroundTile: "amu-game-world-ground-tile-v1",
} as const;

export type GameAssetTemplateKeyType = (typeof GAME_ASSET_TEMPLATE_KEYS)[keyof typeof GAME_ASSET_TEMPLATE_KEYS];

// 8방향 파이프라인(P2-2 오케스트레이션) STEP → 템플릿 키 매핑 (에셋 계약 v2 D2 옵션 B: STEP1 anchor → STEP2 base4+diagonal4 2회 호출)
export const SPRITE_PIPELINE_V2_TEMPLATE_KEYS = {
  anchor: GAME_ASSET_TEMPLATE_KEYS.characterSpriteAnchorV2,
  bible: GAME_ASSET_TEMPLATE_KEYS.characterBible5DirV3,
  base4: GAME_ASSET_TEMPLATE_KEYS.characterSpriteBase4V2,
  diagonal4: GAME_ASSET_TEMPLATE_KEYS.characterSpriteDiagonal4V2,
  direction: GAME_ASSET_TEMPLATE_KEYS.characterSpriteDirectionV3,
} as const;

export const SPRITE_SHEET_PROFILE_KEYS = ["v2", "f6", "f8"] as const;
export type SpriteSheetProfileKeyType = (typeof SPRITE_SHEET_PROFILE_KEYS)[number];
export const SPRITE_FRAME_COUNTS = [4, 6, 8] as const;
export type SpriteFrameCountType = (typeof SPRITE_FRAME_COUNTS)[number];

const SPRITE_SHEET_ROW_ORDER = [
    "down", // row 0 = SW
    "up", // row 1 = NE
    "left", // row 2 = NW
    "right", // row 3 = SE
    "down-left", // row 4 = W
    "up-left", // row 5 = N
    "up-right", // row 6 = E
    "down-right", // row 7 = S
  ] as const;

// **스프라이트 시트 런타임 프로파일 (에셋 계약 v2 / F5)**
// - v2는 기존 4프레임 계약이며 변경하지 않는다.
// - 6/8프레임은 관리자 옵트인이다. 공급자 출력 그리드는 서버가 1방향 1행 strip으로 정규화한다.
// - 실제 런타임 행/프레임 매핑은 IPersonaSprite.animations 메타가 권위다.
export const SPRITE_SHEET_PROFILES = {
  v2: {
    frameCount: 4,
    cellWidth: 256,
    cellHeight: 256,
    sheetWidth: 1024,
    sheetHeight: 2048,
    frameColumns: ["idle", "walk-1", "walk-2", "walk-3"],
    sheet4Generation: { columns: 4, rows: 4, directionAxis: "rows", size: "1024x1024", aspectRatio: "1:1" },
    directionGeneration: { columns: 2, rows: 2, size: "1024x1024", aspectRatio: "1:1" },
  },
  f6: {
    frameCount: 6,
    cellWidth: 256,
    cellHeight: 256,
    sheetWidth: 1536,
    sheetHeight: 2048,
    frameColumns: ["frame-1", "frame-2", "frame-3", "frame-4", "frame-5", "frame-6"],
    sheet4Generation: { columns: 6, rows: 4, directionAxis: "rows", size: "1536x1024", aspectRatio: "3:2" },
    directionGeneration: { columns: 3, rows: 2, size: "1536x1024", aspectRatio: "3:2" },
  },
  f8: {
    frameCount: 8,
    cellWidth: 256,
    cellHeight: 256,
    sheetWidth: 2048,
    sheetHeight: 2048,
    frameColumns: ["frame-1", "frame-2", "frame-3", "frame-4", "frame-5", "frame-6", "frame-7", "frame-8"],
    // gpt-image 계열은 2048x1024를 지원하지 않아 4방향 열 x 8프레임 행으로 생성 후 재배열한다.
    sheet4Generation: { columns: 4, rows: 8, directionAxis: "columns", size: "1024x1536", aspectRatio: "2:3" },
    directionGeneration: { columns: 4, rows: 2, size: "1536x1024", aspectRatio: "3:2" },
  },
} as const;

export function getSpriteSheetProfileKey(frameCount: unknown): SpriteSheetProfileKeyType {
  if (frameCount === "f6" || Number(frameCount) === 6) return "f6";
  if (frameCount === "f8" || Number(frameCount) === 8) return "f8";
  return "v2";
}

export function getSpriteSheetProfile(frameCount: unknown) {
  return SPRITE_SHEET_PROFILES[getSpriteSheetProfileKey(frameCount)];
}

function frameRangeLabel(frameCount: number) {
  return Array.from({ length: frameCount }, (_, index) => `frame ${index + 1}`).join(", ");
}

export function getSpriteSheet4PromptVariables(
  profileKey: SpriteSheetProfileKeyType,
  directions: readonly string[],
) {
  const profile = SPRITE_SHEET_PROFILES[profileKey];
  const grid = profile.sheet4Generation;
  const cellCount = grid.columns * grid.rows;
  const directionList = directions.join(", ");
  return {
    sprite_frame_count: String(profile.frameCount),
    sprite_sheet_layout: `exactly ${grid.columns} columns and ${grid.rows} rows, ${cellCount} evenly spaced cells on a ${grid.size} canvas`,
    sprite_direction_layout:
      grid.directionAxis === "rows"
        ? `each row is one direction in this top-to-bottom order: ${directionList}`
        : `each column is one direction in this left-to-right order: ${directionList}`,
    sprite_frame_order:
      grid.directionAxis === "rows"
        ? `columns from left to right are ${frameRangeLabel(profile.frameCount)}`
        : `rows from top to bottom are ${frameRangeLabel(profile.frameCount)}`,
  };
}

export function getSpriteDirectionPromptVariables(profileKey: SpriteSheetProfileKeyType) {
  const profile = SPRITE_SHEET_PROFILES[profileKey];
  const grid = profile.directionGeneration;
  return {
    sprite_frame_count: String(profile.frameCount),
    sprite_direction_grid_layout:
      `exactly ${grid.columns} columns and ${grid.rows} rows on a ${grid.size} canvas; ` +
      `place ${frameRangeLabel(profile.frameCount)} in row-major order from left to right, top to bottom`,
  };
}

// ---------------------------------------------------------------------------
// Chroma Key Preset → 배경 프롬프트 변수 (CK-501)
// ---------------------------------------------------------------------------

const CHROMA_KEY_BG_TEXTS: Record<string, string> = {
  green:
    "Background: solid uniform pure green (#00FF00) filling the entire canvas, " +
    "completely flat — no gradients, no pattern, no checkerboard, " +
    "no rim light, no drop shadows on the background.",
  blue:
    "Background: solid uniform pure blue (#0000FF) filling the entire canvas, " +
    "completely flat — no gradients, no pattern, no checkerboard, " +
    "no rim light, no drop shadows on the background.",
  magenta:
    "Background: solid uniform pure magenta (#FF00FF) filling the entire canvas, " +
    "completely flat — no gradients, no pattern, no checkerboard, " +
    "no rim light, no drop shadows on the background.",
};

const CHROMA_KEY_DEFAULT_PRESET = "magenta";

/**
 * chroma_key_preset 값(green/blue/magenta)을 받아
 * 템플릿 변수 {chroma_key_background}에 주입할 배경 프롬프트 텍스트를 반환한다.
 *
 * 미인식 preset은 magenta로 fallback한다.
 */
export function getChromaKeyPromptVariables(preset: string | undefined): Record<string, string> {
  const normalized = (preset || "").trim().toLowerCase();
  const bgText = CHROMA_KEY_BG_TEXTS[normalized] || CHROMA_KEY_BG_TEXTS[CHROMA_KEY_DEFAULT_PRESET];
  return {
    chroma_key_preset: normalized in CHROMA_KEY_BG_TEXTS ? normalized : CHROMA_KEY_DEFAULT_PRESET,
    chroma_key_background: bgText,
  };
}


// 기존 import·발행 자산 해석을 보존하는 4프레임 호환 계약.
export const SPRITE_SHEET_V2_CONTRACT = {
  ...SPRITE_SHEET_PROFILES.v2,
  columns: SPRITE_SHEET_PROFILES.v2.frameCount,
  rows: SPRITE_SHEET_ROW_ORDER.length,
  rowOrder: SPRITE_SHEET_ROW_ORDER,

  directionCount: SPRITE_SHEET_ROW_ORDER.length,
} as const;

export type GameAssetPromptModelLockType = {
  enabled: boolean;
  provider: ImageProviderType;
  modelName: string;
  allowedAlternates?: GameAssetPromptModelOptionType[];
  reason: string;
};

export type GameAssetPromptModelOptionType = {
  provider: ImageProviderType;
  modelName: string;
  alias: string;
  supportsTransparentBackground: boolean;
  estimatedCoinsPerImage: number;
};

// 캐릭터 스프라이트 생성에서 허용하는 모델과 사용자 고지용 메타데이터의 단일 기준.
// 예상 코인은 안내값이며 실제 차감은 서버 preflight 결과가 권위다.
export const SPRITE_MODEL_OPTIONS: readonly GameAssetPromptModelOptionType[] = [
  {
    provider: "openai",
    modelName: OPENAI_GPT_IMAGE_FLARE_MODEL,
    alias: "Flare",
    supportsTransparentBackground: true,
    estimatedCoinsPerImage: 221,
  },
  {
    provider: "openai",
    modelName: OPENAI_GPT_IMAGE_SUNBURST_MODEL,
    alias: "Sunburst",
    supportsTransparentBackground: true,
    estimatedCoinsPerImage: 221,
  },
  {
    provider: "google",
    modelName: AMU_GAME_SPRITE_GOOGLE_MODEL,
    alias: "Nano Banana 2",
    supportsTransparentBackground: false,
    estimatedCoinsPerImage: 160,
  },
];

export function findSpriteModelOption(provider: unknown, modelName: unknown) {
  const normalizedProvider = String(provider || "").trim().toLowerCase();
  const normalizedModelName = String(modelName || "").trim();
  if (!normalizedProvider || !normalizedModelName) return null;
  return (
    SPRITE_MODEL_OPTIONS.find(
      (option) => option.provider === normalizedProvider && option.modelName === normalizedModelName,
    ) || null
  );
}

export function resolveSpriteModelSelection(args: {
  variables?: unknown;
  fallbackProvider?: unknown;
  fallbackModelName?: unknown;
}) {
  const variables =
    args.variables && typeof args.variables === "object" && !Array.isArray(args.variables)
      ? (args.variables as Record<string, unknown>)
      : {};
  const requestedProvider = String(variables.sprite_model_provider || "").trim();
  const requestedModelName = String(variables.sprite_model_name || "").trim();
  const hasSelection = Boolean(requestedProvider || requestedModelName);
  const option = hasSelection ? findSpriteModelOption(requestedProvider, requestedModelName) : null;
  return {
    hasSelection,
    option,
    provider: option?.provider || String(args.fallbackProvider || "").trim(),
    modelName: option?.modelName || String(args.fallbackModelName || "").trim(),
  };
}

const SPRITE_MODEL_LOCK: GameAssetPromptModelLockType = {
  enabled: true,
  provider: "openai",
  modelName: OPENAI_GPT_IMAGE_SUNBURST_MODEL,
  allowedAlternates: SPRITE_MODEL_OPTIONS.filter(
    (option) => option.modelName !== OPENAI_GPT_IMAGE_SUNBURST_MODEL,
  ),
  reason:
    "Sprite sheets require consistent frame grids, camera angle, and character identity across poses. " +
    "P0-5 empirical test (2026-07-17, 4x4 walk sheet) validated gpt-image-2 for superior final-output detail and clearer walk-cycle frames at equal identity consistency; Nano Banana 2 (gemini-3.1-flash-image-preview) kept as faster/cheaper alternate and native strip-ratio fallback. " +
    "2026-09-09: gpt-image-2 was deprecated by the catalog and this lock now points at gpt-image-2.5-sunburst (OpenAI's editing-precision successor). The P0-5 sprite-sheet comparison has NOT been re-run against 2.5 — re-validate before treating sprite quality as confirmed. " +
    "Pipeline (P2-2) must use async jobs + idempotency keys: this model's latency can exceed client timeouts and double-charge. See Project/.agent/docs/2026/07/20260717_085815__amu-play-p0-checkpoint-verification.md.",
};

export const ISO_NEGATIVE =
  "no text, no watermark, no logo, no realistic photo background, no perspective mismatch, no cropped object, no duplicate shadows";

export const GAME_ASSET_IMAGE_PROMPT_TEMPLATES: PromptItemExtendedType[] = [
  {
    key: GAME_ASSET_TEMPLATE_KEYS.characterSprite,
    title: "AMU Game Character Sprite Sheet v1",
    categories: ["all-my-universe", "game-asset", "sprite-sheet", "character"],
    accessLevel: "admin",
    enabled: true,
    version: 1,
    tags: ["amu", "the-world", "isometric", "character", "sprite"],
    usageTip:
      "Create a 4x4 isometric character sprite sheet for The World. Keep the same character identity in every frame.",
    defaultParams: {
      provider: "openai",
      modelName: OPENAI_GPT_IMAGE_SUNBURST_MODEL,
      aspectRatio: "1:1",
      size: "1024x1024",
      frameGrid: { columns: 4, rows: 4 },
      frameOrder: ["down_walk", "left_walk", "right_walk", "up_walk"],
      modelLock: SPRITE_MODEL_LOCK,
      negative: ISO_NEGATIVE,
    },
    inputPolicy: {
      referenceImage: {
        required: false,
        minCount: 0,
        maxCount: 4,
      },
    },
    templateText: [
      "Create a clean transparent-background isometric game character sprite sheet for All My Universe: The World.",
      "Character identity: {character_identity::young human explorer|academy tutor|merchant strategist|monster companion|robot assistant}",
      "Visual style: {visual_style::premium 2.5D isometric game art|soft anime game asset|clean stylized mobile RPG}",
      "Outfit theme: {outfit_theme::modern academy uniform|urban explorer gear|fantasy commerce guild outfit|minimal futuristic suit}",
      "Mood: {mood::curious and friendly|calm and intelligent|confident and strategic}",
      "Sheet layout: exactly 4 columns and 4 rows, evenly spaced frames, full body visible in every frame.",
      "Rows: down walk, left walk, right walk, up walk. Columns: idle contact, step 1, contact, step 2.",
      "Camera: fixed isometric 2:1 game angle, consistent scale, consistent lighting, centered character.",
      "Rendering: transparent background, crisp silhouette, no text, no frame numbers, no grid lines.",
      "{extra}",
      "{negative}",
    ].join("\n"),
  },
  {
    key: GAME_ASSET_TEMPLATE_KEYS.npcPortrait,
    title: "AMU Game NPC Portrait v1",
    categories: ["all-my-universe", "game-asset", "npc", "portrait"],
    accessLevel: "admin",
    enabled: true,
    version: 1,
    tags: ["amu", "the-world", "npc", "profile"],
    usageTip: "Create an NPC portrait or persona profile image for The World without forcing user persona templates.",
    defaultParams: {
      provider: "google",
      modelName: AMU_GAME_SPRITE_GOOGLE_MODEL,
      aspectRatio: "1:1",
      size: "1K",
      negative: "no text, no watermark, no logo, no extra people, no cropped face",
    },
    templateText: [
      "Create a polished NPC portrait for All My Universe: The World.",
      "NPC role: {npc_role::world guide|market analyst|training mentor|quest broker|archive librarian}",
      "Species/persona: {persona_type::human|monster|android|hybrid spirit}",
      "Personality: {personality::warm and precise|mysterious but helpful|ambitious and tactical|quiet and analytical}",
      "World context: isometric strategy growth simulation, learning, trade, missions, relationships.",
      "Composition: bust portrait, clear face, readable silhouette, subtle background, service-ready profile image.",
      "Style: {visual_style::premium mobile game portrait|clean anime-inspired portrait|stylized semi-real game art}",
      "{extra}",
      "{negative}",
    ].join("\n"),
  },
  {
    key: GAME_ASSET_TEMPLATE_KEYS.stageTileset,
    title: "AMU Game Isometric Stage Tileset v1",
    categories: ["all-my-universe", "game-asset", "stage", "tileset"],
    accessLevel: "admin",
    enabled: true,
    version: 1,
    tags: ["amu", "the-world", "isometric", "stage", "tileset"],
    usageTip: "Create an admin-only tileset sheet for isometric stage assembly.",
    defaultParams: {
      provider: "google",
      modelName: AMU_GAME_SPRITE_GOOGLE_MODEL,
      aspectRatio: "1:1",
      size: "1K",
      sheetGrid: { columns: 4, rows: 4 },
      negative: ISO_NEGATIVE,
    },
    templateText: [
      "Create a transparent-background isometric 2:1 stage tileset sheet for All My Universe: The World.",
      "World zone: {zone::central plaza|learning district|commerce market|training arena|quiet residential block}",
      "Tile theme: {tile_theme::clean futuristic city|warm academy campus|fantasy commerce district|minimal sci-fi settlement}",
      "Sheet layout: exactly 4 columns and 4 rows, separated items, no overlapping, consistent tile footprint.",
      "Include ground tiles, edge tiles, corner tiles, path tiles, and small environmental variations.",
      "Camera: fixed isometric 2:1 angle, consistent lighting, game-ready scale.",
      "Rendering: transparent background, crisp boundaries, no text, no labels, no grid lines.",
      "{extra}",
      "{negative}",
    ].join("\n"),
  },
  {
    key: GAME_ASSET_TEMPLATE_KEYS.propBuildingSheet,
    title: "AMU Game Prop and Building Sheet v1",
    categories: ["all-my-universe", "game-asset", "prop", "building"],
    accessLevel: "admin",
    enabled: true,
    version: 1,
    tags: ["amu", "the-world", "isometric", "building", "object"],
    usageTip: "Create a prop/building sheet for shops, mission points, training objects, and stage decoration.",
    defaultParams: {
      provider: "google",
      modelName: AMU_GAME_SPRITE_GOOGLE_MODEL,
      aspectRatio: "1:1",
      size: "1K",
      sheetGrid: { columns: 4, rows: 4 },
      negative: ISO_NEGATIVE,
    },
    templateText: [
      "Create a transparent-background isometric object and building asset sheet for All My Universe: The World.",
      "Asset set purpose: {asset_purpose::starter town services|learning hub objects|commerce store fixtures|battle training props}",
      "Style: {visual_style::premium 2.5D isometric mobile game art|clean stylized strategy sim assets|soft futuristic city objects}",
      "Sheet layout: exactly 4 columns and 4 rows, one complete object per cell, consistent scale.",
      "Include small props, medium interactable objects, storefront buildings, mission markers, and decorative variants.",
      "Camera: fixed isometric 2:1 angle, consistent shadow direction, game-ready silhouettes.",
      "Rendering: transparent background, no text, no logos, no labels, no grid lines.",
      "{extra}",
      "{negative}",
    ].join("\n"),
  },
  // ---- 스프라이트 v2 (에셋 계약 v2 / D2 옵션 B — STEP별 분할 생성) ----
  // 행 순서는 SPRITE_SHEET_V2_CONTRACT.rowOrder(D1)와 발행 기본 animations 매핑(down/up/left/right)을 따른다.
  {
    key: GAME_ASSET_TEMPLATE_KEYS.characterSpriteAnchorV2,
    title: "AMU Game Character Anchor Cut v2 (STEP1)",
    categories: ["all-my-universe", "game-asset", "sprite-sheet", "character", "sprite-v2"],
    accessLevel: "admin",
    enabled: true,
    version: 2,
    tags: ["amu", "isometric", "character", "sprite-v2", "anchor"],
    usageTip:
      "STEP1 — confirm the single anchor reference cut. Every STEP2 directional sheet reuses this image as the identity reference, so lock face, outfit, colors, and camera here.",
    defaultParams: {
      provider: "openai",
      modelName: OPENAI_GPT_IMAGE_SUNBURST_MODEL,
      aspectRatio: "1:1",
      size: "1024x1024",
      modelLock: SPRITE_MODEL_LOCK,
      negative: ISO_NEGATIVE,
    },
    inputPolicy: {
      referenceImage: {
        required: false,
        minCount: 0,
        maxCount: 4,
      },
    },
    templateText: [
      "Create a single full-body anchor reference cut for an isometric game character sprite set (All My Universe).",
      "Character identity: {character_identity::young human explorer|academy tutor|merchant strategist|monster companion|robot assistant}",
      "Visual style: {visual_style::premium 2.5D isometric game art|soft anime game asset|clean stylized mobile RPG}",
      "Outfit theme: {outfit_theme::modern academy uniform|urban explorer gear|fantasy commerce guild outfit|minimal futuristic suit}",
      "Pose: relaxed idle stance facing the isometric down direction (front three-quarter view toward the viewer's lower-left), full body centered, feet grounded on a consistent baseline.",
      "Camera: fixed isometric 2:1 game angle, consistent scale and lighting.",
      "{chroma_key_background::Background: solid uniform pure magenta (#FF00FF) filling the entire canvas, completely flat — no gradients, no pattern, no checkerboard, no shadows cast on the background.}",
      "Rendering: crisp silhouette, exactly one character, no text, no grid lines, no frame borders.",
      "This image is reused as the identity reference for all 8 directional walk sheets: keep design details clean, readable, and unambiguous from every angle.",
      "{extra}",
      "{negative}",
    ].join("\n"),
  },
  {
    key: GAME_ASSET_TEMPLATE_KEYS.characterBible5DirV3,
    title: "AMU Game Character Bible 5-Direction Sheet v3 (STEP1-BIBLE)",
    categories: ["all-my-universe", "game-asset", "sprite-sheet", "character", "character-bible"],
    accessLevel: "admin",
    enabled: true,
    version: 3,
    tags: ["amu", "isometric", "character", "character-bible", "5-direction"],
    usageTip:
      "Generate one identity bible from the confirmed anchor cut. Review all five views and confirm symmetry before animation generation.",
    defaultParams: {
      provider: "openai",
      modelName: OPENAI_GPT_IMAGE_SUNBURST_MODEL,
      aspectRatio: "3:2",
      size: "1536x1024",
      frameGrid: { columns: 5, rows: 1 },
      frameOrder: ["down", "down-right", "up-left", "up", "left"],
      modelLock: SPRITE_MODEL_LOCK,
      negative: ISO_NEGATIVE,
    },
    inputPolicy: {
      referenceImage: {
        required: true,
        minCount: 1,
        maxCount: 1,
      },
    },
    templateText: [
      "Create a five-view isometric character identity bible from the attached anchor image.",
      "The attached image is the exact same character. Preserve face, hair, outfit, colors, proportions, accessories, and material details in every view.",
      "Layout: exactly 5 equal columns and 1 row on a 1536x1024 canvas. Put exactly one full-body character in each cell, centered with feet on one shared baseline.",
      "Columns from left to right: down (front three-quarter toward lower-left), down-right (front view toward the bottom), up-left (back view toward the top), up (back three-quarter toward upper-right), left (back three-quarter toward upper-left).",
      "Pose: neutral idle stance in all five cells. This is an identity and camera reference, not an animation sheet.",
      "Camera: fixed isometric 2:1 game angle, identical scale, lighting, body proportions, and ground baseline across all five views.",
      "{chroma_key_background::Background: solid uniform pure magenta (#FF00FF) filling the entire canvas, completely flat — no gradients, patterns, checkerboard, or shadows on the background.}",
      "Rendering: crisp silhouette, no text, no labels, no frame numbers, no grid lines, no borders, no extra characters.",
      "{extra}",
      "{negative}",
    ].join("\n"),
  },
  {
    key: GAME_ASSET_TEMPLATE_KEYS.characterSpriteBase4V2,
    title: "AMU Game Character Sprite Base 4-Direction Sheet v2 (STEP2-A)",
    categories: ["all-my-universe", "game-asset", "sprite-sheet", "character", "sprite-v2"],
    accessLevel: "admin",
    enabled: true,
    version: 2,
    tags: ["amu", "isometric", "character", "sprite-v2", "base4"],
    usageTip:
      "STEP2-A — base 4 directions (down/up/left/right) walk sheet. Attach the STEP1 anchor cut as reference; row order matches sheet contract v2 rows 0-3.",
    defaultParams: {
      provider: "openai",
      modelName: OPENAI_GPT_IMAGE_SUNBURST_MODEL,
      aspectRatio: "1:1",
      size: "1024x1024",
      frameGrid: { columns: 4, rows: 4 },
      frameOrder: ["down", "up", "left", "right"],
      sprite_action_key: "walk",
      sprite_action_label: "걷기",
      motion_action: "natural isometric walking cycle",
      motion_sequence: "idle contact, step 1, opposite contact, step 2",
      motion_loop: "seamless loop; the last pose must flow naturally back to the first pose",
      motion_fps: "8",
      sprite_frame_count: "4",
      sprite_sheet_layout: "exactly 4 columns and 4 rows, 16 evenly spaced 256px cells on a 1024x1024 canvas",
      sprite_direction_layout: "each row is one direction in the listed top-to-bottom order",
      sprite_frame_order: "columns from left to right are frames 1, 2, 3, and 4",
      modelLock: SPRITE_MODEL_LOCK,
      negative: ISO_NEGATIVE,
    },
    inputPolicy: {
      referenceImage: {
        required: true,
        minCount: 1,
        maxCount: 4,
      },
    },
    templateText: [
      "Create an isometric character animation sprite sheet. The attached reference image is the exact same character: lock identity — face, hair, outfit, colors, proportions must match the reference in every frame.",
      "If Image B is attached, use only its pose timing, joint flow, baseline, and foot-contact sequence as the motion guide. Preserve the appearance exclusively from Image A; never copy the guide mannequin, labels, lines, or colors.",
      "Animation state: {motion_action::natural isometric walking cycle}.",
      "Motion sequence ({sprite_frame_count::4} frames): {motion_sequence::idle contact, step 1, opposite contact, step 2}.",
      "Playback behavior: {motion_loop::seamless loop; the last pose must flow naturally back to the first pose}.",
      "Sheet layout: {sprite_sheet_layout::exactly 4 columns and 4 rows, 16 evenly spaced 256px cells on a 1024x1024 canvas}. Put one full-body character in every cell, centered, with feet aligned to a consistent baseline.",
      "Direction layout: {sprite_direction_layout::each row is one direction in this top-to-bottom order: down, up, left, right}. Keep every frame in a direction facing exactly that view.",
      "Frame order: {sprite_frame_order::columns from left to right are frames 1, 2, 3, and 4}. Follow the approved motion sequence exactly and make the action readable across the complete cycle.",
      "Camera: fixed isometric 2:1 game angle identical to the reference image, with consistent character scale and lighting across every cell.",
      "{chroma_key_background::Background: solid uniform pure magenta (#FF00FF) filling the entire canvas, completely flat — no gradients, no pattern, no checkerboard, no drop shadows on the background.}",
      "Rendering: crisp silhouettes, no text, no frame numbers, no grid lines, no cell borders.",
      "{extra}",
      "{negative}",
    ].join("\n"),
  },
  {
    key: GAME_ASSET_TEMPLATE_KEYS.characterSpriteDiagonal4V2,
    title: "AMU Game Character Sprite Diagonal 4-Direction Sheet v2 (STEP2-B)",
    categories: ["all-my-universe", "game-asset", "sprite-sheet", "character", "sprite-v2"],
    accessLevel: "admin",
    enabled: true,
    version: 2,
    tags: ["amu", "isometric", "character", "sprite-v2", "diagonal4"],
    usageTip:
      "STEP2-B — diagonal 4 directions (down-left/up-left/up-right/down-right) walk sheet. Attach the STEP1 anchor (and optionally the STEP2-A sheet) as reference; row order matches sheet contract v2 rows 4-7.",
    defaultParams: {
      provider: "openai",
      modelName: OPENAI_GPT_IMAGE_SUNBURST_MODEL,
      aspectRatio: "1:1",
      size: "1024x1024",
      frameGrid: { columns: 4, rows: 4 },
      frameOrder: ["down-left", "up-left", "up-right", "down-right"],
      sprite_action_key: "walk",
      sprite_action_label: "걷기",
      motion_action: "natural isometric walking cycle",
      motion_sequence: "idle contact, step 1, opposite contact, step 2",
      motion_loop: "seamless loop; the last pose must flow naturally back to the first pose",
      motion_fps: "8",
      sprite_frame_count: "4",
      sprite_sheet_layout: "exactly 4 columns and 4 rows, 16 evenly spaced 256px cells on a 1024x1024 canvas",
      sprite_direction_layout: "each row is one direction in the listed top-to-bottom order",
      sprite_frame_order: "columns from left to right are frames 1, 2, 3, and 4",
      modelLock: SPRITE_MODEL_LOCK,
      negative: ISO_NEGATIVE,
    },
    inputPolicy: {
      referenceImage: {
        required: true,
        minCount: 1,
        maxCount: 4,
      },
    },
    templateText: [
      "Create an isometric character animation sprite sheet. The attached reference images show the exact same character: lock identity — face, hair, outfit, colors, proportions must match the reference in every frame.",
      "If Image B is attached, use only its pose timing, joint flow, baseline, and foot-contact sequence as the motion guide. Preserve the appearance exclusively from Image A; never copy the guide mannequin, labels, lines, or colors.",
      "Animation state: {motion_action::natural isometric walking cycle}.",
      "Motion sequence ({sprite_frame_count::4} frames): {motion_sequence::idle contact, step 1, opposite contact, step 2}.",
      "Playback behavior: {motion_loop::seamless loop; the last pose must flow naturally back to the first pose}.",
      "Sheet layout: {sprite_sheet_layout::exactly 4 columns and 4 rows, 16 evenly spaced 256px cells on a 1024x1024 canvas}. Put one full-body character in every cell, centered, with feet aligned to a consistent baseline.",
      "Direction layout: {sprite_direction_layout::each row is one direction in this top-to-bottom order: down-left, up-left, up-right, down-right}. Keep every frame in a direction facing exactly that view.",
      "Frame order: {sprite_frame_order::columns from left to right are frames 1, 2, 3, and 4}. Follow the approved motion sequence exactly and make the action readable across the complete cycle.",
      "Camera: fixed isometric 2:1 game angle identical to the reference image, with consistent character scale and lighting across every cell.",
      "{chroma_key_background::Background: solid uniform pure magenta (#FF00FF) filling the entire canvas, completely flat — no gradients, no pattern, no checkerboard, no drop shadows on the background.}",
      "Rendering: crisp silhouettes, no text, no frame numbers, no grid lines, no cell borders.",
      "{extra}",
      "{negative}",
    ].join("\n"),
  },
  {
    key: GAME_ASSET_TEMPLATE_KEYS.characterSpriteDirectionV3,
    title: "AMU Game Character Single-Direction Sprite v3 (STEP2-DIR)",
    categories: ["all-my-universe", "game-asset", "sprite-sheet", "character", "sprite-direction"],
    accessLevel: "admin",
    enabled: true,
    version: 3,
    tags: ["amu", "isometric", "character", "sprite-v3", "single-direction"],
    usageTip:
      "Regenerate one failed direction as a profile-specific 2x2, 3x2, or 4x2 grid. The server reflows it into a 4, 6, or 8-frame runtime strip.",
    defaultParams: {
      provider: "openai",
      modelName: OPENAI_GPT_IMAGE_SUNBURST_MODEL,
      aspectRatio: "1:1",
      size: "1024x1024",
      frameGrid: { columns: 2, rows: 2 },
      frameOrder: ["frame-1", "frame-2", "frame-3", "frame-4"],
      sprite_action_key: "walk",
      sprite_action_label: "걷기",
      motion_action: "natural isometric walking cycle",
      motion_sequence: "idle contact, step 1, opposite contact, step 2",
      motion_loop: "seamless loop; the last pose must flow naturally back to the first pose",
      motion_fps: "8",
      sprite_direction: "down",
      sprite_frame_count: "4",
      sprite_direction_grid_layout: "exactly 2 columns and 2 rows on a 1024x1024 canvas; frames 1-2 are on the top row and frames 3-4 are on the bottom row",
      modelLock: SPRITE_MODEL_LOCK,
      negative: ISO_NEGATIVE,
    },
    inputPolicy: {
      referenceImage: {
        required: true,
        minCount: 1,
        maxCount: 4,
      },
    },
    templateText: [
      "Create one isometric character animation direction from the attached identity reference.",
      "The attached image shows the exact same character. Preserve face, hair, outfit, colors, proportions, accessories, materials, camera, and lighting.",
      "If Image B is attached, use only its pose timing, joint flow, baseline, and foot-contact sequence as the motion guide. Preserve the appearance exclusively from Image A; never copy the guide mannequin, labels, lines, or colors.",
      "Animation state: {motion_action::natural isometric walking cycle}.",
      "Motion sequence ({sprite_frame_count::4} frames): {motion_sequence::idle contact, step 1, opposite contact, step 2}.",
      "Playback behavior: {motion_loop::seamless loop; the last pose must flow naturally back to the first pose}.",
      "Direction: every frame must face {sprite_direction::down}. Do not mix or rotate toward another direction.",
      "Sheet layout: {sprite_direction_grid_layout::exactly 2 columns and 2 rows on a 1024x1024 canvas; frames 1-2 are on the top row and frames 3-4 are on the bottom row}. Put exactly one full-body character in each cell.",
      "Keep feet on a consistent baseline inside every cell, with enough transparent-safe margin around the silhouette.",
      "{chroma_key_background::Background: solid uniform pure magenta (#FF00FF) filling the entire canvas, completely flat — no gradients, patterns, checkerboard, or shadows on the background.}",
      "Rendering: crisp silhouettes, no text, no labels, no frame numbers, no grid lines, no borders, no extra characters.",
      "{extra}",
      "{negative}",
    ].join("\n"),
  },
  {
    key: GAME_ASSET_TEMPLATE_KEYS.boundaryTilesetV2,
    title: "AMU Game Boundary Tileset v2 (Cliff / Water / Fence)",
    categories: ["all-my-universe", "game-asset", "stage", "tileset", "boundary"],
    accessLevel: "admin",
    enabled: true,
    version: 2,
    tags: ["amu", "isometric", "boundary", "tileset", "sprite-v2"],
    usageTip:
      "Boundary tiles that block movement (contract v2 §4.3). Publish stage assets from this sheet with roles: [\"boundary\"] so the collision grid blocks them (P1-5 isStageBoundaryRole).",
    defaultParams: {
      provider: "google",
      modelName: AMU_GAME_SPRITE_GOOGLE_MODEL,
      aspectRatio: "1:1",
      size: "1K",
      sheetGrid: { columns: 4, rows: 4 },
      negative: ISO_NEGATIVE,
    },
    templateText: [
      "Create a transparent-background isometric 2:1 boundary tileset sheet for All My Universe.",
      "Boundary theme: {boundary_theme::rocky cliff edges|calm water shoreline|wooden fence line|stone wall border}",
      "Tile style: {visual_style::premium 2.5D isometric game art|clean stylized mobile RPG tiles|soft natural terrain}",
      "Sheet layout: exactly 4 columns and 4 rows, one complete boundary tile per cell, consistent 2:1 isometric footprint, no overlapping.",
      "Include straight edges, outer corners, inner corners, and end-cap variations so an irregular world border can be assembled.",
      "These tiles mark impassable world boundaries: silhouettes must read clearly as blocking terrain at game scale.",
      "Camera: fixed isometric 2:1 angle, consistent lighting and shadow direction.",
      "Rendering: transparent background, crisp tile boundaries, no text, no labels, no grid lines.",
      "{extra}",
      "{negative}",
    ].join("\n"),
  },
];
