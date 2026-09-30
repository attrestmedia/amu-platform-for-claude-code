export const MAIL_TEMPLATE_KEYS = [
  "auth.password_reset",
  "auth.email_verification",
  "newsletter.subscription_confirmation",
  "newsletter.consent_notice",
  "newsletter.issue",
  "account.deletion_requested",
  "account.deletion_review_required",
  "account.deletion_processing",
  "account.deletion_failed",
  "wallet.destruction_warning",
  "wallet.destruction_completed",
  "payment.confirmed",
  "payment.reconciliation_failed",
  "payment.canceled",
  "payment.refunded",
  "payment.manual_review",
] as const;

export type MailTemplateKey = (typeof MAIL_TEMPLATE_KEYS)[number];
export type MailTemplateLocale = MailLocale;

export type NewsletterIssueStory = {
  title: string;
  excerpt: string;
  url: string;
  commercialLabel?: "ad" | "affiliate";
};

export type NewsletterIssueTopic = {
  title: string;
  summary: string;
  url: string;
};

export type NewsletterIssueData = {
  issueTitle: string;
  intro: string;
  stories: readonly NewsletterIssueStory[];
  topic: NewsletterIssueTopic;
  unsubscribeUrl: string;
};

export const NEWSLETTER_HTML_MAX_BYTES = 102 * 1024;

export interface MailTemplateDataByKey {
  "auth.password_reset": {
    actionUrl: string;
    expiresInMinutes: number;
  };
  "auth.email_verification": {
    actionUrl: string;
    expiresInMinutes: number;
  };
  "newsletter.subscription_confirmation": {
    actionUrl: string;
    expiresInMinutes: number;
  };
  "newsletter.consent_notice": {
    confirmedAt: string;
    settingsUrl: string;
    unsubscribeUrl: string;
  };
  "newsletter.issue": NewsletterIssueData;
  "account.deletion_requested": {
    requestedAt: string;
    supportUrl: string;
  };
  "account.deletion_review_required": {
    requestedAt: string;
    supportUrl: string;
  };
  "account.deletion_processing": {
    processedAt: string;
    wordpressStatus: string;
    supportUrl: string;
  };
  "account.deletion_failed": {
    failedAt: string;
    supportUrl: string;
  };
  "wallet.destruction_warning": {
    universeName: string;
    destructionAt: string;
    actionUrl: string;
  };
  "wallet.destruction_completed": {
    universeName: string;
    destroyedAt: string;
    actionUrl: string;
  };
  "payment.confirmed": {
    orderId: string;
    paidAt: string;
    amount: string;
    creditedCoins: string;
    purpose: string;
    context: string;
  };
  "payment.reconciliation_failed": {
    orderId: string;
    occurredAt: string;
    supportUrl: string;
  };
  "payment.canceled": {
    orderId: string;
    occurredAt: string;
    amount: string;
    supportUrl: string;
  };
  "payment.refunded": {
    orderId: string;
    occurredAt: string;
    amount: string;
    supportUrl: string;
  };
  "payment.manual_review": {
    orderId: string;
    occurredAt: string;
    supportUrl: string;
  };
}

export interface RenderedMailTemplate {
  subject: string;
  text: string;
  html: string;
}

type TemplateRenderer<K extends MailTemplateKey> = (
  data: MailTemplateDataByKey[K],
) => RenderedMailTemplate;

type MailTemplateRegistry = {
  [K in MailTemplateKey]: Record<MailTemplateLocale, TemplateRenderer<K>>;
};

const escapeHtml = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (character) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]!,
  );

function renderHtml(input: {
  locale: MailTemplateLocale;
  heading: string;
  paragraphs: readonly string[];
  action?: { label: string; url: string };
}) {
  const paragraphs = input.paragraphs
    .map((paragraph) => `<p style="margin:0 0 16px">${escapeHtml(paragraph)}</p>`)
    .join("");
  const action = input.action
    ? `<p style="margin:24px 0"><a href="${escapeHtml(input.action.url)}" style="display:inline-block;padding:12px 18px;background:#111827;color:#ffffff;text-decoration:none;border-radius:8px">${escapeHtml(input.action.label)}</a></p>`
    : "";
  const footer = input.locale === "ko" ? "본 메일은 발신 전용입니다." : "This mailbox is not monitored.";

  return `<!doctype html><html lang="${input.locale}"><body style="margin:0;background:#f3f4f6;color:#111827;font-family:Arial,sans-serif"><div style="max-width:600px;margin:0 auto;padding:32px 20px"><main style="background:#ffffff;border-radius:12px;padding:32px"><p style="margin:0 0 24px;font-size:14px;font-weight:700">All My Universe</p><h1 style="margin:0 0 24px;font-size:24px">${escapeHtml(input.heading)}</h1>${paragraphs}${action}<p style="margin:32px 0 0;color:#6b7280;font-size:12px">${footer}</p></main></div></body></html>`;
}

function isHttpUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function validateNewsletterIssueData(data: NewsletterIssueData) {
  if (!data.issueTitle.trim() || data.issueTitle.length > 160) throw new Error("NEWSLETTER_ISSUE_TITLE_REQUIRED");
  if (!data.intro.trim()) throw new Error("NEWSLETTER_ISSUE_INTRO_REQUIRED");
  if (!Array.isArray(data.stories) || data.stories.length < 3 || data.stories.length > 5) {
    throw new Error("NEWSLETTER_ISSUE_STORIES_INVALID");
  }
  for (const story of data.stories) {
    if (!story.title.trim() || !story.excerpt.trim() || !isHttpUrl(story.url)) {
      throw new Error("NEWSLETTER_ISSUE_STORY_INVALID");
    }
  }
  if (!data.topic.title.trim() || !data.topic.summary.trim() || !isHttpUrl(data.topic.url)) {
    throw new Error("NEWSLETTER_ISSUE_TOPIC_INVALID");
  }
  if (!isHttpUrl(data.unsubscribeUrl)) throw new Error("NEWSLETTER_UNSUBSCRIBE_URL_INVALID");
}

function commercialLabel(label: NewsletterIssueStory["commercialLabel"], locale: MailTemplateLocale) {
  if (label === "ad") return locale === "ko" ? "광고" : "Advertisement";
  if (label === "affiliate") return locale === "ko" ? "제휴" : "Affiliate";
  return "";
}

function renderNewsletterIssueText(locale: MailTemplateLocale, data: NewsletterIssueData) {
  const stories = data.stories
    .map((story, index) =>
      [
        `${index + 1}. ${story.title}`,
        story.commercialLabel ? `[${commercialLabel(story.commercialLabel, locale)}]` : "",
        story.excerpt,
        story.url,
      ]
        .filter(Boolean)
        .join("\n"),
    )
    .join("\n\n");
  const topicLabel = locale === "ko" ? "이번 호의 주제별 추천" : "Topic pick";
  const unsubscribeLabel = locale === "ko" ? "뉴스레터 수신거부" : "Unsubscribe from newsletters";
  return [
    data.issueTitle,
    data.intro,
    stories,
    `${topicLabel}: ${data.topic.title}`,
    data.topic.summary,
    data.topic.url,
    `${unsubscribeLabel}: ${data.unsubscribeUrl}`,
  ].join("\n\n");
}

function renderNewsletterIssueHtml(locale: MailTemplateLocale, data: NewsletterIssueData) {
  const storyHtml = data.stories
    .map((story, index) => {
      const label = story.commercialLabel
        ? `<p style="margin:0 0 8px;color:#6b7280;font-size:12px;font-weight:700">${escapeHtml(commercialLabel(story.commercialLabel, locale))}</p>`
        : "";
      return `<article style="margin:0 0 20px;padding:18px;border:1px solid #e5e7eb;border-radius:10px"><p style="margin:0 0 8px;color:#6b7280;font-size:12px">${index + 1}</p>${label}<h2 style="margin:0 0 8px;font-size:18px"><a href="${escapeHtml(story.url)}" style="color:#111827;text-decoration:none">${escapeHtml(story.title)}</a></h2><p style="margin:0 0 12px;line-height:1.6">${escapeHtml(story.excerpt)}</p><a href="${escapeHtml(story.url)}" style="color:#2563eb">${locale === "ko" ? "기사 읽기" : "Read the story"}</a></article>`;
    })
    .join("");
  const topicLabel = locale === "ko" ? "이번 호의 주제별 추천" : "Topic pick";
  const unsubscribeLabel = locale === "ko" ? "뉴스레터 수신거부" : "Unsubscribe from newsletters";
  return `<!doctype html><html lang="${locale}"><body style="margin:0;background:#f3f4f6;color:#111827;font-family:Arial,sans-serif"><div style="max-width:600px;margin:0 auto;padding:32px 20px"><main style="background:#ffffff;border-radius:12px;padding:32px"><p style="margin:0 0 24px;font-size:14px;font-weight:700">All My Universe</p><h1 style="margin:0 0 16px;font-size:24px">${escapeHtml(data.issueTitle)}</h1><p style="margin:0 0 24px;line-height:1.6">${escapeHtml(data.intro)}</p>${storyHtml}<section style="margin:24px 0 0;padding:20px;background:#f9fafb;border-radius:10px"><p style="margin:0 0 8px;color:#6b7280;font-size:12px;font-weight:700">${escapeHtml(topicLabel)}</p><h2 style="margin:0 0 8px;font-size:18px"><a href="${escapeHtml(data.topic.url)}" style="color:#111827;text-decoration:none">${escapeHtml(data.topic.title)}</a></h2><p style="margin:0 0 12px;line-height:1.6">${escapeHtml(data.topic.summary)}</p><a href="${escapeHtml(data.topic.url)}" style="color:#2563eb">${locale === "ko" ? "주제 더 보기" : "Explore the topic"}</a></section><p style="margin:32px 0 0;color:#6b7280;font-size:12px"><a href="${escapeHtml(data.unsubscribeUrl)}" style="color:#6b7280">${escapeHtml(unsubscribeLabel)}</a></p></main></div></body></html>`;
}

function renderNewsletterIssue(locale: MailTemplateLocale, data: NewsletterIssueData) {
  validateNewsletterIssueData(data);
  return {
    subject: `[AMU] ${data.issueTitle}`,
    text: renderNewsletterIssueText(locale, data),
    html: renderNewsletterIssueHtml(locale, data),
  };
}

function ensureComplete(rendered: RenderedMailTemplate) {
  if (!rendered.subject.trim()) throw new Error("MAIL_TEMPLATE_SUBJECT_REQUIRED");
  if (!rendered.text.trim()) throw new Error("MAIL_TEMPLATE_TEXT_REQUIRED");
  if (!rendered.html.trim()) throw new Error("MAIL_TEMPLATE_HTML_REQUIRED");
  return rendered;
}

export const MAIL_TEMPLATE_REGISTRY: MailTemplateRegistry = {
  "auth.password_reset": {
    ko: ({ actionUrl, expiresInMinutes }) => ({
      subject: "[AMU] 비밀번호 재설정 안내",
      text: [
        "All My Universe 비밀번호 재설정 요청을 받았습니다.",
        `아래 링크는 ${expiresInMinutes}분 동안 유효합니다.`,
        actionUrl,
        "본인이 요청하지 않았다면 이 메일을 무시해 주세요.",
      ].join("\n\n"),
      html: renderHtml({
        locale: "ko",
        heading: "비밀번호를 재설정해 주세요",
        paragraphs: [
          "All My Universe 비밀번호 재설정 요청을 받았습니다.",
          `아래 링크는 ${expiresInMinutes}분 동안 유효합니다. 본인이 요청하지 않았다면 이 메일을 무시해 주세요.`,
        ],
        action: { label: "비밀번호 재설정", url: actionUrl },
      }),
    }),
    en: ({ actionUrl, expiresInMinutes }) => ({
      subject: "[AMU] Reset your password",
      text: [
        "We received a request to reset your All My Universe password.",
        `The link below is valid for ${expiresInMinutes} minutes.`,
        actionUrl,
        "If you did not make this request, you can ignore this email.",
      ].join("\n\n"),
      html: renderHtml({
        locale: "en",
        heading: "Reset your password",
        paragraphs: [
          "We received a request to reset your All My Universe password.",
          `The link below is valid for ${expiresInMinutes} minutes. If you did not make this request, you can ignore this email.`,
        ],
        action: { label: "Reset password", url: actionUrl },
      }),
    }),
  },
  "auth.email_verification": {
    ko: ({ actionUrl, expiresInMinutes }) => ({
      subject: "[AMU] 이메일 주소를 인증해 주세요",
      text: [
        "All My Universe 이메일 인증을 요청하셨습니다.",
        `아래 링크는 ${expiresInMinutes}분 동안 유효합니다.`,
        actionUrl,
        "본인이 요청하지 않았다면 이 메일을 무시해 주세요.",
      ].join("\n\n"),
      html: renderHtml({
        locale: "ko",
        heading: "이메일 주소를 인증해 주세요",
        paragraphs: [
          "All My Universe 이메일 인증을 요청하셨습니다.",
          `아래 링크는 ${expiresInMinutes}분 동안 유효합니다. 본인이 요청하지 않았다면 이 메일을 무시해 주세요.`,
        ],
        action: { label: "이메일 인증", url: actionUrl },
      }),
    }),
    en: ({ actionUrl, expiresInMinutes }) => ({
      subject: "[AMU] Verify your email address",
      text: [
        "Please verify your email address for All My Universe.",
        `The link below is valid for ${expiresInMinutes} minutes.`,
        actionUrl,
        "If you did not make this request, you can ignore this email.",
      ].join("\n\n"),
      html: renderHtml({
        locale: "en",
        heading: "Verify your email address",
        paragraphs: [
          "Please verify your email address for All My Universe.",
          `The link below is valid for ${expiresInMinutes} minutes. If you did not make this request, you can ignore this email.`,
        ],
        action: { label: "Verify email", url: actionUrl },
      }),
    }),
  },
  "newsletter.subscription_confirmation": {
    ko: ({ actionUrl, expiresInMinutes }) => ({
      subject: "[AMU] 뉴스레터 수신을 확인해 주세요",
      text: [
        "All My Universe 뉴스레터 수신 신청을 받았습니다.",
        `아래 링크는 ${expiresInMinutes}분 동안 유효합니다. 링크를 눌러야 뉴스레터를 받을 수 있습니다.`,
        actionUrl,
        "신청하지 않았다면 이 메일을 무시해 주세요.",
      ].join("\n\n"),
      html: renderHtml({
        locale: "ko",
        heading: "뉴스레터 수신을 확인해 주세요",
        paragraphs: [
          "All My Universe 뉴스레터 수신 신청을 받았습니다.",
          `아래 링크는 ${expiresInMinutes}분 동안 유효합니다. 링크를 눌러야 뉴스레터를 받을 수 있습니다. 신청하지 않았다면 이 메일을 무시해 주세요.`,
        ],
        action: { label: "뉴스레터 수신 확인", url: actionUrl },
      }),
    }),
    en: ({ actionUrl, expiresInMinutes }) => ({
      subject: "[AMU] Confirm your newsletter subscription",
      text: [
        "We received a request to subscribe to the All My Universe newsletter.",
        `The link below is valid for ${expiresInMinutes} minutes. You must confirm before receiving newsletters.`,
        actionUrl,
        "If you did not make this request, you can ignore this email.",
      ].join("\n\n"),
      html: renderHtml({
        locale: "en",
        heading: "Confirm your newsletter subscription",
        paragraphs: [
          "We received a request to subscribe to the All My Universe newsletter.",
          `The link below is valid for ${expiresInMinutes} minutes. You must confirm before receiving newsletters. If you did not make this request, you can ignore this email.`,
        ],
        action: { label: "Confirm subscription", url: actionUrl },
      }),
    }),
  },
  "newsletter.consent_notice": {
    ko: ({ confirmedAt, settingsUrl, unsubscribeUrl }) => ({
      subject: "[AMU] 뉴스레터 수신동의 확인 안내",
      text: [
        "All My Universe 뉴스레터 수신동의 사실을 알려드립니다.",
        `최초 수신동의 확인일: ${confirmedAt}`,
        "현재 수신동의가 유지되고 있습니다. 계속 받으려면 별도 조치가 필요하지 않습니다.",
        "수신을 원하지 않으면 아래 수신거부 링크에서 즉시 철회할 수 있습니다.",
        unsubscribeUrl,
        `로그인 회원은 계정 관리에서도 수신 설정을 변경할 수 있습니다: ${settingsUrl}`,
      ].join("\n\n"),
      html: renderHtml({
        locale: "ko",
        heading: "뉴스레터 수신동의 확인 안내",
        paragraphs: [
          "All My Universe 뉴스레터 수신동의 사실을 알려드립니다.",
          `최초 수신동의 확인일: ${confirmedAt}`,
          "현재 수신동의가 유지되고 있습니다. 계속 받으려면 별도 조치가 필요하지 않습니다.",
          `수신거부 링크에서 즉시 철회하거나 로그인 회원은 계정 관리(${settingsUrl})에서 수신 설정을 변경할 수 있습니다.`,
        ],
        action: { label: "뉴스레터 수신거부", url: unsubscribeUrl },
      }),
    }),
    en: ({ confirmedAt, settingsUrl, unsubscribeUrl }) => ({
      subject: "[AMU] Confirmation of your newsletter consent",
      text: [
        "This notice confirms your consent to receive the All My Universe newsletter.",
        `Initial confirmation date: ${confirmedAt}`,
        "Your consent remains active. No action is required to keep receiving the newsletter.",
        "If you no longer wish to receive it, use the unsubscribe link below to withdraw immediately.",
        unsubscribeUrl,
        `Signed-in members can also change this setting in Account Management: ${settingsUrl}`,
      ].join("\n\n"),
      html: renderHtml({
        locale: "en",
        heading: "Confirmation of your newsletter consent",
        paragraphs: [
          "This notice confirms your consent to receive the All My Universe newsletter.",
          `Initial confirmation date: ${confirmedAt}`,
          "Your consent remains active. No action is required to keep receiving the newsletter.",
          `You can withdraw immediately with the unsubscribe link or change the setting in Account Management (${settingsUrl}) if you are signed in.`,
        ],
        action: { label: "Unsubscribe from newsletters", url: unsubscribeUrl },
      }),
    }),
  },
  "newsletter.issue": {
    ko: (data) => renderNewsletterIssue("ko", data),
    en: (data) => renderNewsletterIssue("en", data),
  },
  "account.deletion_requested": {
    ko: ({ requestedAt, supportUrl }) => ({
      subject: "[AMU] 회원 탈퇴 요청이 접수되었습니다",
      text: [
        "All My Universe 회원 탈퇴 요청이 접수되었습니다.",
        `접수 시각: ${requestedAt}`,
        "직접 요청하지 않았다면 고객 지원에 즉시 알려 주세요.",
        supportUrl,
      ].join("\n\n"),
      html: renderHtml({
        locale: "ko",
        heading: "회원 탈퇴 요청 접수",
        paragraphs: [
          "All My Universe 회원 탈퇴 요청이 접수되었습니다.",
          `접수 시각: ${requestedAt}`,
          "직접 요청하지 않았다면 고객 지원에 즉시 알려 주세요.",
        ],
        action: { label: "고객 지원", url: supportUrl },
      }),
    }),
    en: ({ requestedAt, supportUrl }) => ({
      subject: "[AMU] We received your account deletion request",
      text: [
        "We received a request to delete your All My Universe account.",
        `Requested at: ${requestedAt}`,
        "If you did not make this request, contact support immediately.",
        supportUrl,
      ].join("\n\n"),
      html: renderHtml({
        locale: "en",
        heading: "Account deletion request received",
        paragraphs: [
          "We received a request to delete your All My Universe account.",
          `Requested at: ${requestedAt}`,
          "If you did not make this request, contact support immediately.",
        ],
        action: { label: "Contact support", url: supportUrl },
      }),
    }),
  },
  "account.deletion_review_required": {
    ko: ({ requestedAt, supportUrl }) => ({
      subject: "[AMU] 회원 탈퇴 요청에 환불·정산 검토가 필요합니다",
      text: [
        "All My Universe 회원 탈퇴 요청을 기록했습니다.",
        `요청 시각: ${requestedAt}`,
        "잔여 유상 코인 또는 이용 중인 구독이 있어 자동 탈퇴 대신 환불·정산 검토가 필요합니다. 계정 접근은 아직 차단되지 않았습니다.",
        supportUrl,
      ].join("\n\n"),
      html: renderHtml({
        locale: "ko",
        heading: "환불·정산 검토가 필요합니다",
        paragraphs: [
          "All My Universe 회원 탈퇴 요청을 기록했습니다.",
          `요청 시각: ${requestedAt}`,
          "잔여 유상 코인 또는 이용 중인 구독이 있어 자동 탈퇴 대신 환불·정산 검토가 필요합니다. 계정 접근은 아직 차단되지 않았습니다.",
        ],
        action: { label: "All My Universe 열기", url: supportUrl },
      }),
    }),
    en: ({ requestedAt, supportUrl }) => ({
      subject: "[AMU] Your deletion request needs a refund review",
      text: [
        "We recorded your All My Universe account deletion request.",
        `Requested at: ${requestedAt}`,
        "A paid coin balance or active subscription requires a refund and settlement review. Your account access has not been blocked.",
        supportUrl,
      ].join("\n\n"),
      html: renderHtml({
        locale: "en",
        heading: "A refund review is required",
        paragraphs: [
          "We recorded your All My Universe account deletion request.",
          `Requested at: ${requestedAt}`,
          "A paid coin balance or active subscription requires a refund and settlement review. Your account access has not been blocked.",
        ],
        action: { label: "Open All My Universe", url: supportUrl },
      }),
    }),
  },
  "account.deletion_processing": {
    ko: ({ processedAt, wordpressStatus, supportUrl }) => ({
      subject: "[AMU] 회원 탈퇴 접근 차단 처리가 시작되었습니다",
      text: [
        "All My Universe 통합 계정의 접근을 차단하고 개인정보 정리 절차를 시작했습니다.",
        `처리 시각: ${processedAt}`,
        `매거진 계정 처리 상태: ${wordpressStatus}`,
        "법령상 보존 의무가 있는 거래 자료와 서비스 데이터의 최종 파기는 별도 절차에 따라 진행됩니다.",
        supportUrl,
      ].join("\n\n"),
      html: renderHtml({
        locale: "ko",
        heading: "회원 탈퇴 처리를 시작했습니다",
        paragraphs: [
          "All My Universe 통합 계정의 접근을 차단하고 개인정보 정리 절차를 시작했습니다.",
          `처리 시각: ${processedAt}`,
          `매거진 계정 처리 상태: ${wordpressStatus}`,
          "법령상 보존 의무가 있는 거래 자료와 서비스 데이터의 최종 파기는 별도 절차에 따라 진행됩니다.",
        ],
        action: { label: "All My Universe 홈", url: supportUrl },
      }),
    }),
    en: ({ processedAt, wordpressStatus, supportUrl }) => ({
      subject: "[AMU] Account access blocking has started",
      text: [
        "We blocked access to your integrated All My Universe account and started the personal-data cleanup process.",
        `Processed at: ${processedAt}`,
        `Magazine account status: ${wordpressStatus}`,
        "Transaction records that must be retained by law and remaining service data are handled by a separate final-deletion process.",
        supportUrl,
      ].join("\n\n"),
      html: renderHtml({
        locale: "en",
        heading: "Account deletion processing has started",
        paragraphs: [
          "We blocked access to your integrated All My Universe account and started the personal-data cleanup process.",
          `Processed at: ${processedAt}`,
          `Magazine account status: ${wordpressStatus}`,
          "Transaction records that must be retained by law and remaining service data are handled by a separate final-deletion process.",
        ],
        action: { label: "All My Universe home", url: supportUrl },
      }),
    }),
  },
  "account.deletion_failed": {
    ko: ({ failedAt, supportUrl }) => ({
      subject: "[AMU] 회원 탈퇴 처리 지연 안내",
      text: [
        "All My Universe 회원 탈퇴 처리 중 일부 단계를 자동으로 완료하지 못했습니다.",
        `처리 시각: ${failedAt}`,
        "접근 차단은 유지되며 담당자가 확인 후 후속 조치를 진행합니다.",
        "문의 사항은 고객 지원으로 연락해 주세요.",
        supportUrl,
      ].join("\n\n"),
      html: renderHtml({
        locale: "ko",
        heading: "회원 탈퇴 처리가 지연되고 있습니다",
        paragraphs: [
          "All My Universe 회원 탈퇴 처리 중 일부 단계를 자동으로 완료하지 못했습니다.",
          `처리 시각: ${failedAt}`,
          "접근 차단은 유지되며 담당자가 확인 후 후속 조치를 진행합니다. 문의 사항은 고객 지원으로 연락해 주세요.",
        ],
        action: { label: "고객 지원", url: supportUrl },
      }),
    }),
    en: ({ failedAt, supportUrl }) => ({
      subject: "[AMU] Account deletion is delayed",
      text: [
        "We could not automatically complete some steps of your All My Universe account deletion.",
        `Processed at: ${failedAt}`,
        "Access blocking stays in place and our team will follow up after review.",
        "Contact support if you have any questions.",
        supportUrl,
      ].join("\n\n"),
      html: renderHtml({
        locale: "en",
        heading: "Account deletion is delayed",
        paragraphs: [
          "We could not automatically complete some steps of your All My Universe account deletion.",
          `Processed at: ${failedAt}`,
          "Access blocking stays in place and our team will follow up after review. Contact support if you have any questions.",
        ],
        action: { label: "Contact support", url: supportUrl },
      }),
    }),
  },
  "wallet.destruction_warning": {
    ko: ({ universeName, destructionAt, actionUrl }) => ({
      subject: `[AMU] ${universeName} 유니버스 지갑 소멸 예정 안내`,
      text: [
        `${universeName} 유니버스 지갑이 장기 무활동 정책에 따라 소멸될 예정입니다.`,
        `소멸 예정일: ${destructionAt}`,
        "로그인하거나 정상적인 운영 활동을 하면 소멸을 방지할 수 있습니다.",
        actionUrl,
      ].join("\n\n"),
      html: renderHtml({
        locale: "ko",
        heading: "유니버스 지갑 소멸 예정 안내",
        paragraphs: [
          `${universeName} 유니버스 지갑이 장기 무활동 정책에 따라 소멸될 예정입니다.`,
          `소멸 예정일: ${destructionAt}`,
          "로그인하거나 정상적인 운영 활동을 하면 소멸을 방지할 수 있습니다.",
        ],
        action: { label: "All My Universe 열기", url: actionUrl },
      }),
    }),
    en: ({ universeName, destructionAt, actionUrl }) => ({
      subject: `[AMU] ${universeName} Universe wallet expiration notice`,
      text: [
        `The ${universeName} Universe wallet is scheduled to expire under the inactivity policy.`,
        `Scheduled expiration: ${destructionAt}`,
        "Sign in or resume normal operations to prevent expiration.",
        actionUrl,
      ].join("\n\n"),
      html: renderHtml({
        locale: "en",
        heading: "Universe wallet expiration notice",
        paragraphs: [
          `The ${universeName} Universe wallet is scheduled to expire under the inactivity policy.`,
          `Scheduled expiration: ${destructionAt}`,
          "Sign in or resume normal operations to prevent expiration.",
        ],
        action: { label: "Open All My Universe", url: actionUrl },
      }),
    }),
  },
  "wallet.destruction_completed": {
    ko: ({ universeName, destroyedAt, actionUrl }) => ({
      subject: `[AMU] ${universeName} 유니버스 지갑 소멸 처리 안내`,
      text: [
        `${universeName} 유니버스 지갑이 장기 무활동 정책에 따라 소멸 처리되었습니다.`,
        `처리 시각: ${destroyedAt}`,
        "Membership 코인과 Charged 코인 잔액이 0으로 처리되고 유니버스 접근 상태가 폐쇄로 변경되었습니다.",
        "복구가 필요하면 고객지원 심사를 요청해 주세요.",
        actionUrl,
      ].join("\n\n"),
      html: renderHtml({
        locale: "ko",
        heading: "유니버스 지갑 소멸 처리 안내",
        paragraphs: [
          `${universeName} 유니버스 지갑이 장기 무활동 정책에 따라 소멸 처리되었습니다.`,
          `처리 시각: ${destroyedAt}`,
          "Membership 코인과 Charged 코인 잔액이 0으로 처리되고 유니버스 접근 상태가 폐쇄로 변경되었습니다.",
          "복구가 필요하면 고객지원 심사를 요청해 주세요.",
        ],
        action: { label: "All My Universe 열기", url: actionUrl },
      }),
    }),
    en: ({ universeName, destroyedAt, actionUrl }) => ({
      subject: `[AMU] ${universeName} Universe wallet expiration completed`,
      text: [
        `The ${universeName} Universe wallet was expired under the inactivity policy.`,
        `Processed at: ${destroyedAt}`,
        "Membership and Charged coin balances were set to zero, and Universe access was closed.",
        "Contact support if you need a recovery review.",
        actionUrl,
      ].join("\n\n"),
      html: renderHtml({
        locale: "en",
        heading: "Universe wallet expiration completed",
        paragraphs: [
          `The ${universeName} Universe wallet was expired under the inactivity policy.`,
          `Processed at: ${destroyedAt}`,
          "Membership and Charged coin balances were set to zero, and Universe access was closed.",
          "Contact support if you need a recovery review.",
        ],
        action: { label: "Open All My Universe", url: actionUrl },
      }),
    }),
  },
  "payment.confirmed": {
    ko: ({ orderId, paidAt, amount, creditedCoins, purpose, context }) => ({
      subject: `[AMU] ${context} 결제가 완료되었습니다`,
      text: [
        `${context} 결제가 완료되었습니다.`,
        `결제 시각: ${paidAt}`,
        `주문번호: ${orderId}`,
        `결제 목적: ${purpose}`,
        `결제 금액: ${amount}`,
        `지급 코인: ${creditedCoins}`,
        "환불이 필요하면 주문번호와 함께 고객지원으로 문의해 주세요.",
      ].join("\n\n"),
      html: renderHtml({
        locale: "ko",
        heading: "결제가 완료되었습니다",
        paragraphs: [
          `${context} 결제가 완료되었습니다.`,
          `결제 시각: ${paidAt}`,
          `주문번호: ${orderId}`,
          `결제 목적: ${purpose}`,
          `결제 금액: ${amount}`,
          `지급 코인: ${creditedCoins}`,
          "환불이 필요하면 주문번호와 함께 고객지원으로 문의해 주세요.",
        ],
      }),
    }),
    en: ({ orderId, paidAt, amount, creditedCoins, purpose, context }) => ({
      subject: `[AMU] ${context} payment completed`,
      text: [
        `Your ${context} payment is complete.`,
        `Paid at: ${paidAt}`,
        `Order ID: ${orderId}`,
        `Purpose: ${purpose}`,
        `Amount: ${amount}`,
        `Credited coins: ${creditedCoins}`,
        "Contact support with the order ID if you need a refund review.",
      ].join("\n\n"),
      html: renderHtml({
        locale: "en",
        heading: "Payment completed",
        paragraphs: [
          `Your ${context} payment is complete.`,
          `Paid at: ${paidAt}`,
          `Order ID: ${orderId}`,
          `Purpose: ${purpose}`,
          `Amount: ${amount}`,
          `Credited coins: ${creditedCoins}`,
          "Contact support with the order ID if you need a refund review.",
        ],
      }),
    }),
  },
  "payment.reconciliation_failed": {
    ko: ({ orderId, occurredAt, supportUrl }) => ({
      subject: "[AMU] 결제 확인이 진행 중입니다",
      text: [
        "결제는 접수되었지만 결제 금액과 서비스 반영 상태를 확인하고 있습니다.",
        `주문번호: ${orderId}`,
        `접수 시각: ${occurredAt}`,
        "확인이 끝나면 결과를 안내해 드립니다. 같은 결제를 반복하지 말아 주세요.",
        supportUrl,
      ].join("\n\n"),
      html: renderHtml({
        locale: "ko",
        heading: "결제 확인이 진행 중입니다",
        paragraphs: [
          "결제는 접수되었지만 결제 금액과 서비스 반영 상태를 확인하고 있습니다.",
          `주문번호: ${orderId}`,
          `접수 시각: ${occurredAt}`,
          "확인이 끝나면 결과를 안내해 드립니다. 같은 결제를 반복하지 말아 주세요.",
        ],
        action: { label: "고객 지원", url: supportUrl },
      }),
    }),
    en: ({ orderId, occurredAt, supportUrl }) => ({
      subject: "[AMU] We are checking your payment",
      text: [
        "Your payment was received, but we are checking the payment amount and service credit status.",
        `Order ID: ${orderId}`,
        `Received at: ${occurredAt}`,
        "We will let you know when the check is complete. Please do not submit the same payment again.",
        supportUrl,
      ].join("\n\n"),
      html: renderHtml({
        locale: "en",
        heading: "We are checking your payment",
        paragraphs: [
          "Your payment was received, but we are checking the payment amount and service credit status.",
          `Order ID: ${orderId}`,
          `Received at: ${occurredAt}`,
          "We will let you know when the check is complete. Please do not submit the same payment again.",
        ],
        action: { label: "Contact support", url: supportUrl },
      }),
    }),
  },
  "payment.canceled": {
    ko: ({ orderId, occurredAt, amount, supportUrl }) => ({
      subject: "[AMU] 결제가 취소되었습니다",
      text: [
        "결제가 취소되었습니다.",
        `주문번호: ${orderId}`,
        `처리 시각: ${occurredAt}`,
        `결제 금액: ${amount}`,
        "결제수단 반영 시점은 카드사 또는 결제수단에 따라 다를 수 있습니다.",
        supportUrl,
      ].join("\n\n"),
      html: renderHtml({
        locale: "ko",
        heading: "결제가 취소되었습니다",
        paragraphs: [
          "결제가 취소되었습니다.",
          `주문번호: ${orderId}`,
          `처리 시각: ${occurredAt}`,
          `결제 금액: ${amount}`,
          "결제수단 반영 시점은 카드사 또는 결제수단에 따라 다를 수 있습니다.",
        ],
        action: { label: "고객 지원", url: supportUrl },
      }),
    }),
    en: ({ orderId, occurredAt, amount, supportUrl }) => ({
      subject: "[AMU] Your payment was canceled",
      text: [
        "Your payment was canceled.",
        `Order ID: ${orderId}`,
        `Processed at: ${occurredAt}`,
        `Amount: ${amount}`,
        "The time for the payment method to reflect the cancellation may vary by issuer or provider.",
        supportUrl,
      ].join("\n\n"),
      html: renderHtml({
        locale: "en",
        heading: "Your payment was canceled",
        paragraphs: [
          "Your payment was canceled.",
          `Order ID: ${orderId}`,
          `Processed at: ${occurredAt}`,
          `Amount: ${amount}`,
          "The time for the payment method to reflect the cancellation may vary by issuer or provider.",
        ],
        action: { label: "Contact support", url: supportUrl },
      }),
    }),
  },
  "payment.refunded": {
    ko: ({ orderId, occurredAt, amount, supportUrl }) => ({
      subject: "[AMU] 환불이 처리되었습니다",
      text: [
        "환불 처리가 완료되었습니다.",
        `주문번호: ${orderId}`,
        `처리 시각: ${occurredAt}`,
        `환불 금액: ${amount}`,
        "결제수단에 실제 반영되는 시점은 카드사 또는 결제수단에 따라 다를 수 있습니다.",
        supportUrl,
      ].join("\n\n"),
      html: renderHtml({
        locale: "ko",
        heading: "환불이 처리되었습니다",
        paragraphs: [
          "환불 처리가 완료되었습니다.",
          `주문번호: ${orderId}`,
          `처리 시각: ${occurredAt}`,
          `환불 금액: ${amount}`,
          "결제수단에 실제 반영되는 시점은 카드사 또는 결제수단에 따라 다를 수 있습니다.",
        ],
        action: { label: "고객 지원", url: supportUrl },
      }),
    }),
    en: ({ orderId, occurredAt, amount, supportUrl }) => ({
      subject: "[AMU] Your refund was processed",
      text: [
        "Your refund was processed.",
        `Order ID: ${orderId}`,
        `Processed at: ${occurredAt}`,
        `Refund amount: ${amount}`,
        "The time for the payment method to reflect the refund may vary by issuer or provider.",
        supportUrl,
      ].join("\n\n"),
      html: renderHtml({
        locale: "en",
        heading: "Your refund was processed",
        paragraphs: [
          "Your refund was processed.",
          `Order ID: ${orderId}`,
          `Processed at: ${occurredAt}`,
          `Refund amount: ${amount}`,
          "The time for the payment method to reflect the refund may vary by issuer or provider.",
        ],
        action: { label: "Contact support", url: supportUrl },
      }),
    }),
  },
  "payment.manual_review": {
    ko: ({ orderId, occurredAt, supportUrl }) => ({
      subject: "[AMU] 결제 확인에 고객센터 검토가 필요합니다",
      text: [
        "결제 확인에 추가 검토가 필요합니다.",
        `주문번호: ${orderId}`,
        `접수 시각: ${occurredAt}`,
        "고객센터에서 확인 후 안내해 드립니다. 같은 결제를 반복하지 말아 주세요.",
        supportUrl,
      ].join("\n\n"),
      html: renderHtml({
        locale: "ko",
        heading: "결제 확인에 검토가 필요합니다",
        paragraphs: [
          "결제 확인에 추가 검토가 필요합니다.",
          `주문번호: ${orderId}`,
          `접수 시각: ${occurredAt}`,
          "고객센터에서 확인 후 안내해 드립니다. 같은 결제를 반복하지 말아 주세요.",
        ],
        action: { label: "고객 지원", url: supportUrl },
      }),
    }),
    en: ({ orderId, occurredAt, supportUrl }) => ({
      subject: "[AMU] Your payment needs a support review",
      text: [
        "Your payment needs an additional review.",
        `Order ID: ${orderId}`,
        `Received at: ${occurredAt}`,
        "Customer support will review it and contact you. Please do not submit the same payment again.",
        supportUrl,
      ].join("\n\n"),
      html: renderHtml({
        locale: "en",
        heading: "Your payment needs a support review",
        paragraphs: [
          "Your payment needs an additional review.",
          `Order ID: ${orderId}`,
          `Received at: ${occurredAt}`,
          "Customer support will review it and contact you. Please do not submit the same payment again.",
        ],
        action: { label: "Contact support", url: supportUrl },
      }),
    }),
  },
};

export function renderMailTemplate<K extends MailTemplateKey>(input: {
  key: K;
  locale: MailTemplateLocale;
  data: MailTemplateDataByKey[K];
}) {
  const renderer = MAIL_TEMPLATE_REGISTRY[input.key][input.locale] as TemplateRenderer<K>;
  const rendered = ensureComplete(renderer(input.data));
  if (input.key === "newsletter.issue" && Buffer.byteLength(rendered.html, "utf8") > NEWSLETTER_HTML_MAX_BYTES) {
    throw new Error("NEWSLETTER_HTML_TOO_LARGE");
  }
  return rendered;
}
import type { MailLocale } from "models/mail";
