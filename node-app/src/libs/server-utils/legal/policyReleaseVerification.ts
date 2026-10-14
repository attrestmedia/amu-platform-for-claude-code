/**
 * @docHint
 * @purpose WordPress 공개 정책 표지와 node manifest를 비교하고 검증 증거를 저장한다.
 * @process runtime 선택  WordPress 상태 조회  세 표면 대조  이벤트·hold 기록
 * @domain legal-policy
 * @scope policy-release-verification
 */

import "server-only";

import { resolvePolicy } from "consts/legal/policyRelease/resolver";
import type { ManifestPolicyId, PolicyReleaseManifest } from "consts/legal/policyRelease/types";
import { POLICY_RELEASE_PUBLIC_WP_ORIGIN } from "consts/env/server";
import { wpApiUri } from "consts/env/runtime";
import {
  hasPolicyReleaseEvents,
  recordPolicyReleaseEvent,
  type PolicyReleaseEventInput,
} from "libs/database/legal/policyReleaseEventRepo";
import { setPolicyReleaseHold } from "libs/database/legal/policyReleaseHoldRepo";
import { getActivePolicyReleaseHolds } from "libs/server-utils/legal/policyReleaseSignals";
import { buildPolicyReleaseState } from "libs/server-utils/legal/policyReleaseState";
import { notifyOps } from "libs/server-utils/legal/policyReleaseNotify";
import {
  getPolicyReleaseRuntime,
  type PolicyReleaseRuntime,
} from "libs/server-utils/legal/policyReleaseRuntime";

const POLICY_IDS: readonly ManifestPolicyId[] = [
  "terms-of-service",
  "privacy-policy",
  "refund-return-policy",
];
const EVIDENCE_KINDS = ["notice_observed", "activation_observed"] as const;
const RELEASE_ID_PATTERN = /^(terms-of-service|privacy-policy|refund-return-policy)@(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const MARKER_ATTRIBUTE_NAMES = [
  "data-policy-id",
  "data-release-id",
  "data-content-sha256",
  "data-manifest-revision",
  "data-role",
] as const;

type Role = "active" | "announced";
type ReleaseEntry = {
  policyId: ManifestPolicyId;
  releaseId: string;
  sha: string | null;
  role: Role;
};
type PublicMarker = ReleaseEntry & { manifestRevision: string | null; httpStatus: number; history: boolean };
type WpPolicyState = {
  active?: { releaseId?: unknown; contentSha256?: unknown } | null;
  announced?: readonly { releaseId?: unknown; contentSha256?: unknown }[];
};
type WpState = {
  ok: true;
  mode: "legacy" | "manifest";
  manifestRevision: string | null;
  policies: Record<string, WpPolicyState>;
};

export type PolicyReleaseVerificationInput = {
  runId: string;
  attempt: number;
  mode: "daily" | "deploy";
  trigger: string;
};

export type PolicyReleaseVerificationSummary = {
  skipped?: true;
  compared?: number;
  onceRecorded?: number;
  mismatches?: number;
  holdsSet?: number;
  warnings?: number;
};

export type PolicyReleaseVerificationDependencies = {
  fetchWp?: (url: string, init?: RequestInit) => Promise<Response>;
  now?: () => Date;
  runtime?: PolicyReleaseRuntime;
  recordEvent?: typeof recordPolicyReleaseEvent;
  hasEvents?: typeof hasPolicyReleaseEvents;
  setHold?: typeof setPolicyReleaseHold;
  getHolds?: typeof getActivePolicyReleaseHolds;
  getWpBaseUrl?: typeof wpApiUri;
  getPublicOrigin?: () => string;
  notify?: typeof notifyOps;
};

export class PolicyReleaseVerificationError extends Error {
  readonly status: number;
  readonly errorCode: string;

  constructor(status: number, errorCode: string) {
    super(errorCode);
    this.name = "PolicyReleaseVerificationError";
    this.status = status;
    this.errorCode = errorCode;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function safeReleaseId(value: unknown): string | null {
  return typeof value === "string" && RELEASE_ID_PATTERN.test(value) ? value : null;
}

function safeSha(value: unknown): string | null {
  return typeof value === "string" && SHA256_PATTERN.test(value) ? value : null;
}

function safeManifestRevision(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 && value.length <= 200 ? value : null;
}

function policyIdFromReleaseId(releaseId: string): ManifestPolicyId | null {
  const match = RELEASE_ID_PATTERN.exec(releaseId);
  return match ? match[1] as ManifestPolicyId : null;
}

function expectedNodeEntries(manifest: PolicyReleaseManifest, nowMs: number): ReleaseEntry[] {
  return POLICY_IDS.flatMap((policyId) => {
    const definition = manifest.policies[policyId];
    const selection = resolvePolicy(manifest, policyId, nowMs);
    const entries: ReleaseEntry[] = [];
    if (selection.active) {
      const release = definition.releases.find((candidate) => candidate.releaseId === selection.active);
      if (release) entries.push({ policyId, releaseId: release.releaseId, sha: release.contentSha256, role: "active" });
    }
    for (const releaseId of selection.announced) {
      const release = definition.releases.find((candidate) => candidate.releaseId === releaseId);
      if (release) entries.push({ policyId, releaseId: release.releaseId, sha: release.contentSha256, role: "announced" });
    }
    return entries;
  });
}

function entriesFromWpState(state: WpState): ReleaseEntry[] {
  if (state.mode !== "manifest") return [];
  const entries: ReleaseEntry[] = [];
  for (const policyId of POLICY_IDS) {
    const policy = state.policies[policyId];
    if (!policy || !isRecord(policy)) continue;
    const activeId = safeReleaseId(policy.active?.releaseId);
    if (activeId && policyIdFromReleaseId(activeId) === policyId) {
      entries.push({ policyId, releaseId: activeId, sha: safeSha(policy.active?.contentSha256), role: "active" });
    }
    for (const item of Array.isArray(policy.announced) ? policy.announced : []) {
      const releaseId = safeReleaseId(item?.releaseId);
      if (releaseId && policyIdFromReleaseId(releaseId) === policyId) {
        entries.push({ policyId, releaseId, sha: safeSha(item?.contentSha256), role: "announced" });
      }
    }
  }
  return entries;
}

function readTagAttributes(tag: string): Record<string, string> {
  const attributes: Record<string, string> = {};
  const source = tag.replace(/^<div\b|\s*\/?>$/gi, " ");
  const attributePattern = /([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g;
  for (const match of source.matchAll(attributePattern)) {
    const name = match[1].toLowerCase();
    if ((MARKER_ATTRIBUTE_NAMES as readonly string[]).includes(name)) {
      attributes[name] = match[2] ?? match[3] ?? match[4] ?? "";
    } else if (name === "class") {
      attributes.class = match[2] ?? match[3] ?? match[4] ?? "";
    }
  }
  return attributes;
}

function parsePublicMarkers(html: string, httpStatus: number): PublicMarker[] {
  const markers: PublicMarker[] = [];
  const tagPattern = /<div\b(?:"[^"]*"|'[^']*'|[^'">])*?>/gi;
  for (const match of html.matchAll(tagPattern)) {
    const attributes = readTagAttributes(match[0]);
    if (!(attributes.class || "").split(/\s+/).includes("amu-policy-release")) continue;
    const releaseId = safeReleaseId(attributes["data-release-id"]);
    const policyId = attributes["data-policy-id"] as ManifestPolicyId;
    const role = attributes["data-role"];
    if (!releaseId || !POLICY_IDS.includes(policyId) || policyIdFromReleaseId(releaseId) !== policyId) continue;
    if (role !== "active" && role !== "announced" && role !== "history") continue;
    markers.push({
      policyId,
      releaseId,
      sha: safeSha(attributes["data-content-sha256"]),
      role: role === "announced" ? "announced" : "active",
      manifestRevision: safeManifestRevision(attributes["data-manifest-revision"]),
      httpStatus,
      history: role === "history",
    });
  }
  return markers;
}

function parseWpState(value: unknown): WpState | null {
  if (!isRecord(value) || value.ok !== true || (value.mode !== "legacy" && value.mode !== "manifest")) return null;
  if (value.mode === "manifest" && !isRecord(value.policies)) return null;
  if (value.mode === "legacy" && value.policies !== undefined && !isRecord(value.policies)) return null;
  return {
    ok: true,
    mode: value.mode,
    manifestRevision: safeManifestRevision(value.manifestRevision),
    policies: isRecord(value.policies) ? value.policies as Record<string, WpPolicyState> : {},
  };
}

function getWpOrigin(baseUrl: string): string {
  return new URL(baseUrl).origin;
}

function makeObserved(node?: ReleaseEntry, wpRest?: ReleaseEntry, wpPublic?: PublicMarker) {
  return {
    node: { releaseId: node?.releaseId ?? null, sha: node?.sha ?? null },
    wpRest: { releaseId: wpRest?.releaseId ?? null, sha: wpRest?.sha ?? null },
    wpPublic: {
      releaseId: wpPublic?.releaseId ?? null,
      sha: wpPublic?.sha ?? null,
      httpStatus: wpPublic?.httpStatus ?? null,
    },
  };
}

function mismatchDetails(node: ReleaseEntry, wpRest?: ReleaseEntry, wpPublic?: PublicMarker): string[] {
  const details: string[] = [];
  for (const [surface, observed] of [["wp_rest", wpRest], ["wp_public", wpPublic]] as const) {
    if (!observed) details.push(`${surface}_missing`);
    else {
      if (observed.sha !== node.sha) details.push(`${surface}_sha`);
      if (observed.role !== node.role) details.push(`${surface}_role`);
    }
  }
  return details;
}

async function runPolicyReleaseVerificationInternal(
  input: PolicyReleaseVerificationInput,
  dependencies: PolicyReleaseVerificationDependencies = {},
): Promise<PolicyReleaseVerificationSummary> {
  const runtime = dependencies.runtime ?? getPolicyReleaseRuntime();
  const now = dependencies.now ?? (() => new Date());
  const recordEvent = dependencies.recordEvent ?? recordPolicyReleaseEvent;
  const queryEvents = dependencies.hasEvents ?? hasPolicyReleaseEvents;
  const setHold = dependencies.setHold ?? setPolicyReleaseHold;
  const getHolds = dependencies.getHolds ?? getActivePolicyReleaseHolds;
  const notify = dependencies.notify ?? notifyOps;

  if (runtime.mode === "legacy") return { skipped: true };

  const recordRunFailure = async (status: number, errorCode: string): Promise<never> => {
    const observedAt = now();
    try {
      await recordEvent({
        eventKey: `${input.runId}#${input.attempt}:-:run_failed`,
        releaseId: "-",
        policyId: "-",
        kind: "run_failed",
        manifestRevision: runtime.mode === "manifest" ? runtime.manifest.manifestRevision : null,
        observedAt,
        outcome: "failed",
        errorCode,
        runId: input.runId,
        actor: "system:policy-release-cron",
      });
    } catch {
      // 실패 이벤트 저장이 불가능해도 경보 로그는 남긴다.
    }
    notify({ kind: "run_failed", runId: input.runId, errorCode });
    throw new PolicyReleaseVerificationError(status, errorCode);
  };

  if (runtime.mode === "unavailable") {
    return recordRunFailure(500, "POLICY_RELEASE_UNAVAILABLE");
  }

  const manifest = runtime.manifest;
  const observedAt = now();
  const nowMs = observedAt.getTime();
  const nodeEntries = expectedNodeEntries(manifest, nowMs);
  let holds: readonly string[] = [];
  let evidence: readonly { releaseId: string; kind: typeof EVIDENCE_KINDS[number] }[] | null = [];
  try {
    holds = await getHolds();
  } catch {
    // 신호 helper는 LKG를 반환하지만, 주입 구현이 실패하면 state API는 불확정으로 응답한다.
    holds = [];
  }
  try {
    const recorded = await queryEvents(
      manifest.policies["terms-of-service"].releases
        .concat(manifest.policies["privacy-policy"].releases, manifest.policies["refund-return-policy"].releases)
        .filter((release) => release.status !== "cancelled")
        .map((release) => release.releaseId),
      EVIDENCE_KINDS,
    );
    evidence = recorded.filter((event): event is { releaseId: string; kind: typeof EVIDENCE_KINDS[number] } =>
      event.kind === "notice_observed" || event.kind === "activation_observed",
    );
  } catch {
    evidence = null;
  }

  try {
    await buildPolicyReleaseState({ runtime, nowMs, holds, evidence });
  } catch {
    return recordRunFailure(500, "POLICY_RELEASE_UNAVAILABLE");
  }

  const fetchWp = dependencies.fetchWp ?? fetch;
  let origin: string;
  let wpState: WpState;
  try {
    origin = getWpOrigin((dependencies.getWpBaseUrl ?? wpApiUri)());
    const stateResponse = await fetchWp(`${origin}/wp-json/amu/v1/policy-releases/state`, {
      method: "GET",
      cache: "no-store",
      signal: AbortSignal.timeout(20_000),
    });
    if (!stateResponse.ok) return recordRunFailure(502, "WP_UNREACHABLE");
    const parsedState = parseWpState(await stateResponse.json());
    if (!parsedState) return recordRunFailure(502, "WP_UNREACHABLE");
    wpState = parsedState;
  } catch {
    return recordRunFailure(502, "WP_UNREACHABLE");
  }

  const record = async (event: PolicyReleaseEventInput) => {
    try {
      return await recordEvent(event);
    } catch {
      return recordRunFailure(500, "POLICY_RELEASE_VERIFICATION_FAILED");
    }
  };
  const revisionMismatch = wpState.manifestRevision !== manifest.manifestRevision;

  if (input.mode === "deploy") {
    if (revisionMismatch) {
      await record({
        eventKey: `${input.runId}:-:mismatch`,
        releaseId: "-",
        policyId: "-",
        kind: "mismatch",
        manifestRevision: manifest.manifestRevision,
        observedAt,
        outcome: "mismatch",
        detail: "revision",
        runId: input.runId,
        actor: "system:policy-release-cron",
      });
      notify({ kind: "revision_mismatch", runId: input.runId, detail: "revision" });
      return { compared: 1, onceRecorded: 0, mismatches: 1, holdsSet: 0, warnings: 0 };
    }

    let onceRecorded = 0;
    const wpRestEntries = entriesFromWpState(wpState);
    for (const entry of nodeEntries) {
      const result = await record({
        eventKey: `${entry.releaseId}:deployed_observed`,
        releaseId: entry.releaseId,
        policyId: entry.policyId,
        kind: "deployed_observed",
        manifestRevision: manifest.manifestRevision,
        observedAt,
        outcome: "ok",
        observed: makeObserved(entry, wpRestEntries.find((wpEntry) => wpEntry.releaseId === entry.releaseId)),
        runId: input.runId,
        actor: "system:policy-release-cron",
      });
      if (result.inserted) onceRecorded += 1;
    }
    return { compared: 1, onceRecorded, mismatches: 0, holdsSet: 0, warnings: 0 };
  }

  let publicOrigin: string | null = null;
  try {
    const parsedOrigin = new URL((dependencies.getPublicOrigin ?? (() => POLICY_RELEASE_PUBLIC_WP_ORIGIN))());
    if (parsedOrigin.protocol === "https:") publicOrigin = parsedOrigin.origin;
  } catch {
    // Missing or malformed public origin is reported below as a sanitized configuration failure.
  }
  if (!publicOrigin) return recordRunFailure(503, "PUBLIC_ORIGIN_NOT_CONFIGURED");

  const publicResults = await Promise.all(POLICY_IDS.map(async (policyId) => {
    try {
      const slug = manifest.policies[policyId].aliases.wpSlug;
      const url = `${publicOrigin}/${encodeURIComponent(slug)}/`;
      const response = await fetchWp(url, {
        method: "GET",
        cache: "no-store",
        redirect: "manual",
        headers: { "Cache-Control": "no-cache" },
        signal: AbortSignal.timeout(20_000),
      });
      if (response.status !== 200) return null;
      return { policyId, httpStatus: response.status, html: await response.text() };
    } catch {
      return null;
    }
  }));
  if (publicResults.some((result) => result === null)) return recordRunFailure(502, "WP_PUBLIC_UNREACHABLE");

  const wpRestEntries = entriesFromWpState(wpState);
  const publicMarkers = publicResults.flatMap((result) => parsePublicMarkers(result!.html, result!.httpStatus));
  const publicEntries = publicMarkers.filter((marker) => !marker.history && (marker.role === "active" || marker.role === "announced"));
  const nodeById = new Map(nodeEntries.map((entry) => [entry.releaseId, entry]));
  const restById = new Map(wpRestEntries.map((entry) => [entry.releaseId, entry]));
  const publicById = new Map(publicEntries.map((entry) => [entry.releaseId, entry]));
  const releaseById = new Map(POLICY_IDS.flatMap((policyId) => manifest.policies[policyId].releases.map((release) => [release.releaseId, { policyId, release }] as const)));
  let compared = 0;
  let onceRecorded = 0;
  let mismatches = 0;
  let holdsSet = 0;
  let warnings = 0;

  const recordMismatch = async (args: {
    releaseId: string;
    policyId: ManifestPolicyId | "-";
    detail: string;
    node?: ReleaseEntry;
    wpRest?: ReleaseEntry;
    wpPublic?: PublicMarker;
    setHold: boolean;
  }) => {
    await record({
      eventKey: `${input.runId}:${args.releaseId}:mismatch`,
      releaseId: args.releaseId,
      policyId: args.policyId,
      kind: "mismatch",
      manifestRevision: manifest.manifestRevision,
      observedAt,
      observed: makeObserved(args.node, args.wpRest, args.wpPublic),
      outcome: "mismatch",
      detail: args.detail.slice(0, 500),
      runId: input.runId,
      actor: "system:policy-release-cron",
    });
    if (args.setHold && args.policyId !== "-") {
      let result: { changed: boolean };
      try {
        result = await setHold({
          releaseId: args.releaseId,
          policyId: args.policyId,
          reason: `mismatch:${args.detail}`,
          setBy: "system:policy-release-cron",
          runId: input.runId,
          manifestRevision: manifest.manifestRevision,
        });
      } catch {
        return recordRunFailure(500, "POLICY_RELEASE_VERIFICATION_FAILED");
      }
      if (result.changed) {
        holdsSet += 1;
        notify({ kind: "hold_set", runId: input.runId, releaseId: args.releaseId, detail: args.detail });
      }
    }
    notify({ kind: "mismatch", runId: input.runId, releaseId: args.releaseId, detail: args.detail });
    mismatches += 1;
  };

  for (const nodeEntry of nodeEntries) {
    compared += 1;
    const wpRestEntry = restById.get(nodeEntry.releaseId);
    const wpPublicEntry = publicById.get(nodeEntry.releaseId);
    const details = mismatchDetails(nodeEntry, wpRestEntry, wpPublicEntry);
    if (details.length > 0) {
      await recordMismatch({
        releaseId: nodeEntry.releaseId,
        policyId: nodeEntry.policyId,
        detail: details.join(","),
        node: nodeEntry,
        wpRest: wpRestEntry,
        wpPublic: wpPublicEntry,
        setHold: true,
      });
      continue;
    }

    const release = releaseById.get(nodeEntry.releaseId)?.release;
    if (!release) return recordRunFailure(500, "POLICY_RELEASE_UNAVAILABLE");
    const kind = nodeEntry.role === "announced" ? "notice_observed" : "activation_observed";
    const alreadyRecorded = evidence?.some((event) => event.releaseId === nodeEntry.releaseId && event.kind === kind);
    const event = await record({
      eventKey: `${nodeEntry.releaseId}:${kind}`,
      releaseId: nodeEntry.releaseId,
      policyId: nodeEntry.policyId,
      kind,
      manifestRevision: manifest.manifestRevision,
      expectedAt: new Date(kind === "notice_observed" ? release.noticeAtMs : release.effectiveAtMs),
      observedAt,
      lagMs: nowMs - (kind === "notice_observed" ? release.noticeAtMs : release.effectiveAtMs),
      observed: makeObserved(nodeEntry, wpRestEntry, wpPublicEntry),
      outcome: "ok",
      runId: input.runId,
      actor: "system:policy-release-cron",
    });
    if (event.inserted) onceRecorded += 1;
    if (alreadyRecorded && event.inserted) return recordRunFailure(500, "POLICY_RELEASE_EVENT_INCONSISTENT");
  }

  const wpOnly = new Map<string, { policyId: ManifestPolicyId; wpRest?: ReleaseEntry; wpPublic?: PublicMarker }>();
  for (const entry of wpRestEntries) {
    if (!nodeById.has(entry.releaseId)) wpOnly.set(entry.releaseId, { policyId: entry.policyId, wpRest: entry });
  }
  for (const entry of publicEntries) {
    if (!nodeById.has(entry.releaseId)) {
      const current = wpOnly.get(entry.releaseId) ?? { policyId: entry.policyId };
      wpOnly.set(entry.releaseId, { ...current, wpPublic: entry });
    }
  }
  for (const [releaseId, extra] of wpOnly) {
    await recordMismatch({
      releaseId,
      policyId: extra.policyId,
      detail: "wp_only_release",
      wpRest: extra.wpRest,
      wpPublic: extra.wpPublic,
      setHold: false,
    });
  }

  const expectedHistory = POLICY_IDS.flatMap((policyId) => manifest.policies[policyId].releases
    .filter((release) => release.status !== "cancelled" && release.effectiveAtMs <= nowMs && !nodeById.has(release.releaseId))
    .map((release) => release.releaseId));
  const historyMarkers = publicMarkers.filter((marker) => marker.history);
  const historyById = new Map(historyMarkers.map((marker) => [marker.releaseId, marker]));
  for (const releaseId of expectedHistory) {
    if (!historyById.has(releaseId)) warnings += 1;
  }
  for (const marker of historyMarkers) {
    const known = releaseById.get(marker.releaseId);
    if (!known || known.release.status === "cancelled" || known.release.effectiveAtMs > nowMs || marker.sha !== known.release.contentSha256) {
      const nodeEntry = nodeById.get(marker.releaseId);
      await recordMismatch({
        releaseId: marker.releaseId,
        policyId: known?.policyId ?? marker.policyId,
        detail: !known || known.release.status === "cancelled" ? "history_ineligible" :
          known.release.effectiveAtMs > nowMs ? "history_future" : "history_sha",
        node: nodeEntry,
        wpPublic: marker,
        setHold: Boolean(nodeEntry),
      });
    }
  }

  const allReleaseSetsMatch = nodeEntries.length === wpRestEntries.length &&
    nodeEntries.length === publicEntries.length &&
    nodeEntries.every((entry) => {
      const restEntry = restById.get(entry.releaseId);
      const publicEntry = publicById.get(entry.releaseId);
      return restEntry?.sha === entry.sha && restEntry.role === entry.role &&
        publicEntry?.sha === entry.sha && publicEntry.role === entry.role;
    });
  const publicRevisionMismatch = publicEntries.some((entry) => {
    const marker = publicById.get(entry.releaseId) as (PublicMarker | undefined);
    return marker?.manifestRevision !== manifest.manifestRevision;
  });
  if (revisionMismatch || publicRevisionMismatch) {
    if (allReleaseSetsMatch && mismatches === 0) {
      await record({
        eventKey: `${input.runId}:-:mismatch`,
        releaseId: "-",
        policyId: "-",
        kind: "mismatch",
        manifestRevision: manifest.manifestRevision,
        observedAt,
        outcome: "mismatch",
        detail: "revision",
        runId: input.runId,
        actor: "system:policy-release-cron",
      });
      notify({ kind: "revision_mismatch", runId: input.runId, detail: "revision" });
      mismatches += 1;
    }
  }

  return { compared, onceRecorded, mismatches, holdsSet, warnings };
}

export async function runPolicyReleaseVerification(
  input: PolicyReleaseVerificationInput,
  dependencies: PolicyReleaseVerificationDependencies = {},
): Promise<PolicyReleaseVerificationSummary> {
  try {
    return await runPolicyReleaseVerificationInternal(input, dependencies);
  } catch (error) {
    if (error instanceof PolicyReleaseVerificationError) throw error;
    const runtime = dependencies.runtime ?? getPolicyReleaseRuntime();
    const now = dependencies.now ?? (() => new Date());
    try {
      await (dependencies.recordEvent ?? recordPolicyReleaseEvent)({
        eventKey: `${input.runId}#${input.attempt}:-:run_failed`,
        releaseId: "-",
        policyId: "-",
        kind: "run_failed",
        manifestRevision: runtime.mode === "manifest" ? runtime.manifest.manifestRevision : null,
        observedAt: now(),
        outcome: "failed",
        errorCode: "POLICY_RELEASE_VERIFICATION_FAILED",
        runId: input.runId,
        actor: "system:policy-release-cron",
      });
    } catch {
      // 실패 이벤트 저장이 불가능해도 경보 로그는 남긴다.
    }
    (dependencies.notify ?? notifyOps)({
      kind: "run_failed",
      runId: input.runId,
      errorCode: "POLICY_RELEASE_VERIFICATION_FAILED",
    });
    throw new PolicyReleaseVerificationError(500, "POLICY_RELEASE_VERIFICATION_FAILED");
  }
}
