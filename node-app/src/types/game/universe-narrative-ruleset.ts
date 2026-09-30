export const UNIVERSE_NARRATIVE_RULESET_STATUS_VALUES = [
  "draft",
  "review",
  "published",
  "deprecated",
  "archived",
] as const;

export type UniverseNarrativeRulesetStatus = (typeof UNIVERSE_NARRATIVE_RULESET_STATUS_VALUES)[number];

export const NARRATIVE_STAT_IDS = [
  "vitality",
  "focus",
  "insight",
  "empathy",
  "adaptability",
  "fortune",
] as const;

export type NarrativeStatId = (typeof NARRATIVE_STAT_IDS)[number];
export type NarrativeStatValues = Record<NarrativeStatId, number>;

export interface IAttributeDefinition {
  id: string;
  i18nKey: string;
  displayName?: string;
  description?: string;
}

export interface IAffinityMatrixEntry {
  sourceAttributeId: string;
  targetAttributeId: string;
  multiplier: number;
}

export interface IStatDefinition {
  id: NarrativeStatId;
  i18nKey: string;
  min: number;
  max: number;
  description?: string;
}

export interface IArchetypeDefinition {
  id: string;
  i18nKey: string;
  displayName?: string;
  statModifiers?: Partial<NarrativeStatValues>;
}

export interface ITraitDefinition {
  id: string;
  i18nKey: string;
  displayName?: string;
  description?: string;
  rarity?: string;
}

export interface IUniverseNarrativeRuleset {
  universeId: string;
  rulesetVersion: number;
  algorithmVersion: number;
  status: UniverseNarrativeRulesetStatus;
  attributes: IAttributeDefinition[];
  affinityMatrix: IAffinityMatrixEntry[];
  stats: IStatDefinition[];
  archetypes: IArchetypeDefinition[];
  traits: ITraitDefinition[];
  createdBy?: string;
  publishedBy?: string;
  publishedAt?: string | Date | null;
  supersedesVersion?: number | null;
  createdAt?: string | Date;
  updatedAt?: string | Date;
}

export interface ICharacterGenesisProfileSnapshot {
  characterId: string;
  universeId: string;
  speciesId: string;
  rulesetVersion: number;
  algorithmVersion: number;
  primaryAttributeId: string;
  rarityTier: string;
  stats: NarrativeStatValues;
  traitIds: string[];
}

export function validateUniverseNarrativeRuleset(input: IUniverseNarrativeRuleset): string[] {
  const errors: string[] = [];
  const attributeIds = new Set<string>();
  const archetypeIds = new Set<string>();
  const traitIds = new Set<string>();
  const statIds = new Set<string>();

  if (!input.universeId.trim()) errors.push("universeId is required");
  if (!Number.isInteger(input.rulesetVersion) || input.rulesetVersion < 1) {
    errors.push("rulesetVersion must be a positive integer");
  }
  if (!Number.isInteger(input.algorithmVersion) || input.algorithmVersion < 1) {
    errors.push("algorithmVersion must be a positive integer");
  }

  for (const entry of input.attributes) {
    if (!entry.id.trim() || !entry.i18nKey.trim()) errors.push("attribute id and i18nKey are required");
    if (attributeIds.has(entry.id)) errors.push(`duplicate attribute id: ${entry.id}`);
    attributeIds.add(entry.id);
  }

  for (const entry of input.affinityMatrix) {
    if (!attributeIds.has(entry.sourceAttributeId)) {
      errors.push(`unknown affinity source attribute: ${entry.sourceAttributeId}`);
    }
    if (!attributeIds.has(entry.targetAttributeId)) {
      errors.push(`unknown affinity target attribute: ${entry.targetAttributeId}`);
    }
    if (!Number.isFinite(entry.multiplier) || entry.multiplier <= 0) {
      errors.push(`affinity multiplier must be positive: ${entry.sourceAttributeId}->${entry.targetAttributeId}`);
    }
  }

  for (const entry of input.stats) {
    if (statIds.has(entry.id)) errors.push(`duplicate stat id: ${entry.id}`);
    statIds.add(entry.id);
    if (!entry.i18nKey.trim()) errors.push(`stat i18nKey is required: ${entry.id}`);
    if (!Number.isFinite(entry.min) || !Number.isFinite(entry.max) || entry.min > entry.max) {
      errors.push(`invalid stat range: ${entry.id}`);
    }
  }

  for (const id of NARRATIVE_STAT_IDS) {
    if (!statIds.has(id)) errors.push(`missing common stat: ${id}`);
  }

  for (const entry of input.archetypes) {
    if (archetypeIds.has(entry.id)) errors.push(`duplicate archetype id: ${entry.id}`);
    archetypeIds.add(entry.id);
  }

  for (const entry of input.traits) {
    if (traitIds.has(entry.id)) errors.push(`duplicate trait id: ${entry.id}`);
    traitIds.add(entry.id);
  }

  return errors;
}
