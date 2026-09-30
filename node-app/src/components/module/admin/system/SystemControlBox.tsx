"use client";

import { useEffect, useMemo, useState } from "react";
import { REASONING_EFFORT_LEVELS } from "consts/ai";
import { SYSTEM_CONTROL_ROLLBACK_CONFIRM_PHRASE } from "consts/system/systemControl";
import {
  Button,
  Input,
  Preloader,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Switch,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@amu-labs/ui";
import { Lang, lang } from "components/module/i18n";
import {
  fetchSystemControlHistory,
  fetchSystemPricingSummary,
  fetchSystemModelControls,
  patchSystemModelControls,
  previewSystemPricing,
  rollbackSystemControlAudit,
  setSystemDefaultModel,
  type SystemControlAuditClientItem,
  type SystemPricingPreviewResult,
  type SystemPricingSummary,
  type SystemModelControlClientItem,
} from "libs/api/admin/systemControls";
import { logger } from "utils/log";

function groupByProvider(items: SystemModelControlClientItem[]) {
  const grouped = items.reduce<Record<string, SystemModelControlClientItem[]>>((acc, item) => {
    const key = `${item.modality}:${item.provider}`;
    acc[key] = acc[key] || [];
    acc[key].push(item);
    return acc;
  }, {});

  for (const key of Object.keys(grouped)) {
    grouped[key] = [...grouped[key]].sort(compareSystemModelItems);
  }

  return grouped;
}

function compareSystemModelItems(a: SystemModelControlClientItem, b: SystemModelControlClientItem) {
  const score = (item: SystemModelControlClientItem) => {
    let value = 0;
    if (item.policyDefaultModel) value -= 1000;
    if (item.defaultModel) value -= 700;
    if (item.recommendedModel) value -= 300;
    if (item.enabled) value -= 120;
    if (item.catalogSource === "policy") value -= 40;
    if (item.deprecated) value += 500;
    return value;
  };
  const diff = score(a) - score(b);
  if (diff !== 0) return diff;
  return a.modelName.localeCompare(b.modelName);
}

function getGroupPolicyStatus(items: SystemModelControlClientItem[]) {
  const policyDefault = items.find((item) => item.policyDefaultModel);
  const activeDefault = items.find((item) => item.defaultModel);
  const dbOnlyCount = items.filter((item) => item.catalogSource === "db").length;
  const deprecatedCount = items.filter((item) => item.deprecated).length;
  const invariantItems = items.filter((item) => item.invariantViolation);

  return {
    policyDefault,
    activeDefault,
    dbOnlyCount,
    deprecatedCount,
    invariantItems,
    defaultMismatch: Boolean(policyDefault && activeDefault && policyDefault.key !== activeDefault.key),
  };
}

/** 모델 그룹이 아닌 운영 도구(가격 견적·변경 이력) 탭. */
const OPS_TAB_VALUE = "ops";

/** 용도(modality) 탭 순서. 관리 빈도가 높은 순서로 고정한다. */
const MODALITY_TAB_ORDER = ["text", "image", "video", "audio"] as const;
type ModalityTabValue = (typeof MODALITY_TAB_ORDER)[number];

const MODALITY_TAB_LABEL: Record<ModalityTabValue, { ko: string; en: string }> = {
  text: { ko: "텍스트", en: "Text" },
  image: { ko: "이미지", en: "Image" },
  video: { ko: "영상", en: "Video" },
  audio: { ko: "음성", en: "Audio" },
};

function providerLabel(provider: string) {
  return provider === "qwen"
    ? { ko: "QwenCloud", en: "QwenCloud" }
    : { ko: provider, en: provider };
}

type ModalityTab = {
  modality: ModalityTabValue;
  groups: Array<[string, SystemModelControlClientItem[]]>;
  enabledCount: number;
  totalCount: number;
  /** 탭을 열지 않아도 보여야 하는 이상 신호 수 */
  attentionCount: number;
  invariantCount: number;
};

/**
 * provider 섹션을 용도별 탭으로 묶는다.
 * 이상 신호(정책 기본 불일치·불변식 위반·DB only·deprecated)는 탭 배지로 올려
 * 탭이 닫혀 있어도 놓치지 않게 한다.
 */
function buildModalityTabs(grouped: Record<string, SystemModelControlClientItem[]>): ModalityTab[] {
  return MODALITY_TAB_ORDER.map((modality) => {
    const groups = Object.entries(grouped)
      .filter(([groupKey]) => groupKey.split(":")[0] === modality)
      .sort(([a], [b]) => a.localeCompare(b));
    const items = groups.flatMap(([, groupItems]) => groupItems);
    let attentionCount = 0;
    let invariantCount = 0;
    for (const [, groupItems] of groups) {
      const status = getGroupPolicyStatus(groupItems);
      if (status.defaultMismatch) attentionCount += 1;
      attentionCount += status.dbOnlyCount + status.deprecatedCount + status.invariantItems.length;
      invariantCount += status.invariantItems.length;
    }
    return {
      modality,
      groups,
      enabledCount: items.filter((item) => item.enabled).length,
      totalCount: items.length,
      attentionCount,
      invariantCount,
    };
  }).filter((tab) => tab.totalCount > 0);
}

function invariantReasonLabel(reasonCode?: string) {
  switch (reasonCode) {
    case "default_model_admin_only":
      return { ko: "기본 모델이 관리자 전용으로 차단됨", en: "Default model is admin-only" };
    case "default_model_deprecated":
      return { ko: "기본 모델이 폐기 예정", en: "Default model is deprecated" };
    case "role_default_not_registered":
      return { ko: "역할 기본 모델이 코드 정책에 없음", en: "Role default model is not registered" };
    case "role_default_role_missing":
      return { ko: "역할 기본 모델이 해당 역할을 갖지 않음", en: "Role default model lacks the role" };
    case "role_default_disabled":
      return { ko: "역할 기본 모델이 비활성화됨", en: "Role default model is disabled" };
    case "role_default_deprecated":
      return { ko: "역할 기본 모델이 폐기 예정", en: "Role default model is deprecated" };
    case "role_default_not_routable":
      return { ko: "역할 기본 모델이 미검증(라우팅 불가)", en: "Role default model is not routable" };
    default:
      return { ko: "기본 모델이 비활성화됨", en: "Default model is disabled" };
  }
}

function reasoningEffortImpact(level: string) {
  switch (level) {
    case "low":
      return { ko: "빠름·저비용", en: "fast · low cost" };
    case "high":
      return { ko: "균형", en: "balanced" };
    case "max":
      return { ko: "느림·고비용", en: "slow · high cost" };
    default:
      return { ko: "", en: "" };
  }
}

type PricingPreviewFormState = {
  provider: string;
  modality: "image" | "text" | "audio";
  modelName: string;
  variant: string;
  inputTokens: string;
  outputTokens: string;
  imageCount: string;
  seconds: string;
};

function createInitialPreviewForm(models: SystemModelControlClientItem[]): PricingPreviewFormState {
  const fallback =
    models.find((item) => item.defaultModel && item.modality === "image") ||
    models.find((item) => item.modality === "image");
  return {
    provider: fallback?.provider || "google",
    modality: "image",
    modelName: fallback?.modelName || "",
    variant: "",
    inputTokens: "1000",
    outputTokens: "500",
    imageCount: "1",
    seconds: "5",
  };
}

function formatAuditCreatedAt(value?: string) {
  const date = value ? new Date(value) : null;
  return date && !Number.isNaN(date.getTime()) ? date.toLocaleString("ko-KR") : "-";
}

export function SystemControlBox() {
  const [models, setModels] = useState<SystemModelControlClientItem[]>([]);
  const [history, setHistory] = useState<SystemControlAuditClientItem[]>([]);
  const [pricingSummary, setPricingSummary] = useState<SystemPricingSummary | null>(null);
  const [previewForm, setPreviewForm] = useState<PricingPreviewFormState>({
    provider: "google",
    modality: "image",
    modelName: "",
    variant: "",
    inputTokens: "1000",
    outputTokens: "500",
    imageCount: "1",
    seconds: "5",
  });
  const [pricingPreview, setPricingPreview] = useState<SystemPricingPreviewResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [savingKey, setSavingKey] = useState("");
  const [rollbackLoadingAuditId, setRollbackLoadingAuditId] = useState("");
  const [previewLoading, setPreviewLoading] = useState(false);
  const [changeReason, setChangeReason] = useState("");
  const [rollbackReasonMap, setRollbackReasonMap] = useState<Record<string, string>>({});
  const [rollbackConfirmMap, setRollbackConfirmMap] = useState<Record<string, string>>({});
  const [error, setError] = useState("");

  const loadHistory = async () => {
    setHistoryLoading(true);
    try {
      const nextHistory = await fetchSystemControlHistory(20);
      setHistory(nextHistory);
    } catch (err) {
      logger.error("[SystemControlBox] history load failed", err);
      setError(
        lang({ ko: "최근 운영 변경 이력을 불러오지 못했습니다.", en: "Failed to load recent control history." }),
      );
    } finally {
      setHistoryLoading(false);
    }
  };

  useEffect(function loadInitialSystemControls() {
    let alive = true;
    // 마운트 시 외부 시스템 데이터(model controls / pricing / history) 일괄 fetch
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    Promise.all([fetchSystemModelControls(), fetchSystemPricingSummary(), fetchSystemControlHistory(20)])
      .then(([nextModels, nextPricingSummary, nextHistory]) => {
        if (!alive) return;
        setModels(nextModels);
        setPricingSummary(nextPricingSummary);
        setHistory(nextHistory);
        setPreviewForm((prev) => {
          if (prev.modelName) return prev;
          return createInitialPreviewForm(nextModels);
        });
      })
      .catch((err) => {
        logger.error("[SystemControlBox] load failed", err);
        if (alive) setError(lang({ ko: "모델 설정을 불러오지 못했습니다.", en: "Failed to load model controls." }));
      })
      .finally(() => {
        if (alive) setLoading(false);
      });

    return () => {
      alive = false;
    };
  }, []);

  const grouped = useMemo(() => groupByProvider(models), [models]);
  const modalityTabs = useMemo(() => buildModalityTabs(grouped), [grouped]);
  const [selectedTab, setSelectedTab] = useState<string>("");
  const activeTab =
    (selectedTab === OPS_TAB_VALUE
      ? OPS_TAB_VALUE
      : modalityTabs.find((tab) => tab.modality === selectedTab)?.modality) ||
    // 처음 열 때는 조치가 필요한 용도를 먼저 보여준다. 없으면 첫 탭.
    modalityTabs.find((tab) => tab.invariantCount > 0)?.modality ||
    modalityTabs[0]?.modality ||
    OPS_TAB_VALUE;
  const previewModelOptions = useMemo(
    () =>
      models.filter(
        (item) => item.provider === previewForm.provider && item.modality === previewForm.modality && item.enabled,
      ),
    [models, previewForm.modality, previewForm.provider],
  );

  useEffect(
    function syncPreviewModelFromOptions() {
      if (previewForm.modality === "audio") return;
      if (previewModelOptions.some((item) => item.modelName === previewForm.modelName)) return;
      const nextModel =
        previewModelOptions.find((item) => item.defaultModel)?.modelName || previewModelOptions[0]?.modelName || "";
      if (!nextModel) return;
      // 외부 카탈로그(previewModelOptions) 변경 시 프리뷰 폼 modelName 동기화
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setPreviewForm((prev) => ({ ...prev, modelName: nextModel }));
    },
    [previewForm.modality, previewForm.modelName, previewModelOptions],
  );

  const latestAudit = history[0] || null;
  const normalizedChangeReason = changeReason.trim();

  const handleToggle = async (item: SystemModelControlClientItem, enabled: boolean) => {
    if (!normalizedChangeReason) {
      setError(lang({ ko: "변경 사유를 입력한 뒤 저장해 주세요.", en: "Enter a reason before saving changes." }));
      return;
    }

    const previous = models;
    setSavingKey(item.key);
    setError("");
    setModels((prev) => prev.map((model) => (model.key === item.key ? { ...model, enabled } : model)));

    try {
      const next = await patchSystemModelControls({
        patches: [{ key: item.key, enabled }],
        reason: normalizedChangeReason,
      });
      setModels(next);
      await loadHistory();
    } catch (err) {
      logger.error("[SystemControlBox] patch failed", err);
      setModels(previous);
      setError(lang({ ko: "모델 설정 저장에 실패했습니다.", en: "Failed to save model control." }));
    } finally {
      setSavingKey("");
    }
  };

  const handleSetDefault = async (item: SystemModelControlClientItem) => {
    if (!normalizedChangeReason) {
      setError(lang({ ko: "변경 사유를 입력한 뒤 저장해 주세요.", en: "Enter a reason before saving changes." }));
      return;
    }

    const previous = models;
    setSavingKey(`default:${item.key}`);
    setError("");
    setModels((prev) =>
      prev.map((model) =>
        model.provider === item.provider && model.modality === item.modality
          ? {
              ...model,
              defaultModel: model.key === item.key,
              enabled: model.key === item.key ? true : model.enabled,
            }
          : model,
      ),
    );

    try {
      const next = await setSystemDefaultModel({
        defaultModelKey: item.key,
        reason: normalizedChangeReason,
      });
      setModels(next);
      await loadHistory();
    } catch (err) {
      logger.error("[SystemControlBox] set default failed", err);
      setModels(previous);
      setError(lang({ ko: "기본 모델 저장에 실패했습니다.", en: "Failed to save default model." }));
    } finally {
      setSavingKey("");
    }
  };

  const handleToggleRecommended = async (item: SystemModelControlClientItem, recommendedModel: boolean) => {
    if (!normalizedChangeReason) {
      setError(lang({ ko: "변경 사유를 입력한 뒤 저장해 주세요.", en: "Enter a reason before saving changes." }));
      return;
    }

    const previous = models;
    setSavingKey(`recommended:${item.key}`);
    setError("");
    setModels((prev) => prev.map((model) => (model.key === item.key ? { ...model, recommendedModel } : model)));

    try {
      const next = await patchSystemModelControls({
        patches: [{ key: item.key, recommendedModel }],
        reason: normalizedChangeReason,
      });
      setModels(next);
      await loadHistory();
    } catch (err) {
      logger.error("[SystemControlBox] recommended patch failed", err);
      setModels(previous);
      setError(lang({ ko: "추천 모델 설정 저장에 실패했습니다.", en: "Failed to save recommended model setting." }));
    } finally {
      setSavingKey("");
    }
  };

  const handleChangeReasoningEffort = async (item: SystemModelControlClientItem, reasoningEffort: string) => {
    if (!normalizedChangeReason) {
      setError(lang({ ko: "변경 사유를 입력한 뒤 저장해 주세요.", en: "Enter a reason before saving changes." }));
      return;
    }
    if (reasoningEffort === item.reasoningEffort) return;

    const previous = models;
    setSavingKey(`effort:${item.key}`);
    setError("");
    setModels((prev) => prev.map((model) => (model.key === item.key ? { ...model, reasoningEffort } : model)));

    try {
      const next = await patchSystemModelControls({
        patches: [{ key: item.key, reasoningEffort }],
        reason: normalizedChangeReason,
      });
      setModels(next);
      await loadHistory();
    } catch (err) {
      logger.error("[SystemControlBox] reasoning effort patch failed", err);
      setModels(previous);
      setError(lang({ ko: "추론 강도 저장에 실패했습니다.", en: "Failed to save reasoning effort." }));
    } finally {
      setSavingKey("");
    }
  };

  const handleToggleAdminOnly = async (item: SystemModelControlClientItem, adminOnly: boolean) => {
    if (!normalizedChangeReason) {
      setError(lang({ ko: "변경 사유를 입력한 뒤 저장해 주세요.", en: "Enter a reason before saving changes." }));
      return;
    }
    if (adminOnly === item.adminOnly) return;

    const previous = models;
    setSavingKey(`adminOnly:${item.key}`);
    setError("");
    setModels((prev) => prev.map((model) => (model.key === item.key ? { ...model, adminOnly } : model)));

    try {
      const next = await patchSystemModelControls({
        patches: [{ key: item.key, adminOnly }],
        reason: normalizedChangeReason,
      });
      setModels(next);
      await loadHistory();
    } catch (err) {
      logger.error("[SystemControlBox] adminOnly patch failed", err);
      setModels(previous);
      setError(lang({ ko: "관리자 전용 설정 저장에 실패했습니다.", en: "Failed to save admin-only setting." }));
    } finally {
      setSavingKey("");
    }
  };

  const handleChangeStatus = async (item: SystemModelControlClientItem, status: "active" | "deprecated") => {
    if (!normalizedChangeReason) {
      setError(lang({ ko: "변경 사유를 입력한 뒤 저장해 주세요.", en: "Enter a reason before saving changes." }));
      return;
    }
    if (status === item.status) return;

    const previous = models;
    setSavingKey(`status:${item.key}`);
    setError("");
    setModels((prev) =>
      prev.map((model) => (model.key === item.key ? { ...model, status, deprecated: status === "deprecated" } : model)),
    );

    try {
      const next = await patchSystemModelControls({
        patches: [{ key: item.key, status }],
        reason: normalizedChangeReason,
      });
      setModels(next);
      await loadHistory();
    } catch (err) {
      logger.error("[SystemControlBox] status patch failed", err);
      setModels(previous);
      setError(lang({ ko: "상태 변경에 실패했습니다.", en: "Failed to change status." }));
    } finally {
      setSavingKey("");
    }
  };

  const handleRollback = async (audit: SystemControlAuditClientItem) => {
    const rollbackReason = String(rollbackReasonMap[audit.auditId] || "").trim();
    const confirmPhrase = String(rollbackConfirmMap[audit.auditId] || "").trim();

    if (!rollbackReason) {
      setError(lang({ ko: "롤백 사유를 입력해 주세요.", en: "Enter a rollback reason." }));
      return;
    }
    if (confirmPhrase !== SYSTEM_CONTROL_ROLLBACK_CONFIRM_PHRASE) {
      setError(
        lang({
          ko: `${SYSTEM_CONTROL_ROLLBACK_CONFIRM_PHRASE} 확인 문구를 정확히 입력해 주세요.`,
          en: `Enter the ${SYSTEM_CONTROL_ROLLBACK_CONFIRM_PHRASE} confirm phrase exactly.`,
        }),
      );
      return;
    }

    setRollbackLoadingAuditId(audit.auditId);
    setError("");
    try {
      const result = await rollbackSystemControlAudit({
        auditId: audit.auditId,
        reason: rollbackReason,
        confirmPhrase,
      });
      setModels(result.models || []);
      setRollbackReasonMap((prev) => ({ ...prev, [audit.auditId]: "" }));
      setRollbackConfirmMap((prev) => ({ ...prev, [audit.auditId]: "" }));
      await loadHistory();
    } catch (err) {
      logger.error("[SystemControlBox] rollback failed", err);
      setError(lang({ ko: "롤백 적용에 실패했습니다.", en: "Failed to apply rollback." }));
    } finally {
      setRollbackLoadingAuditId("");
    }
  };

  const handlePreview = async () => {
    setPreviewLoading(true);
    setError("");
    try {
      const preview = await previewSystemPricing({
        provider: previewForm.provider,
        modelName: previewForm.modelName,
        modality: previewForm.modality,
        variant: previewForm.variant || undefined,
        usage:
          previewForm.modality === "text" || previewForm.modality === "audio"
            ? {
                [previewForm.modality]: {
                  input: Math.max(0, Number(previewForm.inputTokens || 0)),
                  output: Math.max(0, Number(previewForm.outputTokens || 0)),
                },
              }
            : undefined,
        fixed:
          previewForm.modality === "image"
            ? {
                images: Math.max(0, Number(previewForm.imageCount || 0)),
                seconds: Math.max(0, Number(previewForm.seconds || 0)),
              }
            : previewForm.modality === "audio"
              ? { seconds: Math.max(0, Number(previewForm.seconds || 0)) }
              : undefined,
      });
      setPricingPreview(preview);
    } catch (err) {
      logger.error("[SystemControlBox] pricing preview failed", err);
      setError(lang({ ko: "가격 미리보기에 실패했습니다.", en: "Failed to preview pricing." }));
    } finally {
      setPreviewLoading(false);
    }
  };

  if (loading) return <Preloader variant="spin" size="md" container />;

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-4">
      {error && (
        <div className="rounded-md border border-destructive/30 px-3 py-2 text-sm text-destructive">{error}</div>
      )}

      <section className="rounded-lg border border-border bg-surface p-4">
        <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
          <div className="grid gap-2">
            <div className="text-sm font-semibold">
              <Lang text={{ ko: "운영 변경 사유", en: "Change reason" }} />
            </div>
            <Input
              value={changeReason}
              onChange={(event) => setChangeReason(event.target.value)}
              placeholder={lang({
                ko: "예: 기본 이미지 모델 교체, 장애 대응, 비용 통제",
                en: "Example: switch default image model, incident response, cost control",
              })}
            />
          </div>
          <div className="text-xs text-muted-foreground">
            <Lang
              text={{
                ko: "모델 on/off 및 기본 모델 변경 시 감사 로그에 함께 저장됩니다.",
                en: "Saved to the audit log with every model enable/default change.",
              }}
            />
          </div>
        </div>

        {latestAudit ? (
          <div className="mt-3 rounded-md border border-border/70 bg-muted/20 p-3 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-semibold">
                <Lang text={{ ko: "최근 운영 변경", en: "Latest control change" }} />
              </span>
              <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xxs font-semibold text-primary">
                {latestAudit.actionType}
              </span>
              <span className="rounded-full bg-muted px-2 py-0.5 text-xxs font-semibold text-muted-foreground">
                {latestAudit.status}
              </span>
            </div>
            <div className="mt-1 text-muted-foreground">
              {formatAuditCreatedAt(latestAudit.createdAt)} · {latestAudit.actorId || "-"} · {latestAudit.reason}
            </div>
            {latestAudit.summary?.length ? (
              <div className="mt-1 text-xs text-muted-foreground">{latestAudit.summary.join(" / ")}</div>
            ) : null}
          </div>
        ) : null}
      </section>

      <Tabs value={activeTab} onValueChange={setSelectedTab} className="w-full">
        <TabsList className="w-full" scrollable>
          {modalityTabs.map((tab) => (
            <TabsTrigger key={tab.modality} value={tab.modality} className="group">
              <Lang text={MODALITY_TAB_LABEL[tab.modality]} />
              {/* 활성 탭은 primary 배경이라 muted 계열이 읽히지 않는다. 활성 상태에서만 대비를 올린다. */}
              <span className="ml-1.5 text-xs tabular-nums text-muted-foreground group-data-[state=active]:text-white/80">
                {tab.enabledCount}/{tab.totalCount}
              </span>
              {tab.attentionCount > 0 ? (
                <span
                  className={`ml-1.5 rounded-full px-1.5 text-xxs font-semibold ${
                    // 활성 탭 배경(primary) 위에서는 반투명 배경 + 진한 글자가 읽히지 않는다.
                    // 활성 상태에서만 밝은 칩 배경 + 어두운 글자로 뒤집어 대비를 확보한다.
                    // destructive 토큰은 다크 테마에서 흰 글자 대비가 3.91이라 AA에 못 미쳐 red-200/950 쌍을 쓴다.
                    tab.invariantCount > 0
                      ? "bg-destructive/15 text-destructive group-data-[state=active]:bg-red-200 group-data-[state=active]:text-red-950"
                      : "bg-amber-500/15 text-amber-700 group-data-[state=active]:bg-amber-200 group-data-[state=active]:text-amber-950 dark:text-amber-300"
                  }`}
                  aria-label={lang({
                    ko: `조치 필요 ${tab.attentionCount}건`,
                    en: `${tab.attentionCount} items need attention`,
                  })}
                >
                  {tab.attentionCount}
                </span>
              ) : null}
            </TabsTrigger>
          ))}
          <TabsTrigger value={OPS_TAB_VALUE} className="group">
            <Lang text={{ ko: "가격·이력", en: "Pricing & history" }} />
            {history.length ? (
              <span className="ml-1.5 text-xs tabular-nums text-muted-foreground group-data-[state=active]:text-white/80">
                {history.length}
              </span>
            ) : null}
          </TabsTrigger>
        </TabsList>

        {modalityTabs.map((modalityGroup) => (
          <TabsContent key={modalityGroup.modality} value={modalityGroup.modality} className="mt-4 flex flex-col gap-4">
            {modalityGroup.groups.map(([groupKey, items]) => {
              const [modality, provider] = groupKey.split(":");
              const policyStatus = getGroupPolicyStatus(items);

              return (
                <section key={groupKey} className="rounded-lg border border-border bg-surface p-4">
                  <div className="mb-3 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                    <div className="min-w-0">
                      <h3 className="text-base font-semibold">
                        <Lang text={providerLabel(provider)} /> · {modality}
                      </h3>
                      <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                        <span className="whitespace-nowrap">
                          <Lang text={{ ko: "정책 기본", en: "Policy default" }} />:{" "}
                          {policyStatus.policyDefault?.modelName || "-"}
                        </span>
                        <span className="whitespace-nowrap">
                          <Lang text={{ ko: "DB 기본", en: "DB default" }} />:{" "}
                          {policyStatus.activeDefault?.modelName || "-"}
                        </span>
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground md:shrink-0 md:justify-end">
                      <span>
                        {items.filter((item) => item.enabled).length}/{items.length}
                      </span>
                      {policyStatus.dbOnlyCount > 0 ? (
                        <span className="rounded-full bg-amber-500/10 px-2 py-0.5 font-semibold text-amber-700 dark:text-amber-300">
                          DB only {policyStatus.dbOnlyCount}
                        </span>
                      ) : null}
                      {policyStatus.deprecatedCount > 0 ? (
                        <span className="rounded-full bg-muted px-2 py-0.5 font-semibold text-muted-foreground">
                          deprecated {policyStatus.deprecatedCount}
                        </span>
                      ) : null}
                    </div>
                  </div>

                  {policyStatus.defaultMismatch && policyStatus.policyDefault ? (
                    <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-800 dark:text-amber-200">
                      <span>
                        <Lang
                          text={{
                            ko: "코드 정책 기본 모델과 DB 기본 모델이 다릅니다.",
                            en: "The code policy default and DB default are different.",
                          }}
                        />
                      </span>
                      <Button
                        variant="outline"
                        size="xs"
                        disabled={Boolean(savingKey) || !normalizedChangeReason}
                        onClick={() => {
                          if (policyStatus.policyDefault) handleSetDefault(policyStatus.policyDefault);
                        }}
                      >
                        <Lang text={{ ko: "정책 기본 적용", en: "Apply policy default" }} />
                      </Button>
                    </div>
                  ) : null}

                  {policyStatus.invariantItems.length > 0 ? (
                    <div className="mb-3 flex flex-col gap-1 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                      <span className="font-semibold">
                        <Lang text={{ ko: "정책 기본 불변식 위반", en: "Policy default invariant violation" }} />
                      </span>
                      {policyStatus.invariantItems.map((item) => (
                        <span key={item.key}>
                          {item.modelName} — <Lang text={invariantReasonLabel(item.invariantViolation?.reasonCode)} />
                        </span>
                      ))}
                    </div>
                  ) : null}

                  <div className="divide-y divide-border">
                    {items.map((item) => (
                      <div
                        key={item.key}
                        className={`flex flex-col gap-2 py-3 md:flex-row md:items-center md:justify-between md:gap-3 ${
                          item.deprecated || item.catalogSource === "db" ? "opacity-75" : ""
                        }`}
                      >
                        <div className="min-w-0 md:flex-1">
                          <div className="truncate text-sm font-medium">{item.modelName}</div>
                          <div className="mt-1 flex flex-wrap items-center gap-1.5">
                            {item.policyDefaultModel ? (
                              <span className="shrink-0 whitespace-nowrap rounded-full bg-sky-500/10 px-2 py-0.5 text-xxs font-semibold text-sky-700 dark:text-sky-300">
                                <Lang text={{ ko: "정책 기본", en: "Policy default" }} />
                              </span>
                            ) : null}
                            {item.defaultModel ? (
                              <span className="shrink-0 whitespace-nowrap rounded-full bg-primary/10 px-2 py-0.5 text-xxs font-semibold text-primary">
                                <Lang text={{ ko: "기본", en: "Default" }} />
                              </span>
                            ) : null}
                            {item.recommendedModel ? (
                              <span className="shrink-0 whitespace-nowrap rounded-full bg-accent/20 px-2 py-0.5 text-xxs font-semibold text-accent-foreground">
                                <Lang text={{ ko: "추천", en: "Recommended" }} />
                              </span>
                            ) : null}
                            {item.deprecated ? (
                              <span className="shrink-0 whitespace-nowrap rounded-full bg-amber-500/10 px-2 py-0.5 text-xxs font-semibold text-amber-700 dark:text-amber-300">
                                <Lang text={{ ko: "폐기 예정", en: "Deprecated" }} />
                              </span>
                            ) : null}
                            {item.adminOnly ? (
                              <span className="shrink-0 whitespace-nowrap rounded-full bg-muted px-2 py-0.5 text-xxs font-semibold text-muted-foreground">
                                <Lang text={{ ko: "관리자 전용", en: "Admin only" }} />
                              </span>
                            ) : null}
                            {item.catalogSource === "db" ? (
                              <span className="shrink-0 whitespace-nowrap rounded-full bg-amber-500/10 px-2 py-0.5 text-xxs font-semibold text-amber-700 dark:text-amber-300">
                                DB only
                              </span>
                            ) : null}
                            {item.invariantViolation ? (
                              <span className="shrink-0 whitespace-nowrap rounded-full bg-destructive/10 px-2 py-0.5 text-xxs font-semibold text-destructive">
                                <Lang text={{ ko: "기본 불일치", en: "Default violation" }} />
                              </span>
                            ) : null}
                            {item.overrides && item.overrides.length > 0 ? (
                              <span
                                className="shrink-0 whitespace-nowrap rounded-full bg-sky-500/10 px-2 py-0.5 text-xxs font-semibold text-sky-700 dark:text-sky-300"
                                title={item.overrides.join(", ")}
                              >
                                <Lang text={{ ko: "정책 재정의", en: "Overridden" }} />
                              </span>
                            ) : null}
                          </div>
                          {item.displayName && item.displayName !== item.modelName ? (
                            <div className="truncate text-xs text-muted-foreground">{item.displayName}</div>
                          ) : null}
                          <div className="truncate text-xxs text-muted-foreground">
                            upstream: {item.upstreamModelName || item.modelName}
                          </div>
                          {item.supportsReasoningEffort ? (
                            <div className="truncate text-xxs text-muted-foreground">
                              <Lang text={{ ko: "정책 추론 강도", en: "Policy reasoning effort" }} />:{" "}
                              {item.policyReasoningEffort || "-"}
                            </div>
                          ) : null}
                          {item.supportsReasoningEffort && item.reasoningEffort ? (
                            <div className="truncate text-xxs text-muted-foreground">
                              <Lang text={{ ko: "현재 추론 강도", en: "Current reasoning effort" }} />:{" "}
                              {item.reasoningEffort} (<Lang text={reasoningEffortImpact(item.reasoningEffort)} />)
                            </div>
                          ) : null}
                        </div>
                        <div className="flex flex-wrap items-center gap-2 md:shrink-0 md:justify-end">
                          {item.supportsReasoningEffort ? (
                            <Select
                              value={item.reasoningEffort || item.policyReasoningEffort}
                              onValueChange={(value) =>
                                handleChangeReasoningEffort(
                                  item,
                                  Array.isArray(value) ? String(value[0] || "") : String(value),
                                )
                              }
                              disabled={Boolean(savingKey) || !normalizedChangeReason}
                            >
                              <SelectTrigger
                                size="xs"
                                className="w-28"
                                aria-label={lang({
                                  ko: `${item.modelName} 추론 강도`,
                                  en: `${item.modelName} reasoning effort`,
                                })}
                              >
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {(item.reasoningEffortLevels?.length
                                  ? item.reasoningEffortLevels
                                  : REASONING_EFFORT_LEVELS
                                ).map((level) => (
                                  <SelectItem key={level} value={level}>
                                    {level} · {lang(reasoningEffortImpact(level))}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          ) : null}
                          <Button
                            variant="outline"
                            size="xs"
                            disabled={Boolean(savingKey) || !normalizedChangeReason}
                            onClick={() => handleToggleRecommended(item, !item.recommendedModel)}
                          >
                            <Lang
                              text={
                                item.recommendedModel
                                  ? { ko: "추천 해제", en: "Unrecommend" }
                                  : { ko: "추천 설정", en: "Recommend" }
                              }
                            />
                          </Button>
                          {item.modality !== "audio" && !item.defaultModel ? (
                            <Button
                              variant="outline"
                              size="xs"
                              disabled={Boolean(savingKey) || !normalizedChangeReason}
                              onClick={() => handleSetDefault(item)}
                            >
                              <Lang text={{ ko: "기본으로 설정", en: "Set default" }} />
                            </Button>
                          ) : null}
                          <Button
                            variant="outline"
                            size="xs"
                            disabled={Boolean(savingKey) || !normalizedChangeReason}
                            onClick={() => handleChangeStatus(item, item.deprecated ? "active" : "deprecated")}
                          >
                            <Lang
                              text={item.deprecated ? { ko: "복원", en: "Restore" } : { ko: "폐기", en: "Deprecate" }}
                            />
                          </Button>
                          <div className="flex items-center gap-1">
                            <span className="text-xxs text-muted-foreground">
                              <Lang text={{ ko: "관리자", en: "Admin" }} />
                            </span>
                            <Switch
                              checked={item.adminOnly}
                              disabled={!item.enabled || Boolean(savingKey) || !normalizedChangeReason}
                              onCheckedChange={(checked) => handleToggleAdminOnly(item, checked)}
                              aria-label={lang({
                                ko: `${item.modelName} 관리자 전용`,
                                en: `${item.modelName} admin only`,
                              })}
                            />
                          </div>
                          <Switch
                            checked={item.enabled}
                            disabled={
                              savingKey === item.key ||
                              savingKey === `default:${item.key}` ||
                              savingKey === `recommended:${item.key}` ||
                              savingKey === `effort:${item.key}` ||
                              savingKey === `adminOnly:${item.key}` ||
                              savingKey === `status:${item.key}` ||
                              !normalizedChangeReason
                            }
                            onCheckedChange={(checked) => handleToggle(item, checked)}
                            aria-label={lang({ ko: `${item.modelName} 사용 여부`, en: `${item.modelName} enabled` })}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              );
            })}
          </TabsContent>
        ))}
        <TabsContent value={OPS_TAB_VALUE} className="mt-4 flex flex-col gap-4">
          <section className="rounded-lg border border-border bg-background p-4">
            <div className="mb-3 flex items-center justify-between gap-2">
              <h3 className="text-base font-semibold">
                <Lang text={{ ko: "가격 Dry-Run", en: "Pricing Dry-run" }} />
              </h3>
              <span className="text-xs text-muted-foreground">
                {pricingSummary
                  ? `${pricingSummary.totalEntries} entries · db ${pricingSummary.dbEntries} / fallback ${pricingSummary.fallbackEntries}`
                  : ""}
              </span>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <div className="grid gap-3">
                <div className="grid gap-2 md:grid-cols-3">
                  <Select
                    value={previewForm.modality}
                    onValueChange={(value) =>
                      setPreviewForm((prev) => ({
                        ...prev,
                        modality: String(value || "image") as "image" | "text" | "audio",
                      }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="modality" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="image">image</SelectItem>
                      <SelectItem value="text">text</SelectItem>
                      <SelectItem value="audio">audio</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select
                    value={previewForm.provider}
                    onValueChange={(value) => setPreviewForm((prev) => ({ ...prev, provider: String(value || "") }))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="provider" />
                    </SelectTrigger>
                    <SelectContent>
                      {["google", "openai", "claude", "deepseek", "xai", "zai", "photoroom", "pixian"].map(
                        (provider) => (
                          <SelectItem key={provider} value={provider}>
                            {provider}
                          </SelectItem>
                        ),
                      )}
                    </SelectContent>
                  </Select>
                  <Input
                    value={previewForm.variant}
                    onChange={(event) => setPreviewForm((prev) => ({ ...prev, variant: event.target.value }))}
                    placeholder={lang({ ko: "variant", en: "variant" })}
                  />
                </div>

                {previewForm.modality !== "audio" && previewModelOptions.length > 0 ? (
                  <Select
                    value={previewForm.modelName}
                    onValueChange={(value) => setPreviewForm((prev) => ({ ...prev, modelName: String(value || "") }))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="model" />
                    </SelectTrigger>
                    <SelectContent>
                      {previewModelOptions.map((item) => (
                        <SelectItem key={item.key} value={item.modelName}>
                          {item.modelName}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <Input
                    value={previewForm.modelName}
                    onChange={(event) => setPreviewForm((prev) => ({ ...prev, modelName: event.target.value }))}
                    placeholder={lang({ ko: "modelName", en: "modelName" })}
                  />
                )}

                {(previewForm.modality === "text" || previewForm.modality === "audio") && (
                  <div className="grid gap-2 md:grid-cols-2">
                    <Input
                      value={previewForm.inputTokens}
                      onChange={(event) => setPreviewForm((prev) => ({ ...prev, inputTokens: event.target.value }))}
                      placeholder={lang({ ko: "input tokens", en: "input tokens" })}
                    />
                    <Input
                      value={previewForm.outputTokens}
                      onChange={(event) => setPreviewForm((prev) => ({ ...prev, outputTokens: event.target.value }))}
                      placeholder={lang({ ko: "output tokens", en: "output tokens" })}
                    />
                  </div>
                )}

                {previewForm.modality === "image" && (
                  <Input
                    value={previewForm.imageCount}
                    onChange={(event) => setPreviewForm((prev) => ({ ...prev, imageCount: event.target.value }))}
                    placeholder={lang({ ko: "image count", en: "image count" })}
                  />
                )}

                {(previewForm.modality === "image" || previewForm.modality === "audio") && (
                  <Input
                    value={previewForm.seconds}
                    onChange={(event) => setPreviewForm((prev) => ({ ...prev, seconds: event.target.value }))}
                    placeholder={lang({ ko: "seconds", en: "seconds" })}
                  />
                )}

                <div>
                  <Button variant="outline" loading={previewLoading} onClick={handlePreview}>
                    <Lang text={{ ko: "서버 견적 계산", en: "Run server quote" }} />
                  </Button>
                </div>
              </div>

              <div className="rounded-lg border border-border/70 bg-muted/20 p-3 text-sm">
                {pricingPreview ? (
                  <div className="flex flex-col gap-2">
                    <div className="font-semibold">{pricingPreview.billingKey}</div>
                    <div className="text-muted-foreground">
                      <Lang text={{ ko: "과금 방식", en: "Strategy" }} />: {pricingPreview.billingStrategy}
                    </div>
                    <div className="text-muted-foreground">
                      <Lang text={{ ko: "예상 코인", en: "Estimated coins" }} />: {pricingPreview.coins}
                    </div>
                    {pricingPreview.tokenPricing ? (
                      <div className="text-muted-foreground">
                        token: in {pricingPreview.tokenPricing.input} / out {pricingPreview.tokenPricing.output} (
                        {pricingPreview.tokenPricingSource})
                      </div>
                    ) : null}
                    {pricingPreview.fixedPricing ? (
                      <div className="text-muted-foreground">
                        fixed:
                        {typeof pricingPreview.fixedPricing.perImage === "number"
                          ? ` image ${pricingPreview.fixedPricing.perImage}`
                          : ""}
                        {typeof pricingPreview.fixedPricing.perSecond === "number"
                          ? ` second ${pricingPreview.fixedPricing.perSecond}`
                          : ""}
                        {typeof pricingPreview.fixedPricing.perMinute === "number"
                          ? ` minute ${pricingPreview.fixedPricing.perMinute}`
                          : ""}{" "}
                        ({pricingPreview.fixedPricingSource})
                      </div>
                    ) : null}
                  </div>
                ) : (
                  <div className="text-muted-foreground">
                    <Lang
                      text={{
                        ko: "provider / model / usage를 입력하면 서버 pricing catalog 기준 예상 코인을 계산합니다.",
                        en: "Enter provider, model, and usage to preview estimated coins from the server pricing catalog.",
                      }}
                    />
                  </div>
                )}
              </div>
            </div>
          </section>

          <section className="rounded-lg border border-border bg-background p-4">
            <div className="mb-3 flex items-center justify-between gap-2">
              <h3 className="text-base font-semibold">
                <Lang text={{ ko: "최근 운영 변경 이력", en: "Recent control history" }} />
              </h3>
              <span className="text-xs text-muted-foreground">
                {historyLoading ? <Lang text={{ ko: "불러오는 중...", en: "Loading..." }} /> : `${history.length}`}
              </span>
            </div>

            <div className="flex flex-col gap-3">
              {history.map((audit) => {
                const canRollback =
                  audit.targetType === "model_catalog" && audit.status === "applied" && audit.actionType !== "rollback";

                return (
                  <div key={audit.auditId} className="rounded-lg border border-border/70 bg-muted/20 p-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xxs font-semibold text-primary">
                        {audit.actionType}
                      </span>
                      <span className="rounded-full bg-muted px-2 py-0.5 text-xxs font-semibold text-muted-foreground">
                        {audit.targetType}
                      </span>
                      <span className="rounded-full bg-muted px-2 py-0.5 text-xxs font-semibold text-muted-foreground">
                        {audit.status}
                      </span>
                    </div>

                    <div className="mt-2 text-sm font-medium">{audit.reason}</div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      {formatAuditCreatedAt(audit.createdAt)} · actor {audit.actorId || "-"} · request{" "}
                      {audit.requestId || "-"}
                    </div>
                    {audit.summary?.length ? (
                      <div className="mt-1 text-xs text-muted-foreground">{audit.summary.join(" / ")}</div>
                    ) : null}
                    {audit.status === "rolled_back" ? (
                      <div className="mt-1 text-xs text-muted-foreground">
                        <Lang text={{ ko: "롤백 완료", en: "Rolled back" }} />: {audit.rolledBackByAuditId || "-"}
                      </div>
                    ) : null}
                    {audit.rollbackOfAuditId ? (
                      <div className="mt-1 text-xs text-muted-foreground">
                        <Lang text={{ ko: "원본 변경", en: "Source audit" }} />: {audit.rollbackOfAuditId}
                      </div>
                    ) : null}

                    {canRollback ? (
                      <div className="mt-3 grid gap-2 md:grid-cols-[minmax(0,1fr)_180px_auto]">
                        <Input
                          value={rollbackReasonMap[audit.auditId] || ""}
                          onChange={(event) =>
                            setRollbackReasonMap((prev) => ({ ...prev, [audit.auditId]: event.target.value }))
                          }
                          placeholder={lang({ ko: "롤백 사유", en: "Rollback reason" })}
                        />
                        <Input
                          value={rollbackConfirmMap[audit.auditId] || ""}
                          onChange={(event) =>
                            setRollbackConfirmMap((prev) => ({ ...prev, [audit.auditId]: event.target.value }))
                          }
                          placeholder={SYSTEM_CONTROL_ROLLBACK_CONFIRM_PHRASE}
                        />
                        <Button
                          variant="outline"
                          loading={rollbackLoadingAuditId === audit.auditId}
                          disabled={Boolean(rollbackLoadingAuditId)}
                          onClick={() => handleRollback(audit)}
                        >
                          <Lang text={{ ko: "이 변경 롤백", en: "Rollback" }} />
                        </Button>
                      </div>
                    ) : null}
                  </div>
                );
              })}

              {!history.length ? (
                <div className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
                  <Lang
                    text={{ ko: "아직 기록된 운영 변경 이력이 없습니다.", en: "No recent control history found." }}
                  />
                </div>
              ) : null}
            </div>
          </section>
        </TabsContent>
      </Tabs>

      <div className="text-xs text-muted-foreground">
        <Lang
          text={{
            ko: "스위치 변경은 서버 DB catalog에 저장되며, 생성 요청은 서버에서 다시 검증됩니다. 롤백은 model catalog 변경 이력에 한해 지원됩니다.",
            en: "Switch changes are stored in the server DB catalog and generation requests are verified server-side. Rollback is currently limited to model catalog history.",
          }}
        />
      </div>
    </div>
  );
}
