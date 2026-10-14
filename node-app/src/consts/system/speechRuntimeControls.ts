/**
 * @docHint
 * @purpose EL-202 speech 런타임 운영 제어(kill switch·provider 활성·preset·voice allowlist·budget) 정의
 * @process 기본값 선언  저장값 정규화  코드 정책 상한 적용
 * @domain system-control
 * @scope shared
 */

import { listSpeechModelPolicies, SPEECH_CATALOG_PROVIDER_TYPES, type SpeechCatalogProviderType } from "consts/ai";
import {
  SPEECH_RUNTIME_MANIFEST,
  type SpeechBudgetRole,
  type SpeechManifestBudgetOwner,
  type SpeechRuntimeManifest,
} from "consts/ai/speechRuntimeManifest";

export const SPEECH_RUNTIME_CONTROLS_SETTING_KEY = "speech.runtime-controls.v1";

export const SPEECH_QUALITY_PRESETS = ["quality", "fast"] as const;
export type SpeechQualityPresetType = (typeof SPEECH_QUALITY_PRESETS)[number];

export type SpeechBudgetLimits = {
  /** null은 "미확정"이다. 0(무료·차단)과 구분한다. 실제 수치는 EL-204/EL-403 계측 후 확정한다. */
  perRequestUsdCap: number | null;
  dailyUsdCap: number | null;
  monthlyUsdCap: number | null;
};

export type SpeechConcurrencyLimits = {
  /** null은 "미확정". 강제는 EL-204가 소유한다. */
  perUserConcurrent: number | null;
  globalConcurrent: number | null;
};

/**
 * TUTORS-192 — Tutors OpenAI STT 활성화 정책(서버 설정).
 *
 * 기본은 전부 닫힘이다. 운영 개방은 사용자 게이트(정책 게시·미성년 보호·양의 예산·유료 smoke)에서
 * 이 값을 채운 뒤에만 일어난다. provider는 openai로 고정하며 DB가 바꿀 수 없다.
 */
/**
 * EL-204 budget owner 축. EL-004가 채택한 "서비스별 budget owner 분리"를 코드 상수로 고정한다.
 *
 * Gen Studio 자산 출처(STUDIO_GENERATION_SOURCE_SERVICE_VALUES)와 의도적으로 분리했다 —
 * 그쪽은 "이 자산을 누가 만들었나"이고 이쪽은 "이 지출을 누가 책임지나"다. 축이 겹쳐 보이지만
 * 같은 값이 아니며, 하나로 합치면 예산 책임이 자산 출처에 끌려다닌다.
 */
export const SPEECH_BUDGET_OWNERS = ["magazine", "tutors", "play", "internal"] as const;
export type SpeechBudgetOwnerType = (typeof SPEECH_BUDGET_OWNERS)[number];

/** manifest가 예산을 강제하도록 지정한 provider 목록. */
export const SPEECH_BUDGET_REQUIRED_PROVIDERS: readonly SpeechCatalogProviderType[] = Object.freeze(
  Object.keys(SPEECH_RUNTIME_MANIFEST.budgetEnforcement).sort() as SpeechCatalogProviderType[],
);

export function isSpeechBudgetOwner(value: unknown): value is SpeechBudgetOwnerType {
  return (SPEECH_BUDGET_OWNERS as readonly string[]).includes(String(value || "").trim().toLowerCase());
}

export function isRetiredSpeechBudgetOwner(
  owner: string | undefined,
  manifest: SpeechRuntimeManifest = SPEECH_RUNTIME_MANIFEST,
): boolean {
  if (!owner || !isSpeechBudgetOwner(owner)) return false;
  return !Object.hasOwn(manifest.budgetByOwner, String(owner).trim().toLowerCase());
}

export function isSpeechBudgetEnforced(
  provider: string,
  owner: string | undefined,
  manifest: SpeechRuntimeManifest,
  role: SpeechBudgetRole,
): boolean {
  if (isRetiredSpeechBudgetOwner(owner, manifest)) return true;

  const normalizedProvider = String(provider || "").trim().toLowerCase();
  const enforcedOwners = manifest.budgetEnforcement[normalizedProvider];
  if (!enforcedOwners) return false;
  const roleScope = manifest.budgetRoleScope[normalizedProvider];
  if (roleScope) {
    if (!roleScope.roles.includes(role)) return false;
    if (!owner || !isSpeechBudgetOwner(owner)) return false;
    return enforcedOwners.includes(String(owner).trim().toLowerCase() as SpeechManifestBudgetOwner);
  }
  if (!owner || !isSpeechBudgetOwner(owner)) return true;
  return enforcedOwners.includes(String(owner).trim().toLowerCase() as SpeechManifestBudgetOwner);
}

export type SpeechRuntimeControls = {
  /** true면 provider 활성 여부와 무관하게 모든 speech provider 호출을 차단한다. */
  killSwitch: boolean;
  providerEnabled: Record<SpeechCatalogProviderType, boolean>;
  preset: SpeechQualityPresetType;
  /**
   * 빈 배열은 "추가 허용 없음"이며 코드 승인 목록(OPENAI_APPROVED_VOICE_CATALOG 등)만 통과한다.
   * 이 목록은 코드 승인 목록을 대체하지 않고 그 안에서 더 좁히는 용도로만 해석한다.
   */
  voiceAllowlist: string[];
  /** 조직 전체 상한. owner 배분과 무관하게 항상 함께 적용된다. */
  budget: SpeechBudgetLimits;
  /**
   * owner별 상한. **조직 상한을 대체하지 않고 그 안에서 더 좁힌다.**
   * 배분 합계가 조직 상한과 일치할 의무는 없다 — 의도적으로 남기는 여유가 있을 수 있다.
   */
  budgetByOwner: Record<SpeechBudgetOwnerType, SpeechBudgetLimits>;
  concurrency: SpeechConcurrencyLimits;
};

/**
 * 코드 정책 상한 — provider가 실제 라우팅 가능한 모델을 하나라도 갖고 있어야 활성 후보다.
 * DB는 이 값을 **끌 수만 있고 켤 수 없다**. 기존 모델 카탈로그의 capability 계약과 같은 사상이다.
 */
export const SPEECH_PROVIDER_ROUTABLE: Record<SpeechCatalogProviderType, boolean> = Object.fromEntries(
  SPEECH_CATALOG_PROVIDER_TYPES.map((provider) => [
    provider,
    listSpeechModelPolicies().some((policy) => policy.provider === provider && policy.routable),
  ]),
) as Record<SpeechCatalogProviderType, boolean>;

export const DEFAULT_SPEECH_RUNTIME_CONTROLS: SpeechRuntimeControls = {
  killSwitch: false,
  providerEnabled: { ...SPEECH_PROVIDER_ROUTABLE },
  preset: "quality",
  voiceAllowlist: [],
  budget: { perRequestUsdCap: null, dailyUsdCap: null, monthlyUsdCap: null },
  // 전부 null(미확정)로 시작한다. 0(차단)과 구분되며, 수치는 사용자 승인 후 들어오는 configuration이다.
  budgetByOwner: Object.fromEntries(
    SPEECH_BUDGET_OWNERS.map((owner) => [owner, { perRequestUsdCap: null, dailyUsdCap: null, monthlyUsdCap: null }]),
  ) as Record<SpeechBudgetOwnerType, SpeechBudgetLimits>,
  concurrency: { perUserConcurrent: null, globalConcurrent: null },
};

export function isSpeechCatalogProvider(value: unknown): value is SpeechCatalogProviderType {
  return (SPEECH_CATALOG_PROVIDER_TYPES as readonly string[]).includes(String(value || "").trim().toLowerCase());
}

/** 음수·NaN·Infinity를 상한으로 받아들이지 않는다. 알 수 없으면 null(미확정)이다. */
function normalizeCap(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const num = Number(value);
  if (!Number.isFinite(num) || num < 0) return null;
  return num;
}

function normalizeIntCap(value: unknown): number | null {
  const num = normalizeCap(value);
  if (num === null) return null;
  return Math.floor(num);
}

function normalizeBudgetLimits(stored: Partial<SpeechBudgetLimits> | undefined | null): SpeechBudgetLimits {
  return {
    perRequestUsdCap: normalizeCap(stored?.perRequestUsdCap),
    dailyUsdCap: normalizeCap(stored?.dailyUsdCap),
    monthlyUsdCap: normalizeCap(stored?.monthlyUsdCap),
  };
}

/**
 * 저장값은 신뢰할 수 없는 입력으로 취급한다.
 * - killSwitch는 켜는 방향만 신뢰한다(값이 없으면 코드 기본값).
 * - providerEnabled는 코드 정책(SPEECH_PROVIDER_ROUTABLE)을 상한으로 AND 결합한다.
 *   미검증 provider는 저장값이 true여도 활성화되지 않는다.
 */
export function normalizeStoredSpeechRuntimeControls(
  stored?: Partial<SpeechRuntimeControls> | null,
): SpeechRuntimeControls {
  const providerEnabled = { ...DEFAULT_SPEECH_RUNTIME_CONTROLS.providerEnabled };
  for (const provider of SPEECH_CATALOG_PROVIDER_TYPES) {
    const requested = stored?.providerEnabled?.[provider];
    const resolved = typeof requested === "boolean" ? requested : DEFAULT_SPEECH_RUNTIME_CONTROLS.providerEnabled[provider];
    providerEnabled[provider] = resolved && SPEECH_PROVIDER_ROUTABLE[provider];
  }

  const preset = (SPEECH_QUALITY_PRESETS as readonly string[]).includes(String(stored?.preset || ""))
    ? (stored?.preset as SpeechQualityPresetType)
    : DEFAULT_SPEECH_RUNTIME_CONTROLS.preset;

  const voiceAllowlist = Array.isArray(stored?.voiceAllowlist)
    ? Array.from(
        new Set(
          stored.voiceAllowlist
            // voiceId는 대소문자를 보존한다(ADR-EL-001 D3). trim만 한다.
            .map((voiceId) => String(voiceId || "").trim())
            .filter(Boolean),
        ),
      )
    : [];

  return {
    killSwitch: typeof stored?.killSwitch === "boolean" ? stored.killSwitch : DEFAULT_SPEECH_RUNTIME_CONTROLS.killSwitch,
    providerEnabled,
    preset,
    voiceAllowlist,
    budget: normalizeBudgetLimits(stored?.budget),
    budgetByOwner: Object.fromEntries(
      SPEECH_BUDGET_OWNERS.map((owner) => [owner, normalizeBudgetLimits(stored?.budgetByOwner?.[owner])]),
    ) as Record<SpeechBudgetOwnerType, SpeechBudgetLimits>,
    concurrency: {
      perUserConcurrent: normalizeIntCap(stored?.concurrency?.perUserConcurrent),
      globalConcurrent: normalizeIntCap(stored?.concurrency?.globalConcurrent),
    },
  };
}

function applyManifestCap(dbValue: number | null, manifestValue: number | null): number | null {
  if (manifestValue === null) return dbValue === 0 ? 0 : null;
  if (dbValue === null) return manifestValue;
  return Math.min(dbValue, manifestValue);
}

export function applySpeechRuntimeManifest(
  stored: SpeechRuntimeControls,
  manifest: SpeechRuntimeManifest = SPEECH_RUNTIME_MANIFEST,
): SpeechRuntimeControls {
  const budgetByOwner = Object.fromEntries(
    SPEECH_BUDGET_OWNERS.map((owner) => {
      if (!Object.hasOwn(manifest.budgetByOwner, owner)) {
        return [owner, { perRequestUsdCap: 0, dailyUsdCap: 0, monthlyUsdCap: 0 }];
      }
      const limits = manifest.budgetByOwner[owner as SpeechManifestBudgetOwner];
      return [
        owner,
        {
          perRequestUsdCap: applyManifestCap(stored.budgetByOwner[owner].perRequestUsdCap, limits.perRequestUsdCap),
          dailyUsdCap: applyManifestCap(stored.budgetByOwner[owner].dailyUsdCap, limits.dailyUsdCap),
          monthlyUsdCap: applyManifestCap(stored.budgetByOwner[owner].monthlyUsdCap, limits.monthlyUsdCap),
        },
      ];
    }),
  ) as Record<SpeechBudgetOwnerType, SpeechBudgetLimits>;

  return {
    ...stored,
    budget: {
      perRequestUsdCap: applyManifestCap(stored.budget.perRequestUsdCap, manifest.budget.perRequestUsdCap),
      dailyUsdCap: applyManifestCap(stored.budget.dailyUsdCap, manifest.budget.dailyUsdCap),
      monthlyUsdCap: applyManifestCap(stored.budget.monthlyUsdCap, manifest.budget.monthlyUsdCap),
    },
    budgetByOwner,
    concurrency: {
      perUserConcurrent: applyManifestCap(
        stored.concurrency.perUserConcurrent,
        manifest.concurrency.perUserConcurrent,
      ),
      globalConcurrent: applyManifestCap(stored.concurrency.globalConcurrent, manifest.concurrency.globalConcurrent),
    },
  };
}

export function normalizeSpeechRuntimeControls(
  stored?: Partial<SpeechRuntimeControls> | null,
  manifest: SpeechRuntimeManifest = SPEECH_RUNTIME_MANIFEST,
): SpeechRuntimeControls {
  return applySpeechRuntimeManifest(normalizeStoredSpeechRuntimeControls(stored), manifest);
}

export const SPEECH_PROVIDER_BLOCK_REASON_CODES = [
  "kill_switch",
  "provider_disabled",
  "provider_not_routable",
] as const;
export type SpeechProviderBlockReasonCodeType = (typeof SPEECH_PROVIDER_BLOCK_REASON_CODES)[number];

/** provider 호출 허용 판정. 차단 사유를 구분해 돌려준다(운영 중 원인 파악용). */
export function resolveSpeechProviderBlock(
  controls: SpeechRuntimeControls,
  provider: string,
): SpeechProviderBlockReasonCodeType | undefined {
  if (controls.killSwitch) return "kill_switch";
  if (!isSpeechCatalogProvider(provider)) return "provider_not_routable";
  const normalized = String(provider).trim().toLowerCase() as SpeechCatalogProviderType;
  if (!SPEECH_PROVIDER_ROUTABLE[normalized]) return "provider_not_routable";
  if (!controls.providerEnabled[normalized]) return "provider_disabled";
  return undefined;
}

/**
 * ---------------------------------------------------------------------------
 * EL-204 — budget 판정 계약
 *
 * **숫자는 configuration이고 이 판정 규칙이 contract다.** 상한값은 서비스가 늘어날 때마다
 * 다시 산출·승인되지만(EL-004), 아래 우선순위와 fail-closed 방향은 그대로 유지된다.
 *
 * 세 상태를 끝까지 구분한다.
 *   null   미확정 — 아직 정하지 않았다
 *   0      차단   — 이 owner는 이 provider를 쓰지 않기로 정했다
 *   n > 0  상한   — n까지 허용한다
 *
 * `null`을 0으로 뭉개면 미확정이 조용히 차단이 되고, 0을 null로 뭉개면 차단이 조용히 풀린다.
 * 두 사고 방향이 반대라 하나로 합칠 수 없다.
 * ---------------------------------------------------------------------------
 */

export const SPEECH_BUDGET_BLOCK_REASON_CODES = [
  "budget_owner_unknown",
  "budget_estimate_invalid",
  "budget_owner_disabled",
  "budget_unconfigured",
  "budget_usage_unavailable",
  "per_request_cap_exceeded",
  "owner_daily_cap_exceeded",
  "owner_monthly_cap_exceeded",
  "global_daily_cap_exceeded",
  "global_monthly_cap_exceeded",
] as const;
export type SpeechBudgetBlockReasonCodeType = (typeof SPEECH_BUDGET_BLOCK_REASON_CODES)[number];

/** 누적 사용액 스냅샷. `null`은 "집계를 확인하지 못했다"이며 0(쓴 적 없음)과 구분한다. */
export type SpeechBudgetUsageSnapshot = {
  spentTodayUsd: number | null;
  spentThisMonthUsd: number | null;
};

/** 상한이 하나라도 미확정이면 true. 강제 대상 provider에서는 이것만으로 차단 사유가 된다. */
function hasUndeterminedCap(limits: SpeechBudgetLimits) {
  return limits.perRequestUsdCap === null || limits.dailyUsdCap === null || limits.monthlyUsdCap === null;
}

function exceeds(spent: number, estimated: number, cap: number | null) {
  if (cap === null) return false;
  return spent + estimated > cap;
}

/**
 * 호출 전 budget 판정. 차단이면 사유 코드를, 통과면 `undefined`를 돌려준다.
 *
 * 판정 순서에 의미가 있다 — 운영자가 원인을 하나로 읽을 수 있어야 한다.
 *   1) owner를 모른다            → 어떤 예산에 달아야 할지 모르므로 통과시키지 않는다
 *   2) 견적이 수치가 아니다       → 모르는 금액을 통과시키지 않는다
 *   3) owner가 0으로 차단됐다     → 견적이 0이어도 차단이다. "안 쓰기로 했다"는 선언이 우선한다
 *   4) 강제 대상인데 미확정이다   → fail-closed
 *   5) 강제 대상인데 집계가 없다  → fail-closed. 얼마 썼는지 모르면 더 못 쓴다
 *   6) 건당 → owner 일/월 → 조직 일/월
 *
 * 강제 대상이 아닌 provider(현재 openai)는 `null` 상한을 "강제하지 않음"으로 읽는다.
 * 상한을 넣지 않은 기존 운영 경로의 동작을 바꾸지 않기 위해서다.
 */
export function resolveSpeechBudgetBlock(args: {
  controls: SpeechRuntimeControls;
  provider: string;
  owner: string;
  role: SpeechBudgetRole;
  estimatedUsd: number;
  ownerUsage?: SpeechBudgetUsageSnapshot;
  globalUsage?: SpeechBudgetUsageSnapshot;
  manifest?: SpeechRuntimeManifest;
}): SpeechBudgetBlockReasonCodeType | undefined {
  if (!isSpeechBudgetOwner(args.owner)) return "budget_owner_unknown";
  const owner = String(args.owner).trim().toLowerCase() as SpeechBudgetOwnerType;

  const estimated = Number(args.estimatedUsd);
  if (!Number.isFinite(estimated) || estimated < 0) return "budget_estimate_invalid";

  const manifest = args.manifest || SPEECH_RUNTIME_MANIFEST;
  const normalizedProvider = String(args.provider || "").trim().toLowerCase();
  const roleScope = manifest.budgetRoleScope[normalizedProvider];
  const useRoleScope = Boolean(roleScope?.roles.includes(args.role));
  const roleOwnerLimits = roleScope?.byOwner[owner as SpeechManifestBudgetOwner];
  const ownerLimits = useRoleScope
    ? {
        perRequestUsdCap: applyManifestCap(args.controls.budgetByOwner[owner].perRequestUsdCap, roleOwnerLimits?.perRequestUsdCap ?? null),
        dailyUsdCap: applyManifestCap(args.controls.budgetByOwner[owner].dailyUsdCap, roleOwnerLimits?.dailyUsdCap ?? null),
        monthlyUsdCap: applyManifestCap(args.controls.budgetByOwner[owner].monthlyUsdCap, roleOwnerLimits?.monthlyUsdCap ?? null),
      }
    : args.controls.budgetByOwner[owner];
  const globalLimits = useRoleScope
    ? {
        perRequestUsdCap: applyManifestCap(args.controls.budget.perRequestUsdCap, roleScope!.global.perRequestUsdCap),
        dailyUsdCap: applyManifestCap(args.controls.budget.dailyUsdCap, roleScope!.global.dailyUsdCap),
        monthlyUsdCap: applyManifestCap(args.controls.budget.monthlyUsdCap, roleScope!.global.monthlyUsdCap),
      }
    : args.controls.budget;
  const enforced = isSpeechBudgetEnforced(args.provider, owner, manifest, args.role);

  // 0은 "이 owner는 이 provider를 쓰지 않는다"는 선언이다. 견적 0(캐시 hit 등)도 통과시키지 않는다.
  if (ownerLimits.monthlyUsdCap === 0 || ownerLimits.dailyUsdCap === 0 || ownerLimits.perRequestUsdCap === 0) {
    return "budget_owner_disabled";
  }

  if (enforced && (hasUndeterminedCap(ownerLimits) || hasUndeterminedCap(globalLimits))) {
    return "budget_unconfigured";
  }

  // 건당 상한은 누적과 무관하다. owner 상한이 있으면 그쪽이 좁고, 없으면 조직 상한을 본다.
  const perRequestCap = ownerLimits.perRequestUsdCap ?? globalLimits.perRequestUsdCap;
  if (perRequestCap !== null && estimated > perRequestCap) return "per_request_cap_exceeded";

  const ownerUsage = args.ownerUsage;
  const globalUsage = args.globalUsage;
  if (enforced) {
    const unavailable =
      !ownerUsage ||
      !globalUsage ||
      ownerUsage.spentTodayUsd === null ||
      ownerUsage.spentThisMonthUsd === null ||
      globalUsage.spentTodayUsd === null ||
      globalUsage.spentThisMonthUsd === null;
    if (unavailable) return "budget_usage_unavailable";
  }

  if (exceeds(ownerUsage?.spentTodayUsd ?? 0, estimated, ownerLimits.dailyUsdCap)) {
    return "owner_daily_cap_exceeded";
  }
  if (exceeds(ownerUsage?.spentThisMonthUsd ?? 0, estimated, ownerLimits.monthlyUsdCap)) {
    return "owner_monthly_cap_exceeded";
  }
  if (exceeds(globalUsage?.spentTodayUsd ?? 0, estimated, globalLimits.dailyUsdCap)) {
    return "global_daily_cap_exceeded";
  }
  if (exceeds(globalUsage?.spentThisMonthUsd ?? 0, estimated, globalLimits.monthlyUsdCap)) {
    return "global_monthly_cap_exceeded";
  }

  return undefined;
}
