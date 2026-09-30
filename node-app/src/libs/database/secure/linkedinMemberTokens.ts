import "server-only";

import { MONGODB_SECRETS_URL } from "consts/env/server";
import { getModel } from "libs/database/modelCache";
import { decryptSecret, encryptSecret } from "libs/server-utils/secure/SecureVault";
import {
  LinkedInMemberTokenSchema,
  type ILinkedInMemberTokenDocument,
} from "models/secure/LinkedInMemberTokenSchema";

function toSafeString(value: unknown) {
  return String(value || "").trim();
}

function toDateOrNull(value?: Date | string | null) {
  if (!value) return null;
  const next = value instanceof Date ? value : new Date(value);
  return Number.isNaN(next.getTime()) ? null : next;
}

function addSeconds(seconds?: number) {
  const safeSeconds = Number(seconds || 0);
  if (!Number.isFinite(safeSeconds) || safeSeconds <= 0) return null;
  return new Date(Date.now() + safeSeconds * 1000);
}

export function normalizeLinkedInScopes(value: unknown) {
  const rawValues = Array.isArray(value) ? value : [value];
  return Array.from(
    new Set(
      rawValues
        .flatMap((scope) => toSafeString(scope).split(/[\s,]+/))
        .map((scope) => toSafeString(scope))
        .filter(Boolean),
    ),
  );
}

async function getLinkedInMemberTokenModel() {
  return await getModel<ILinkedInMemberTokenDocument>(
    MONGODB_SECRETS_URL,
    "LinkedInMemberToken",
    LinkedInMemberTokenSchema,
    "linkedin_member_tokens",
  );
}

export async function upsertLinkedInMemberToken(input: {
  universeId: string;
  memberId: string;
  displayName?: string;
  accessToken: string;
  refreshToken?: string;
  scope?: string[] | string;
  expiresIn?: number;
  refreshTokenExpiresIn?: number;
  actor?: string;
}) {
  const universeId = toSafeString(input.universeId);
  const memberId = toSafeString(input.memberId);
  const accessToken = toSafeString(input.accessToken);

  if (!universeId || !memberId || !accessToken) {
    throw new Error("LINKEDIN_MEMBER_TOKEN_REQUIRED");
  }

  const scopes = normalizeLinkedInScopes(input.scope);
  const model = await getLinkedInMemberTokenModel();

  return await model
    .findOneAndUpdate(
      { universeId, memberId },
      {
        $set: {
          memberUrn: `urn:li:person:${memberId}`,
          displayName: toSafeString(input.displayName),
          accessTokenEnc: encryptSecret(accessToken),
          ...(input.refreshToken ? { refreshTokenEnc: encryptSecret(input.refreshToken) } : {}),
          scope: scopes,
          expiresAt: addSeconds(input.expiresIn),
          refreshTokenExpiresAt: addSeconds(input.refreshTokenExpiresIn),
          updatedBy: toSafeString(input.actor),
        },
        $setOnInsert: {
          createdBy: toSafeString(input.actor),
        },
      },
      { upsert: true, new: true },
    )
    .lean();
}

export async function getLinkedInMemberTokenStatus(universeId: string) {
  const model = await getLinkedInMemberTokenModel();
  const doc = await model
    .findOne({ universeId: toSafeString(universeId) })
    .sort({ updatedAt: -1 })
    .select({
      _id: 0,
      memberId: 1,
      memberUrn: 1,
      displayName: 1,
      scope: 1,
      expiresAt: 1,
      refreshTokenExpiresAt: 1,
      updatedAt: 1,
    })
    .lean();

  if (!doc) return { exists: false as const };

  const expiresAt = toDateOrNull(doc.expiresAt);
  return {
    exists: true as const,
    memberId: toSafeString(doc.memberId),
    memberUrn: toSafeString(doc.memberUrn),
    displayName: toSafeString(doc.displayName),
    scope: normalizeLinkedInScopes(doc.scope),
    expiresAt: expiresAt?.toISOString() || null,
    refreshTokenExpiresAt: toDateOrNull(doc.refreshTokenExpiresAt)?.toISOString() || null,
    updatedAt: toDateOrNull(doc.updatedAt)?.toISOString() || null,
    expired: !!expiresAt && expiresAt.getTime() <= Date.now(),
  };
}

export async function getDecryptedLinkedInMemberToken(universeId: string) {
  const model = await getLinkedInMemberTokenModel();
  const doc = await model.findOne({ universeId: toSafeString(universeId) }).sort({ updatedAt: -1 }).lean();
  if (!doc) return null;

  const expiresAt = toDateOrNull(doc.expiresAt);
  return {
    universeId: toSafeString(doc.universeId),
    memberId: toSafeString(doc.memberId),
    memberUrn: toSafeString(doc.memberUrn),
    displayName: toSafeString(doc.displayName),
    accessToken: decryptSecret(doc.accessTokenEnc),
    refreshToken: doc.refreshTokenEnc ? decryptSecret(doc.refreshTokenEnc) : "",
    scope: normalizeLinkedInScopes(doc.scope),
    expiresAt,
    refreshTokenExpiresAt: toDateOrNull(doc.refreshTokenExpiresAt),
    expired: !!expiresAt && expiresAt.getTime() <= Date.now(),
  };
}

export async function disconnectLinkedInMemberToken(universeId: string) {
  const model = await getLinkedInMemberTokenModel();
  const result = await model.deleteMany({ universeId: toSafeString(universeId) });
  return { deleted: result.deletedCount ?? 0 };
}
