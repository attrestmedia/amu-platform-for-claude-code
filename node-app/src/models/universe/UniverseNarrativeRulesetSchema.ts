import { Schema, type Document } from "mongoose";
import {
  UNIVERSE_NARRATIVE_RULESET_STATUS_VALUES,
  type IAffinityMatrixEntry,
  type IArchetypeDefinition,
  type IAttributeDefinition,
  type IStatDefinition,
  type ITraitDefinition,
  type IUniverseNarrativeRuleset,
} from "types/game";

const AttributeDefinitionSchema = new Schema<IAttributeDefinition>(
  {
    id: { type: String, required: true, trim: true },
    i18nKey: { type: String, required: true, trim: true },
    displayName: { type: String, default: "" },
    description: { type: String, default: "" },
  },
  { _id: false },
);

const AffinityMatrixEntrySchema = new Schema<IAffinityMatrixEntry>(
  {
    sourceAttributeId: { type: String, required: true, trim: true },
    targetAttributeId: { type: String, required: true, trim: true },
    multiplier: { type: Number, required: true, min: 0.000001 },
  },
  { _id: false },
);

const StatDefinitionSchema = new Schema<IStatDefinition>(
  {
    id: { type: String, required: true, trim: true },
    i18nKey: { type: String, required: true, trim: true },
    min: { type: Number, required: true },
    max: { type: Number, required: true },
    description: { type: String, default: "" },
  },
  { _id: false },
);

const ArchetypeDefinitionSchema = new Schema<IArchetypeDefinition>(
  {
    id: { type: String, required: true, trim: true },
    i18nKey: { type: String, required: true, trim: true },
    displayName: { type: String, default: "" },
    statModifiers: { type: Schema.Types.Mixed, default: undefined },
  },
  { _id: false },
);

const TraitDefinitionSchema = new Schema<ITraitDefinition>(
  {
    id: { type: String, required: true, trim: true },
    i18nKey: { type: String, required: true, trim: true },
    displayName: { type: String, default: "" },
    description: { type: String, default: "" },
    rarity: { type: String, default: "" },
  },
  { _id: false },
);

export interface IUniverseNarrativeRulesetDocument extends Document, IUniverseNarrativeRuleset {}

export const UniverseNarrativeRulesetSchema = new Schema<IUniverseNarrativeRulesetDocument>(
  {
    universeId: { type: String, required: true, trim: true, index: true },
    rulesetVersion: { type: Number, required: true, min: 1 },
    algorithmVersion: { type: Number, required: true, min: 1 },
    status: {
      type: String,
      enum: UNIVERSE_NARRATIVE_RULESET_STATUS_VALUES,
      required: true,
      default: "draft",
      index: true,
    },
    attributes: { type: [AttributeDefinitionSchema], default: [] },
    affinityMatrix: { type: [AffinityMatrixEntrySchema], default: [] },
    stats: { type: [StatDefinitionSchema], default: [] },
    archetypes: { type: [ArchetypeDefinitionSchema], default: [] },
    traits: { type: [TraitDefinitionSchema], default: [] },
    createdBy: { type: String, default: "" },
    publishedBy: { type: String, default: "" },
    publishedAt: { type: Date, default: null },
    supersedesVersion: { type: Number, min: 1, default: null },
  },
  { timestamps: true, collection: "universe_narrative_rulesets" },
);

UniverseNarrativeRulesetSchema.index(
  { universeId: 1, rulesetVersion: 1 },
  { unique: true, name: "universe_narrative_ruleset_version_unique" },
);
UniverseNarrativeRulesetSchema.index(
  { universeId: 1, status: 1, rulesetVersion: -1 },
  { name: "universe_narrative_ruleset_published_lookup" },
);
