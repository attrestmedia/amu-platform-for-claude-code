import { Schema, type Document } from "mongoose";
import { MARKETING_CHANNELS } from "consts/marketing/queue";
import type { MarketingChannel } from "consts/marketing/queue";
import type { UnknownRecord } from "utils/common/typeUtils";

export const MARKETING_TYPO_RULE_STATUS = ["candidate", "active", "ignored", "disabled"] as const;
export const MARKETING_TYPO_RULE_SEVERITY = ["review", "warning", "blocking"] as const;
export const MARKETING_TYPO_RULE_TYPE = ["literal", "regex"] as const;
export const MARKETING_TYPO_RULE_GLOBAL_SCOPE = "__global__";

export type MarketingTypoRuleStatus = (typeof MARKETING_TYPO_RULE_STATUS)[number];
export type MarketingTypoRuleSeverity = (typeof MARKETING_TYPO_RULE_SEVERITY)[number];
export type MarketingTypoRuleType = (typeof MARKETING_TYPO_RULE_TYPE)[number];

export interface IMarketingTypoRuleDocument extends Document {
  ruleId: string;
  universeId: string;
  status: MarketingTypoRuleStatus;
  severity: MarketingTypoRuleSeverity;
  type: MarketingTypoRuleType;
  pattern: string;
  expected?: string[];
  reason?: string;
  channels?: MarketingChannel[];
  occurrenceCount: number;
  firstSeenAt?: Date | null;
  lastSeenAt?: Date | null;
  lastSeen?: UnknownRecord;
  evidence?: UnknownRecord[];
  source?: string;
  createdBy?: string;
  updatedBy?: string;
  approvedBy?: string;
  approvedAt?: Date | null;
  ignoredBy?: string;
  ignoredAt?: Date | null;
  disabledBy?: string;
  disabledAt?: Date | null;
  meta?: UnknownRecord;
  createdAt: Date;
  updatedAt: Date;
}

export const MarketingTypoRuleSchema = new Schema<IMarketingTypoRuleDocument>(
  {
    ruleId: { type: String, required: true, unique: true, index: true },
    universeId: { type: String, required: true, index: true },
    status: { type: String, enum: MARKETING_TYPO_RULE_STATUS, required: true, default: "candidate", index: true },
    severity: { type: String, enum: MARKETING_TYPO_RULE_SEVERITY, required: true, default: "review", index: true },
    type: { type: String, enum: MARKETING_TYPO_RULE_TYPE, required: true, default: "literal", index: true },
    pattern: { type: String, required: true },
    expected: { type: [String], default: [] },
    reason: { type: String, default: "" },
    channels: { type: [String], enum: MARKETING_CHANNELS, default: [] },
    occurrenceCount: { type: Number, default: 0, index: true },
    firstSeenAt: { type: Date, default: null },
    lastSeenAt: { type: Date, default: null, index: true },
    lastSeen: { type: Schema.Types.Mixed, default: {} },
    evidence: { type: [Schema.Types.Mixed], default: [] },
    source: { type: String, default: "ai", index: true },
    createdBy: { type: String, default: "" },
    updatedBy: { type: String, default: "" },
    approvedBy: { type: String, default: "" },
    approvedAt: { type: Date, default: null },
    ignoredBy: { type: String, default: "" },
    ignoredAt: { type: Date, default: null },
    disabledBy: { type: String, default: "" },
    disabledAt: { type: Date, default: null },
    meta: { type: Schema.Types.Mixed, default: {} },
  },
  { timestamps: true, collection: "marketing_typo_rules" },
);

MarketingTypoRuleSchema.index({ universeId: 1, type: 1, pattern: 1 }, { unique: true });
MarketingTypoRuleSchema.index({ universeId: 1, status: 1, severity: 1, updatedAt: -1 });
MarketingTypoRuleSchema.index({ universeId: 1, status: 1, occurrenceCount: -1, lastSeenAt: -1 });
