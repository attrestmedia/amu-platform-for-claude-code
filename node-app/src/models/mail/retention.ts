import type { MailEventType } from "./MailEventSchema";
import type { MailMessageCategory, MailMessageStatus } from "./MailMessageSchema";

const DAY_MS = 24 * 60 * 60 * 1000;

export const MAIL_TRANSIENT_PAYLOAD_RETENTION_DAYS = 7;
export const MAIL_LEDGER_RETENTION_DAYS = 365;
export const NEWSLETTER_ENGAGEMENT_EVENT_RETENTION_DAYS = 60;
export const NEWSLETTER_EMAIL_PURGE_GRACE_DAYS = 7;
export const NEWSLETTER_CONSENT_EVIDENCE_RETENTION_YEARS = 3;
export const NEWSLETTER_CONSENT_NOTICE_INTERVAL_YEARS = 2;

function addDays(value: Date, days: number) {
  return new Date(value.getTime() + days * DAY_MS);
}

function addYears(value: Date, years: number) {
  const result = new Date(value);
  result.setUTCFullYear(result.getUTCFullYear() + years);
  return result;
}

/** 발송 성공·최종 실패 등 처리가 끝난 시점부터 수신 주소와 렌더 입력을 최대 7일만 보관한다. */
export function getMailPayloadExpiresAt(completedAt: Date) {
  return addDays(completedAt, MAIL_TRANSIENT_PAYLOAD_RETENTION_DAYS);
}

/** 발송 메타데이터와 SES 이벤트는 기록 시점부터 1년 보관한다. */
export function getMailLedgerExpiresAt(recordedAt: Date) {
  return addDays(recordedAt, MAIL_LEDGER_RETENTION_DAYS);
}

/** 뉴스레터 open/click만 60일, 그 밖의 신규 SES 이벤트는 1년 보관한다. */
export function getMailEventExpiresAt(
  recordedAt: Date,
  category: MailMessageCategory,
  eventType: MailEventType,
) {
  const retentionDays =
    category === "newsletter" && (eventType === "open" || eventType === "click")
      ? NEWSLETTER_ENGAGEMENT_EVENT_RETENTION_DAYS
      : MAIL_LEDGER_RETENTION_DAYS;
  return addDays(recordedAt, retentionDays);
}

export function getNewsletterEmailPurgeAt(referenceAt: Date) {
  return addDays(referenceAt, NEWSLETTER_EMAIL_PURGE_GRACE_DAYS);
}

export function getNewsletterConsentEvidenceExpiresAt(withdrawnAt: Date) {
  return addYears(withdrawnAt, NEWSLETTER_CONSENT_EVIDENCE_RETENTION_YEARS);
}

export function getNewsletterNextConsentNoticeAt(confirmedAt: Date) {
  return addYears(confirmedAt, NEWSLETTER_CONSENT_NOTICE_INTERVAL_YEARS);
}

/** 지연 실행 시 누락 주기를 연속 발송하지 않고 최초 확인일에 정렬된 다음 미래 주기로 이동한다. */
export function getFollowingNewsletterConsentNoticeAt(anchorAt: Date, after: Date) {
  let cycle = 1;
  let candidate = addYears(anchorAt, NEWSLETTER_CONSENT_NOTICE_INTERVAL_YEARS);
  while (candidate.getTime() <= after.getTime()) {
    cycle += 1;
    candidate = addYears(anchorAt, NEWSLETTER_CONSENT_NOTICE_INTERVAL_YEARS * cycle);
  }
  return candidate;
}

/**
 * Legacy rows may only have confirmedAt. Restore their schedule without a bulk
 * migration: if one or more cycles are overdue, select only the latest overdue
 * cycle; otherwise keep the first future cycle.
 */
export function resolveNewsletterConsentNoticeSchedule(anchorAt: Date, at: Date) {
  let currentDueAt: Date | null = null;
  let nextDueAt = addYears(anchorAt, NEWSLETTER_CONSENT_NOTICE_INTERVAL_YEARS);
  let cycle = 1;
  while (nextDueAt.getTime() <= at.getTime()) {
    currentDueAt = nextDueAt;
    cycle += 1;
    nextDueAt = addYears(anchorAt, NEWSLETTER_CONSENT_NOTICE_INTERVAL_YEARS * cycle);
  }
  return { currentDueAt, nextDueAt };
}

export function formatNewsletterConsentDateKst(value: Date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(value);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value || "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

/** 결정적 enqueue replay 중에도 처리 가능한 queue 상태만 현재 주기의 성공으로 인정한다. */
export function isNewsletterConsentNoticeEnqueueStatusAccepted(status: MailMessageStatus) {
  return status === "queued" || status === "processing" || status === "retry_wait" || status === "sent";
}
