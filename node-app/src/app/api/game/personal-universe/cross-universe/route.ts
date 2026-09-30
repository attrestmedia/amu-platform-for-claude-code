import { NextResponse } from "next/server";
import type { AuthenticatedUserType } from "libs/server-utils/api/_helpers";
import { withAuth } from "libs/server-utils/api/apiMiddleware";
import { getAuthenticatedUid } from "libs/server-utils/lab/imageAssetAccess";
import {
  approveCrossUniverseBridge,
  blockCrossUniverseUser,
  createCrossUniverseBridgeRequest,
  createCrossUniverseReport,
  getCrossUniverseSharePreference,
  getPublicUniverseMatchSnapshot,
  getPersonalUniverseCanonRevision,
  getPersonalUniverseByUid,
  isCrossUniverseBlocked,
  listCrossUniverseBridgesForUser,
  listEnabledCrossUniverseSharePreferences,
  listPublishedPersonalUniverseCanon,
  listPublicUniverseGraphSnapshots,
  listPublicUniverseMatchSnapshots,
  listUserGameCharacters,
  upsertCrossUniverseSharePreference,
  withdrawCrossUniverseBridge,
} from "libs/database/game";
import { canCreateCrossUniverseAppearance, getCrossUniverseGate } from "libs/server-utils/narrative/crossUniversePolicy";
import { applyApprovedCrossUniverseCanonBridge } from "libs/server-utils/narrative/crossUniverseCanonReducer";
import { projectForeignCharacterReference } from "libs/server-utils/narrative/crossUniverseForeignCharacterProjection";
import { buildCrossUniverseMatchCandidates } from "libs/server-utils/narrative/crossUniverseMatchmaking";
import { resolveTrustedMinorStatus } from "libs/server-utils/narrative/narrativeLifecycle";
import { CROSS_UNIVERSE_CONSENT_VERSION, CROSS_UNIVERSE_REPORT_REASON_VALUES, CROSS_UNIVERSE_SCOPE_VALUES, type CrossUniverseReportReason, type CrossUniverseScope } from "types/game";
import type { UnknownRecord } from "utils/common/typeUtils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function text(body: UnknownRecord, key: string, max = 1200) {
  return typeof body[key] === "string" ? body[key].trim().slice(0, max) : "";
}
function scopes(body: UnknownRecord) {
  return Array.isArray(body.scopes) ? body.scopes.filter((value): value is CrossUniverseScope => typeof value === "string" && CROSS_UNIVERSE_SCOPE_VALUES.includes(value as CrossUniverseScope)) : [];
}

/**
 * @docHint
 * @purpose Cross-Universe owner API; disabled 상태에서는 노출·새 요청을 만들지 않는다.
 * @process gate/minor/block  owner preference  bilateral request  public-snapshot graph projection
 * @domain game.personal-universe.cross-universe
 * @scope user-api
 */
export const GET = withAuth(
  async (_body, user) => {
    const uid = getAuthenticatedUid(user as AuthenticatedUserType);
    const gate = getCrossUniverseGate();
    if (!uid) return NextResponse.json({ ok: false, error: "CROSS_UNIVERSE_OWNER_REQUIRED" }, { status: 401 });
    if (!gate.ready) return NextResponse.json({ ok: true, data: { enabled: false, gate, bridges: [], nodes: [], candidates: [], characters: [], requests: [], canonBridges: [], shareEnabled: false } }, { headers: { "Cache-Control": "no-store" } });
    const universe = await getPersonalUniverseByUid(uid);
    if (!universe) return NextResponse.json({ ok: true, data: { enabled: true, gate, bridges: [], nodes: [], candidates: [], characters: [], requests: [], canonBridges: [], shareEnabled: false } }, { headers: { "Cache-Control": "no-store" } });
    const [bridges, preference, ownCanon, characters, sharePreferences] = await Promise.all([
      listCrossUniverseBridgesForUser(uid),
      getCrossUniverseSharePreference(uid, universe.personalUniverseId),
      listPublishedPersonalUniverseCanon(universe.personalUniverseId, uid),
      listUserGameCharacters({ uid, universeId: universe.rulesetUniverseId, status: "active", limit: 50 }),
      listEnabledCrossUniverseSharePreferences({ excludeOwnerUid: uid, limit: 100 }),
    ]);
    const universeIds = Array.from(new Set(bridges.flatMap((bridge) => [bridge.hostUniverseId, bridge.guest.sourceUniverseId])));
    const [snapshots, matchSnapshots] = await Promise.all([
      listPublicUniverseGraphSnapshots(universeIds),
      preference?.status === "enabled" ? listPublicUniverseMatchSnapshots(sharePreferences.map((item) => item.personalUniverseId)) : Promise.resolve([]),
    ]);
    const nodes = snapshots.map((snapshot) => ({ universeId: snapshot.personalUniverseId, publicSnapshotId: snapshot.snapshotId, title: snapshot.content?.worldName || "Public Universe" }));
    const visible = new Set(nodes.map((node) => node.universeId));
    const candidates = preference?.status === "enabled" ? buildCrossUniverseMatchCandidates({ ownCanon, candidates: matchSnapshots, limit: gate.matchmakingLimit }) : [];
    return NextResponse.json({
      ok: true,
      data: {
        enabled: true,
        gate,
        nodes,
        candidates,
        shareEnabled: preference?.status === "enabled",
        characters: characters.filter((character) => character.personalUniverseId === universe.personalUniverseId).map((character) => ({ characterId: character.characterId, name: character.name })),
        requests: bridges.filter((bridge) => bridge.status === "requested" && bridge.hostUid === uid).map((bridge) => ({ bridgeId: bridge.bridgeId, title: bridge.sharedFact.title, kind: bridge.kind })),
        canonBridges: bridges.filter((bridge) => bridge.kind === "canon-bridge" && bridge.status === "approved").map((bridge) => ({ bridgeId: bridge.bridgeId, title: bridge.sharedFact.title })),
        bridges: bridges.filter((bridge) => bridge.status === "approved" && visible.has(bridge.hostUniverseId) && visible.has(bridge.guest.sourceUniverseId)).map((bridge) => ({
          bridgeId: bridge.bridgeId,
          kind: bridge.kind,
          status: bridge.status,
          hostUniverseId: bridge.hostUniverseId,
          guestUniverseId: bridge.guest.sourceUniverseId,
          foreignCharacter: projectForeignCharacterReference(bridge.guest),
          sharedFact: { title: bridge.sharedFact.title, occurredAt: bridge.sharedFact.occurredAt },
          createdAt: bridge.createdAt,
        })),
      },
    }, { headers: { "Cache-Control": "no-store" } });
  },
  undefined,
  "game/personal-universe/cross-universe:read",
  { bodyParser: "none" },
);

export const POST = withAuth(
  async (body: UnknownRecord, user) => {
    try {
      const uid = getAuthenticatedUid(user as AuthenticatedUserType);
      const action = text(body, "action", 40);
      if (!uid || !["share", "request", "request-candidate", "approve", "apply-canon", "withdraw", "block", "report"].includes(action)) {
        return NextResponse.json({ ok: false, error: "CROSS_UNIVERSE_INPUT_INVALID" }, { status: 400 });
      }
      if (action === "block") {
        const blockedUid = text(body, "blockedUid", 160);
        await blockCrossUniverseUser({ ownerUid: uid, blockedUid });
        return NextResponse.json({ ok: true, data: { blockedUid } }, { headers: { "Cache-Control": "no-store" } });
      }
      if (action === "report") {
        const reason = text(body, "reason", 40) as CrossUniverseReportReason;
        if (!CROSS_UNIVERSE_REPORT_REASON_VALUES.includes(reason)) return NextResponse.json({ ok: false, error: "CROSS_UNIVERSE_REPORT_INPUT_INVALID" }, { status: 400 });
        const report = await createCrossUniverseReport({ reporterUid: uid, reportedUid: text(body, "reportedUid", 160), bridgeId: text(body, "bridgeId", 160), reason, note: text(body, "note", 500) });
        return NextResponse.json({ ok: true, data: { reportId: report.reportId, status: report.status } }, { status: 201, headers: { "Cache-Control": "no-store" } });
      }
      const gate = getCrossUniverseGate();
      if (!gate.ready) return NextResponse.json({ ok: false, error: "CROSS_UNIVERSE_DISABLED" }, { status: 423 });
      const minor = await resolveTrustedMinorStatus(uid);
      if (minor.isMinor) return NextResponse.json({ ok: false, error: "CROSS_UNIVERSE_MINOR_BLOCKED" }, { status: 403 });
      if (action === "share") {
        const universe = await getPersonalUniverseByUid(uid);
        if (!universe) return NextResponse.json({ ok: false, error: "PERSONAL_UNIVERSE_NOT_FOUND_OR_FORBIDDEN" }, { status: 404 });
        if (body.enabled === true && body.confirmCrossUniverseSharing !== true) return NextResponse.json({ ok: false, error: "CROSS_UNIVERSE_SHARE_CONFIRMATION_REQUIRED" }, { status: 400 });
        const allowedScopes = body.enabled === true ? [...CROSS_UNIVERSE_SCOPE_VALUES] : [];
        const result = await upsertCrossUniverseSharePreference({ ownerUid: uid, personalUniverseId: universe.personalUniverseId, status: body.enabled === true ? "enabled" : "withdrawn", allowedScopes, consentVersion: CROSS_UNIVERSE_CONSENT_VERSION });
        return NextResponse.json({ ok: true, data: { status: result.status, allowedScopes: result.allowedScopes } }, { headers: { "Cache-Control": "no-store" } });
      }
      if (action === "approve") {
        const result = await approveCrossUniverseBridge({ bridgeId: text(body, "bridgeId", 160), actorUid: uid, localConsequence: { summary: text(body, "localSummary", 1200), relationInterpretation: text(body, "relationInterpretation", 600) } });
        return NextResponse.json({ ok: true, data: { bridgeId: result.bridgeId, status: result.status } }, { headers: { "Cache-Control": "no-store" } });
      }
      if (action === "apply-canon") {
        const result = await applyApprovedCrossUniverseCanonBridge({ bridgeId: text(body, "bridgeId", 160), actorUid: uid });
        return NextResponse.json({ ok: true, data: { bridgeId: result.bridge.bridgeId, revisionId: result.revision.revisionId, applied: result.applied } }, { headers: { "Cache-Control": "no-store" } });
      }
      if (action === "withdraw") {
        const result = await withdrawCrossUniverseBridge({ bridgeId: text(body, "bridgeId", 160), actorUid: uid });
        return NextResponse.json({ ok: true, data: { bridgeId: result.bridgeId, status: result.status } }, { headers: { "Cache-Control": "no-store" } });
      }
      const ownUniverse = await getPersonalUniverseByUid(uid);
      if (!ownUniverse) return NextResponse.json({ ok: false, error: "PERSONAL_UNIVERSE_NOT_FOUND_OR_FORBIDDEN" }, { status: 404 });
      const candidateSnapshot = action === "request-candidate" ? await getPublicUniverseMatchSnapshot(text(body, "snapshotId", 160)) : null;
      if (action === "request-candidate" && !candidateSnapshot) return NextResponse.json({ ok: false, error: "PERSONAL_UNIVERSE_PUBLIC_SNAPSHOT_NOT_FOUND" }, { status: 404 });
      const hostUid = candidateSnapshot?.ownerUid || text(body, "hostUid", 160);
      const hostUniverseId = candidateSnapshot?.personalUniverseId || text(body, "hostUniverseId", 160);
      const characterId = text(body, "characterId", 160);
      const characterRevisionDoc = await getPersonalUniverseCanonRevision({ personalUniverseId: ownUniverse.personalUniverseId, ownerUid: uid, entityType: "character", entityId: characterId, status: "published" });
      const guest = { ownerUid: uid, sourceUniverseId: ownUniverse.personalUniverseId, characterId, characterRevision: Number(characterRevisionDoc?.revision || 0) };
      const [hostPreference, guestPreference, hostMinor, blocked] = await Promise.all([
        getCrossUniverseSharePreference(hostUid, hostUniverseId),
        getCrossUniverseSharePreference(uid, guest.sourceUniverseId),
        resolveTrustedMinorStatus(hostUid),
        isCrossUniverseBlocked(uid, hostUid),
      ]);
      if (!hostPreference || !guestPreference) return NextResponse.json({ ok: false, error: "CROSS_UNIVERSE_SHARE_CONSENT_REQUIRED" }, { status: 403 });
      const appearance = canCreateCrossUniverseAppearance({ gateReady: gate.ready, isMinor: hostMinor.isMinor, isBlocked: blocked, host: hostPreference, guest: guestPreference, scopes: scopes(body) });
      if (!appearance.allowed) return NextResponse.json({ ok: false, error: appearance.reason }, { status: 403 });
      const kind = body.kind === "canon-bridge" ? "canon-bridge" : "guest-encounter";
      const sharedFact = { title: text(body, "title", 180) || "Cross-Universe encounter", summary: text(body, "summary", 1200) || "Creator-approved guest encounter.", scopes: appearance.scopes };
      const result = await createCrossUniverseBridgeRequest({
        kind,
        requesterUid: uid,
        hostUid,
        guest,
        hostUniverseId,
        hostCharacterId: text(body, "hostCharacterId", 160),
        sharedFact,
        localConsequences: kind === "canon-bridge" ? [{ universeId: ownUniverse.personalUniverseId, summary: text(body, "localSummary", 1200) || sharedFact.summary, relationInterpretation: text(body, "relationInterpretation", 600) }] : [],
      });
      return NextResponse.json({ ok: true, data: { bridgeId: result.bridgeId, status: result.status, approvalRequired: true } }, { status: 201, headers: { "Cache-Control": "no-store" } });
    } catch (error) {
      const code = String((error as { message?: unknown })?.message || "CROSS_UNIVERSE_FAILED");
      const status = code.includes("FORBIDDEN") || code.includes("BLOCKED") ? 403 : code.includes("INVALID") ? 400 : code.includes("NOT_FOUND") ? 404 : 500;
      return NextResponse.json({ ok: false, error: code }, { status, headers: { "Cache-Control": "no-store" } });
    }
  },
  undefined,
  "game/personal-universe/cross-universe:write",
  { bodyParser: "json" },
);
