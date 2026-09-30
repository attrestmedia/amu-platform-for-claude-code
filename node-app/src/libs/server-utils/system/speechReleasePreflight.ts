/**
 * @docHint
 * @purpose EL-P4 speech 승격 전 정책·DB·runtime readiness 순수 판정
 * @process 조회 결과 검증  차단 사유 수집  승격 가능 여부 반환
 * @domain speech-release
 * @scope shared
 */

import type { SpeechCatalogProviderType, SpeechModelPolicy } from "consts/ai";
import {
  SPEECH_BUDGET_REQUIRED_PROVIDERS,
  type SpeechRuntimeControls,
} from "consts/system/speechRuntimeControls";

export type SpeechReleaseBlockReasonCodeType =
  | "code_policy_missing"
  | "db_entry_missing"
  | "launch_state_mismatch"
  | "routable_without_launch"
  | "enabled_without_routable"
  | "billing_unit_unverified"
  | "voice_allowlist_unapproved"
  | "budget_cap_unset"
  | "kill_switch_on"
  | "manifest_hash_mismatch"
  | "input_unavailable"
  | "voice_disable_scheduled"
  | "voice_notice_period_short"
  | "voice_custom_rate"
  | "voice_tier_unavailable"
  | "voice_terms_stale"
  | "voice_terms_unknown";

export type SpeechReleasePreflightFindingType = {
  reasonCode: SpeechReleaseBlockReasonCodeType;
  provider: string;
  modelName?: string;
  detail: string;
};

export type SpeechReleaseDbCatalogEntry = {
  provider: string;
  modelName: string;
  modality: string;
  enabled: boolean;
  deprecated: boolean;
  launchState: SpeechModelPolicy["launchState"];
};

export type SpeechReleaseVoiceOperationalTerms = {
  voiceId: string;
  noticePeriodDays: number | null;
  disableAt: number | null;
  liveModerationEnabled: boolean | null;
  rate: number | null;
  availableForTiers: readonly string[] | null;
  observedAt: string | null;
};

export type SpeechReleasePreflightInput = {
  provider: SpeechCatalogProviderType;
  codePolicies: readonly SpeechModelPolicy[];
  dbCatalogEntries: readonly SpeechReleaseDbCatalogEntry[] | null;
  runtimeControls: SpeechRuntimeControls | null;
  approvedVoiceIds: readonly string[];
  /** ElevenLabs 운영 조건 조회 결과. null/undefined는 조회 누락으로 fail-closed한다. */
  voiceOperationalTerms?: readonly SpeechReleaseVoiceOperationalTerms[] | null;
  currentPlan?: string | null;
  asOf?: Date | string;
  manifestHash?: { local?: string | null; production?: string | null };
};

export type SpeechReleasePreflightResult = {
  ok: boolean;
  blocking: SpeechReleasePreflightFindingType[];
  warnings: SpeechReleasePreflightFindingType[];
};

function normalizeProvider(provider: string) {
  return String(provider || "").trim().toLowerCase();
}

function normalizeModelName(modelName: string) {
  return String(modelName || "").trim();
}

function sameModel(left: { provider: string; modelName: string }, right: { provider: string; modelName: string }) {
  return (
    normalizeProvider(left.provider) === normalizeProvider(right.provider) &&
    normalizeModelName(left.modelName) === normalizeModelName(right.modelName)
  );
}

function finding(
  reasonCode: SpeechReleaseBlockReasonCodeType,
  provider: string,
  detail: string,
  modelName?: string,
): SpeechReleasePreflightFindingType {
  return { reasonCode, provider, ...(modelName ? { modelName } : {}), detail };
}

function allBudgetCapsUnset(controls: SpeechRuntimeControls) {
  const caps = [
    controls.budget.perRequestUsdCap,
    controls.budget.dailyUsdCap,
    controls.budget.monthlyUsdCap,
    ...Object.values(controls.budgetByOwner).flatMap((limits) => [
      limits.perRequestUsdCap,
      limits.dailyUsdCap,
      limits.monthlyUsdCap,
    ]),
  ];
  return caps.every((cap) => cap === null);
}

function resolveAsOf(input: SpeechReleasePreflightInput) {
  const value = input.asOf ? new Date(input.asOf) : new Date();
  return Number.isFinite(value.getTime()) ? value : new Date();
}

function isStaleObservedAt(observedAt: string | null, asOf: Date) {
  if (!observedAt) return true;
  const observed = new Date(observedAt);
  if (!Number.isFinite(observed.getTime())) return true;
  // 운영 조건은 provider가 바꿀 수 있으므로 월간 동기화보다 긴 관측을 허용하지 않는다.
  const maxAgeMs = 30 * 24 * 60 * 60 * 1000;
  return asOf.getTime() - observed.getTime() > maxAgeMs;
}

/**
 * DB·네트워크 I/O 없이 speech 승격 입력의 정합성만 판정한다.
 * 조회 입력이 없거나 정책·카탈로그·runtime이 서로 어긋난 경우에는 통과시키지 않는다.
 */
export function evaluateSpeechReleasePreflight(
  input: SpeechReleasePreflightInput,
): SpeechReleasePreflightResult {
  const blocking: SpeechReleasePreflightFindingType[] = [];
  const warnings: SpeechReleasePreflightFindingType[] = [];
  const provider = input.provider;
  const providerKey = normalizeProvider(provider);
  const codePolicies = input.codePolicies.filter((policy) => normalizeProvider(policy.provider) === providerKey);

  const missingInputs: string[] = [];
  if (input.dbCatalogEntries === null) missingInputs.push("dbCatalogEntries");
  if (input.runtimeControls === null) missingInputs.push("runtimeControls");
  if (missingInputs.length > 0) {
    blocking.push(
      finding(
        "input_unavailable",
        provider,
        `판정에 필요한 입력이 없습니다: ${missingInputs.join(", ")}`,
      ),
    );
  }

  if (input.dbCatalogEntries !== null) {
    const dbEntries = input.dbCatalogEntries.filter(
      (entry) => entry.modality === "audio" && normalizeProvider(entry.provider) === providerKey,
    );

    for (const dbEntry of dbEntries) {
      const policy = codePolicies.find((candidate) => sameModel(candidate, dbEntry));
      if (!policy) {
        blocking.push(
          finding(
            "code_policy_missing",
            provider,
            `DB audio 카탈로그 ${normalizeModelName(dbEntry.modelName)}에 대응하는 코드 정책이 없습니다.`,
            normalizeModelName(dbEntry.modelName),
          ),
        );
        continue;
      }

      if (policy.launchState !== dbEntry.launchState) {
        blocking.push(
          finding(
            "launch_state_mismatch",
            provider,
            `코드 launchState=${policy.launchState}, DB launchState=${dbEntry.launchState}입니다.`,
            normalizeModelName(policy.modelName),
          ),
        );
      }

      if (policy.routable && (!dbEntry.enabled || dbEntry.launchState === "internal")) {
        blocking.push(
          finding(
            "routable_without_launch",
            provider,
            `코드 routable=true인데 DB enabled=${String(dbEntry.enabled)}, launchState=${dbEntry.launchState}입니다.`,
            normalizeModelName(policy.modelName),
          ),
        );
      }

      if (dbEntry.enabled && !policy.routable) {
        blocking.push(
          finding(
            "enabled_without_routable",
            provider,
            "DB enabled=true인데 코드 정책 routable=false입니다.",
            normalizeModelName(policy.modelName),
          ),
        );
      }
    }

    for (const policy of codePolicies) {
      const dbEntry = dbEntries.find((candidate) => sameModel(candidate, policy));
      if (!dbEntry) {
        blocking.push(
          finding(
            "db_entry_missing",
            provider,
            `코드 정책 ${normalizeModelName(policy.modelName)}에 대응하는 DB audio 카탈로그가 없습니다.`,
            normalizeModelName(policy.modelName),
          ),
        );
      }
    }
  }

  // billingUnit은 실제 라우팅 승격 대상(routable=true)에 대해서만 요구한다.
  for (const policy of codePolicies) {
    if (policy.routable && policy.billingUnit === null) {
      blocking.push(
        finding(
          "billing_unit_unverified",
          provider,
          "승격 대상 모델의 billingUnit이 미확정(null)입니다.",
          normalizeModelName(policy.modelName),
        ),
      );
    }
  }

  if (input.runtimeControls !== null) {
    if (input.runtimeControls.killSwitch) {
      blocking.push(finding("kill_switch_on", provider, "승격 판정 시점에 speech kill switch가 켜져 있습니다."));
    }

    const approvedVoiceIds = new Set(input.approvedVoiceIds);
    for (const voiceId of input.runtimeControls.voiceAllowlist) {
      if (approvedVoiceIds.has(voiceId)) continue;
      blocking.push(
        finding(
          "voice_allowlist_unapproved",
          provider,
          `runtime voice allowlist의 voiceId가 코드 승인 목록에 없습니다: ${voiceId}`,
        ),
      );
    }

    if (
      (SPEECH_BUDGET_REQUIRED_PROVIDERS as readonly string[]).includes(providerKey) &&
      allBudgetCapsUnset(input.runtimeControls)
    ) {
      blocking.push(
        finding(
          "budget_cap_unset",
          provider,
          "강제 budget provider의 조직·owner별 상한이 모두 미확정(null)입니다.",
        ),
      );
    }
  }

  if (providerKey === "elevenlabs") {
    const terms = input.voiceOperationalTerms;
    if (terms == null) {
      blocking.push(
        finding(
          "input_unavailable",
          provider,
          "ElevenLabs Voice 운영 조건 조회 결과가 없습니다.",
        ),
      );
    } else {
      const termsByVoiceId = new Map(terms.map((item) => [String(item.voiceId || "").trim(), item]));
      const asOf = resolveAsOf(input);
      for (const voiceId of input.runtimeControls?.voiceAllowlist || []) {
        const term = termsByVoiceId.get(String(voiceId || "").trim());
        if (!term) {
          blocking.push(
            finding(
              "input_unavailable",
              provider,
              `승인 목록 Voice의 운영 조건이 없습니다: ${voiceId}`,
            ),
          );
          continue;
        }
        const unknownFields = [
          term.noticePeriodDays === null || term.noticePeriodDays === undefined ? "noticePeriodDays" : "",
          term.liveModerationEnabled === null || term.liveModerationEnabled === undefined ? "liveModerationEnabled" : "",
          term.rate === null || term.rate === undefined ? "rate" : "",
          term.availableForTiers === null || term.availableForTiers === undefined ? "availableForTiers" : "",
          term.observedAt === null || term.observedAt === undefined ? "observedAt" : "",
        ].filter(Boolean);
        if (unknownFields.length > 0) {
          blocking.push(
            finding(
              "voice_terms_unknown",
              provider,
              `runtime allowlist Voice의 운영 조건이 미확정입니다: ${unknownFields.join(", ")}`,
              voiceId,
            ),
          );
          continue;
        }
        if (term.disableAt !== null) {
          blocking.push(
            finding(
              "voice_disable_scheduled",
              provider,
              `Voice 중단 예정 시각이 설정돼 있습니다: ${term.disableAt}`,
              voiceId,
            ),
          );
        }
        if (Number(term.noticePeriodDays) < 730) {
          warnings.push(
            finding(
              "voice_notice_period_short",
              provider,
              `Voice notice period가 730일보다 짧습니다: ${term.noticePeriodDays}일`,
              voiceId,
            ),
          );
        }
        if (Number(term.rate) !== 1) {
          blocking.push(
            finding(
              "voice_custom_rate",
              provider,
              `Voice custom rate=${String(term.rate)}로 표준 요율이 아닙니다.`,
              voiceId,
            ),
          );
        }
        const tiers = (term.availableForTiers || []).map((tier) => String(tier || "").trim()).filter(Boolean);
        const currentPlan = String(input.currentPlan || "").trim();
        if (tiers.length > 0 && (!currentPlan || !tiers.includes(currentPlan))) {
          blocking.push(
            finding(
              "voice_tier_unavailable",
              provider,
              `현재 플랜(${currentPlan || "unknown"})이 Voice 허용 등급에 없습니다: ${tiers.join(", ")}`,
              voiceId,
            ),
          );
        }
        if (isStaleObservedAt(term.observedAt, asOf)) {
          warnings.push(
            finding(
              "voice_terms_stale",
              provider,
              `Voice 운영 조건 관측 시각이 오래됐거나 유효하지 않습니다: ${term.observedAt}`,
              voiceId,
            ),
          );
        }
      }
    }
  }

  const localManifestHash = input.manifestHash?.local ?? null;
  const productionManifestHash = input.manifestHash?.production ?? null;
  if (localManifestHash !== null && productionManifestHash !== null) {
    if (localManifestHash !== productionManifestHash) {
      blocking.push(
        finding(
          "manifest_hash_mismatch",
          provider,
          `local manifest hash와 production manifest hash가 다릅니다: ${localManifestHash} !== ${productionManifestHash}`,
        ),
      );
    }
  } else if (localManifestHash !== null || productionManifestHash !== null) {
    warnings.push(
      finding(
        "manifest_hash_mismatch",
        provider,
        "local 또는 production manifest hash가 아직 없어 parity 비교를 보류합니다.",
      ),
    );
  }

  return { ok: blocking.length === 0, blocking, warnings };
}
