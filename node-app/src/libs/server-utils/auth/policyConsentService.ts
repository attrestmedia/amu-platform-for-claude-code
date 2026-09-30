import "server-only";
import mongoose from "mongoose";
import { MONGODB_USERS_URL } from "consts/env/server";
import { MONGODB_USER_MODEL_PREFIX } from "consts/db";
import {
  currentPolicyConsents,
  resolveAccountPolicyConsentStatus,
  type AccountPolicyId,
  type PolicyConsentRecord,
} from "consts/legal/accountPolicy";
import { dbConnect } from "libs/database/mongoose";
import { getModel } from "libs/database/modelCache";
import {
  UserIndexSchema,
  UserSchema,
  type IUserDocument,
  type IUserIndexDocument,
} from "models/user";
import { findWordPressUserByEmail, saveWordPressPolicyConsents } from "./wordpressAccountService";

function consentKey(consent: PolicyConsentRecord) {
  return `${consent.policyId}:${consent.version}:${new Date(consent.agreedAt).toISOString()}:${consent.method}`;
}

function mergeConsentHistory(...groups: Array<readonly PolicyConsentRecord[] | null | undefined>) {
  const merged = new Map<string, PolicyConsentRecord>();
  for (const consent of groups.flatMap((group) => (Array.isArray(group) ? group : []))) {
    if (!consent?.policyId || !consent?.version || !consent?.agreedAt || !consent?.method) continue;
    merged.set(consentKey(consent), consent);
  }
  return [...merged.values()].sort(
    (left, right) => new Date(left.agreedAt).getTime() - new Date(right.agreedAt).getTime(),
  );
}

async function policyModels(uid: string) {
  const connection = await dbConnect(MONGODB_USERS_URL);
  const UserIndexModel: mongoose.Model<IUserIndexDocument> =
    (connection.models.UserIndex as mongoose.Model<IUserIndexDocument> | undefined) ||
    connection.model<IUserIndexDocument>("UserIndex", UserIndexSchema, "users_index");
  const modelName = `${MONGODB_USER_MODEL_PREFIX}${uid}`;
  const UserModel = await getModel<IUserDocument>(MONGODB_USERS_URL, modelName, UserSchema, modelName);
  return { UserIndexModel, UserModel };
}

export async function getAccountPolicyConsentStatus(args: {
  uid: string;
  email?: string;
  knownConsents?: readonly PolicyConsentRecord[];
  now?: Date;
}) {
  const { UserIndexModel, UserModel } = await policyModels(args.uid);
  const [index, user] = await Promise.all([
    UserIndexModel.findOne(
      { $or: [{ uid: args.uid }, ...(args.email ? [{ userEmailLower: args.email.toLowerCase() }] : [])] },
      { policyConsents: 1 },
    ).lean(),
    args.knownConsents ? Promise.resolve(null) : UserModel.findOne({ uid: args.uid }, { policyConsents: 1 }).lean(),
  ]);
  const consents = mergeConsentHistory(args.knownConsents, index?.policyConsents, user?.policyConsents);
  return { ...resolveAccountPolicyConsentStatus(consents, args.now), consents };
}

export async function recordAccountPolicyReconsent(args: {
  uid: string;
  email: string;
  agreedPolicyIds: readonly AccountPolicyId[];
  syncWordPress?: boolean;
}) {
  const email = args.email.trim().toLowerCase();
  if (!args.uid || !email) {
    throw Object.assign(new Error("계정 식별 정보를 확인할 수 없습니다."), {
      errorCode: "ACCOUNT_IDENTITY_REQUIRED",
      status: 422,
    });
  }

  const before = await getAccountPolicyConsentStatus(args);
  if (!before.required) return before;

  const accepted = new Set(args.agreedPolicyIds);
  const unaccepted = before.noticePolicyIds.filter((policyId) => !accepted.has(policyId));
  if (unaccepted.length > 0) {
    throw Object.assign(new Error("개정 정책의 필수 동의 항목을 확인해 주세요."), {
      errorCode: "POLICY_CONSENT_REQUIRED",
      status: 400,
    });
  }
  const acceptedMissingPolicyIds = before.noticePolicyIds.filter((policyId) => accepted.has(policyId));
  if (acceptedMissingPolicyIds.length === 0) return before;

  const newConsents = currentPolicyConsents("policy_reconsent", undefined, acceptedMissingPolicyIds);
  if (args.syncWordPress !== false) {
    const wordpressUser = await findWordPressUserByEmail(email);
    if (!wordpressUser) {
      throw Object.assign(new Error("연결된 AMU 매거진 계정을 찾을 수 없습니다."), {
        errorCode: "WORDPRESS_ACCOUNT_NOT_FOUND",
        status: 409,
      });
    }
    await saveWordPressPolicyConsents(wordpressUser.id, newConsents);
  }

  const { UserIndexModel, UserModel } = await policyModels(args.uid);
  await Promise.all([
    UserIndexModel.updateOne(
      { $or: [{ uid: args.uid }, { userEmailLower: email }] },
      { $push: { policyConsents: { $each: newConsents } } },
    ),
    UserModel.updateOne({ uid: args.uid }, { $push: { policyConsents: { $each: newConsents } } }),
  ]);

  return getAccountPolicyConsentStatus({ uid: args.uid, email });
}
