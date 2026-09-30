import "server-only";

import {
  createPersonalUniverseCanonDraft,
  getPersonalUniverseCanonRevision,
  getPersonalUniverseForOwner,
  transitionPersonalUniverseCanonRevision,
} from "libs/database/game/personalUniverseRepo";
import { getCrossUniverseBridgeById } from "libs/database/game/crossUniverseRepo";
import { assertLocalConsequenceOwnership, getCrossUniverseGate, isCrossUniverseBridgeApproved } from "libs/server-utils/narrative/crossUniversePolicy";
import type { CrossUniverseBridgeEvent } from "types/game";

/**
 * @docHint
 * @purpose 승인된 Canon Bridge를 요청한 소유자의 Canon에만 명시적으로 반영한다.
 * @process bilateral bridge read  local consequence ownership  idempotent history revision publish
 * @domain narrative-canon.cross-universe
 * @scope server
 */

function localUniverseForActor(bridge: CrossUniverseBridgeEvent, actorUid: string) {
  if (bridge.requesterUid === actorUid) return bridge.guest.sourceUniverseId;
  if (bridge.hostUid === actorUid) return bridge.hostUniverseId;
  return "";
}

/**
 * 자동 reducer가 아니다. 양쪽 승인이 완료된 뒤에도 각 소유자가 자기 세계에 적용을 눌러야 하며,
 * 저장값은 C1 history 1건뿐이다. foreign character 정의나 상대 Canon은 절대 쓰지 않는다.
 */
export async function applyApprovedCrossUniverseCanonBridge(input: { bridgeId: string; actorUid: string }) {
  if (!getCrossUniverseGate().ready) throw new Error("CROSS_UNIVERSE_DISABLED");
  const bridge = await getCrossUniverseBridgeById(input.bridgeId);
  if (!bridge || bridge.kind !== "canon-bridge" || !isCrossUniverseBridgeApproved(bridge)) {
    throw new Error("CROSS_UNIVERSE_CANON_BRIDGE_NOT_APPROVED");
  }
  const personalUniverseId = localUniverseForActor(bridge, input.actorUid);
  const consequence = bridge.localConsequences.find((item) => item.universeId === personalUniverseId);
  if (!personalUniverseId || !consequence) throw new Error("CROSS_UNIVERSE_LOCAL_CONSEQUENCE_NOT_FOUND");
  assertLocalConsequenceOwnership({ actorUniverseId: personalUniverseId, consequenceUniverseId: consequence.universeId, foreignReference: bridge.guest });

  const universe = await getPersonalUniverseForOwner(personalUniverseId, input.actorUid);
  if (!universe || universe.status !== "active") throw new Error("PERSONAL_UNIVERSE_NOT_FOUND_OR_FORBIDDEN");
  const entityId = `cross-bridge:${bridge.bridgeId}`;
  const published = await getPersonalUniverseCanonRevision({ personalUniverseId, ownerUid: input.actorUid, entityType: "history", entityId, status: "published" });
  if (published) return { bridge, revision: published, applied: false as const };

  let revision = await getPersonalUniverseCanonRevision({ personalUniverseId, ownerUid: input.actorUid, entityType: "history", entityId });
  if (!revision || revision.status === "archived" || revision.status === "deprecated") {
    revision = await createPersonalUniverseCanonDraft({
      personalUniverseId,
      ownerUid: input.actorUid,
      layer: "C1",
      entityType: "history",
      entityId,
      payload: {
        title: bridge.sharedFact.title,
        summary: consequence.summary,
        description: consequence.relationInterpretation || "Creator-approved Cross-Universe Canon Bridge",
      },
      changelog: "Cross-Universe Canon Bridge owner application",
      supersedesRevision: revision?.revision || null,
    });
  }
  if (revision.status === "draft") revision = await transitionPersonalUniverseCanonRevision({ revisionId: revision.revisionId, to: "review", ownerUid: input.actorUid });
  if (revision.status === "review") revision = await transitionPersonalUniverseCanonRevision({ revisionId: revision.revisionId, to: "published", ownerUid: input.actorUid });
  return { bridge, revision, applied: true as const };
}
