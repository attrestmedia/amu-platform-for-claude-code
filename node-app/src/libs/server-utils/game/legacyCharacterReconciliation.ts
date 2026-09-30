import { createHash } from "node:crypto";

export type LegacyCharacterInventoryRow = {
  characterId: string;
  uid: string;
  universeId: string;
  speciesId?: string;
};

export type LegacyReferenceRow = {
  id: string;
  kind: "persona" | "user-persona" | "tutor";
  collection: string;
  characterId?: string;
};

export type LegacyReconciliationInput = {
  characters: LegacyCharacterInventoryRow[];
  genesisProfiles: string[];
  generationRolls: string[];
  personaReferences: LegacyReferenceRow[];
  officialNpcCount: number;
};

function opaque(value: string) {
  return createHash("sha256").update(value, "utf8").digest("hex").slice(0, 16);
}

function unique(values: string[]) {
  return [...new Set(values.map((value) => String(value || "").trim()).filter(Boolean))].sort();
}

/** 운영 쓰기 전에 대상·예외·필드만 계산하는 결정적 backfill 계획. 실제 write는 이 모듈에 없다. */
export function buildLegacyReconciliationPlan(input: LegacyReconciliationInput) {
  const profiles = new Set(unique(input.genesisProfiles));
  const rolls = new Set(unique(input.generationRolls));
  const rowsById = new Map<string, LegacyCharacterInventoryRow[]>();
  for (const row of input.characters) {
    const id = String(row.characterId || "").trim();
    if (!id) continue;
    rowsById.set(id, [...(rowsById.get(id) || []), row]);
  }

  const operations = [...rowsById.entries()]
    .filter(([, rows]) => rows.length === 1)
    .flatMap(([characterId, rows]) => {
      const row = rows[0];
      const missingProfile = !profiles.has(characterId);
      const missingRoll = !rolls.has(characterId);
      if (!missingProfile && !missingRoll) return [];
      return [{
        operationKey: opaque(`backfill:${row.uid}:${characterId}`),
        entityId: opaque(characterId),
        uid: opaque(row.uid),
        universeId: row.universeId,
        action: "backfill-genesis-deterministic",
        missing: [
          ...(missingProfile ? ["profile"] : []),
          ...(missingRoll ? ["roll"] : []),
        ],
        writeFields: [
          ...(missingProfile ? ["character_genesis_profiles"] : []),
          ...(missingRoll ? ["character_generation_rolls"] : []),
          ...(missingProfile ? ["character_progress"] : []),
        ],
        requiresProductDataApproval: true,
      }];
    });

  const duplicateCharacterIds = [...rowsById.entries()]
    .filter(([, rows]) => rows.length > 1)
    .map(([characterId]) => opaque(characterId));
  const characterIds = new Set(rowsById.keys());
  const orphanProfiles = [...profiles].filter((id) => !characterIds.has(id)).map(opaque);
  const orphanRolls = [...rolls].filter((id) => !characterIds.has(id)).map(opaque);
  const matchedPersonaReferences = input.personaReferences.filter((row) => {
    const characterId = String(row.characterId || row.id || "").trim();
    return Boolean(characterId && characterIds.has(characterId));
  });

  return {
    readOnly: true,
    writeApplied: false,
    productionDataMutationAuthorized: false,
    policy: {
      officialCharacterGenesis: "authored-profile-required",
      userLegacyCharacterGenesis: "deterministic-backfill-pending-approval",
      duplicateHandling: "dead-letter-no-automatic-merge",
      rollback: "snapshot-plus-migration-batch-id-logical-rollback",
    },
    counts: {
      logicalCharacters: rowsById.size,
      duplicateLogicalCharacterGroups: duplicateCharacterIds.length,
      genesisProfiles: profiles.size,
      generationRolls: rolls.size,
      missingGenesisOperations: operations.length,
      orphanProfiles: orphanProfiles.length,
      orphanRolls: orphanRolls.length,
      personaReferences: input.personaReferences.length,
      mappedPersonaReferences: matchedPersonaReferences.length,
      officialNpcCount: Math.max(0, Number(input.officialNpcCount || 0)),
    },
    operations,
    exceptions: {
      duplicateCharacterIds,
      orphanProfiles,
      orphanRolls,
      unmappedPersonaReferences: input.personaReferences.length - matchedPersonaReferences.length,
    },
  };
}

export function fingerprintLegacyReconciliationPlan(plan: unknown) {
  return createHash("sha256").update(JSON.stringify(plan), "utf8").digest("hex");
}

export function assertProductionWriteDisabled(args: { apply: boolean; authorized: boolean }) {
  if (args.apply || args.authorized) {
    throw new Error("OOC032_PRODUCTION_WRITE_DISABLED: separate user approval and migration gate are required");
  }
}
