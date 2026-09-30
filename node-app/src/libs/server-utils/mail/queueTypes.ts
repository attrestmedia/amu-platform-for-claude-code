import type {
  IMailMessageError,
  IMailMessagePayload,
  MailLocale,
  MailMessageCategory,
  MailMessageStatus,
  MailSuppressionReason,
  MailSuppressionScope,
} from "models/mail";
import type { MailHeader } from "./types";

export interface NewsletterDispatchAuthorization {
  mode: "production";
  campaignId: string;
  approvedBy: string;
  approvalId: string;
}

export interface NewsletterAttribution {
  universeId: string;
  campaignId: string;
  issueId: string;
}

export interface EnqueueMailInput {
  messageId: string;
  category: MailMessageCategory;
  templateKey: string;
  locale?: MailLocale;
  recipientEmail: string;
  subject: string;
  text: string;
  html: string;
  replyTo?: readonly string[];
  headers?: readonly MailHeader[];
  scheduledAt?: Date;
  maxAttempts?: number;
  /** newsletter 본문은 관리자 승인 capability 없이는 queue에 들어갈 수 없다. */
  newsletterDispatch?: NewsletterDispatchAuthorization;
  /** 이메일 본문이 제거된 뒤에도 SES 이벤트를 이슈별로 집계하기 위한 비식별 attribution. */
  newsletterAttribution?: NewsletterAttribution;
}

export interface MailQueueJob {
  id: string;
  messageId: string;
  category: MailMessageCategory;
  templateKey: string;
  locale: MailLocale;
  recipientEmail: string;
  emailHash: string;
  payload: IMailMessagePayload;
  configurationSet: string;
  attempts: number;
  maxAttempts: number;
}

export interface MailSuppressionMatch {
  scope: MailSuppressionScope;
  reason: MailSuppressionReason;
}

export interface MailQueueStore {
  createOnce(input: {
    messageId: string;
    category: MailMessageCategory;
    templateKey: string;
    locale: MailLocale;
    recipientEmail: string;
    emailHash: string;
    payload: IMailMessagePayload;
    configurationSet: string;
    scheduledAt: Date;
    maxAttempts: number;
  }): Promise<{ created: boolean; status: MailMessageStatus }>;
  claim(workerId: string, now: Date, leaseMs: number): Promise<MailQueueJob | null>;
  findSuppression(emailHash: string, category: MailMessageCategory): Promise<MailSuppressionMatch | null>;
  markSuppressed(job: MailQueueJob, workerId: string, suppression: MailSuppressionMatch, now: Date): Promise<void>;
  markSent(job: MailQueueJob, workerId: string, providerMessageId: string, now: Date): Promise<void>;
  markError(job: MailQueueJob, workerId: string, error: IMailMessageError, now: Date): Promise<MailMessageStatus>;
  /** 외부 정책으로 잠시 보류할 때 시도 횟수를 소모하지 않고 lease를 반환한다. */
  defer?(job: MailQueueJob, workerId: string, nextAttemptAt: Date, error: IMailMessageError, now: Date): Promise<void>;
  purgeExpiredPayloads(now: Date): Promise<number>;
}

export interface MailRateGate {
  acquire(nowMs?: number): Promise<{ allowed: boolean; retryAfterMs: number }>;
}
