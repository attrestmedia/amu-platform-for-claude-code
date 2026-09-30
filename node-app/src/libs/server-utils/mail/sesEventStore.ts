import "server-only";

import { MONGODB_AMU_URL } from "consts/env/server";
import { getModel } from "libs/database/modelCache";
import {
  type IMailEventDocument,
  MailEventSchema,
  type IMailMessageDocument,
  MailMessageSchema,
  type IMailSuppressionDocument,
  MailSuppressionSchema,
} from "models/mail";
import type { MailEventStore } from "./sesEventTypes";
import { recordMailDeliverabilityEvent } from "./mailDeliverability";
import { recordMailVolumeEvent } from "./mailVolumeService";
import { recordNewsletterPerformanceEvent } from "./newsletterPerformanceService";
import { synchronizeNewsletterSuppression } from "./newsletterSuppressionService";

function isDuplicateKey(error: unknown) {
  return Boolean(error && typeof error === "object" && "code" in error && error.code === 11000);
}

const eventModel = () => getModel<IMailEventDocument>(MONGODB_AMU_URL, "MailEvent", MailEventSchema, "mail_events");
const messageModel = () => getModel<IMailMessageDocument>(MONGODB_AMU_URL, "MailMessage", MailMessageSchema, "mail_messages");
const suppressionModel = () =>
  getModel<IMailSuppressionDocument>(MONGODB_AMU_URL, "MailSuppression", MailSuppressionSchema, "mail_suppressions");

export const mongoMailEventStore: MailEventStore = {
  async findMessageBySesId(sesMessageId) {
    const Model = await messageModel();
    const row = await Model.findOne({ sesMessageId }).select("messageId templateKey emailHash payload.newsletterAttribution").lean();
    const attribution = row?.payload?.newsletterAttribution;
    return row
      ? {
          messageId: row.messageId,
          templateKey: row.templateKey,
          emailHash: row.emailHash,
          newsletterUniverseId: attribution?.universeId,
          newsletterCampaignId: attribution?.campaignId,
          newsletterIssueId: attribution?.issueId,
        }
      : null;
  },

  async upsertEvent(input) {
    const Model = await eventModel();
    try {
      const result = await Model.updateOne({ eventId: input.eventId }, { $setOnInsert: input }, { upsert: true });
      return { created: result.upsertedCount === 1 };
    } catch (error) {
      if (!isDuplicateKey(error)) throw error;
      return { created: false };
    }
  },

  async upsertSuppression(input) {
    const Model = await suppressionModel();
    await Model.updateOne(
      { emailHash: input.emailHash, scope: "all" },
      {
        $setOnInsert: {
          emailHash: input.emailHash,
          scope: "all",
          reason: input.reason,
          sourceEventId: input.sourceEventId,
          sesMessageId: input.sesMessageId,
          noteCode: input.noteCode,
        },
      },
      { upsert: true },
    );
  },

  synchronizeNewsletterSuppression,

  async recordNewsletterPerformance(input) {
    await recordNewsletterPerformanceEvent(input);
  },

  async recordDeliverabilityEvent(input) {
    return recordMailDeliverabilityEvent(input);
  },

  async recordMailVolumeEvent(input) {
    return recordMailVolumeEvent(input);
  },
};
