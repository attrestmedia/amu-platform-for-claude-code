import "server-only";

import { randomUUID } from "node:crypto";
import { getPublishedUniverseNarrativeRuleset } from "libs/database/universe";
import {
  createCharacterProgressIfAbsent,
  createGenerationRollIfAbsent,
  createGenesisProfileIfAbsent,
  getGenerationRollByIdempotencyKey,
  getGenesisBundle,
  markGenerationRollApplied,
  markGenerationRollApplying,
} from "libs/database/game";
import { validateUniverseNarrativeRuleset, type IUniverseNarrativeRuleset } from "types/game";
import { rollCharacterGenesis, type CharacterGenesisRollResult } from "./characterGenesisRoll";
import { recordPilotMetric } from "libs/server-utils/play/playPilotMetrics";

export class CharacterGenesisError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, status: number) {
    super(code);
    this.code = code;
    this.status = status;
  }
}

const APPLIED_BUNDLE_WAIT_MS = 5_000;
const APPLIED_BUNDLE_POLL_MS = 50;

function safeId(value: unknown, max = 160) {
  const normalized = String(value || "").trim();
  return normalized && normalized.length <= max && /^[a-zA-Z0-9._:-]+$/.test(normalized) ? normalized : "";
}

function toProfileInput(args: {
  uid: string;
  characterId: string;
  universeId: string;
  roll: CharacterGenesisRollResult;
}) {
  return {
    characterId: args.characterId,
    uid: args.uid,
    universeId: args.universeId,
    speciesId: args.roll.speciesId,
    archetypeId: args.roll.archetypeId,
    sourceType: "user-random" as const,
    rulesetVersion: args.roll.rulesetVersion,
    algorithmVersion: args.roll.algorithmVersion,
    primaryAttributeId: args.roll.primaryAttributeId,
    affinity: args.roll.affinity,
    rarityTier: args.roll.rarityTier,
    potentialBand: args.roll.potentialBand,
    statBudget: args.roll.statBudget,
    stats: args.roll.stats,
    traitIds: args.roll.traitIds,
  };
}

async function applyPreparedRoll(args: {
  uid: string;
  characterId: string;
  universeId: string;
  roll: CharacterGenesisRollResult & { rollId: string; idempotencyKey: string };
}) {
  await markGenerationRollApplying({ uid: args.uid, rollId: args.roll.rollId });
  await createGenesisProfileIfAbsent(toProfileInput(args));
  await createCharacterProgressIfAbsent({
    characterId: args.characterId,
    uid: args.uid,
    level: 1,
    xp: 0,
    hp: Math.max(0, Math.min(200, Math.round(args.roll.stats.vitality))),
    mp: Math.max(0, Math.min(200, Math.round(args.roll.stats.focus))),
    mood: "neutral",
    intimacy: 0,
  });
  await markGenerationRollApplied({ uid: args.uid, rollId: args.roll.rollId });
  return getGenesisBundle({ uid: args.uid, characterId: args.characterId });
}

async function waitForAppliedBundle(args: { uid: string; characterId: string }) {
  const deadline = Date.now() + APPLIED_BUNDLE_WAIT_MS;
  let bundle = await getGenesisBundle({ uid: args.uid, characterId: args.characterId });
  while (
    Date.now() < deadline &&
    (!bundle.roll || bundle.roll.status !== "applied" || !bundle.profile || !bundle.progress)
  ) {
    await new Promise((resolve) => setTimeout(resolve, APPLIED_BUNDLE_POLL_MS));
    bundle = await getGenesisBundle({ uid: args.uid, characterId: args.characterId });
  }
  return bundle;
}

export async function createUserCharacterGenesis(args: {
  uid: string;
  universeId: string;
  speciesId: string;
  archetypeId?: string;
  primaryAttributeId?: string;
  characterId?: string;
  idempotencyKey: string;
}) {
  const uid = safeId(args.uid);
  const universeId = safeId(args.universeId, 80);
  const speciesId = safeId(args.speciesId, 80);
  const idempotencyKey = safeId(args.idempotencyKey, 180);
  const requestedCharacterId = args.characterId ? safeId(args.characterId) : `gen_${randomUUID().replace(/-/g, "")}`;
  if (!uid || !universeId || !speciesId || !idempotencyKey || !requestedCharacterId) {
    throw new CharacterGenesisError("GENESIS_INPUT_INVALID", 400);
  }

  const existingRoll = await getGenerationRollByIdempotencyKey({ uid, idempotencyKey });
  if (existingRoll) {
    // 재시도 수요 계측 — 동일 idempotencyKey로 다시 만들려는 시도(생성은 멱등 유지)
    void recordPilotMetric({
      uid,
      universeId,
      metric: "creation_retry",
      idempotencyKey: `retry:${idempotencyKey}`,
      detail: { rarityTier: String(existingRoll.rarityTier || "") },
    });
    if (existingRoll.characterId !== requestedCharacterId && args.characterId) {
      throw new CharacterGenesisError("GENESIS_IDEMPOTENCY_CONFLICT", 409);
    }
    if (existingRoll.status !== "applied") {
      return applyPreparedRoll({
        uid,
        characterId: existingRoll.characterId,
        universeId: existingRoll.universeId,
        roll: existingRoll as unknown as CharacterGenesisRollResult & { rollId: string; idempotencyKey: string },
      });
    }
    return getGenesisBundle({ uid, characterId: existingRoll.characterId });
  }

  const ruleset = await getPublishedUniverseNarrativeRuleset(universeId);
  if (!ruleset) throw new CharacterGenesisError("GENESIS_RULESET_UNAVAILABLE", 424);
  const rulesetInput = ruleset as unknown as IUniverseNarrativeRuleset;
  if (validateUniverseNarrativeRuleset(rulesetInput).length > 0) {
    throw new CharacterGenesisError("GENESIS_RULESET_INVALID", 424);
  }
  const result = rollCharacterGenesis({
    ruleset: rulesetInput,
    speciesId,
    archetypeId: args.archetypeId,
    primaryAttributeId: args.primaryAttributeId,
  });
  const rollInput = {
    idempotencyKey,
    characterId: requestedCharacterId,
    uid,
    universeId,
    rulesetVersion: ruleset.rulesetVersion,
    algorithmVersion: result.algorithmVersion,
    status: "prepared" as const,
    rarityBucket: result.rarityBucket,
    rarityTier: result.rarityTier,
    archetypeId: result.archetypeId,
    primaryAttributeId: result.primaryAttributeId,
    affinity: result.affinity,
    potentialBand: result.potentialBand,
    statBudget: result.statBudget,
    traitCount: result.traitIds.length,
    stats: result.stats,
    traitIds: result.traitIds,
  };
  const stored = await createGenerationRollIfAbsent(rollInput);
  if (!stored.created) {
    const existing = stored.doc as unknown as typeof rollInput & { rollId: string };
    if (existing.uid !== uid || (args.characterId && existing.characterId !== requestedCharacterId)) {
      throw new CharacterGenesisError("GENESIS_IDEMPOTENCY_CONFLICT", 409);
    }
    // 동시 요청 경쟁에서 진 호출은 winner의 적용 완료를 짧게 대기해 동일 결과를 반환한다.
    const waited = await waitForAppliedBundle({ uid, characterId: existing.characterId });
    if (waited.roll?.status === "applied" && waited.profile && waited.progress) return waited;
    // 적용이 중단된 prepared/applying roll은 저장된 roll을 재적용한다 (reroll 없음).
    if (waited.roll && waited.roll.status !== "applied") {
      return applyPreparedRoll({
        uid,
        characterId: existing.characterId,
        universeId: existing.universeId,
        roll: waited.roll as unknown as CharacterGenesisRollResult & { rollId: string; idempotencyKey: string },
      });
    }
    return waited;
  }

  const storedRoll = stored.doc as unknown as { rollId?: string; rarityTier?: string };
  void recordPilotMetric({
    uid,
    universeId,
    metric: "creation_attempt",
    idempotencyKey: `create:${idempotencyKey}`,
    detail: { rarityTier: String(storedRoll.rarityTier || "") },
  });
  return applyPreparedRoll({
    uid,
    characterId: requestedCharacterId,
    universeId,
    roll: {
      ...result,
      rollId: String((storedRoll as { rollId?: string }).rollId || ""),
      idempotencyKey,
      rulesetVersion: ruleset.rulesetVersion,
    },
  });
}
