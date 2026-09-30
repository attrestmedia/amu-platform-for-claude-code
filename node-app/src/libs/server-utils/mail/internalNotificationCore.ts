import type { MailMessageStatus } from "models/mail";
import type { EnqueueMailInput } from "./queueTypes";

const ACCEPTED_STATUSES: readonly MailMessageStatus[] = ["queued", "processing", "retry_wait", "sent"];

export async function enqueueInternalNotificationWithDependencies(input: {
  mail: EnqueueMailInput;
  eventType: string;
  enqueue: (mail: EnqueueMailInput) => Promise<{ status: MailMessageStatus }>;
  logError: (message: string, context: Record<string, unknown>) => void;
}): Promise<{ accepted: boolean; status?: MailMessageStatus }> {
  try {
    const result = await input.enqueue(input.mail);
    const accepted = ACCEPTED_STATUSES.includes(result.status);
    if (!accepted) {
      input.logError("[internal-mail] notification was not accepted", {
        eventType: input.eventType,
        messageId: input.mail.messageId,
        status: result.status,
      });
    }
    return { accepted, status: result.status };
  } catch (error) {
    input.logError("[internal-mail] notification enqueue failed", {
      eventType: input.eventType,
      messageId: input.mail.messageId,
      errorCode: error instanceof Error ? error.message : "INTERNAL_MAIL_ENQUEUE_FAILED",
    });
    return { accepted: false };
  }
}
