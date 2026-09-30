import "server-only";
import { TYPESAFE_API_BASE_URL } from "libs/server-utils/secure/typesafeCredentialVerification";
import { logger } from "utils/log";
import type { DecisionQuestion, DecisionState } from "types/decision/decision";

export type JevEvaluateRequest = {
  model: string;
  state: DecisionState;
  questions: Record<string, DecisionQuestion>;
};

export type JevClientFailure =
  | "unavailable"
  | "unauthorized"
  | "invalid_request"
  | "rate_limited"
  | "overloaded"
  | "server_error"
  | "timeout"
  | "network"
  | "response_too_large"
  | "malformed_response";

export type JevEvaluateResult =
  | {
      ok: true;
      model: string;
      answers: Record<string, unknown>;
      usage: { inputTokens: number; outputTokens: number };
    }
  | {
      ok: false;
      failure: JevClientFailure;
      status: number | null;
      retryAfterMs: number | null;
    };

export type JevClientDeps = {
  fetchImpl?: typeof fetch;
  resolveApiKey?: () => Promise<string>;
};

type JevClientOptions = { timeoutMs: number; maxResponseBytes: number };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readRetryAfterMs(value: string | null): number | null {
  if (!value?.trim()) return null;

  const seconds = Number(value);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);

  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? Math.max(0, timestamp - Date.now()) : null;
}

function getErrorName(error: unknown): string | null {
  if (!isRecord(error) || typeof error.name !== "string") return null;
  return error.name;
}

function reportFailure(failure: JevClientFailure, status: number | null, startedAt: number) {
  try {
    logger.server.warn({ failure, status, latencyMs: Math.max(0, Date.now() - startedAt) });
  } catch {
    // Logging must not change the safe fallback result.
  }
}

function failed(
  failure: JevClientFailure,
  startedAt: number,
  status: number | null = null,
  retryAfterMs: number | null = null,
): JevEvaluateResult {
  reportFailure(failure, status, startedAt);
  return { ok: false, failure, status, retryAfterMs };
}

function mapHttpFailure(status: number): JevClientFailure {
  if (status === 401 || status === 403) return "unauthorized";
  if (status === 400 || status === 422) return "invalid_request";
  if (status === 429) return "rate_limited";
  if (status === 529 || status === 503) return "overloaded";
  if (status >= 500 && status <= 599) return "server_error";
  return "invalid_request";
}

function isValidUsageTokenCount(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

async function resolveDefaultApiKey(): Promise<string> {
  const { resolvePlatformCredential } = await import("libs/server-utils/secure/platformCredentialResolver");
  const { payload } = await resolvePlatformCredential("ai.typesafe.default");
  return payload.apiKey;
}

export function createJevClient(deps: JevClientDeps = {}) {
  const fetchImpl = deps.fetchImpl ?? fetch;
  const resolveApiKey = deps.resolveApiKey ?? resolveDefaultApiKey;

  return {
    async evaluate(req: JevEvaluateRequest, opts: JevClientOptions): Promise<JevEvaluateResult> {
      const startedAt = Date.now();
      let apiKey: string;
      try {
        apiKey = (await resolveApiKey()).trim();
      } catch {
        return failed("unavailable", startedAt);
      }
      if (!apiKey) return failed("unavailable", startedAt);

      try {
        const response = await fetchImpl(`${TYPESAFE_API_BASE_URL}/systemone`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(req),
          signal: AbortSignal.timeout(opts.timeoutMs),
          cache: "no-store",
        });

        if (!response.ok) {
          const failure = mapHttpFailure(response.status);
          const retryAfterMs =
            failure === "rate_limited" || failure === "overloaded"
              ? readRetryAfterMs(response.headers.get("Retry-After"))
              : null;
          return failed(failure, startedAt, response.status, retryAfterMs);
        }

        const contentLength = response.headers.get("content-length");
        if (contentLength?.trim()) {
          const declaredBytes = Number(contentLength);
          if (Number.isFinite(declaredBytes) && declaredBytes > opts.maxResponseBytes) {
            return failed("response_too_large", startedAt, response.status);
          }
        }

        const bodyText = await response.text();
        if (Buffer.byteLength(bodyText, "utf8") > opts.maxResponseBytes) {
          return failed("response_too_large", startedAt, response.status);
        }

        let body: unknown;
        try {
          body = JSON.parse(bodyText);
        } catch {
          return failed("malformed_response", startedAt, response.status);
        }

        if (!isRecord(body) || typeof body.model !== "string" || !isRecord(body.answers) || !isRecord(body.usage)) {
          return failed("malformed_response", startedAt, response.status);
        }

        const inputTokens = body.usage.input_tokens;
        const outputTokens = body.usage.output_tokens;
        if (!isValidUsageTokenCount(inputTokens) || !isValidUsageTokenCount(outputTokens)) {
          return failed("malformed_response", startedAt, response.status);
        }

        return {
          ok: true,
          model: body.model,
          answers: body.answers,
          usage: { inputTokens, outputTokens },
        };
      } catch (error) {
        const failure = ["AbortError", "TimeoutError"].includes(getErrorName(error) || "") ? "timeout" : "network";
        return failed(failure, startedAt);
      }
    },
  };
}
