import { Schema, type Document } from "mongoose";
import type { IntelligencePattern } from "libs/server-utils/magazine/magazineIntelligencePatternContract";

/**
 * @docHint
 * @purpose node-app이 소유하는 Intelligence Pattern Registry v1 모델 — AIR-800
 * @process 검증된 Pattern aggregate를 revision CAS와 함께 저장하고 Knowledge Article과 연결
 * @domain intelligence-pattern-registry
 * @scope db-schema
 */

export interface IMagazineIntelligencePatternDocument extends Document {
  contractType: "intelligence-pattern-registry";
  schemaVersion: "intelligence-pattern-registry.v1";
  patternId: string;
  normalizedName: string;
  maturity: IntelligencePattern["maturity"];
  scopeStatus: IntelligencePattern["scopeStatus"];
  healthStatus: IntelligencePattern["healthStatus"];
  pattern: IntelligencePattern;
  revision: string;
  source: "admin";
  updatedBy: string;
  createdAt: Date;
  updatedAt: Date;
}

export const MagazineIntelligencePatternSchema = new Schema<IMagazineIntelligencePatternDocument>(
  {
    contractType: { type: String, enum: ["intelligence-pattern-registry"], required: true, default: "intelligence-pattern-registry" },
    schemaVersion: { type: String, enum: ["intelligence-pattern-registry.v1"], required: true, default: "intelligence-pattern-registry.v1" },
    patternId: { type: String, required: true, unique: true, index: true },
    normalizedName: { type: String, required: true, index: true },
    maturity: { type: String, enum: ["candidate", "emerging", "active"], required: true, index: true },
    scopeStatus: { type: String, enum: ["general", "contextual"], required: true, index: true },
    healthStatus: { type: String, enum: ["current", "weakening", "deprecated"], required: true, index: true },
    pattern: { type: Schema.Types.Mixed, required: true },
    revision: { type: String, required: true, match: /^[a-f0-9]{64}$/ },
    source: { type: String, enum: ["admin"], required: true },
    updatedBy: { type: String, required: true },
  },
  { timestamps: true, strict: "throw" },
);

MagazineIntelligencePatternSchema.index({ normalizedName: 1, maturity: 1, healthStatus: 1 }, { name: "intelligence_pattern_name_lifecycle" });
MagazineIntelligencePatternSchema.index({ "pattern.aliases.normalized": 1 }, { name: "intelligence_pattern_alias" });
