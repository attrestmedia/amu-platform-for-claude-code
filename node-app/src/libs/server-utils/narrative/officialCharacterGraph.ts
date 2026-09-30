import {
  CANON_RELATION_EXCLUSIVE_PAIRS,
  CANON_RELATION_TYPE_VALUES,
  CANON_RELATION_VISIBILITY_VALUES,
} from "types/game";
import type {
  CanonGraphRevisionDoc,
  CanonGraphValidationIssue,
  CanonReferenceEntityType,
  CanonRelationType,
  CanonRelationVisibility,
} from "types/game";

/**
 * @docHint
 * @purpose OOC-080 공식 Character Graph의 검증·읽기 계약 (versioned schema v1)
 * @process published relation edge 판정  참조/중복/lore 충돌 검사  admin/public projection  규모별 비용 추정
 * @domain narrative-canon.character-graph
 * @scope server
 */

export const OFFICIAL_CHARACTER_GRAPH_SCHEMA_VERSION = 1;

export const OFFICIAL_CHARACTER_GRAPH_POLICY = {
  /** 관계 세기는 절대 성능·결제 가치와 결합하지 않는 서술 강도값이다(0~100). */
  minStrength: 0,
  maxStrength: 100,
  /** 한 캐릭터가 소유할 수 있는 published out-edge 상한. prompt projection 비용 상한과 같은 근거다. */
  maxEdgesPerCharacter: 24,
  /** admin/public 조회 응답에 실을 수 있는 총 edge 상한. */
  maxProjectedEdges: 400,
  /**
   * prompt에 투영할 때는 전체 그래프가 아니라 해당 캐릭터의 이웃 edge만 싣는다.
   * Director의 maxPromptTokens(1800) 안에 Canon·상태 section과 함께 들어가야 하므로 별도 상한을 둔다.
   */
  maxPromptScopedEdges: 12,
  promptScopeTokenBudget: 600,
  defaultVisibility: "internal" as CanonRelationVisibility,
} as const;

export const OFFICIAL_CHARACTER_GRAPH_FLAG = "OFFICIAL_CHARACTER_GRAPH_ENABLED";

/** 기본 비활성. 명시적 true만 graph 읽기 경로를 연다. */
export function isOfficialCharacterGraphEnabled(env: Record<string, string | undefined> = process.env) {
  return env[OFFICIAL_CHARACTER_GRAPH_FLAG] === "true";
}

export type OfficialCharacterGraphEdge = {
  entityId: string;
  revision: number;
  sourceCharacterId: string;
  targetRefType: CanonReferenceEntityType;
  targetRefId: string;
  relationTypes: CanonRelationType[];
  strength: number;
  visibility: CanonRelationVisibility;
  sinceEventId?: string;
};

export type OfficialCharacterGraphNode = {
  characterId: string;
  revision: number;
  title?: string;
};

export type OfficialCharacterGraphProjection = {
  schemaVersion: number;
  audience: "admin" | "public";
  nodes: OfficialCharacterGraphNode[];
  edges: OfficialCharacterGraphEdge[];
  excludedEdgeCount: number;
};

const AUTHORABLE_STATUSES = new Set(["draft", "review", "published"]);

function safeId(value: unknown) {
  const id = typeof value === "string" ? value.trim() : "";
  return /^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,119}$/.test(id) ? id : "";
}

function latestByEntity(revisions: readonly CanonGraphRevisionDoc[]) {
  const latest = new Map<string, CanonGraphRevisionDoc>();
  for (const revision of revisions) {
    if (!AUTHORABLE_STATUSES.has(revision.status)) continue;
    const key = `${revision.entityType}:${revision.entityId}`;
    const current = latest.get(key);
    if (!current || revision.revision > current.revision) latest.set(key, revision);
  }
  return [...latest.values()];
}

function readRelationTypes(value: unknown): string[] {
  return Array.isArray(value) ? value.map((item) => String(item || "").trim()).filter(Boolean) : [];
}

function readVisibility(value: unknown): CanonRelationVisibility {
  return CANON_RELATION_VISIBILITY_VALUES.includes(value as CanonRelationVisibility)
    ? (value as CanonRelationVisibility)
    : OFFICIAL_CHARACTER_GRAPH_POLICY.defaultVisibility;
}

function readStrength(value: unknown) {
  return Number.isInteger(value) ? Number(value) : 0;
}

function edgeKey(edge: { sourceCharacterId: string; targetRefType: string; targetRefId: string }) {
  return `${edge.sourceCharacterId}->${edge.targetRefType}:${edge.targetRefId}`;
}

/**
 * relation edge만 검사한다. relation이 없는 Canon 집합에서는 어떤 issue도 만들지 않으므로
 * 기존 publish 경로의 동작을 바꾸지 않는다.
 */
export function validateOfficialCharacterGraph(revisions: readonly CanonGraphRevisionDoc[]): CanonGraphValidationIssue[] {
  const issues: CanonGraphValidationIssue[] = [];
  const latest = latestByEntity(revisions);
  const relations = latest.filter((item) => item.entityType === "relation");
  if (!relations.length) return issues;

  const byKey = new Map(latest.map((item) => [`${item.entityType}:${item.entityId}`, item] as const));
  const seenEdges = new Map<string, string>();
  const outDegree = new Map<string, number>();

  for (const relation of relations) {
    const payload = relation.payload;
    const sourceCharacterId = safeId(payload.sourceCharacterId);
    const targetRefType = String(payload.targetRefType || "") as CanonReferenceEntityType;
    const targetRefId = safeId(payload.targetRefId);
    const base = { entityType: relation.entityType, entityId: relation.entityId } as const;

    if (!sourceCharacterId || !targetRefId) {
      issues.push({ ...base, code: "OCG_EDGE_ENDPOINT_INVALID", path: "payload", message: "relation edge must declare a valid source and target" });
      continue;
    }

    const source = byKey.get(`character:${sourceCharacterId}`);
    if (!source) {
      issues.push({ ...base, code: "OCG_SOURCE_NOT_FOUND", path: "payload.sourceCharacterId", message: `source character ${sourceCharacterId} does not exist` });
    }
    const target = byKey.get(`${targetRefType}:${targetRefId}`);
    if (!target) {
      issues.push({ ...base, code: "OCG_TARGET_NOT_FOUND", path: "payload.targetRefId", message: `target ${targetRefType}:${targetRefId} does not exist` });
    }

    if (targetRefType === "character" && sourceCharacterId === targetRefId) {
      issues.push({ ...base, code: "OCG_SELF_RELATION_FORBIDDEN", path: "payload.targetRefId", message: "a character cannot hold a relation to itself" });
    }

    // published edge는 published 대상만 가리킬 수 있다. 미발행 Canon 노출을 막는다.
    if (relation.status === "published") {
      if (source && source.status !== "published") {
        issues.push({ ...base, code: "OCG_SOURCE_NOT_PUBLISHED", path: "payload.sourceCharacterId", message: `source character ${sourceCharacterId} is not published` });
      }
      if (target && target.status !== "published") {
        issues.push({ ...base, code: "OCG_TARGET_NOT_PUBLISHED", path: "payload.targetRefId", message: `target ${targetRefType}:${targetRefId} is not published` });
      }
    }

    const relationTypes = readRelationTypes(payload.relationTypes);
    if (!relationTypes.length) {
      issues.push({ ...base, code: "OCG_RELATION_TYPE_REQUIRED", path: "payload.relationTypes", message: "relation edge must declare at least one relation type" });
    }
    for (const type of relationTypes) {
      if (!CANON_RELATION_TYPE_VALUES.includes(type as CanonRelationType)) {
        issues.push({ ...base, code: "OCG_RELATION_TYPE_INVALID", path: "payload.relationTypes", message: `${type} is not an AMU relation type` });
      }
    }
    for (const [a, b] of CANON_RELATION_EXCLUSIVE_PAIRS) {
      if (relationTypes.includes(a) && relationTypes.includes(b)) {
        issues.push({ ...base, code: "OCG_LORE_CONFLICT", path: "payload.relationTypes", message: `${a} and ${b} cannot describe the same edge` });
      }
    }

    if (payload.strength !== undefined) {
      const strength = readStrength(payload.strength);
      if (!Number.isInteger(payload.strength) || strength < OFFICIAL_CHARACTER_GRAPH_POLICY.minStrength || strength > OFFICIAL_CHARACTER_GRAPH_POLICY.maxStrength) {
        issues.push({ ...base, code: "OCG_STRENGTH_OUT_OF_RANGE", path: "payload.strength", message: `strength must be an integer within ${OFFICIAL_CHARACTER_GRAPH_POLICY.minStrength}~${OFFICIAL_CHARACTER_GRAPH_POLICY.maxStrength}` });
      }
    }

    if (payload.visibility !== undefined && !CANON_RELATION_VISIBILITY_VALUES.includes(payload.visibility as CanonRelationVisibility)) {
      issues.push({ ...base, code: "OCG_VISIBILITY_INVALID", path: "payload.visibility", message: "visibility must be public or internal" });
    }
    // public edge는 published 대상만 공개할 수 있다.
    if (readVisibility(payload.visibility) === "public" && target && target.status !== "published") {
      issues.push({ ...base, code: "OCG_PUBLIC_EDGE_UNPUBLISHED_TARGET", path: "payload.visibility", message: "a public edge cannot expose an unpublished target" });
    }

    if (payload.sinceEventId !== undefined) {
      const sinceEventId = safeId(payload.sinceEventId);
      const event = sinceEventId ? byKey.get(`event:${sinceEventId}`) : undefined;
      if (!event) {
        issues.push({ ...base, code: "OCG_SINCE_EVENT_NOT_FOUND", path: "payload.sinceEventId", message: `sinceEventId ${String(payload.sinceEventId)} does not reference a Canon event` });
      }
    }

    const key = edgeKey({ sourceCharacterId, targetRefType, targetRefId });
    const existing = seenEdges.get(key);
    if (existing && existing !== relation.entityId) {
      issues.push({ ...base, code: "OCG_DUPLICATE_EDGE", path: "payload", message: `${key} is already declared by relation ${existing}` });
    } else {
      seenEdges.set(key, relation.entityId);
    }

    const degree = (outDegree.get(sourceCharacterId) || 0) + 1;
    outDegree.set(sourceCharacterId, degree);
    if (degree > OFFICIAL_CHARACTER_GRAPH_POLICY.maxEdgesPerCharacter) {
      issues.push({ ...base, code: "OCG_EDGE_LIMIT_EXCEEDED", path: "payload.sourceCharacterId", message: `${sourceCharacterId} exceeds ${OFFICIAL_CHARACTER_GRAPH_POLICY.maxEdgesPerCharacter} published relations` });
    }
  }

  return issues;
}

function toEdge(relation: CanonGraphRevisionDoc): OfficialCharacterGraphEdge {
  const payload = relation.payload;
  return {
    entityId: relation.entityId,
    revision: relation.revision,
    sourceCharacterId: safeId(payload.sourceCharacterId),
    targetRefType: String(payload.targetRefType || "character") as CanonReferenceEntityType,
    targetRefId: safeId(payload.targetRefId),
    relationTypes: readRelationTypes(payload.relationTypes).filter((type) =>
      CANON_RELATION_TYPE_VALUES.includes(type as CanonRelationType),
    ) as CanonRelationType[],
    strength: readStrength(payload.strength),
    visibility: readVisibility(payload.visibility),
    ...(safeId(payload.sinceEventId) ? { sinceEventId: safeId(payload.sinceEventId) } : {}),
  };
}

/**
 * 읽기 계약. admin은 published edge 전체를, public은 published + visibility public edge만 본다.
 * 어떤 audience에서도 미발행 revision과 authoring metadata는 나가지 않는다.
 */
export function projectOfficialCharacterGraph(input: {
  revisions: readonly CanonGraphRevisionDoc[];
  audience: "admin" | "public";
  characterIds?: readonly string[];
}): OfficialCharacterGraphProjection {
  const latest = latestByEntity(input.revisions);
  const published = latest.filter((item) => item.status === "published");
  const publishedKeys = new Set(published.map((item) => `${item.entityType}:${item.entityId}`));
  const scope = input.characterIds?.length ? new Set(input.characterIds) : null;

  const candidates = published.filter((item) => item.entityType === "relation").map(toEdge);
  const admitted: OfficialCharacterGraphEdge[] = [];
  let excludedEdgeCount = 0;

  for (const edge of candidates) {
    const endpointsPublished =
      publishedKeys.has(`character:${edge.sourceCharacterId}`) && publishedKeys.has(`${edge.targetRefType}:${edge.targetRefId}`);
    const audienceAllowed = input.audience === "admin" || edge.visibility === "public";
    const inScope = !scope || scope.has(edge.sourceCharacterId) || scope.has(edge.targetRefId);
    if (!endpointsPublished || !audienceAllowed || !inScope || admitted.length >= OFFICIAL_CHARACTER_GRAPH_POLICY.maxProjectedEdges) {
      excludedEdgeCount += 1;
      continue;
    }
    // public 응답에는 발행되지 않은 사건 참조를 남기지 않는다.
    const sinceEventPublished = edge.sinceEventId ? publishedKeys.has(`event:${edge.sinceEventId}`) : false;
    admitted.push(
      input.audience === "public" && !sinceEventPublished ? { ...edge, sinceEventId: undefined } : edge,
    );
  }

  const referenced = new Set<string>();
  for (const edge of admitted) {
    referenced.add(edge.sourceCharacterId);
    if (edge.targetRefType === "character") referenced.add(edge.targetRefId);
  }
  const nodes = published
    .filter((item) => item.entityType === "character" && referenced.has(item.entityId))
    .map((item) => ({
      characterId: item.entityId,
      revision: item.revision,
      ...(typeof item.payload.title === "string" ? { title: item.payload.title } : {}),
    }));

  return {
    schemaVersion: OFFICIAL_CHARACTER_GRAPH_SCHEMA_VERSION,
    audience: input.audience,
    nodes: nodes.sort((a, b) => a.characterId.localeCompare(b.characterId)),
    edges: admitted.sort((a, b) => a.sourceCharacterId.localeCompare(b.sourceCharacterId) || a.targetRefId.localeCompare(b.targetRefId)),
    excludedEdgeCount,
  };
}

/**
 * 캐릭터 수 증가 기준의 조회·prompt projection 비용 상한 추정.
 * edge 한 줄의 최대 길이를 상한으로 잡아 문자수를 계산한다(토큰은 4자 기준 근사).
 */
export function estimateOfficialCharacterGraphProjectionCost(input: { characterCount: number; edgesPerCharacter?: number }) {
  const edgesPerCharacter = Math.min(
    Math.max(1, Math.floor(Number(input.edgesPerCharacter || 4))),
    OFFICIAL_CHARACTER_GRAPH_POLICY.maxEdgesPerCharacter,
  );
  const characterCount = Math.max(0, Math.floor(Number(input.characterCount || 0)));
  const rawEdges = characterCount * edgesPerCharacter;
  const projectedEdges = Math.min(rawEdges, OFFICIAL_CHARACTER_GRAPH_POLICY.maxProjectedEdges);
  // "- [relation source -> type:target] types(3) strength" 한 줄의 보수적 상한
  const bytesPerEdge = 180;
  // prompt에는 캐릭터 이웃(in+out) edge만 싣고 그마저도 상한으로 자른다.
  const promptScopedEdges = Math.min(edgesPerCharacter * 2, OFFICIAL_CHARACTER_GRAPH_POLICY.maxPromptScopedEdges);
  const promptScopedTokens = Math.ceil((promptScopedEdges * bytesPerEdge) / 4);
  return {
    characterCount,
    edgesPerCharacter,
    rawEdges,
    projectedEdges,
    truncatedEdges: rawEdges - projectedEdges,
    estimatedReadChars: projectedEdges * bytesPerEdge,
    estimatedReadTokens: Math.ceil((projectedEdges * bytesPerEdge) / 4),
    promptScopedEdges,
    promptScopedTokens,
    /** 캐릭터 수와 무관하게 조회·prompt 비용이 상한 안에 머무는지. */
    bounded:
      projectedEdges <= OFFICIAL_CHARACTER_GRAPH_POLICY.maxProjectedEdges &&
      promptScopedTokens <= OFFICIAL_CHARACTER_GRAPH_POLICY.promptScopeTokenBudget,
  };
}
