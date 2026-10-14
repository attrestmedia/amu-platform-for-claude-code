import fetchClient from "libs/api/fetchClient";
import type { AiCostMonitorReportV1, AiCostMonitorWindowPreset } from "types/ai";
import type { UnknownRecord } from "utils/common/typeUtils";

export type { AiCostMonitorReportV1 } from "types/ai";

export type SystemModelControlClientItem = {
  key: string;
  provider: string;
  modelName: string;
  modality: "audio" | "image" | "text" | "video";
  displayName: string;
  upstreamModelName: string;
  enabled: boolean;
  adminOnly: boolean;
  defaultModel: boolean;
  recommendedModel: boolean;
  supportsImageInput: boolean;
  supportsAudioInput: boolean;
  supportsAudioUnderstanding: boolean;
  supportsReasoningEffort: boolean;
  reasoningEffort: string;
  policyReasoningEffort: string;
  reasoningEffortLevels: string[];
  status: "active" | "deprecated";
  deprecated: boolean;
  catalogSource: "manifest";
  policyDefaultModel: boolean;
  launchState: "internal" | "admin_only" | "public";
  policyLaunchState?: "internal" | "admin_only" | "public";
  overrides: string[];
  invariantViolation?:
    | {
        type: "default_unselectable";
        reasonCode: "default_model_internal" | "default_model_admin_only" | "default_model_deprecated";
      }
    | {
        type: "speech_role_default_unusable";
        reasonCode:
          | "role_default_not_registered"
          | "role_default_role_missing"
          | "role_default_disabled"
          | "role_default_deprecated"
          | "role_default_not_routable";
      };
};

export type SystemControlAuditClientItem = {
  auditId: string;
  requestId: string;
  targetType: "model_catalog" | "pricing_catalog" | "system_flag";
  actionType:
    | "model_enabled_update"
    | "default_model_update"
    | "model_recommendation_update"
    | "model_reasoning_effort_update"
    | "model_admin_only_update"
    | "model_status_update"
    | "model_upsert"
    | "model_delete"
    | "pricing_update"
    | "service_availability_update"
    | "rollback";
  status: "applied" | "rolled_back";
  actorId: string;
  reason: string;
  confirmPolicy?: {
    type: "reason_only" | "confirm_phrase";
    phrase?: string;
  };
  summary: string[];
  rollbackOfAuditId?: string;
  rolledBackAt?: string | null;
  rolledBackBy?: string;
  rolledBackByAuditId?: string;
  createdAt?: string;
  updatedAt?: string;
};

export async function fetchSystemModelControls() {
  const res = await fetchClient.get<{ ok: boolean; models: SystemModelControlClientItem[] }>(
    "/admin/system-controls/models",
    { responseType: "json" },
  );
  return res.data.models || [];
}

export async function fetchSystemControlHistory(limit = 20) {
  const res = await fetchClient.get<{ ok: boolean; audits: SystemControlAuditClientItem[] }>(
    "/admin/system-controls/history",
    {
      params: { limit },
      responseType: "json",
    },
  );
  return res.data.audits || [];
}

export type SystemPricingSummary = {
  totalEntries: number;
  tokenEntries: number;
  fixedEntries: number;
  fallbackEntries: number;
  dbEntries: number;
};

export type SystemPricingPreviewResult = {
  billingKey: string;
  billingStrategy: "fixed" | "token" | "hybrid";
  coins: number;
  breakdown: UnknownRecord;
  tokenPricing: { input: number; output: number } | null;
  fixedPricing: { perSecond?: number; perMinute?: number; perImage?: number; perVideo?: number } | null;
  tokenPricingSource: "manifest" | null;
  fixedPricingSource: "manifest" | null;
};

export async function fetchSystemPricingSummary() {
  const res = await fetchClient.get<{ ok: boolean; summary: SystemPricingSummary }>("/admin/system-controls/pricing", {
    responseType: "json",
  });
  return (
    res.data.summary || {
      totalEntries: 0,
      tokenEntries: 0,
      fixedEntries: 0,
      fallbackEntries: 0,
      dbEntries: 0,
    }
  );
}

export async function previewSystemPricing(args: {
  provider: string;
  modelName: string;
  modality: "image" | "text" | "audio";
  variant?: string;
  usage?: UnknownRecord;
  fixed?: UnknownRecord;
}) {
  const res = await fetchClient.post<{ ok: boolean; preview: SystemPricingPreviewResult }>(
    "/admin/system-controls/pricing",
    args,
    { responseType: "json" },
  );
  return res.data.preview;
}

export async function fetchAiCostMonitor(window: AiCostMonitorWindowPreset) {
  const res = await fetchClient.get<{ ok: boolean; report: AiCostMonitorReportV1 }>(
    "/admin/system-controls/cost-monitor",
    {
      params: { window },
      responseType: "json",
    },
  );
  return res.data.report;
}
