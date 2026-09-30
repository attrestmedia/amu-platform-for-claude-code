import "server-only";

import { MONGODB_SECRETS_URL } from "consts/env/server";
import { getModel } from "libs/database/modelCache";
import { decryptSecret, encryptSecret } from "libs/server-utils/secure/SecureVault";
import {
  OAuthAppCredentialSchema,
  type IOAuthAppCredentialDocument,
  type OAuthAppCredentialProvider,
} from "models/secure/OAuthAppCredentialSchema";
import { toSafeString } from "utils/common/typeUtils";

/**
 * @docHint
 * @purpose 플랫폼 공용 OAuth App ID/Secret의 암호화 저장·서버 전용 조회
 * @process provider 단일 row upsert → 비밀 필드 암호화 → 서버 resolver만 복호화 → 상태에는 값 미노출
 * @domain security
 * @scope server
 */

async function getOAuthAppCredentialModel() {
  return await getModel<IOAuthAppCredentialDocument>(
    MONGODB_SECRETS_URL,
    "OAuthAppCredential",
    OAuthAppCredentialSchema,
    "oauth_app_credentials",
  );
}

export async function getDecryptedOAuthAppCredential(provider: OAuthAppCredentialProvider) {
  const model = await getOAuthAppCredentialModel();
  const row = await model.findOne({ provider }).lean();
  if (!row) return null;

  return {
    provider,
    clientId: decryptSecret(row.clientIdEnc),
    clientSecret: decryptSecret(row.clientSecretEnc),
    developerToken: row.developerTokenEnc ? decryptSecret(row.developerTokenEnc) : "",
    updatedAt: row.updatedAt instanceof Date ? row.updatedAt : new Date(row.updatedAt),
  };
}

export async function listOAuthAppCredentialDatabaseStatus() {
  const model = await getOAuthAppCredentialModel();
  const rows = await model
    .find({})
    .select({ _id: 0, provider: 1, clientIdEnc: 1, clientSecretEnc: 1, developerTokenEnc: 1, updatedAt: 1 })
    .lean();

  return new Map(
    rows.map((row) => [
      row.provider,
      {
        exists: true,
        hasClientId: Boolean(row.clientIdEnc),
        hasClientSecret: Boolean(row.clientSecretEnc),
        hasDeveloperToken: Boolean(row.developerTokenEnc),
        updatedAt: row.updatedAt instanceof Date ? row.updatedAt.toISOString() : String(row.updatedAt || ""),
      },
    ]),
  );
}

export async function upsertOAuthAppCredential(args: {
  provider: OAuthAppCredentialProvider;
  clientId?: string;
  clientSecret?: string;
  developerToken?: string;
  actor?: string;
  actorIp?: string;
  requestId?: string;
}) {
  const model = await getOAuthAppCredentialModel();
  const existing = await model.findOne({ provider: args.provider }).select({ _id: 1 }).lean();
  const clientId = toSafeString(args.clientId);
  const clientSecret = toSafeString(args.clientSecret);
  const developerToken = toSafeString(args.developerToken);

  if (!existing && (!clientId || !clientSecret)) {
    throw new Error("OAUTH_APP_CREDENTIAL_REQUIRED");
  }

  const set: Record<string, unknown> = { updatedBy: toSafeString(args.actor) };
  const changedFields: string[] = [];
  if (clientId) {
    set.clientIdEnc = encryptSecret(clientId);
    changedFields.push("clientId");
  }
  if (clientSecret) {
    set.clientSecretEnc = encryptSecret(clientSecret);
    changedFields.push("clientSecret");
  }
  if (developerToken) {
    set.developerTokenEnc = encryptSecret(developerToken);
    changedFields.push("developerToken");
  }

  if (changedFields.length === 0) throw new Error("OAUTH_APP_CREDENTIAL_NO_CHANGES");

  await model.findOneAndUpdate(
    { provider: args.provider },
    {
      $set: set,
      $setOnInsert: { provider: args.provider, createdBy: toSafeString(args.actor) },
      $push: {
        auditEvents: {
          $each: [
            {
              action: existing ? "update" : "create",
              actor: toSafeString(args.actor),
              actorIp: toSafeString(args.actorIp),
              requestId: toSafeString(args.requestId),
              changedFields,
              at: new Date(),
            },
          ],
          $slice: -50,
        },
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );

  return { provider: args.provider, changedFields };
}
