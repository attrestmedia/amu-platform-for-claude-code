import { createHash } from "crypto";
import type { MailMessageStatus } from "models/mail";
import type { EnqueueMailInput } from "./queueTypes";
import { renderMailTemplate } from "./templates";

interface WalletNoticeBaseInput {
  universeId: string;
  universeName: string;
  recipientEmail: string;
}

function walletNoticeMessageId(kind: string, universeId: string, eventAt: Date) {
  const digest = createHash("sha256")
    .update(`${kind}:${universeId}:${eventAt.toISOString()}`)
    .digest("hex");
  return `wallet-${kind}:${digest}`;
}

const escapeHtml = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (character) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]!,
  );

export function buildMembershipExpiryNoticeMail(
  input: WalletNoticeBaseInput & { expiresAt: Date },
): EnqueueMailInput {
  const expiresOn = input.expiresAt.toLocaleString("ko-KR");
  const safeName = escapeHtml(input.universeName);
  return {
    messageId: walletNoticeMessageId("membership-expiry", input.universeId, input.expiresAt),
    category: "transactional",
    templateKey: "wallet.membership_expiry_notice",
    locale: "ko",
    recipientEmail: input.recipientEmail,
    subject: `[AMU] ${input.universeName} 유니버스 Membership 만료 예정 안내`,
    text: `${input.universeName} 유니버스의 Membership은 ${expiresOn} 만료 예정입니다. 관리자 페이지에서 조기 재결제할 수 있습니다.`,
    html: `<p><strong>${safeName}</strong> 유니버스의 Membership은 <strong>${expiresOn}</strong> 만료 예정입니다.</p><p>관리자 페이지에서 조기 재결제할 수 있습니다.</p>`,
  };
}

export function buildWalletDestructionWarningMail(
  input: WalletNoticeBaseInput & { destructionAt: Date; actionUrl: string },
): EnqueueMailInput {
  const rendered = renderMailTemplate({
    key: "wallet.destruction_warning",
    locale: "ko",
    data: {
      universeName: input.universeName,
      destructionAt: input.destructionAt.toLocaleDateString("ko-KR"),
      actionUrl: input.actionUrl,
    },
  });
  return {
    messageId: walletNoticeMessageId("destruction-warning", input.universeId, input.destructionAt),
    category: "transactional",
    templateKey: "wallet.destruction_warning",
    locale: "ko",
    recipientEmail: input.recipientEmail,
    ...rendered,
  };
}

export function buildWalletDestructionCompletedMail(
  input: WalletNoticeBaseInput & { destroyedAt: Date; actionUrl: string },
): EnqueueMailInput {
  const rendered = renderMailTemplate({
    key: "wallet.destruction_completed",
    locale: "ko",
    data: {
      universeName: input.universeName,
      destroyedAt: input.destroyedAt.toLocaleString("ko-KR", { timeZone: "Asia/Seoul" }),
      actionUrl: input.actionUrl,
    },
  });
  return {
    messageId: walletNoticeMessageId("destruction-completed", input.universeId, input.destroyedAt),
    category: "transactional",
    templateKey: "wallet.destruction_completed",
    locale: "ko",
    recipientEmail: input.recipientEmail,
    ...rendered,
  };
}

export function isAcceptedWalletNoticeStatus(status: MailMessageStatus) {
  return status === "queued" || status === "processing" || status === "retry_wait" || status === "sent";
}
