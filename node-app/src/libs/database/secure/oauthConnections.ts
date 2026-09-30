import "server-only";

import { MONGODB_SECRETS_URL } from "consts/env/server";
import { getModel } from "libs/database/modelCache";
import { deriveOAuthConnectionStatus } from "libs/marketing/auth/oauthConnectionStatusContract";
import { decryptSecret, encryptSecret } from "libs/server-utils/secure/SecureVault";
import {
  OAuthConnectionSchema,
  type IOAuthConnectionDocument,
  type OAuthConnectionProvider,
  type OAuthConnectionStatus,
} from "models/secure/OAuthConnectionSchema";
import { toSafeString } from "utils/common/typeUtils";

/**
 * @docHint
 * @purpose 사용자/유니버스 OAuth 연결 토큰 저장/조회/폐기
 * @process secrets DB에 provider별 OAuth 토큰을 암호문으로 upsert하고, 상태(존재/만료)만 클라이언트에 노출
 * @domain security
 * @scope server
 */

export type OAuthConnectionOwnerType = "user" | "universe";

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

async function getOAuthConnectionModel() {
  return await getModel<IOAuthConnectionDocument>(
    MONGODB_SECRETS_URL,
    "OAuthConnection",
    OAuthConnectionSchema,
    "oauth_connections",
  );
}

export async function upsertOAuthConnection(input: {
  ownerType: OAuthConnectionOwnerType;
  ownerId: string;
  provider: OAuthConnectionProvider;
  providerAccountId: string;
  displayName?: string;
  accessToken: string;
  refreshToken?: string;
  scope?: string[] | string;
  tokenType?: string;
  expiresIn?: number;
  refreshTokenExpiresIn?: number;
  connectionStatus?: OAuthConnectionStatus;
  selectedResourceId?: string;
  selectedResourceName?: string;
  selectedResourceType?: string;
  managerResourceId?: string;
  connectedByProviderUserId?: string;
  actor?: string;
}) {
  const ownerType = input.ownerType;
  const ownerId = toSafeString(input.ownerId);
  const provider = input.provider;
  const providerAccountId = toSafeString(input.providerAccountId);
  const accessToken = toSafeString(input.accessToken);

  if (!ownerId || !provider || !providerAccountId || !accessToken) {
    throw new Error("OAUTH_CONNECTION_REQUIRED");
  }

  const scopes = Array.from(
    new Set(
      (Array.isArray(input.scope) ? input.scope : toSafeString(input.scope).split(/[\s,]+/))
        .map((scope) => toSafeString(scope))
        .filter(Boolean),
    ),
  );
  const model = await getOAuthConnectionModel();
  const actor = toSafeString(input.actor);

  // universe/provider당 실제 실행 대상은 하나만 활성화한다.
  await model.updateMany(
    { ownerType, ownerId, provider, providerAccountId: { $ne: providerAccountId }, isActive: true },
    { $set: { isActive: false } },
  );

  return await model
    .findOneAndUpdate(
      { ownerType, ownerId, provider, providerAccountId },
      {
        $set: {
          displayName: toSafeString(input.displayName),
          accessTokenEnc: encryptSecret(accessToken),
          ...(input.refreshToken ? { refreshTokenEnc: encryptSecret(input.refreshToken) } : {}),
          scope: scopes,
          tokenType: toSafeString(input.tokenType),
          expiresAt: addSeconds(input.expiresIn),
          refreshTokenExpiresAt: addSeconds(input.refreshTokenExpiresIn),
          connectionStatus: input.connectionStatus || "connected",
          isActive: true,
          selectedResourceId: toSafeString(input.selectedResourceId),
          selectedResourceName: toSafeString(input.selectedResourceName),
          selectedResourceType: toSafeString(input.selectedResourceType),
          managerResourceId: toSafeString(input.managerResourceId),
          connectedByProviderUserId: toSafeString(input.connectedByProviderUserId),
          lastValidatedAt: new Date(),
          lastValidationError: "",
          updatedBy: actor,
        },
        $setOnInsert: {
          createdBy: actor,
        },
        $push: {
          auditEvents: {
            $each: [{ action: "oauth_connected", actor, at: new Date() }],
            $slice: -50,
          },
        },
      },
      { upsert: true, new: true },
    )
    .lean();
}

/** 상태 조회(클라이언트 노출용) - 토큰 값은 숨기고 연결 목록/만료만 반환 */
export async function listOAuthConnectionStatus(args: {
  ownerType: OAuthConnectionOwnerType;
  ownerId: string;
  provider?: OAuthConnectionProvider;
}) {
  const model = await getOAuthConnectionModel();
  const query: Record<string, unknown> = {
    ownerType: args.ownerType,
    ownerId: toSafeString(args.ownerId),
    connectionStatus: { $ne: "disconnected" },
  };
  if (args.provider) query.provider = args.provider;

  const list = await model
    .find(query)
    .sort({ updatedAt: -1 })
    .select({
      _id: 0,
      provider: 1,
      providerAccountId: 1,
      displayName: 1,
      scope: 1,
      isActive: 1,
      selectedResourceId: 1,
      selectedResourceName: 1,
      selectedResourceType: 1,
      managerResourceId: 1,
      expiresAt: 1,
      refreshTokenEnc: 1,
      refreshTokenExpiresAt: 1,
      connectionStatus: 1,
      lastValidatedAt: 1,
      lastValidationError: 1,
      updatedAt: 1,
    })
    .lean();

  return list.map((doc) => {
    const expiresAt = toDateOrNull(doc.expiresAt);
    const status = deriveOAuthConnectionStatus({
      provider: doc.provider as OAuthConnectionProvider,
      connectionStatus: (doc.connectionStatus as OAuthConnectionStatus) || "connected",
      accessTokenExpiresAt: expiresAt,
      refreshTokenPresent: Boolean(toSafeString(doc.refreshTokenEnc)),
      refreshTokenExpiresAt: toDateOrNull(doc.refreshTokenExpiresAt),
      lastValidationError: toSafeString(doc.lastValidationError),
    });
    return {
      provider: doc.provider as OAuthConnectionProvider,
      providerAccountId: toSafeString(doc.providerAccountId),
      displayName: toSafeString(doc.displayName),
      scope: Array.isArray(doc.scope) ? doc.scope : [],
      isActive: doc.isActive === true,
      selectedResourceId: toSafeString(doc.selectedResourceId),
      selectedResourceName: toSafeString(doc.selectedResourceName),
      selectedResourceType: toSafeString(doc.selectedResourceType),
      managerResourceId: toSafeString(doc.managerResourceId),
      connectionStatus: status.connectionStatus,
      expiresAt: expiresAt?.toISOString() || null,
      lastValidatedAt: toDateOrNull(doc.lastValidatedAt)?.toISOString() || null,
      updatedAt: toDateOrNull(doc.updatedAt)?.toISOString() || null,
      expired: status.accessTokenExpired,
      accessTokenExpired: status.accessTokenExpired,
      canRefresh: status.canRefresh,
      refreshTokenExpired: status.refreshTokenExpired,
      tokenHealth: status.tokenHealth,
      lastValidationErrorCode: status.lastValidationErrorCode,
    };
  });
}

export async function getDecryptedOAuthConnection(args: {
  ownerType: OAuthConnectionOwnerType;
  ownerId: string;
  provider: OAuthConnectionProvider;
  providerAccountId?: string;
  allowSelectionRequired?: boolean;
  allowExpired?: boolean;
}) {
  const model = await getOAuthConnectionModel();
  const query: Record<string, unknown> = {
    ownerType: args.ownerType,
    ownerId: toSafeString(args.ownerId),
    provider: args.provider,
    isActive: true,
    connectionStatus: args.allowSelectionRequired
      ? { $in: ["connected", "selection_required", ...(args.allowExpired ? ["reauth_required"] : [])] }
      : args.allowExpired
        ? { $in: ["connected", "reauth_required"] }
        : "connected",
  };
  if (args.providerAccountId) query.providerAccountId = toSafeString(args.providerAccountId);

  const doc = await model.findOne(query).sort({ updatedAt: -1 }).lean();
  if (!doc || !toSafeString(doc.accessTokenEnc)) return null;

  const expiresAt = toDateOrNull(doc.expiresAt);
  if (expiresAt && expiresAt.getTime() <= Date.now() && !args.allowExpired) {
    await model.updateOne(
      { _id: doc._id, connectionStatus: { $ne: "disconnected" } },
      { $set: { connectionStatus: "reauth_required", lastValidationError: "access_token_expired" } },
    );
    return null;
  }
  return {
    ownerType: doc.ownerType as OAuthConnectionOwnerType,
    ownerId: toSafeString(doc.ownerId),
    provider: doc.provider as OAuthConnectionProvider,
    providerAccountId: toSafeString(doc.providerAccountId),
    displayName: toSafeString(doc.displayName),
    accessToken: decryptSecret(doc.accessTokenEnc),
    refreshToken: doc.refreshTokenEnc ? decryptSecret(doc.refreshTokenEnc) : "",
    scope: Array.isArray(doc.scope) ? doc.scope : [],
    tokenType: toSafeString(doc.tokenType),
    connectionStatus: (doc.connectionStatus as OAuthConnectionStatus) || "connected",
    isActive: doc.isActive === true,
    selectedResourceId: toSafeString(doc.selectedResourceId),
    selectedResourceName: toSafeString(doc.selectedResourceName),
    selectedResourceType: toSafeString(doc.selectedResourceType),
    managerResourceId: toSafeString(doc.managerResourceId),
    expiresAt,
    refreshTokenExpiresAt: toDateOrNull(doc.refreshTokenExpiresAt),
    expired: !!expiresAt && expiresAt.getTime() <= Date.now(),
  };
}

export async function hasOAuthConnectionHistory(args: {
  ownerType: OAuthConnectionOwnerType;
  ownerId: string;
  provider: OAuthConnectionProvider;
}) {
  const model = await getOAuthConnectionModel();
  return !!(await model.exists({
    ownerType: args.ownerType,
    ownerId: toSafeString(args.ownerId),
    provider: args.provider,
  }));
}

export async function updateOAuthConnectionToken(args: {
  ownerType: OAuthConnectionOwnerType;
  ownerId: string;
  provider: OAuthConnectionProvider;
  providerAccountId: string;
  accessToken: string;
  refreshToken?: string;
  expiresIn?: number;
  tokenType?: string;
  connectionStatus?: OAuthConnectionStatus;
}) {
  const model = await getOAuthConnectionModel();
  const accessToken = toSafeString(args.accessToken);
  if (!accessToken) throw new Error("OAUTH_ACCESS_TOKEN_REQUIRED");
  return await model.updateOne(
    {
      ownerType: args.ownerType,
      ownerId: toSafeString(args.ownerId),
      provider: args.provider,
      providerAccountId: toSafeString(args.providerAccountId),
      isActive: true,
      connectionStatus: { $ne: "disconnected" },
    },
    {
      $set: {
        accessTokenEnc: encryptSecret(accessToken),
        ...(args.refreshToken ? { refreshTokenEnc: encryptSecret(args.refreshToken) } : {}),
        expiresAt: addSeconds(args.expiresIn),
        tokenType: toSafeString(args.tokenType),
        ...(args.connectionStatus ? { connectionStatus: args.connectionStatus } : {}),
        lastValidatedAt: new Date(),
        lastValidationError: "",
      },
    },
  );
}

export async function updateOAuthConnectionValidation(args: {
  ownerType: OAuthConnectionOwnerType;
  ownerId: string;
  provider: OAuthConnectionProvider;
  providerAccountId: string;
  errorCode: string;
  connectionStatus?: OAuthConnectionStatus;
}) {
  const model = await getOAuthConnectionModel();
  return await model.updateOne(
    {
      ownerType: args.ownerType,
      ownerId: toSafeString(args.ownerId),
      provider: args.provider,
      providerAccountId: toSafeString(args.providerAccountId),
      isActive: true,
      connectionStatus: { $ne: "disconnected" },
    },
    {
      $set: {
        lastValidatedAt: new Date(),
        lastValidationError: toSafeString(args.errorCode),
        ...(args.connectionStatus ? { connectionStatus: args.connectionStatus } : {}),
      },
    },
  );
}

export async function selectOAuthConnectionResource(args: {
  ownerType: OAuthConnectionOwnerType;
  ownerId: string;
  provider: OAuthConnectionProvider;
  providerAccountId: string;
  resourceId: string;
  resourceName?: string;
  resourceType: string;
  managerResourceId?: string;
  actor?: string;
}) {
  const model = await getOAuthConnectionModel();
  const actor = toSafeString(args.actor);
  const result = await model.updateOne(
    {
      ownerType: args.ownerType,
      ownerId: toSafeString(args.ownerId),
      provider: args.provider,
      providerAccountId: toSafeString(args.providerAccountId),
      isActive: true,
      connectionStatus: { $ne: "disconnected" },
    },
    {
      $set: {
        selectedResourceId: toSafeString(args.resourceId),
        selectedResourceName: toSafeString(args.resourceName),
        selectedResourceType: toSafeString(args.resourceType),
        managerResourceId: toSafeString(args.managerResourceId),
        connectionStatus: "connected",
        lastValidatedAt: new Date(),
        lastValidationError: "",
        updatedBy: actor,
      },
      $push: {
        auditEvents: {
          $each: [{ action: "oauth_resource_selected", actor, at: new Date() }],
          $slice: -50,
        },
      },
    },
  );
  if ((result.matchedCount ?? 0) !== 1) throw new Error("OAUTH_CONNECTION_NOT_FOUND");
  return { selected: true };
}

/** 연결 해제(soft): status=disconnected + 토큰 폐기 */
export async function disconnectOAuthConnection(args: {
  ownerType: OAuthConnectionOwnerType;
  ownerId: string;
  provider: OAuthConnectionProvider;
  providerAccountId?: string;
  actor?: string;
}) {
  const model = await getOAuthConnectionModel();
  const query: Record<string, unknown> = {
    ownerType: args.ownerType,
    ownerId: toSafeString(args.ownerId),
    provider: args.provider,
  };
  if (args.providerAccountId) query.providerAccountId = toSafeString(args.providerAccountId);

  const result = await model.updateMany(query, {
    $set: {
      connectionStatus: "disconnected",
      isActive: false,
      accessTokenEnc: "",
      refreshTokenEnc: "",
      updatedBy: toSafeString(args.actor),
    },
    $push: {
      auditEvents: {
        $each: [{ action: "oauth_disconnected", actor: toSafeString(args.actor), at: new Date() }],
        $slice: -50,
      },
    },
  });

  return { modified: result.modifiedCount ?? 0 };
}

function providerUserIdQuery(provider: OAuthConnectionProvider, providerUserId: string) {
  return {
    provider,
    $or: [
      { providerAccountId: providerUserId },
      { connectedByProviderUserId: providerUserId },
    ],
  };
}

/** Meta lifecycle callback용: provider user id에 연결된 universe 목록만 조회 */
export async function listOAuthConnectionOwnerIdsByProviderUserId(args: {
  provider: OAuthConnectionProvider;
  providerUserId: string;
}) {
  const providerUserId = toSafeString(args.providerUserId);
  if (!providerUserId) return [];
  const model = await getOAuthConnectionModel();
  const rows = await model
    .find(providerUserIdQuery(args.provider, providerUserId))
    .select({ _id: 0, ownerType: 1, ownerId: 1 })
    .lean();
  return Array.from(
    new Set(
      rows
        .filter((row) => row.ownerType === "universe")
        .map((row) => toSafeString(row.ownerId))
        .filter(Boolean),
    ),
  );
}

/** Meta deauthorization callback용: 토큰을 즉시 폐기하되 감사용 connection row는 보존 */
export async function disconnectOAuthConnectionsByProviderUserId(args: {
  provider: OAuthConnectionProvider;
  providerUserId: string;
  actor: string;
}) {
  const providerUserId = toSafeString(args.providerUserId);
  if (!providerUserId) return { modified: 0 };
  const model = await getOAuthConnectionModel();
  const result = await model.updateMany(providerUserIdQuery(args.provider, providerUserId), {
    $set: {
      connectionStatus: "disconnected",
      isActive: false,
      accessTokenEnc: "",
      refreshTokenEnc: "",
      updatedBy: toSafeString(args.actor),
    },
    $push: {
      auditEvents: {
        $each: [{ action: "oauth_deauthorized_by_provider", actor: toSafeString(args.actor), at: new Date() }],
        $slice: -50,
      },
    },
  });
  return { modified: result.modifiedCount ?? 0 };
}

/** Meta data deletion callback용: provider user id에 연결된 OAuth row를 완전 삭제 */
export async function deleteOAuthConnectionsByProviderUserId(args: {
  provider: OAuthConnectionProvider;
  providerUserId: string;
}) {
  const providerUserId = toSafeString(args.providerUserId);
  if (!providerUserId) return { deleted: 0 };
  const model = await getOAuthConnectionModel();
  const result = await model.deleteMany(providerUserIdQuery(args.provider, providerUserId));
  return { deleted: result.deletedCount ?? 0 };
}
