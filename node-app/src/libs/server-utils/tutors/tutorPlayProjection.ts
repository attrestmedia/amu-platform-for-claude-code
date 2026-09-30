import "server-only";

import {
  commitTutorPlayProjection,
  releaseTutorPlayProjection,
  reserveTutorPlayProjection,
} from "libs/database/game";
import { assertNarrativeCollectionAllowed } from "libs/server-utils/narrative/narrativeLifecycle";
import { applyNarrativeOutcome, resolveNarrativeOutcome } from "libs/server-utils/narrative/narrativeReducer";
import {
  deriveTutorPlayProjection,
  resolveTutorPlayProjectionRuntimeConfig,
  type TutorPlayProjectionDecision,
} from "./tutorPlayProjectionCore";
import {
  TUTOR_PLAY_PROJECTION_CONSENT_VERSION,
  type ServerTutorLearningEvaluation,
  type TutorPlayProjectionBlockReason,
} from "types/game";

export type TutorPlayProjectionResult = TutorPlayProjectionDecision & {
  duplicate: boolean;
  beatApplied: boolean;
  relationApplied: boolean;
  projectionId: string | null;
};

function id(value: unknown, max = 160) {
  const normalized = String(value || "").trim();
  if (!normalized || normalized.length > max || !/^[a-zA-Z0-9][a-zA-Z0-9._:@/-]*$/.test(normalized)) throw new Error("TUTOR_PLAY_INVALID_SIGNAL");
  return normalized;
}

function blocked(reason: TutorPlayProjectionBlockReason, decision?: Partial<TutorPlayProjectionDecision>): TutorPlayProjectionResult {
  return {
    allowed: false,
    reason,
    xp: decision?.xp || 0,
    dailyBucket: decision?.dailyBucket || null,
    signals: decision?.signals || null,
    duplicate: false,
    beatApplied: false,
    relationApplied: false,
    projectionId: null,
  };
}

/**
 * Tutors 서버 평가 → Play Personal Canon bridge.
 * 이 함수는 API body를 직접 받지 않는 서버 adapter에서만 호출한다.
 * 실패하면 학습 결과를 되돌리지 않고 Play projection만 중단한다.
 */
export async function projectTutorLearningToPlay(input: {
  uid: string;
  universeId: string;
  narrativeProfileId: string;
  canonRevision: number;
  beatId: string;
  playerCharacterInstanceId: string;
  evaluation: ServerTutorLearningEvaluation;
}) : Promise<TutorPlayProjectionResult> {
  const runtime = resolveTutorPlayProjectionRuntimeConfig();
  if (!runtime.enabled) return blocked("feature_disabled");
  if (!runtime.dailyXpCap) return blocked("daily_cap_required");

  let consent: Awaited<ReturnType<typeof assertNarrativeCollectionAllowed>>;
  try {
    consent = await assertNarrativeCollectionAllowed(input.uid, { crossService: true });
  } catch {
    return blocked("consent_required");
  }
  if (consent.crossServiceConsentVersion !== TUTOR_PLAY_PROJECTION_CONSENT_VERSION) return blocked("consent_required");

  const decision = deriveTutorPlayProjection({ evaluation: input.evaluation, xpSchedule: runtime.xpSchedule });
  if (!decision.allowed) return blocked(decision.reason === "allowed" ? "invalid_projection_signal" : decision.reason, decision);
  if (!decision.signals || !decision.dailyBucket) return blocked("invalid_projection_signal", decision);

  const idempotencyKey = `tutor-play:${decision.signals.sourceEvaluationId}`;
  let reservation: Awaited<ReturnType<typeof reserveTutorPlayProjection>>;
  try {
    reservation = await reserveTutorPlayProjection({
      uid: input.uid,
      universeId: input.universeId,
      sourceEvaluationId: decision.signals.sourceEvaluationId,
      sourceSessionId: decision.signals.sourceSessionId,
      idempotencyKey,
      dailyBucket: decision.dailyBucket,
      xp: decision.xp,
      dailyCap: runtime.dailyXpCap,
      consentVersion: TUTOR_PLAY_PROJECTION_CONSENT_VERSION,
      signals: decision.signals,
    });
  } catch (error) {
    const code = error instanceof Error ? error.message : "";
    return blocked(code === "TUTOR_PLAY_DAILY_CAP_REACHED" ? "daily_cap_reached" : code === "TUTOR_PLAY_DAILY_CAP_MISMATCH" ? "daily_cap_mismatch" : "projection_write_failed", decision);
  }

  if (reservation.duplicate && reservation.ledger.status === "applied") {
    return { ...decision, duplicate: true, beatApplied: true, relationApplied: Boolean(decision.signals.relationChange), projectionId: reservation.ledger.projectionId };
  }
  if (reservation.ledger.status === "capped") {
    return blocked("daily_cap_reached", decision);
  }
  if (reservation.ledger.status !== "reserved") {
    return blocked("projection_write_failed", decision);
  }

  let beatApplied = false;
  let relationApplied = false;
  try {
    const beatOutcome = resolveNarrativeOutcome({
      source: "learning_evaluation",
      action: { type: "answer_evaluated", beatId: id(input.beatId), passed: true },
    });
    if (!beatOutcome) throw new Error("TUTOR_PLAY_BEAT_OUTCOME_FAILED");
    const beatResult = await applyNarrativeOutcome({
      uid: input.uid,
      universeId: input.universeId,
      narrativeProfileId: input.narrativeProfileId,
      canonRevision: input.canonRevision,
      idempotencyKey: `${idempotencyKey}:beat`,
      outcome: beatOutcome,
    });
    beatApplied = Boolean(beatResult.event);

    if (decision.signals.relationChange) {
      const relation = decision.signals.relationChange;
      const relationOutcome = resolveNarrativeOutcome({
        source: "learning_evaluation",
        action: {
          type: "change_relation",
          playerCharacterInstanceId: id(input.playerCharacterInstanceId),
          targetCharacterId: relation.targetCharacterId,
          relationType: relation.relationType,
          reason: "learning_milestone",
          visibility: "private",
        },
      });
      if (!relationOutcome) throw new Error("TUTOR_PLAY_RELATION_OUTCOME_FAILED");
      const relationResult = await applyNarrativeOutcome({
        uid: input.uid,
        universeId: input.universeId,
        narrativeProfileId: input.narrativeProfileId,
        canonRevision: input.canonRevision,
        idempotencyKey: `${idempotencyKey}:relation:${relation.targetCharacterId}`,
        outcome: relationOutcome,
      });
      const affinityOutcome = resolveNarrativeOutcome({
        source: "learning_evaluation",
        action: {
          type: "set_relation_signal",
          targetCharacterId: relation.targetCharacterId,
          delta: relation.delta,
        },
      });
      if (!affinityOutcome) throw new Error("TUTOR_PLAY_AFFINITY_OUTCOME_FAILED");
      const affinityResult = await applyNarrativeOutcome({
        uid: input.uid,
        universeId: input.universeId,
        narrativeProfileId: input.narrativeProfileId,
        canonRevision: input.canonRevision,
        idempotencyKey: `${idempotencyKey}:affinity:${relation.targetCharacterId}`,
        outcome: affinityOutcome,
      });
      relationApplied = Boolean(relationResult.event) && Boolean(affinityResult.event);
    }

    await commitTutorPlayProjection({
      projectionId: reservation.ledger.projectionId,
      uid: input.uid,
      dailyBucket: decision.dailyBucket,
      xp: decision.xp,
    });
    return { ...decision, duplicate: false, beatApplied, relationApplied, projectionId: reservation.ledger.projectionId };
  } catch {
    try {
      await releaseTutorPlayProjection({
        projectionId: reservation.ledger.projectionId,
        uid: input.uid,
        dailyBucket: decision.dailyBucket,
        xp: decision.xp,
      });
    } catch {
      // reservation reconciliation worker must surface this before production enablement.
    }
    return { ...blocked("projection_write_failed", decision), beatApplied, relationApplied, projectionId: reservation.ledger.projectionId };
  }
}
