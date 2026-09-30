import "server-only";

import type { ClientSession } from "mongoose";
import { MONGODB_USERS_URL, SIGNUP_BONUS_CAMPAIGN_ENABLED, SIGNUP_BONUS_CAMPAIGN_STARTED_AT } from "consts/env/server";
import { MONGODB_USER_MODEL_PREFIX } from "consts/db";
import {
  SIGNUP_BONUS_CAMPAIGN,
  isSignupBonusRegistrationEligible,
  parseSignupBonusCampaignStart,
} from "consts/payment/signupBonus";
import { getModel } from "libs/database/modelCache";
import {
  SignupBonusCampaignSchema,
  SignupBonusGrantSchema,
  type ISignupBonusCampaignDocument,
  type ISignupBonusGrantDocument,
} from "models/payment";
import { UserIndexSchema, UserSchema, type IUserDocument, type IUserIndexDocument } from "models/user";

export type SignupBonusGrantResult =
  | { status: "disabled" | "ineligible" | "cap_reached" }
  | { status: "already_applied" | "applied"; coins: number; sequence: number };

export type SignupBonusRegistrationContext = {
  signupCompletedAt: Date | string;
  registrationSource: string;
};

function isDuplicateKeyError(error: unknown) {
  return Boolean(error && typeof error === "object" && "code" in error && Number(error.code) === 11000);
}

async function findExistingGrant(uid: string, session?: ClientSession) {
  const GrantModel = await getModel<ISignupBonusGrantDocument>(
    MONGODB_USERS_URL,
    "SignupBonusGrant",
    SignupBonusGrantSchema,
    "signup_bonus_grants",
  );
  return GrantModel.findOne({ campaignId: SIGNUP_BONUS_CAMPAIGN.campaignId, uid }).session(session || null).lean();
}

/**
 * 신규 가입 무상 코인을 전역 상한과 사용자별 1회 조건으로 원자 지급한다.
 * 트랜잭션을 지원하지 않는 저장소에서는 상한/멱등성을 약화시키지 않고 실패한다.
 */
export async function grantSignupBonusIfEligible(
  uid: string,
  suppliedRegistration?: SignupBonusRegistrationContext | null,
): Promise<SignupBonusGrantResult> {
  if (!SIGNUP_BONUS_CAMPAIGN_ENABLED) return { status: "disabled" };

  const campaignStartedAt = parseSignupBonusCampaignStart(SIGNUP_BONUS_CAMPAIGN_STARTED_AT);
  if (!campaignStartedAt) {
    throw Object.assign(new Error("signup_bonus_campaign_start_invalid"), {
      errorCode: "SIGNUP_BONUS_CONFIG_INVALID",
    });
  }

  const UserIndexModel = await getModel<IUserIndexDocument>(
    MONGODB_USERS_URL,
    "UserIndex",
    UserIndexSchema,
    "users_index",
  );
  const registration = await UserIndexModel.findOne(
    { uid },
    { policyConsents: 1 },
  ).lean();
  const consent = registration?.policyConsents?.[0];
  const registrationContext = suppliedRegistration || (consent
    ? {
        signupCompletedAt: consent.agreedAt,
        registrationSource:
          consent.method === "platform_social_signup" || consent.method === "magazine_social_signup"
            ? `${consent.method === "magazine_social_signup" ? "magazine" : "platform"}_social_${consent.provider || "unknown"}`
            : consent.method === "platform_email_signup"
              ? "platform_email"
              : "magazine_email",
      }
    : null);
  if (
    !registrationContext ||
    !isSignupBonusRegistrationEligible({
      signupCompletedAt: registrationContext.signupCompletedAt,
      campaignStartedAt,
    })
  ) {
    return { status: "ineligible" };
  }

  const existing = await findExistingGrant(uid);
  if (existing) return { status: "already_applied", coins: existing.coins, sequence: existing.sequence };

  const CampaignModel = await getModel<ISignupBonusCampaignDocument>(
    MONGODB_USERS_URL,
    "SignupBonusCampaign",
    SignupBonusCampaignSchema,
    "signup_bonus_campaigns",
  );
  const GrantModel = await getModel<ISignupBonusGrantDocument>(
    MONGODB_USERS_URL,
    "SignupBonusGrant",
    SignupBonusGrantSchema,
    "signup_bonus_grants",
  );
  const userModelName = `${MONGODB_USER_MODEL_PREFIX}${uid}`;
  const UserModel = await getModel<IUserDocument>(MONGODB_USERS_URL, userModelName, UserSchema, userModelName);
  const session = await UserModel.db.startSession();
  let result: SignupBonusGrantResult = { status: "cap_reached" };

  try {
    await session.withTransaction(async () => {
      const duplicate = await findExistingGrant(uid, session);
      if (duplicate) {
        result = { status: "already_applied", coins: duplicate.coins, sequence: duplicate.sequence };
        return;
      }

      await CampaignModel.updateOne(
        { campaignId: SIGNUP_BONUS_CAMPAIGN.campaignId },
        {
          $setOnInsert: {
            campaignId: SIGNUP_BONUS_CAMPAIGN.campaignId,
            grantedCount: 0,
            maxRecipients: SIGNUP_BONUS_CAMPAIGN.maxRecipients,
            coinsPerGrant: SIGNUP_BONUS_CAMPAIGN.coinsPerGrant,
          },
        },
        { upsert: true, session },
      );

      const campaignConfig = await CampaignModel.findOne(
        { campaignId: SIGNUP_BONUS_CAMPAIGN.campaignId },
        { maxRecipients: 1, coinsPerGrant: 1 },
      ).session(session);
      if (
        !campaignConfig ||
        campaignConfig.maxRecipients !== SIGNUP_BONUS_CAMPAIGN.maxRecipients ||
        campaignConfig.coinsPerGrant !== SIGNUP_BONUS_CAMPAIGN.coinsPerGrant
      ) {
        throw Object.assign(new Error("signup_bonus_campaign_config_conflict"), {
          errorCode: "SIGNUP_BONUS_CONFIG_CONFLICT",
        });
      }

      const campaign = await CampaignModel.findOneAndUpdate(
        {
          campaignId: SIGNUP_BONUS_CAMPAIGN.campaignId,
          maxRecipients: SIGNUP_BONUS_CAMPAIGN.maxRecipients,
          coinsPerGrant: SIGNUP_BONUS_CAMPAIGN.coinsPerGrant,
          grantedCount: { $lt: SIGNUP_BONUS_CAMPAIGN.maxRecipients },
        },
        { $inc: { grantedCount: 1 } },
        { new: true, session },
      );
      if (!campaign) {
        result = { status: "cap_reached" };
        return;
      }

      const appliedAt = new Date();
      const user = await UserModel.findOneAndUpdate(
        { uid },
        { $inc: { "wallet.bonus.coins": SIGNUP_BONUS_CAMPAIGN.coinsPerGrant } },
        { new: true, session },
      );
      if (!user) {
        throw Object.assign(new Error("signup_bonus_user_not_found"), { errorCode: "USER_NOT_FOUND" });
      }

      await GrantModel.create(
        [
          {
            campaignId: SIGNUP_BONUS_CAMPAIGN.campaignId,
            uid,
            sequence: campaign.grantedCount,
            coins: SIGNUP_BONUS_CAMPAIGN.coinsPerGrant,
            appliedAt,
          },
        ],
        { session },
      );
      result = {
        status: "applied",
        coins: SIGNUP_BONUS_CAMPAIGN.coinsPerGrant,
        sequence: campaign.grantedCount,
      };
    });
    return result;
  } catch (error) {
    if (isDuplicateKeyError(error)) {
      const raced = await findExistingGrant(uid);
      if (raced) return { status: "already_applied", coins: raced.coins, sequence: raced.sequence };
    }
    throw error;
  } finally {
    await session.endSession();
  }
}
