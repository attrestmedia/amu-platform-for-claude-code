import "server-only";

import { randomInt } from "node:crypto";
import type {
  IArchetypeDefinition,
  IUniverseNarrativeRuleset,
  NarrativeStatId,
  NarrativeStatValues,
} from "types/game";
import { CHARACTER_SPECIES_IDS, type CharacterSpeciesId } from "consts/game/characterGenesisPolicy";

export const CHARACTER_GENESIS_ALGORITHM_VERSION = 1;
export const CHARACTER_GENESIS_POLICY_VERSION = 1;
export const RARITY_ROLL_TOTAL = 1_000_000;

export const RARITY_TABLE = [
  { tier: "common", weight: 700_000, potentialBand: "faint", budgetFactor: 0.35 },
  { tier: "uncommon", weight: 200_000, potentialBand: "steady", budgetFactor: 0.43 },
  { tier: "rare", weight: 88_900, potentialBand: "bright", budgetFactor: 0.51 },
  { tier: "epic", weight: 10_000, potentialBand: "charged", budgetFactor: 0.59 },
  { tier: "legendary", weight: 1_000, potentialBand: "remarkable", budgetFactor: 0.68 },
  { tier: "mythic", weight: 90, potentialBand: "mythic", budgetFactor: 0.78 },
  { tier: "celestial", weight: 10, potentialBand: "celestial", budgetFactor: 0.88 },
] as const;

export type CharacterGenesisRarityTier = (typeof RARITY_TABLE)[number]["tier"];
export type CharacterGenesisPotentialBand = (typeof RARITY_TABLE)[number]["potentialBand"];
export type CharacterGenesisRng = (maxExclusive: number) => number;

const secureRng: CharacterGenesisRng = (maxExclusive) => randomInt(maxExclusive);

function nextInt(rng: CharacterGenesisRng, maxExclusive: number) {
  if (!Number.isInteger(maxExclusive) || maxExclusive <= 0) return 0;
  const value = Number(rng(maxExclusive));
  if (!Number.isInteger(value) || value < 0 || value >= maxExclusive) {
    throw new Error("genesis_rng_out_of_range");
  }
  return value;
}

export function rollRarity(rng: CharacterGenesisRng = secureRng) {
  const bucket = nextInt(rng, RARITY_ROLL_TOTAL);
  let cursor = 0;
  for (const entry of RARITY_TABLE) {
    cursor += entry.weight;
    if (bucket < cursor) {
      return { ...entry, bucket };
    }
  }
  throw new Error("genesis_rarity_table_incomplete");
}

export function getRarityDisclosure() {
  return RARITY_TABLE.map(({ tier, weight }) => ({
    tier,
    weight,
    probability: weight / RARITY_ROLL_TOTAL,
  }));
}

function chooseArchetype(archetypes: IArchetypeDefinition[], requestedId: string | undefined, rng: CharacterGenesisRng) {
  const requested = requestedId ? archetypes.find((entry) => entry.id === requestedId) : undefined;
  if (requested) return requested;
  if (!archetypes.length) {
    return { id: "unassigned", i18nKey: "game.archetype.unassigned", statModifiers: {} };
  }
  return archetypes[nextInt(rng, archetypes.length)];
}

function rollStats(
  ruleset: IUniverseNarrativeRuleset,
  rarityFactor: number,
  archetype: IArchetypeDefinition,
  rng: CharacterGenesisRng,
) {
  const definitions = ruleset.stats.filter((entry): entry is typeof entry & { id: NarrativeStatId } =>
    ["vitality", "focus", "insight", "empathy", "adaptability", "fortune"].includes(entry.id),
  );
  if (definitions.length !== 6) throw new Error("genesis_common_stats_missing");

  const minTotal = definitions.reduce((sum, entry) => sum + Math.ceil(entry.min), 0);
  const maxTotal = definitions.reduce((sum, entry) => sum + Math.floor(entry.max), 0);
  const statBudget = Math.max(minTotal, Math.min(maxTotal, Math.round(minTotal + (maxTotal - minTotal) * rarityFactor)));
  let remainingExtra = statBudget - minTotal;
  const stats = {} as NarrativeStatValues;

  definitions.forEach((entry, index) => {
    const min = Math.ceil(entry.min);
    const max = Math.floor(entry.max);
    const cap = Math.max(0, max - min);
    const remainingCapacity = definitions
      .slice(index + 1)
      .reduce((sum, next) => sum + Math.max(0, Math.floor(next.max) - Math.ceil(next.min)), 0);
    const lowest = Math.max(0, remainingExtra - remainingCapacity);
    const highest = Math.min(cap, remainingExtra);
    const extra = index === definitions.length - 1 ? remainingExtra : lowest + nextInt(rng, highest - lowest + 1);
    remainingExtra -= extra;
    const modifier = Number(archetype.statModifiers?.[entry.id] || 0);
    stats[entry.id] = Math.max(min, Math.min(max, min + extra + modifier));
  });

  return { stats, statBudget };
}

function rollTraits(
  ruleset: IUniverseNarrativeRuleset,
  rarityTier: CharacterGenesisRarityTier,
  rng: CharacterGenesisRng,
) {
  if (!ruleset.traits.length) return [];
  const chanceByTier: Record<CharacterGenesisRarityTier, number> = {
    common: 500,
    uncommon: 1_000,
    rare: 2_000,
    epic: 3_500,
    legendary: 5_000,
    mythic: 7_500,
    celestial: 9_000,
  };
  if (nextInt(rng, 10_000) >= chanceByTier[rarityTier]) return [];
  return [ruleset.traits[nextInt(rng, ruleset.traits.length)].id];
}

export interface CharacterGenesisRollInput {
  ruleset: IUniverseNarrativeRuleset;
  speciesId: string;
  archetypeId?: string;
  primaryAttributeId?: string;
  rng?: CharacterGenesisRng;
}

export interface CharacterGenesisRollResult {
  rulesetVersion: number;
  algorithmVersion: number;
  policyVersion: number;
  speciesId: string;
  archetypeId: string;
  primaryAttributeId: string;
  affinity: Record<string, number>;
  rarityBucket: number;
  rarityTier: CharacterGenesisRarityTier;
  potentialBand: CharacterGenesisPotentialBand;
  statBudget: number;
  stats: NarrativeStatValues;
  traitIds: string[];
}

export function rollCharacterGenesis(input: CharacterGenesisRollInput): CharacterGenesisRollResult {
  const speciesId = String(input.speciesId || "").trim();
  if (!CHARACTER_SPECIES_IDS.includes(speciesId as CharacterSpeciesId)) throw new Error("genesis_species_invalid");
  if (!input.ruleset.attributes.length) throw new Error("genesis_attributes_missing");

  const rng = input.rng || secureRng;
  const rarity = rollRarity(rng);
  const archetype = chooseArchetype(input.ruleset.archetypes, input.archetypeId, rng);
  const requestedAttributeId = String(input.primaryAttributeId || "").trim();
  const requestedAttribute = requestedAttributeId
    ? input.ruleset.attributes.find((entry) => entry.id === requestedAttributeId)
    : undefined;
  if (requestedAttributeId && !requestedAttribute) throw new Error("genesis_attribute_invalid");
  const primaryAttributeId = requestedAttribute?.id || input.ruleset.attributes[nextInt(rng, input.ruleset.attributes.length)].id;
  const affinityEntries = input.ruleset.affinityMatrix.filter(
    (entry) => entry.sourceAttributeId === primaryAttributeId,
  );
  const affinity = Object.fromEntries(
    affinityEntries.length
      ? affinityEntries.map((entry) => [entry.targetAttributeId, entry.multiplier])
      : [[primaryAttributeId, 1]],
  );
  const rolledStats = rollStats(input.ruleset, rarity.budgetFactor, archetype, rng);

  return {
    rulesetVersion: input.ruleset.rulesetVersion,
    algorithmVersion: CHARACTER_GENESIS_ALGORITHM_VERSION,
    policyVersion: CHARACTER_GENESIS_POLICY_VERSION,
    speciesId,
    archetypeId: archetype.id,
    primaryAttributeId,
    affinity,
    rarityBucket: rarity.bucket,
    rarityTier: rarity.tier,
    potentialBand: rarity.potentialBand,
    statBudget: rolledStats.statBudget,
    stats: rolledStats.stats,
    traitIds: rollTraits(input.ruleset, rarity.tier, rng),
  };
}

export function summarizeRarityBuckets(buckets: number[]) {
  const counts = new Map<CharacterGenesisRarityTier, number>(RARITY_TABLE.map(({ tier }) => [tier, 0]));
  for (const bucket of buckets) {
    const tier = RARITY_TABLE.find((entry, index) => {
      const start = RARITY_TABLE.slice(0, index).reduce((sum, current) => sum + current.weight, 0);
      return bucket >= start && bucket < start + entry.weight;
    })?.tier;
    if (tier) counts.set(tier, (counts.get(tier) || 0) + 1);
  }
  const sampleSize = buckets.length;
  return RARITY_TABLE.map(({ tier, weight }) => ({
    tier,
    count: counts.get(tier) || 0,
    sampleSize,
    observedProbability: sampleSize ? (counts.get(tier) || 0) / sampleSize : 0,
    expectedProbability: weight / RARITY_ROLL_TOTAL,
  }));
}
