import { Schema, type Document } from "mongoose";
import type { MagazineEmbedRegistryEntry } from "libs/server-utils/magazine/magazineEmbedContract";

/**
 * @docHint
 * @purpose Magazine Embed Registry v1의 서버 소유 정책 스키마
 * @process maturity/exposure/allowlist/expiry/kill switch를 DB에 엄격히 저장
 * @domain magazine-content-experience
 * @scope db-schema
 */

export type IMagazineEmbedRegistryDocument = MagazineEmbedRegistryEntry & Document;

export const MagazineEmbedRegistrySchema = new Schema<IMagazineEmbedRegistryDocument>(
  {
    contractType: { type: String, enum: ["magazine-embed-registry"], required: true, default: "magazine-embed-registry" },
    schemaVersion: { type: String, enum: ["article-experience.v2"], required: true, default: "article-experience.v2" },
    integrationId: { type: String, required: true, unique: true, index: true },
    serviceKey: { type: String, enum: ["gen-studio", "tutors", "play", "store"], required: true, index: true },
    productMaturity: { type: String, enum: ["development", "pilot", "beta", "stable"], required: true, index: true },
    magazineExposure: { type: String, enum: ["disabled", "article", "context-link", "service-page", "global"], required: true, index: true },
    renderMode: { type: String, enum: ["wp-native", "app-embed", "context-link"], required: true },
    capabilities: { type: [String], enum: ["preview", "generate", "chat"], required: true, default: [] },
    allowedContentIds: { type: [String], default: [] },
    allowedTemplateKeys: { type: [String], default: [] },
    allowedTutorPersonaIds: { type: [String], default: [] },
    owner: { type: String, required: true },
    rationale: { type: String, required: true },
    reviewedAt: { type: Date, required: true },
    startsAt: { type: Date },
    expiresAt: { type: Date },
    runtimeEnabled: { type: Boolean, required: true, default: false, index: true },
    authRequired: { type: Boolean, required: true, default: true },
    billingMode: { type: String, enum: ["none", "metered", "subscription", "unknown"], required: true, default: "unknown" },
    contextRevision: { type: String, required: true },
    contextHash: { type: String, required: true, match: /^[a-f0-9]{64}$/ },
    killSwitch: { type: Boolean, required: true, default: false, index: true },
  },
  { timestamps: true, strict: "throw" },
);

MagazineEmbedRegistrySchema.index({ serviceKey: 1, magazineExposure: 1, runtimeEnabled: 1 });
