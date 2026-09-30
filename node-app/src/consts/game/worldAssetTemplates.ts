import type { PromptItemExtendedType } from "types/app";
import { AMU_GAME_SPRITE_GOOGLE_MODEL, GAME_ASSET_TEMPLATE_KEYS, ISO_NEGATIVE } from "./gameAssetTemplates";

/**
 * 월드 에셋 생성 템플릿 (STEP4 — 단일 아이소메트릭 오브젝트/타일).
 *
 * 기존 게임 에셋 템플릿은 전부 4x4 '시트' 생성기라 재사용할 수 없다.
 * 이 파일은 '나무 한 그루', '바위 하나'처럼 단일 오브젝트/단일 타일을 만드는
 * 템플릿 2종을 정의한다. seedGameAssetTemplates 경로로 DB에 동기화한다.
 *
 * - 투영은 isometric 2:1 고정, negative는 ISO_NEGATIVE 상속.
 * - 월드 오브젝트 계열은 배경 투명 + 단일 오브젝트 + 그림자 방향 일치를 본문에 명시한다.
 */

export const WORLD_ASSET_IMAGE_PROMPT_TEMPLATES: PromptItemExtendedType[] = [
  {
    key: GAME_ASSET_TEMPLATE_KEYS.worldObjectSingle,
    title: "AMU Game World Single Object v1",
    categories: ["all-my-universe", "game-asset", "world", "object", "single"],
    accessLevel: "public",
    enabled: true,
    version: 1,
    tags: ["amu", "world", "isometric", "object", "single"],
    usageTip: "Create one single transparent isometric 2:1 object (no sheet, no grid) for the world asset library.",
    defaultParams: {
      provider: "google",
      modelName: AMU_GAME_SPRITE_GOOGLE_MODEL,
      aspectRatio: "1:1",
      size: "1K",
      negative: ISO_NEGATIVE,
    },
    inputPolicy: {
      referenceImage: {
        required: false,
        minCount: 0,
        maxCount: 2,
      },
    },
    templateText: [
      "Create ONE single transparent-background isometric 2:1 game object for All My Universe.",
      "Object: {object_kind::tree|rock|building|decor prop|barrel|fountain}",
      "Theme: {object_theme::forest|desert|urban|medieval|fantasy}",
      "Style: {visual_style::premium 2.5D isometric game art|clean stylized mobile RPG}",
      "Scale: {size_class::single-tile|multi-tile} — the object must fit a single isometric tile footprint unless the size class says otherwise.",
      "Exactly one object centered on the canvas. No sheet, no grid, no multiple variants, no ground plane beyond the object's own base.",
      "Camera: fixed isometric 2:1 angle. Consistent single light source from the upper-left, one contact shadow only.",
      "Rendering: transparent background, crisp silhouette, no text, no labels, no frame borders.",
      "{extra}",
      "{negative}",
    ].join("\n"),
  },
  {
    key: GAME_ASSET_TEMPLATE_KEYS.worldGroundTile,
    title: "AMU Game World Ground Tile v1",
    categories: ["all-my-universe", "game-asset", "world", "tile", "terrain"],
    accessLevel: "public",
    enabled: true,
    version: 1,
    tags: ["amu", "world", "isometric", "tile", "terrain"],
    usageTip: "Create one seamless isometric 2:1 ground tile (single diamond, tileable) for the world asset library.",
    defaultParams: {
      provider: "google",
      modelName: AMU_GAME_SPRITE_GOOGLE_MODEL,
      aspectRatio: "1:1",
      size: "1K",
      negative: ISO_NEGATIVE,
    },
    templateText: [
      "Create ONE seamless isometric 2:1 ground tile for All My Universe.",
      "Surface: {tile_surface::grass|sand|stone|water|wood}",
      "Theme: {tile_theme::forest|desert|urban|medieval|fantasy}",
      "Edges: {edge_behavior::seamless tileable edge|natural irregular edge}",
      "The tile is a single 2:1 diamond centered on a transparent canvas, tileable when repeated on an isometric grid.",
      "No objects on the tile, no props, no characters, no grid lines, no text.",
      "{extra}",
      "{negative}",
    ].join("\n"),
  },
];
