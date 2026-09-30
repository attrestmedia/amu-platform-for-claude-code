import "server-only";

import type { AppMagazineContent } from "./appContentContract";
import { stripHtmlToText } from "../api/convertHtmlUtils";

/**
 * @docHint
 * @purpose App Magazine 콘텐츠를 AIR-503 Story Mode의 선형 editorial scene manifest로 변환
 * @process cold open은 고정된 편집 beat로, 본문 prose block은 원문 blockId를 보존한 scene으로 변환한다.
 *          동적 모듈·TTS·분기·유료화는 Story Mode 입력에서 제외하고 기존 본문 fallback을 권위로 둔다.
 * @domain magazine-content-experience
 * @scope story-mode
 */

export const EDITORIAL_STORY_CONTRACT_TYPE = "amu-editorial-story-manifest" as const;
export const EDITORIAL_STORY_SCHEMA_VERSION = "editorial-story.v1" as const;
export const EDITORIAL_STORY_EXPERIENCE_ID = "editorial-story-mode" as const;

export type EditorialStoryBeatRole = "hook" | "context" | "problem" | "insight" | "evidence" | "outro";
export type EditorialStorySceneLayout = "cover" | "statement" | "image_text" | "outro";

export type EditorialStoryBeat = {
  schemaVersion: "editorial-story-beat.v1";
  beatId: string;
  role: EditorialStoryBeatRole;
  body: string[];
  importance: 1 | 2 | 3 | 4 | 5;
  sourceRefs: string[];
};

export type EditorialStoryScene = {
  schemaVersion: "editorial-story-scene.v1";
  sceneId: string;
  beatIds: string[];
  layout: EditorialStorySceneLayout;
  text: { reveal: "line" | "fade" };
  durationMs: number;
};

export type EditorialStoryManifest = {
  contractType: typeof EDITORIAL_STORY_CONTRACT_TYPE;
  schemaVersion: typeof EDITORIAL_STORY_SCHEMA_VERSION;
  storyId: string;
  contentRef: { kind: "app_content"; contentId: string; slug: string };
  sourceRevision: string;
  title: string;
  status: "ready";
  beats: EditorialStoryBeat[];
  scenes: EditorialStoryScene[];
  sceneOrder: string[];
  surfaces: { storyMode: { sceneIds: string[] } };
  revision: string;
};

const MAX_TEXT_LINE_LENGTH = 220;

function splitLongText(text: string): string[] {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized) return [];

  const sentences = normalized.split(/(?<=[.!?。！？])\s+/).filter(Boolean);
  const chunks: string[] = [];
  for (const sentence of sentences.length > 0 ? sentences : [normalized]) {
    let remaining = sentence.trim();
    while (remaining.length > MAX_TEXT_LINE_LENGTH) {
      const splitAt = remaining.lastIndexOf(" ", MAX_TEXT_LINE_LENGTH);
      const cutAt = splitAt > Math.floor(MAX_TEXT_LINE_LENGTH * 0.55) ? splitAt : MAX_TEXT_LINE_LENGTH;
      chunks.push(remaining.slice(0, cutAt).trim());
      remaining = remaining.slice(cutAt).trim();
    }
    if (remaining) chunks.push(remaining);
  }
  return chunks;
}

function toStoryLines(value: string): string[] {
  return splitLongText(stripHtmlToText(value));
}

function createBeat(
  beatId: string,
  role: EditorialStoryBeatRole,
  body: string[],
  importance: 1 | 2 | 3 | 4 | 5,
  sourceRefs: string[],
): EditorialStoryBeat | null {
  const lines = body.flatMap(toStoryLines).filter(Boolean);
  if (lines.length === 0) return null;
  return {
    schemaVersion: "editorial-story-beat.v1",
    beatId,
    role,
    body: lines,
    importance,
    sourceRefs,
  };
}

function createScene(sceneId: string, beatId: string, layout: EditorialStorySceneLayout): EditorialStoryScene {
  return {
    schemaVersion: "editorial-story-scene.v1",
    sceneId,
    beatIds: [beatId],
    layout,
    text: { reveal: layout === "cover" ? "fade" : "line" },
    durationMs: layout === "cover" ? 5200 : 6200,
  };
}

/**
 * Manifest v1 문법은 유지하되, AIR-503에서는 저장·편집 파이프라인을 새로 만들지 않고
 * 현재 App 콘텐츠에서 결정론적으로 생성한다. 따라서 같은 revision은 항상 같은 scene 순서를 만든다.
 */
export function buildEditorialStoryManifest(content: AppMagazineContent, sourceRevision: string): EditorialStoryManifest {
  const beats: EditorialStoryBeat[] = [];
  const scenes: EditorialStoryScene[] = [];

  const add = (
    beatId: string,
    role: EditorialStoryBeatRole,
    body: string[],
    importance: 1 | 2 | 3 | 4 | 5,
    sourceRefs: string[],
    layout: EditorialStorySceneLayout,
  ) => {
    const beat = createBeat(beatId, role, body, importance, sourceRefs);
    if (!beat) return;
    beats.push(beat);
    scenes.push(createScene(`scene-${scenes.length + 1}`, beat.beatId, layout));
  };

  add("beat-cover", "hook", [content.heroLine || content.title], 5, ["content:title"], "cover");
  add("beat-problem", "problem", [content.coldOpen.problem], 5, ["cold-open:problem"], "statement");
  add("beat-context", "context", [content.coldOpen.scene], 3, ["cold-open:scene"], "image_text");
  add("beat-insight", "insight", [content.coldOpen.tension], 4, ["cold-open:tension"], "statement");

  let proseIndex = 0;
  for (const block of content.body) {
    if (block.kind !== "prose") continue;
    proseIndex += 1;
    add(
      `beat-prose-${proseIndex}`,
      proseIndex === 1 ? "evidence" : "insight",
      [block.html],
      proseIndex === 1 ? 4 : 3,
      [block.blockId],
      "statement",
    );
  }

  add("beat-outro", "outro", [content.primaryQuestion || "본문에서 더 자세히 읽어보세요."], 2, ["content:primary-question"], "outro");

  const sceneOrder = scenes.map((scene) => scene.sceneId);
  return {
    contractType: EDITORIAL_STORY_CONTRACT_TYPE,
    schemaVersion: EDITORIAL_STORY_SCHEMA_VERSION,
    storyId: `${EDITORIAL_STORY_EXPERIENCE_ID}:${content.contentId}:${sourceRevision}`,
    contentRef: { kind: "app_content", contentId: content.contentId, slug: content.slug },
    sourceRevision,
    title: content.title,
    status: "ready",
    beats,
    scenes,
    sceneOrder,
    surfaces: { storyMode: { sceneIds: sceneOrder } },
    revision: sourceRevision,
  };
}
