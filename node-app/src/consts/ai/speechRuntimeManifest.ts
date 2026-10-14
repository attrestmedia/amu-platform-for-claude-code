/**
 * @docHint
 * @purpose speech 런타임 예산·동시성 정책의 승인 manifest 값 제공
 * @process 생성 manifest 읽기  speech 제어 계약 형태로 투영
 * @domain ai
 * @scope shared
 */

import { AI_MODEL_BUDGETS } from "./generated/modelCatalog.generated";

export type SpeechManifestBudgetOwner = "internal" | "magazine" | "play";

export type SpeechManifestCapLimits = {
  perRequestUsdCap: number | null;
  dailyUsdCap: number | null;
  monthlyUsdCap: number | null;
};

export type SpeechBudgetRole = "speech_stt" | "speech_tts" | "speech_analysis";

export type SpeechBudgetRoleScope = {
  roles: readonly SpeechBudgetRole[];
  global: SpeechManifestCapLimits;
  byOwner: Readonly<Partial<Record<SpeechManifestBudgetOwner, SpeechManifestCapLimits>>>;
};

export type SpeechRuntimeManifest = {
  /** provider → 강제 owner 목록. 목록에 없는 (provider, owner)는 null 상한을 강제하지 않는다. */
  budgetEnforcement: Readonly<Record<string, readonly SpeechManifestBudgetOwner[]>>;
  budget: SpeechManifestCapLimits;
  budgetByOwner: Readonly<Record<SpeechManifestBudgetOwner, SpeechManifestCapLimits>>;
  concurrency: { perUserConcurrent: number | null; globalConcurrent: number | null };
  /** 역할 범위를 선언한 provider만 포함한다. */
  budgetRoleScope: Readonly<Record<string, SpeechBudgetRoleScope>>;
};

const speechBudget = AI_MODEL_BUDGETS.speech;

export const SPEECH_RUNTIME_MANIFEST: Readonly<SpeechRuntimeManifest> = {
  budgetEnforcement: Object.fromEntries(
    speechBudget.enforcement.map(({ provider, owners }) => [provider, owners]),
  ) as Readonly<Record<string, readonly SpeechManifestBudgetOwner[]>>,
  budget: speechBudget.global,
  budgetByOwner: speechBudget.byOwner,
  concurrency: speechBudget.concurrency,
  budgetRoleScope: Object.fromEntries(
    speechBudget.enforcement
      .filter((entry) => "roles" in entry && "limits" in entry)
      .map((entry) => [entry.provider, {
        roles: entry.roles as readonly SpeechBudgetRole[],
        global: entry.limits.global,
        byOwner: entry.limits.byOwner,
      }]),
  ) as Readonly<Record<string, SpeechBudgetRoleScope>>,
};
