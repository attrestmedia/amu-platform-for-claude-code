import "server-only";
import crypto from "crypto";
import { type NextRequest } from "next/server";

const AGENT_KEY_HEADER = "x-agent-key";
const AGENT_KEY_ID_HEADER = "x-agent-key-id";
const AGENT_WILDCARD_SCOPE = "*";

type AgentKeyConfig = {
  id: string;
  key: string;
  uid: string;
  scopes: string[];
  source: "json" | "legacy";
};

type AgentAuthResult =
  | { valid: true; uid: string; keyHash: string; keyId: string; scopes: string[] }
  | { valid: false; error: string };

type AgentKeyAuthOptions = {
  scope?: string | string[];
  allowWildcard?: boolean;
  allowLegacyWildcard?: boolean;
};

function hashAgentKey(key: string) {
  return crypto.createHash("sha256").update(key).digest("hex").slice(0, 12);
}

function isSameAgentKey(key: string, expectedKey: string) {
  const keyBuffer = Buffer.from(key);
  const expectedBuffer = Buffer.from(expectedKey);
  return keyBuffer.length === expectedBuffer.length && crypto.timingSafeEqual(keyBuffer, expectedBuffer);
}

function toStringArray(raw: unknown) {
  return Array.from(
    new Set(
      (Array.isArray(raw) ? raw : String(raw || "").split(","))
        .map((item) => String(item || "").trim())
        .filter(Boolean),
    ),
  );
}

function normalizeConfig(id: string, raw: unknown): AgentKeyConfig | null {
  const item = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const key = String(item.key || item.apiKey || "").trim();
  const uid = String(item.uid || item.userId || process.env.AGENT_UID || "").trim();
  const scopes = toStringArray(item.scopes || item.scope);

  if (!key || !uid) return null;

  return {
    id: String(item.id || item.keyId || id || "agent").trim(),
    key,
    uid,
    scopes: scopes.length > 0 ? scopes : [AGENT_WILDCARD_SCOPE],
    source: "json",
  };
}

function loadAgentKeyConfigs(): AgentKeyConfig[] {
  const configs: AgentKeyConfig[] = [];
  const rawJson = String(process.env.AGENT_API_KEYS_JSON || "").trim();

  if (rawJson) {
    try {
      const parsed = JSON.parse(rawJson);
      if (Array.isArray(parsed)) {
        parsed.forEach((item, index) => {
          const config = normalizeConfig(String(index), item);
          if (config) configs.push(config);
        });
      } else if (parsed && typeof parsed === "object") {
        Object.entries(parsed as Record<string, unknown>).forEach(([id, item]) => {
          const config = normalizeConfig(id, item);
          if (config) configs.push(config);
        });
      }
    } catch {
      // Legacy AGENT_API_KEY fallback below remains available if JSON is malformed.
    }
  }

  const legacyKey = String(process.env.AGENT_API_KEY || "").trim();
  const legacyUid = String(process.env.AGENT_UID || "").trim();
  if (legacyKey && legacyUid) {
    configs.push({
      id: "legacy",
      key: legacyKey,
      uid: legacyUid,
      scopes: [AGENT_WILDCARD_SCOPE],
      source: "legacy",
    });
  }

  return configs;
}

function hasScope(grantedScopes: readonly string[], requiredScope: string) {
  return grantedScopes.some((scope) => {
    if (scope === AGENT_WILDCARD_SCOPE) return true;
    if (scope === requiredScope) return true;
    if (scope.endsWith(":*")) return requiredScope.startsWith(scope.slice(0, -1));
    return false;
  });
}

function hasRequiredScopes(grantedScopes: readonly string[], requiredScopes: readonly string[]) {
  return requiredScopes.every((scope) => hasScope(grantedScopes, scope));
}

/**
 * Agent API 키 인증
 * - AGENT_API_KEYS_JSON 다중 키/스코프를 우선 사용
 * - AGENT_API_KEY/AGENT_UID는 legacy wildcard 키로 호환 유지
 */
export function validateAgentKey(request: NextRequest, options: AgentKeyAuthOptions = {}): AgentAuthResult {
  const key = request.headers.get(AGENT_KEY_HEADER);
  const requestedKeyId = String(request.headers.get(AGENT_KEY_ID_HEADER) || "").trim();
  const configs = loadAgentKeyConfigs();
  const requiredScopes = toStringArray(options.scope);

  if (configs.length === 0) return { valid: false, error: "AGENT_API_KEY not configured" };
  if (!key) return { valid: false, error: "Invalid or missing agent key" };

  const candidates = requestedKeyId ? configs.filter((config) => config.id === requestedKeyId) : configs;

  for (const config of candidates) {
    if (!isSameAgentKey(key, config.key)) continue;
    const wildcardAllowed =
      options.allowWildcard !== false ||
      (options.allowLegacyWildcard === true && config.source === "legacy");
    if (!wildcardAllowed && config.scopes.includes(AGENT_WILDCARD_SCOPE)) {
      return { valid: false, error: "Wildcard agent key scope is not allowed" };
    }
    if (requiredScopes.length > 0 && !hasRequiredScopes(config.scopes, requiredScopes)) {
      return { valid: false, error: "Agent key scope is not allowed" };
    }

    return { valid: true, uid: config.uid, keyHash: hashAgentKey(key), keyId: config.id, scopes: config.scopes };
  }

  return { valid: false, error: "Invalid or missing agent key" };
}
