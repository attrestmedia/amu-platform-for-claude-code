import { Schema, type Document } from "mongoose";
import { MAIL_MESSAGE_CATEGORIES, type MailMessageCategory } from "./MailMessageSchema";

export interface IMailDeliverabilityStateDocument extends Document {
  category: MailMessageCategory;
  windowStart: Date;
  sendCount: number;
  bounceCount: number;
  complaintCount: number;
  lastEventAt?: Date | null;
  blockedUntil?: Date | null;
  blockReason?: string | null;
  lastAlertKey?: string | null;
  lastAlertAt?: Date | null;
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

export const MailDeliverabilityStateSchema = new Schema<IMailDeliverabilityStateDocument>(
  {
    category: { type: String, enum: MAIL_MESSAGE_CATEGORIES, required: true },
    windowStart: { type: Date, required: true },
    sendCount: { type: Number, required: true, min: 0, default: 0 },
    bounceCount: { type: Number, required: true, min: 0, default: 0 },
    complaintCount: { type: Number, required: true, min: 0, default: 0 },
    lastEventAt: { type: Date, default: null },
    blockedUntil: { type: Date, default: null },
    blockReason: { type: String, default: null },
    lastAlertKey: { type: String, default: null },
    lastAlertAt: { type: Date, default: null },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true, collection: "mail_deliverability_states" },
);

MailDeliverabilityStateSchema.index(
  { category: 1, windowStart: 1 },
  { unique: true, name: "mail_deliverability_category_window_unique" },
);
MailDeliverabilityStateSchema.index(
  { category: 1, blockedUntil: 1 },
  { name: "mail_deliverability_active_block" },
);
MailDeliverabilityStateSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0, name: "mail_deliverability_retention_ttl" });
