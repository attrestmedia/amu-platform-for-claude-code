import "server-only";

import {
  AWS_SES_NEWSLETTER_CONFIGURATION_SET,
  AWS_SES_NEWSLETTER_IDENTITY,
  AWS_SES_REGION,
  AWS_SES_TRANSACTIONAL_CONFIGURATION_SET,
  AWS_SES_TRANSACTIONAL_IDENTITY,
  CREDENTIALS_KMS_KEY,
} from "consts/env/server";
import type { MailMessageCategory } from "models/mail";
import { mongoMailQueueStore } from "./mailQueueStore";
import { enqueueMailWithStore } from "./mailQueueCore";
import type { EnqueueMailInput } from "./queueTypes";

function configurationSet(category: MailMessageCategory) {
  return category === "newsletter"
    ? AWS_SES_NEWSLETTER_CONFIGURATION_SET
    : AWS_SES_TRANSACTIONAL_CONFIGURATION_SET;
}

export function resolveMailFromAddress(category: MailMessageCategory) {
  const identity = category === "newsletter" ? AWS_SES_NEWSLETTER_IDENTITY : AWS_SES_TRANSACTIONAL_IDENTITY;
  if (identity.includes("@")) return identity;
  return `${category === "newsletter" ? "newsletter" : "no-reply"}@${identity}`;
}

/** 요청 경로는 SES를 직접 호출하지 않고 멱등 원장에 한 번만 enqueue한다. */
export function enqueueMail(input: EnqueueMailInput) {
  return enqueueMailWithStore(mongoMailQueueStore, input, {
    hashSecret: CREDENTIALS_KMS_KEY,
    configurationSet,
  });
}

export function createDefaultSesProvider() {
  return import("./SesMailProvider").then(({ SesMailProvider }) => new SesMailProvider(AWS_SES_REGION));
}

export { enqueueMailWithStore } from "./mailQueueCore";
