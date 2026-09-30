import { NextResponse } from "next/server";
import { TEXT_PROVIDER_TYPES } from "consts/ai";
import { getPersonalUniverseForOwner, listPublishedPersonalUniverseCanon, getUserGameCharacterById } from "libs/database/game";
import { withAuth } from "libs/server-utils/api/apiMiddleware";
import type { AuthenticatedUserType } from "libs/server-utils/api/_helpers";
import { getAuthenticatedUid } from "libs/server-utils/lab/imageAssetAccess";
import { callTextByProvider } from "libs/server-utils/api/apiHelper";
import { assertSystemModelSelectableOrThrow, resolveSystemDefaultModelName } from "libs/server-utils/api/systemModelControl";
import { buildManualRelationshipProposal, buildRelationshipProposalPrompt } from "libs/server-utils/narrative/relationshipProposal";
import { relationshipProposalSessionKey, resolveRelationshipProposals } from "libs/server-utils/narrative/relationshipProposalRuntime";
import { RELATIONSHIP_PROPOSAL_POLICY, type CanonGraphRevisionDoc, type IPersonalUniverseCanonRevisionDoc, type RelationshipProposalContext } from "types/game";
import type { TextProviderType } from "types/ai";
import { redisCache } from "libs/cache/redisCacheService";
import type { UnknownRecord } from "utils/common/typeUtils";

export const runtime = "nodejs";

/**
 * @docHint
 * @purpose Personal Universe의 AI 관계 제안 proposal API
 * @process owner 인증  owner-scoped Canon 조회  비용·호출 cap  AI proposal 검증  수동 fallback 반환
 * @domain game.personal-universe.relationship-proposals
 * @scope user-api
 */

function value(body: UnknownRecord, key: string, max = 180) {
  const raw = typeof body[key] === "string" ? body[key].trim() : "";
  return raw.slice(0, max);
}

function safeSessionId(body: UnknownRecord, request: Request) {
  const raw = value(body, "sessionId", 160) || String(request.headers.get("x-narrative-session") || "").trim().slice(0, 160);
  return /^[a-zA-Z0-9][a-zA-Z0-9._:-]{7,159}$/.test(raw) ? raw : "";
}

function latestPublished(revisions: IPersonalUniverseCanonRevisionDoc[]) {
  const latest = new Map<string, IPersonalUniverseCanonRevisionDoc>();
  for (const revision of revisions) {
    const key = `${revision.entityType}:${revision.entityId}`;
    const current = latest.get(key);
    if (!current || revision.revision > current.revision) latest.set(key, revision);
  }
  return [...latest.values()];
}

function buildContext(input: {
  uid: string;
  personalUniverseId: string;
  character: NonNullable<Awaited<ReturnType<typeof getUserGameCharacterById>>>;
  canon: IPersonalUniverseCanonRevisionDoc[];
  openLoopIds?: string[];
}): RelationshipProposalContext {
  const canon = latestPublished(input.canon);
  const characterRevision = canon.find((item) => item.entityType === "character" && item.entityId === input.character.characterId);
  const requestedOpenLoopIds = new Set((input.openLoopIds || []).filter(Boolean));
  const openLoops = canon.filter((item) => item.entityType === "open-loop" && (requestedOpenLoopIds.size === 0 || requestedOpenLoopIds.has(item.entityId)));
  return {
    ownerUid: input.uid,
    personalUniverseId: input.personalUniverseId,
    newCharacter: {
      characterId: input.character.characterId,
      title: String(characterRevision?.payload.title || input.character.name || input.character.characterId).slice(0, 240),
      summary: String(characterRevision?.payload.summary || characterRevision?.payload.description || "").slice(0, 800),
    },
    personalCanon: canon as CanonGraphRevisionDoc[],
    openLoops,
  };
}

export const POST = withAuth(
  async (body: UnknownRecord, user, request) => {
    try {
      const uid = getAuthenticatedUid(user as AuthenticatedUserType);
      const characterId = value(body, "characterId");
      const sessionId = safeSessionId(body, request);
      if (!uid || !characterId || !sessionId) return NextResponse.json({ ok: false, error: "RELATIONSHIP_PROPOSAL_INPUT_INVALID" }, { status: 400 });

      const character = await getUserGameCharacterById({ uid, characterId });
      if (!character?.personalUniverseId) return NextResponse.json({ ok: false, error: "PERSONAL_UNIVERSE_REQUIRED" }, { status: 409 });
      const personalUniverseId = character.personalUniverseId;
      const universe = await getPersonalUniverseForOwner(personalUniverseId, uid);
      if (!universe || universe.status !== "active") return NextResponse.json({ ok: false, error: "PERSONAL_UNIVERSE_NOT_FOUND_OR_FORBIDDEN" }, { status: 404 });

      const canon = await listPublishedPersonalUniverseCanon(personalUniverseId, uid);
      const openLoopIds = Array.isArray(body.openLoopIds) ? body.openLoopIds.filter((item): item is string => typeof item === "string").slice(0, RELATIONSHIP_PROPOSAL_POLICY.maxOpenLoops) : undefined;
      const context = buildContext({ uid, personalUniverseId, character, canon, openLoopIds });
      const provider = (value(body, "provider", 40) || "zai") as TextProviderType;
      if (!TEXT_PROVIDER_TYPES.includes(provider)) return NextResponse.json({ ok: false, error: "RELATIONSHIP_PROPOSAL_PROVIDER_INVALID" }, { status: 400 });
      let requestedModel = "";
      try {
        requestedModel = value(body, "modelName", 120) || await resolveSystemDefaultModelName({ provider, modality: "text" });
        await assertSystemModelSelectableOrThrow({ provider, modelName: requestedModel, modality: "text", actor: { user } });
      } catch {
        return NextResponse.json({ ok: true, data: { ...buildManualRelationshipProposal(context, "model_unavailable"), persisted: false, approvalRequired: true } }, { headers: { "Cache-Control": "no-store" } });
      }
      const prompt = buildRelationshipProposalPrompt(context);
      const result = await resolveRelationshipProposals({
        uid,
        personalUniverseId,
        sessionId,
        provider,
        modelName: requestedModel,
        prompt,
        context,
        reserveSessionCall: async () => {
          const count = await redisCache.incr(relationshipProposalSessionKey({ uid, personalUniverseId, sessionId }), RELATIONSHIP_PROPOSAL_POLICY.sessionTtlSeconds);
          return count;
        },
        invoke: async () => {
          const output = await callTextByProvider(provider, requestedModel, prompt, {
            n: 1,
            temperature: 0.2,
            maxOutputTokens: RELATIONSHIP_PROPOSAL_POLICY.maxOutputTokens,
            responseMimeType: "application/json",
            actorUser: user,
          });
          return { rawText: output.outputs[0] || "", promptTokens: output.usageTotal.input, outputTokens: output.usageTotal.output };
        },
      });
      return NextResponse.json({ ok: true, data: { ...result, persisted: false, approvalRequired: true } }, { headers: { "Cache-Control": "no-store" } });
    } catch (error) {
      const code = String((error as { errorCode?: unknown; message?: unknown })?.errorCode || (error as { message?: unknown })?.message || "RELATIONSHIP_PROPOSAL_FAILED");
      const status = code.includes("FORBIDDEN") ? 403 : code.includes("NOT_FOUND") ? 404 : code.includes("MODEL_NOT_SELECTABLE") ? 403 : code.includes("INVALID") ? 400 : 500;
      return NextResponse.json({ ok: false, error: code }, { status });
    }
  },
  undefined,
  "game/personal-universe/relationship-proposals:write",
  { bodyParser: "json" },
);
