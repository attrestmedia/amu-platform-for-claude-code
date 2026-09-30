import { Schema, type Document } from "mongoose";
import { MAIL_MESSAGE_CATEGORIES, type MailMessageCategory } from "./MailMessageSchema";

const MAIL_VOLUME_TRACKED_METRICS = ["send", "delivery", "bounce", "complaint", "reject"] as const;
type MailVolumeMetric = (typeof MAIL_VOLUME_TRACKED_METRICS)[number];

export interface IMailVolumeEventDocument extends Document {
  eventId: string;
  date: string;
  category: MailMessageCategory;
  configurationSet: string;
  metric: MailVolumeMetric;
  eventAt: Date;
  recipientCount: number;
  estimatedCostMicros: number;
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

export const MailVolumeEventSchema = new Schema<IMailVolumeEventDocument>(
  {
    eventId: { type: String, required: true, trim: true },
    date: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/, index: true },
    category: { type: String, enum: MAIL_MESSAGE_CATEGORIES, required: true, index: true },
    configurationSet: { type: String, required: true, trim: true, index: true },
    metric: { type: String, enum: MAIL_VOLUME_TRACKED_METRICS, required: true, index: true },
    eventAt: { type: Date, required: true },
    recipientCount: { type: Number, required: true, min: 0, default: 0 },
    estimatedCostMicros: { type: Number, required: true, min: 0, default: 0 },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true, collection: "mail_volume_events" },
);

MailVolumeEventSchema.index({ eventId: 1 }, { unique: true, name: "mail_volume_event_id_unique" });
MailVolumeEventSchema.index(
  { date: 1, category: 1, configurationSet: 1 },
  { name: "mail_volume_event_daily_dimension" },
);
MailVolumeEventSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0, name: "mail_volume_event_retention_ttl" });
