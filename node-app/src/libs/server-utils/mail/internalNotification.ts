import "server-only";
import { logger } from "utils/log";
import { enqueueMail } from "./mailQueue";
import type { EnqueueMailInput } from "./queueTypes";
import { enqueueInternalNotificationWithDependencies } from "./internalNotificationCore";

export async function enqueueInternalNotification(
  mail: EnqueueMailInput,
  eventType: string,
) {
  return enqueueInternalNotificationWithDependencies({
    mail,
    eventType,
    enqueue: enqueueMail,
    logError: (message, context) => logger.error(message, context),
  });
}

export {
  buildAccountDeletionFailedMail,
  buildAccountDeletionProcessingMail,
  buildAccountDeletionRequestedMail,
  buildPaymentConfirmedMail,
} from "./internalNotificationBuilder";
