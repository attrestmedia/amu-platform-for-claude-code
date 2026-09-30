import { estimateTokens } from "utils/ai/tokenUtils";
import {
  resolveCanonNamespaceProjection,
  sortProjectionSectionsForAdmission,
  sortProjectionSectionsForRender,
  type PersonalUniverseProjectionContext,
} from "libs/server-utils/narrative/canonNamespaceContract";
import type { CanonGraphRevisionDoc, IUniverseCanonRevisionDoc, NarrativeDirective } from "types/game";

/**
 * @docHint
 * @purpose 외부 상태에 의존하지 않는 Narrative prompt section projection
 * @process Canon  directive  Personal Canon state  approved memory 순서로 bounded text 생성
 * @domain narrative-runtime.prompt
 * @scope server
 */

export type NarrativePromptProjection = {
  content: string;
  canonRevision: number;
  stateVersion: number;
  cacheHit: boolean;
};

function clean(value: unknown, max = 500) {
  const text = typeof value === "string" ? value : value == null ? "" : String(value);
  if (/ignore\s+(?:all|any|the|previous|prior)|system\s+prompt|developer\s+message|override\s+(?:canon|policy|rules)/i.test(text)) return "";
  return text.replace(/<\/?[^>]{1,80}>/g, "").replace(/\s+/g, " ").trim().slice(0, max);
}

function safeId(value: unknown) {
  const item = String(value || "").trim();
  return /^[a-zA-Z0-9][a-zA-Z0-9._:@/-]{0,159}$/.test(item) ? item : "";
}

function canonLine(item: CanonGraphRevisionDoc, namespace: "official" | "personal-universe") {
  const payload = item.payload || {};
  const parts = [clean(payload.title, 160), clean(payload.summary, 260), clean(payload.description, 300)].filter(Boolean);
  return parts.length ? `- [${namespace} ${item.layer}/${item.entityType}:${item.entityId}] ${parts.join(" — ")}` : `- [${namespace} ${item.layer}/${item.entityType}:${item.entityId}]`;
}

type PromptSection = { kind: "official-reference" | "personal-universe" | "personal-story" | "moment"; content: string };

function buildSections(input: {
  canon: IUniverseCanonRevisionDoc[];
  personalUniverse?: PersonalUniverseProjectionContext;
  state: { activeArcIds: string[]; activeBeatIds: string[]; completedBeatIds: string[]; flags: Record<string, unknown>; relationAffinity: Record<string, number> };
  directive?: NarrativeDirective | null;
  memory?: string[];
}) {
  const resolved = resolveCanonNamespaceProjection({ officialCanon: input.canon, personalUniverse: input.personalUniverse });
  const sections: PromptSection[] = [];
  if (resolved.official.length) {
    sections.push({
      kind: "official-reference",
      content: [
        input.personalUniverse ? "공식 참조 세계관(Canon, 사용자가 pin한 published revision만):" : "공식 세계관(Canon, 서버 승인 published revision만):",
        ...resolved.official.slice(0, 100).map((item) => canonLine(item, "official")),
      ].join("\n").slice(0, 8000),
    });
  }
  if (resolved.personal.length) {
    sections.push({
      kind: "personal-universe",
      content: ["사용자 Personal Universe Canon(소유자 published revision만):", ...resolved.personal.slice(0, 100).map((item) => canonLine(item, "personal-universe"))].join("\n").slice(0, 8000),
    });
  }
  if (input.directive) {
    const d = input.directive;
    sections.push({
      kind: "moment",
      content: [
        "현재 장면 Directive(proposal; 상태 변경은 별도 서버 reducer만 수행):",
        `- scene: ${safeId(d.scene.sceneId)}`,
        `- motivation: ${clean(d.motivation, 500)}`,
        `- allowedKnowledge: ${d.allowedKnowledge.map((item) => clean(item, 180)).join(" | ") || "none"}`,
        `- forbiddenKnowledge: ${d.forbiddenKnowledge.map((item) => clean(item, 180)).join(" | ") || "none"}`,
      ].join("\n"),
    });
  }
  const stateLines = [
    "개인 서사 상태(현재 사용자 namespace만):",
    `- active arcs: ${input.state.activeArcIds.join(", ") || "none"}`,
    `- active beats: ${input.state.activeBeatIds.join(", ") || "none"}`,
    `- completed beats: ${input.state.completedBeatIds.slice(-20).join(", ") || "none"}`,
  ];
  const flags = Object.entries(input.state.flags).slice(0, 20).map(([key, value]) => `- flag ${clean(key, 100)}=${clean(value, 160)}`);
  const relations = Object.entries(input.state.relationAffinity).slice(0, 20).map(([key, value]) => `- relation ${clean(key, 100)}=${Math.max(-100, Math.min(100, Number(value || 0)))}`);
  if (flags.length) stateLines.push(...flags);
  if (relations.length) stateLines.push(...relations);
  sections.push({ kind: "personal-story", content: stateLines.join("\n") });
  const memory = (input.memory || []).map((item) => clean(item, 240)).filter(Boolean).slice(0, 8);
  if (memory.length) sections.push({ kind: "moment", content: ["승인된 개인화 memory(대화 원문 아님):", ...memory.map((item) => `- ${item}`)].join("\n") });
  return sections;
}

export function projectNarrativePrompt(input: {
  canon: IUniverseCanonRevisionDoc[];
  personalUniverse?: PersonalUniverseProjectionContext;
  state: { activeArcIds: string[]; activeBeatIds: string[]; completedBeatIds: string[]; flags: Record<string, unknown>; relationAffinity: Record<string, number> };
  directive?: NarrativeDirective | null;
  memory?: string[];
  maxTokens?: number;
}) {
  const sections = buildSections(input);
  const admissionSections = input.personalUniverse ? sortProjectionSectionsForAdmission(sections) : sections;
  const budget = Math.max(400, Math.floor(Number(input.maxTokens || 2200)));
  const kept: PromptSection[] = [];
  let used = 0;
  for (const section of admissionSections) {
    const cost = estimateTokens(section.content);
    if (kept.length === 0 || used + cost <= budget) {
      kept.push(section);
      used += cost;
    }
  }
  const rendered = input.personalUniverse ? sortProjectionSectionsForRender(kept) : kept;
  return rendered.map((section) => section.content).join("\n\n").trim();
}
