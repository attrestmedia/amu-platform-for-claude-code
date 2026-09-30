import "server-only";
import { getModel } from "libs/database/modelCache";
import { MONGODB_AMU_URL } from "consts/env/server";
import { UniverseSchema } from "models/universe";
import type { IUniverseDocument } from "models/universe";
import { ensureWalletFor } from "./paymentUtils";
import { resolveUniverseWalletPolicyState } from "utils/payment";
import { UNIVERSE_INACTIVITY_NOTICE_DAYS } from "consts/payment";
import { NEXTAUTH_URL } from "consts/env/server";
import { enqueueMail } from "libs/server-utils/mail/mailQueue";
import {
  buildMembershipExpiryNoticeMail,
  buildWalletDestructionCompletedMail,
  buildWalletDestructionWarningMail,
  isAcceptedWalletNoticeStatus,
} from "libs/server-utils/mail/walletNotice";
import { logger } from "utils/log";

export async function ensureUniverseWalletLifecycle(universeId: string, now = new Date()) {
  const UniverseModel = await getModel<IUniverseDocument>(MONGODB_AMU_URL, "Universe", UniverseSchema, "universes");
  const universe = await UniverseModel.findOne({ id: universeId });
  if (!universe) return null;

  const wallet = ensureWalletFor(universe);
  const pending = wallet.membership.pendingRenewal;
  let changed = false;

  if (pending && new Date(pending.startsAt).getTime() <= now.getTime()) {
    wallet.membership = {
      coins: Math.max(0, pending.coins),
      expiresAt: new Date(pending.expiresAt),
      renewableAt: new Date(pending.renewableAt),
      lastChargedAt: now,
      billingMode: "anniversary",
    };
    wallet.lastQualifyingActivityAt = now;
    changed = true;
  } else if (wallet.membership.expiresAt && new Date(wallet.membership.expiresAt).getTime() <= now.getTime()) {
    if (wallet.membership.coins !== 0) {
      wallet.membership.coins = 0;
      changed = true;
    }
  }

  const state = resolveUniverseWalletPolicyState(wallet, now);
  if (state.accessState === "closed" && !wallet.closedAt) {
    wallet.closedAt = now;
    wallet.membership.coins = 0;
    wallet.membership.pendingRenewal = undefined;
    wallet.charged.coins = 0;
    changed = true;
  }
  if (wallet.accessState !== state.accessState) {
    wallet.accessState = state.accessState;
    changed = true;
  }

  if (changed) {
    universe.markModified?.("wallet");
    await universe.save();
  }
  return universe;
}

export async function touchUniverseLoginActivity(email: string, now = new Date()) {
  const normalized = String(email || "").trim().toLowerCase();
  if (!normalized) return;
  const UniverseModel = await getModel<IUniverseDocument>(MONGODB_AMU_URL, "Universe", UniverseSchema, "universes");
  await UniverseModel.updateMany(
    {
      type: "commerce",
      "wallet.closedAt": { $exists: false },
      $or: [{ billingOwnerEmail: normalized }, { commerceAdmins: normalized }],
    },
    { $set: { "wallet.lastQualifyingActivityAt": now }, $unset: { "wallet.closureNoticeSentAt": "" } },
  );
}

export async function runUniverseWalletLifecycle(now = new Date()) {
  const UniverseModel = await getModel<IUniverseDocument>(MONGODB_AMU_URL, "Universe", UniverseSchema, "universes");
  const rows = await UniverseModel.find({ type: "commerce", wallet: { $exists: true } }, { id: 1 }).lean();
  const result = { checked: rows.length, closed: 0, noticesSent: 0, noticesSkipped: 0, errors: 0 };
  for (const row of rows) {
    try {
      const universe = await ensureUniverseWalletLifecycle(row.id, now);
      if (!universe) continue;
      const wallet = ensureWalletFor(universe);
      const state = resolveUniverseWalletPolicyState(wallet, now);
      if (wallet.closedAt && new Date(wallet.closedAt).getTime() === now.getTime()) result.closed += 1;
      if (wallet.closedAt && !wallet.closureCompletedNoticeSentAt && universe.billingOwnerEmail) {
        const destroyedAt = new Date(wallet.closedAt);
        const mail = await enqueueMail(buildWalletDestructionCompletedMail({
          universeId: universe.id,
          universeName: universe.name,
          recipientEmail: universe.billingOwnerEmail,
          destroyedAt,
          actionUrl: NEXTAUTH_URL,
        }));
        if (isAcceptedWalletNoticeStatus(mail.status)) {
          wallet.closureCompletedNoticeSentAt = now;
          universe.markModified?.("wallet");
          await universe.save();
          result.noticesSent += 1;
        } else {
          result.noticesSkipped += 1;
          logger.error("[wallet-lifecycle] destruction completion mail was not accepted", {
            universeId: universe.id,
            messageId: mail.messageId,
            status: mail.status,
          });
        }
      }
      if (
        state.expiresAt && state.expiresAt > now && state.renewableAt && state.renewableAt <= now &&
        !wallet.membership.expiryNoticeSentAt && universe.billingOwnerEmail
      ) {
        const mail = await enqueueMail(buildMembershipExpiryNoticeMail({
          universeId: universe.id,
          universeName: universe.name,
          recipientEmail: universe.billingOwnerEmail,
          expiresAt: state.expiresAt,
        }));
        if (isAcceptedWalletNoticeStatus(mail.status)) {
          wallet.membership.expiryNoticeSentAt = now;
          universe.markModified?.("wallet");
          await universe.save();
          result.noticesSent += 1;
        } else result.noticesSkipped += 1;
      }
      const noticeAt = state.inactivityClosesAt
        ? new Date(state.inactivityClosesAt.getTime() - UNIVERSE_INACTIVITY_NOTICE_DAYS * 86_400_000)
        : undefined;
      if (
        noticeAt && noticeAt <= now && state.inactivityClosesAt && state.inactivityClosesAt > now &&
        !wallet.closureNoticeSentAt && universe.billingOwnerEmail
      ) {
        const mail = await enqueueMail(buildWalletDestructionWarningMail({
          universeId: universe.id,
          universeName: universe.name,
          recipientEmail: universe.billingOwnerEmail,
          destructionAt: state.inactivityClosesAt,
          actionUrl: NEXTAUTH_URL,
        }));
        if (isAcceptedWalletNoticeStatus(mail.status)) {
          wallet.closureNoticeSentAt = now;
          universe.markModified?.("wallet");
          await universe.save();
          result.noticesSent += 1;
        } else result.noticesSkipped += 1;
      }
    } catch (error) {
      result.errors += 1;
      logger.error("[wallet-lifecycle] notification processing failed", {
        universeId: row.id,
        errorCode: error instanceof Error ? error.message : "WALLET_NOTIFICATION_FAILED",
      });
    }
  }
  return result;
}
