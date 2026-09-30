import { Schema, type Document } from "mongoose";
import { MAIL_MESSAGE_CATEGORIES, type MailMessageCategory } from "./MailMessageSchema";

export interface IMailVolumeDailyDocument extends Document {
  date: string;
  category: MailMessageCategory;
  configurationSet: string;
  sendCount: number;
  recipientCount: number;
  deliveryCount: number;
  bounceCount: number;
  complaintCount: number;
  rejectCount: number;
  duplicateSendCount: number;
  estimatedCostMicros: number;
  lastEventAt?: Date | null;
  lastAlertKey?: string | null;
  lastAlertAt?: Date | null;
  lastAlertReason?: string | null;
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

export const MailVolumeDailySchema = new Schema<IMailVolumeDailyDocument>(
  {
    date: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/, index: true },
    category: { type: String, enum: MAIL_MESSAGE_CATEGORIES, required: true, index: true },
    configurationSet: { type: String, required: true, trim: true, index: true },
    sendCount: { type: Number, required: true, min: 0, default: 0 },
    recipientCount: { type: Number, required: true, min: 0, default: 0 },
    deliveryCount: { type: Number, required: true, min: 0, default: 0 },
    bounceCount: { type: Number, required: true, min: 0, default: 0 },
    complaintCount: { type: Number, required: true, min: 0, default: 0 },
    rejectCount: { type: Number, required: true, min: 0, default: 0 },
    duplicateSendCount: { type: Number, required: true, min: 0, default: 0 },
    estimatedCostMicros: { type: Number, required: true, min: 0, default: 0 },
    lastEventAt: { type: Date, default: null },
    lastAlertKey: { type: String, default: null },
    lastAlertAt: { type: Date, default: null },
    lastAlertReason: { type: String, default: null },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true, collection: "mail_volume_daily" },
);

MailVolumeDailySchema.index(
  { date: 1, category: 1, configurationSet: 1 },
  { unique: true, name: "mail_volume_daily_dimension_unique" },
);
MailVolumeDailySchema.index({ category: 1, date: -1 }, { name: "mail_volume_daily_category_date" });
MailVolumeDailySchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0, name: "mail_volume_daily_retention_ttl" });
