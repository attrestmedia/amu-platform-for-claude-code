import "server-only";

import { getPersonalUniversePublicGate } from "libs/server-utils/narrative/personalUniversePublicPolicy";
import {
  CROSS_UNIVERSE_CONSENT_VERSION,
  CROSS_UNIVERSE_FORBIDDEN_MUTATION_VALUES,
  CROSS_UNIVERSE_SCOPE_VALUES,
  type CrossUniverseBridgeEvent,
  type CrossUniverseScope,
  type CrossUniverseSharePreference,
  type ForeignCharacterReference,
} from "types/game";

/**
 * @docHint
 * @purpose Cross-Universe 정책의 단일 fail-closed 경계
 * @process feature/policy/moderation gate  scope allowlist  bilateral approval  immutable reference
 * @domain narrative-canon.cross-universe
 * @scope server
 */

function id(value: unknown, max = 160) {
  const normalized = String(value || "").trim();
  return normalized && normalized.length <= max && /^[a-zA-Z0-9][a-zA-Z0-9._:-]*$/.test(normalized) ? normalized : "";
}

export function getCrossUniverseGate(env: Record<string, string | undefined> = process.env) {
  const publicGate = getPersonalUniversePublicGate();
  const enabled = env.CROSS_UNIVERSE_ENABLED === "true";
  const policyApproved = env.CROSS_UNIVERSE_POLICY_APPROVED === "true";
  const moderationEnabled = env.CROSS_UNIVERSE_MODERATION_ENABLED === "true";
  return {
    enabled,
    policyApproved,
    moderationEnabled,
    publicReady: publicGate.ready,
    ready: enabled && policyApproved && moderationEnabled && publicGate.ready,
    matchmakingLimit: Math.min(10, Math.max(1, Number.parseInt(String(env.CROSS_UNIVERSE_MATCHMAKING_LIMIT || "5"), 10) || 5)),
  } as const;
}

export function normalizeCrossUniverseScopes(scopes: readonly unknown[]): CrossUniverseScope[] {
  const allowed = new Set(CROSS_UNIVERSE_SCOPE_VALUES);
  return Array.from(new Set(scopes.filter((scope): scope is CrossUniverseScope => typeof scope === "string" && allowed.has(scope as CrossUniverseScope))));
}

export function assertForeignCharacterReference(value: ForeignCharacterReference): ForeignCharacterReference {
  const ownerUid = id(value.ownerUid);
  const sourceUniverseId = id(value.sourceUniverseId);
  const characterId = id(value.characterId);
  const characterRevision = Math.floor(Number(value.characterRevision));
  if (!ownerUid || !sourceUniverseId || !characterId || !Number.isInteger(characterRevision) || characterRevision < 1) {
    throw new Error("CROSS_UNIVERSE_FOREIGN_REFERENCE_INVALID");
  }
  return { ownerUid, sourceUniverseId, characterId, characterRevision };
}

export function assertCrossUniverseSharePreference(value: CrossUniverseSharePreference): CrossUniverseSharePreference {
  const ownerUid = id(value.ownerUid);
  const personalUniverseId = id(value.personalUniverseId);
  const allowedScopes = normalizeCrossUniverseScopes(value.allowedScopes || []);
  if (!ownerUid || !personalUniverseId || !["enabled", "withdrawn"].includes(value.status) || (value.status === "enabled" && !allowedScopes.length) || value.consentVersion !== CROSS_UNIVERSE_CONSENT_VERSION) {
    throw new Error("CROSS_UNIVERSE_SHARE_PREFERENCE_INVALID");
  }
  return { ...value, ownerUid, personalUniverseId, allowedScopes };
}

export function assertCrossUniverseScopes(scopes: readonly unknown[], preference: Pick<CrossUniverseSharePreference, "status" | "allowedScopes">) {
  const requested = normalizeCrossUniverseScopes(scopes);
  if (preference.status !== "enabled") throw new Error("CROSS_UNIVERSE_SHARE_WITHDRAWN");
  if (!requested.length || requested.length !== scopes.length || requested.some((scope) => !preference.allowedScopes.includes(scope))) {
    throw new Error("CROSS_UNIVERSE_SCOPE_FORBIDDEN");
  }
  return requested;
}

/** Canon Bridge는 항상 두 당사자의 승인 timestamp가 있어야만 성립한다. */
export function isCrossUniverseBridgeApproved(event: Pick<CrossUniverseBridgeEvent, "kind" | "status" | "approvals">) {
  if (event.status !== "approved") return false;
  return event.kind === "guest-encounter"
    ? Boolean(event.approvals.hostAt)
    : Boolean(event.approvals.requesterAt && event.approvals.hostAt);
}

/** 외부 세계 reducer는 자신의 local consequence만 처리할 수 있다. */
export function assertLocalConsequenceOwnership(input: { actorUniverseId: string; consequenceUniverseId: string; foreignReference?: ForeignCharacterReference }) {
  if (id(input.actorUniverseId) !== id(input.consequenceUniverseId)) throw new Error("CROSS_UNIVERSE_FOREIGN_CANON_MUTATION_FORBIDDEN");
  if (input.foreignReference) assertForeignCharacterReference(input.foreignReference);
  return true;
}

export function isCrossUniverseForbiddenMutation(value: unknown) {
  return typeof value === "string" && CROSS_UNIVERSE_FORBIDDEN_MUTATION_VALUES.includes(value as (typeof CROSS_UNIVERSE_FORBIDDEN_MUTATION_VALUES)[number]);
}

export function assertCrossUniverseMutationAllowed(value: unknown) {
  if (isCrossUniverseForbiddenMutation(value)) throw new Error("CROSS_UNIVERSE_PERMANENT_MUTATION_FORBIDDEN");
  return true;
}

/** 철회는 미래 등장만 중지한다. 이미 승인된 Bridge Event snapshot은 immutable audit record로 남긴다. */
export function canCreateCrossUniverseAppearance(input: {
  gateReady: boolean;
  isMinor: boolean;
  isBlocked: boolean;
  host: Pick<CrossUniverseSharePreference, "status" | "allowedScopes">;
  guest: Pick<CrossUniverseSharePreference, "status" | "allowedScopes">;
  scopes: readonly unknown[];
}) {
  if (!input.gateReady) return { allowed: false as const, reason: "CROSS_UNIVERSE_DISABLED" };
  if (input.isMinor) return { allowed: false as const, reason: "CROSS_UNIVERSE_MINOR_BLOCKED" };
  if (input.isBlocked) return { allowed: false as const, reason: "CROSS_UNIVERSE_USER_BLOCKED" };
  try {
    const scopes = assertCrossUniverseScopes(input.scopes, input.host);
    assertCrossUniverseScopes(scopes, input.guest);
    return { allowed: true as const, scopes };
  } catch (error) {
    return { allowed: false as const, reason: error instanceof Error ? error.message : "CROSS_UNIVERSE_FORBIDDEN" };
  }
}
