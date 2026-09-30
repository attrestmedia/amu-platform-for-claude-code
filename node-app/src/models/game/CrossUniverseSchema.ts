import { Schema, type Document } from "mongoose";
import {
  CROSS_UNIVERSE_BRIDGE_KIND_VALUES,
  CROSS_UNIVERSE_BRIDGE_STATUS_VALUES,
  CROSS_UNIVERSE_CONSENT_VERSION,
  CROSS_UNIVERSE_REPORT_REASON_VALUES,
  CROSS_UNIVERSE_SCOPE_VALUES,
  CROSS_UNIVERSE_SHARE_STATUS_VALUES,
  type CrossUniverseBridgeEvent,
  type CrossUniverseReport,
  type CrossUniverseSharePreference,
  type CrossUniverseUserBlock,
  type ForeignCharacterReference,
} from "types/game";

export interface ICrossUniverseSharePreferenceDocument extends Document, CrossUniverseSharePreference {}
export interface ICrossUniverseBridgeEventDocument extends Document, CrossUniverseBridgeEvent {}
export interface ICrossUniverseUserBlockDocument extends Document, CrossUniverseUserBlock {}
export interface ICrossUniverseReportDocument extends Document, CrossUniverseReport {}

const ForeignCharacterReferenceSchema = new Schema<ForeignCharacterReference>(
  {
    ownerUid: { type: String, required: true, immutable: true, index: true },
    sourceUniverseId: { type: String, required: true, immutable: true, index: true },
    characterId: { type: String, required: true, immutable: true, index: true },
    characterRevision: { type: Number, required: true, immutable: true, min: 1 },
  },
  { _id: false, strict: true },
);

const SharedFactSchema = new Schema(
  {
    title: { type: String, required: true, maxlength: 180 },
    summary: { type: String, required: true, maxlength: 1200 },
    occurredAt: { type: Date, default: null },
    scopes: { type: [String], enum: CROSS_UNIVERSE_SCOPE_VALUES, required: true, validate: { validator: (value: string[]) => value.length > 0 && value.length <= CROSS_UNIVERSE_SCOPE_VALUES.length, message: "scopes required" } },
  },
  { _id: false, strict: true },
);

const LocalConsequenceSchema = new Schema(
  {
    universeId: { type: String, required: true, immutable: true, index: true },
    summary: { type: String, required: true, maxlength: 1200 },
    relationInterpretation: { type: String, default: "", maxlength: 600 },
  },
  { _id: false, strict: true },
);

export const CrossUniverseSharePreferenceSchema = new Schema<ICrossUniverseSharePreferenceDocument>(
  {
    ownerUid: { type: String, required: true, immutable: true, index: true },
    personalUniverseId: { type: String, required: true, immutable: true, index: true },
    status: { type: String, enum: CROSS_UNIVERSE_SHARE_STATUS_VALUES, required: true, default: "withdrawn", index: true },
    allowedScopes: { type: [String], enum: CROSS_UNIVERSE_SCOPE_VALUES, required: true, default: [] },
    consentVersion: { type: String, enum: [CROSS_UNIVERSE_CONSENT_VERSION], required: true, immutable: true },
    enabledAt: { type: Date, default: null },
    withdrawnAt: { type: Date, default: null },
  },
  { timestamps: true, strict: true, collection: "cross_universe_share_preferences" },
);
CrossUniverseSharePreferenceSchema.index({ ownerUid: 1, personalUniverseId: 1 }, { unique: true, name: "cross_universe_share_preference_owner_universe_unique" });

export const CrossUniverseBridgeEventSchema = new Schema<ICrossUniverseBridgeEventDocument>(
  {
    bridgeId: { type: String, required: true, unique: true, immutable: true, index: true },
    kind: { type: String, enum: CROSS_UNIVERSE_BRIDGE_KIND_VALUES, required: true, immutable: true, index: true },
    status: { type: String, enum: CROSS_UNIVERSE_BRIDGE_STATUS_VALUES, required: true, default: "requested", index: true },
    requesterUid: { type: String, required: true, immutable: true, index: true },
    hostUid: { type: String, required: true, immutable: true, index: true },
    guest: { type: ForeignCharacterReferenceSchema, required: true, immutable: true },
    hostUniverseId: { type: String, required: true, immutable: true, index: true },
    hostCharacterId: { type: String, default: "", immutable: true },
    sharedFact: { type: SharedFactSchema, required: true, immutable: true },
    // 요청자는 자신의 관점을 작성하고, host는 승인 시 자신의 관점을 한 번 추가한다.
    // 앱 경계는 requested 상태에서만 actor 자신의 항목을 추가하도록 강제하며 승인 후에는 변경하지 않는다.
    localConsequences: { type: [LocalConsequenceSchema], required: true, default: [] },
    approvals: {
      type: new Schema({ requesterAt: { type: Date, default: null }, hostAt: { type: Date, default: null } }, { _id: false, strict: true }),
      required: true,
      default: {},
    },
    withdrawnAt: { type: Date, default: null, index: true },
  },
  { timestamps: true, strict: true, collection: "cross_universe_bridge_events" },
);
CrossUniverseBridgeEventSchema.index({ requesterUid: 1, hostUid: 1, status: 1, createdAt: -1 });
CrossUniverseBridgeEventSchema.index({ "guest.ownerUid": 1, hostUid: 1, status: 1 });

export const CrossUniverseUserBlockSchema = new Schema<ICrossUniverseUserBlockDocument>(
  {
    ownerUid: { type: String, required: true, immutable: true, index: true },
    blockedUid: { type: String, required: true, immutable: true, index: true },
  },
  { timestamps: true, strict: true, collection: "cross_universe_user_blocks" },
);
CrossUniverseUserBlockSchema.index({ ownerUid: 1, blockedUid: 1 }, { unique: true, name: "cross_universe_user_block_unique" });

export const CrossUniverseReportSchema = new Schema<ICrossUniverseReportDocument>(
  {
    reportId: { type: String, required: true, unique: true, immutable: true, index: true },
    reporterUid: { type: String, required: true, immutable: true, index: true },
    reportedUid: { type: String, required: true, immutable: true, index: true },
    bridgeId: { type: String, default: "", immutable: true, index: true },
    reason: { type: String, enum: CROSS_UNIVERSE_REPORT_REASON_VALUES, required: true },
    note: { type: String, default: "", maxlength: 500 },
    status: { type: String, enum: ["pending", "resolved", "rejected"], required: true, default: "pending", index: true },
  },
  { timestamps: true, strict: true, collection: "cross_universe_reports" },
);
CrossUniverseReportSchema.index({ reporterUid: 1, bridgeId: 1 }, { unique: true, sparse: true, name: "cross_universe_reporter_bridge_unique" });
