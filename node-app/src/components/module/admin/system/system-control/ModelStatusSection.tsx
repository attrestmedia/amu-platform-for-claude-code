/**
 * @docHint
 * @purpose Show model status and active emergency disable records without mutation controls
 * @process Fetch model controls and emergency disable status inside the section
 * @domain admin-system
 * @scope component
 */
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Button, Preloader, Tabs, TabsContent, TabsList, TabsTrigger } from "@amu-labs/ui";
import { Lang, lang } from "components/module/i18n";
import { fetchSystemModelControls, type SystemModelControlClientItem } from "libs/api/admin/systemControls";
import { fetchModelEmergencyDisables, type ModelEmergencyDisableSnapshot } from "libs/api/admin/modelEmergencyDisables";
import { logger } from "utils/log";
import { useReducedMotion } from "./useReducedMotion";

const MODALITY_ORDER = ["text", "image", "video", "audio"] as const;
type Modality = (typeof MODALITY_ORDER)[number];
const MODALITY_LABEL: Record<Modality, { ko: string; en: string }> = {
  text: { ko: "텍스트", en: "Text" },
  image: { ko: "이미지", en: "Image" },
  video: { ko: "영상", en: "Video" },
  audio: { ko: "음성", en: "Audio" },
};

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

function groupByProvider(items: SystemModelControlClientItem[]) {
  return items.reduce<Record<string, SystemModelControlClientItem[]>>((groups, item) => {
    const key = [item.modality, item.provider].join(":");
    groups[key] = groups[key] || [];
    groups[key].push(item);
    groups[key].sort((a, b) => {
      const score = (model: SystemModelControlClientItem) =>
        Number(!model.policyDefaultModel) * 1000 +
        Number(!model.defaultModel) * 700 +
        Number(!model.recommendedModel) * 300 +
        Number(!model.enabled) * 120 +
        Number(model.deprecated) * 500;
      return score(a) - score(b) || a.modelName.localeCompare(b.modelName);
    });
    return groups;
  }, {});
}

function getModalityTabs(groups: Record<string, SystemModelControlClientItem[]>) {
  return MODALITY_ORDER.map((modality) => {
    const providerGroups = Object.entries(groups)
      .filter(([key]) => key.startsWith(modality + ":"))
      .sort(([a], [b]) => a.localeCompare(b));
    const items = providerGroups.flatMap(([, models]) => models);
    return {
      modality,
      providerGroups,
      enabledCount: items.filter((item) => item.enabled).length,
      totalCount: items.length,
      attentionCount: items.filter((item) => item.deprecated || Boolean(item.invariantViolation)).length,
    };
  }).filter((tab) => tab.totalCount > 0);
}

function EmergencyDisableStatus() {
  const reducedMotion = useReducedMotion();
  const [snapshot, setSnapshot] = useState<ModelEmergencyDisableSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  const loadStatus = useCallback(async (showLoader = true) => {
    if (showLoader) setLoading(true);
    try {
      setSnapshot(await fetchModelEmergencyDisables());
      setFailed(false);
    } catch (error) {
      logger.error("[SystemControlBox] emergency disable status failed", error);
      setSnapshot(null);
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(function loadEmergencyDisableStatus() {
    // Load initial read-only data for this tab; later state updates follow the async request.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadStatus(false);
  }, [loadStatus]);

  const activeRecords = useMemo(
    () =>
      snapshot?.records.filter(
        (item) =>
          item.record.releasedAt === null && Date.parse(item.record.disabledUntil) > Date.parse(snapshot.now),
      ) || [],
    [snapshot],
  );

  return (
    <section className="rounded-lg border border-border bg-surface p-4" aria-labelledby="emergency-disable-status-title">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 id="emergency-disable-status-title" className="text-base font-semibold">
            <Lang text={{ ko: "비상 차단 현황", en: "Emergency disable status" }} />
          </h3>
          <p className="mt-1 text-sm text-muted-foreground" aria-live="polite">
            {loading
              ? lang({ ko: "차단 상태를 불러오는 중입니다.", en: "Loading emergency disable status." })
              : failed
                ? lang({ ko: "차단 상태를 불러오지 못했습니다.", en: "Could not load emergency disable status." })
                : lang({
                    ko: "현재 활성 차단 " + activeRecords.length + "건",
                    en: activeRecords.length + " active disables",
                  })}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {failed ? (
            <Button variant="outline" size="sm" onClick={() => void loadStatus()}>
              <Lang text={{ ko: "다시 시도", en: "Retry" }} />
            </Button>
          ) : null}
          <Button asChild variant="outline" size="sm">
            <Link href="/admin/operations/model-emergency-disable">
              <Lang text={{ ko: "차단 관리 열기", en: "Open disable controls" }} />
            </Link>
          </Button>
        </div>
      </div>

      {loading ? (
        <div className={`mt-4 h-16 rounded-md bg-muted ${reducedMotion ? "" : "animate-pulse"}`} aria-hidden="true" />
      ) : failed ? (
        <p className="mt-3 text-sm text-destructive" role="alert">
          <Lang text={{ ko: "차단 목록을 확인할 수 없습니다.", en: "The disable list is unavailable." }} />
        </p>
      ) : activeRecords.length ? (
        <ul className="mt-4 divide-y divide-border">
          {activeRecords.map((item) => (
            <li key={item.key} className="grid min-w-0 gap-2 py-3 sm:grid-cols-[minmax(0,1fr)_minmax(12rem,0.8fr)]">
              <div className="min-w-0">
                <div className="break-words text-sm font-medium">
                  {item.record.target.kind === "modelProfile"
                    ? item.record.target.modelRef
                    : item.record.target.modelRef + " · " + item.record.target.route}
                </div>
                <p className="mt-1 whitespace-pre-wrap break-words text-sm text-muted-foreground">
                  {item.record.reason}
                </p>
              </div>
              <div className="text-sm text-muted-foreground sm:text-right">
                <span className="text-xs">
                  <Lang text={{ ko: "차단 종료", en: "Disabled until" }} />
                </span>
                <div>{new Date(item.record.disabledUntil).toLocaleString()}</div>
              </div>
            </li>
          ))}
        </ul>
      ) : !loading && !failed ? (
        <p className="mt-3 rounded-md border border-dashed border-border px-3 py-4 text-sm text-muted-foreground">
          <Lang text={{ ko: "활성 차단이 없습니다.", en: "There are no active disables." }} />
        </p>
      ) : null}
    </section>
  );
}

function ModelGroup({ provider, items }: { provider: string; items: SystemModelControlClientItem[] }) {
  const invariantItems = items.filter((item) => item.invariantViolation);
  const deprecatedCount = items.filter((item) => item.deprecated).length;

  return (
    <section className="rounded-lg border border-border bg-surface p-4">
      <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <h3 className="min-w-0 break-words text-base font-semibold">
          {provider === "qwen" ? "QwenCloud" : provider}
        </h3>
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <span>{items.filter((item) => item.enabled).length}/{items.length}</span>
          {deprecatedCount > 0 ? (
            <span className="rounded-full bg-muted px-2 py-0.5 font-semibold">deprecated {deprecatedCount}</span>
          ) : null}
        </div>
      </div>

      {invariantItems.length ? (
        <div className="mb-3 flex flex-col gap-1 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive" role="status">
          <span className="font-semibold">
            <Lang text={{ ko: "기본 모델 점검 필요", en: "Default model needs attention" }} />
          </span>
          {invariantItems.map((item) => (
            <span key={item.key}>
              {item.modelName} — <Lang text={invariantReasonLabel(item.invariantViolation?.reasonCode)} />
            </span>
          ))}
        </div>
      ) : null}

      <ul className="divide-y divide-border">
        {items.map((item) => (
          <li key={item.key} className={item.deprecated ? "flex min-w-0 flex-col gap-2 py-3 opacity-75" : "flex min-w-0 flex-col gap-2 py-3"}>
            <div className="min-w-0">
              <div className="break-words text-sm font-medium">{item.displayName || item.modelName}</div>
              {item.displayName && item.displayName !== item.modelName ? (
                <div className="break-all text-xs text-muted-foreground">{item.modelName}</div>
              ) : null}
              <div className="mt-1 break-all text-xs text-muted-foreground">
                upstream: {item.upstreamModelName || item.modelName}
              </div>
              {item.supportsReasoningEffort ? (
                <div className="mt-1 text-xs text-muted-foreground">
                  <Lang text={{ ko: "추론 강도", en: "Reasoning effort" }} />: {item.reasoningEffort || item.policyReasoningEffort || "—"}
                </div>
              ) : null}
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              <span className={item.enabled
                ? "rounded-full bg-primary/10 px-2 py-0.5 text-xxs font-semibold text-primary"
                : "rounded-full bg-muted px-2 py-0.5 text-xxs font-semibold text-muted-foreground"}>
                {item.enabled
                  ? <Lang text={{ ko: "사용 가능", en: "Enabled" }} />
                  : <Lang text={{ ko: "비활성", en: "Disabled" }} />}
              </span>
              {item.policyDefaultModel ? (
                <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xxs font-semibold text-primary">
                  <Lang text={{ ko: "정책 기본", en: "Policy default" }} />
                </span>
              ) : null}
              {item.defaultModel ? (
                <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xxs font-semibold text-primary">
                  <Lang text={{ ko: "기본", en: "Default" }} />
                </span>
              ) : null}
              {item.recommendedModel ? (
                <span className="rounded-full bg-accent/20 px-2 py-0.5 text-xxs font-semibold text-accent-foreground">
                  <Lang text={{ ko: "추천", en: "Recommended" }} />
                </span>
              ) : null}
              {item.deprecated ? (
                <span className="rounded-full bg-muted px-2 py-0.5 text-xxs font-semibold text-muted-foreground">
                  <Lang text={{ ko: "폐기 예정", en: "Deprecated" }} />
                </span>
              ) : null}
              {item.adminOnly ? (
                <span className="rounded-full bg-muted px-2 py-0.5 text-xxs font-semibold text-muted-foreground">
                  <Lang text={{ ko: "관리자 전용", en: "Admin only" }} />
                </span>
              ) : null}
              {item.invariantViolation ? (
                <span className="rounded-full bg-destructive/10 px-2 py-0.5 text-xxs font-semibold text-destructive">
                  <Lang text={{ ko: "점검 필요", en: "Needs attention" }} />
                </span>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function ModelStatusSection() {
  const [models, setModels] = useState<SystemModelControlClientItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [selectedModality, setSelectedModality] = useState("");

  const loadModels = useCallback(async (showLoader = true) => {
    if (showLoader) setLoading(true);
    try {
      setModels(await fetchSystemModelControls());
      setFailed(false);
    } catch (error) {
      logger.error("[SystemControlBox] model controls load failed", error);
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(function loadModelControls() {
    // Load initial read-only data for this tab; later state updates follow the async request.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadModels(false);
  }, [loadModels]);

  const grouped = useMemo(() => groupByProvider(models), [models]);
  const modalityTabs = useMemo(() => getModalityTabs(grouped), [grouped]);
  const activeModality = modalityTabs.find((tab) => tab.modality === selectedModality)?.modality || modalityTabs[0]?.modality || "";

  return (
    <div className="flex flex-col gap-4">
      <EmergencyDisableStatus />
      <section className="rounded-lg border border-border bg-background p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">
              <Lang text={{ ko: "모델 상태", en: "Model status" }} />
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              <Lang text={{ ko: "현재 제공·기본·추천 상태와 운영상 점검 항목을 확인합니다.", en: "Review current availability, defaults, recommendations, and operational checks." }} />
            </p>
          </div>
          {failed ? (
            <Button variant="outline" onClick={() => void loadModels()}>
              <Lang text={{ ko: "다시 시도", en: "Retry" }} />
            </Button>
          ) : null}
        </div>

        {loading ? (
          <div className="mt-4" role="status" aria-live="polite">
            <Preloader variant="spin" size="sm" container />
          </div>
        ) : failed ? (
          <p className="mt-4 text-sm text-destructive" role="alert">
            <Lang text={{ ko: "모델 상태를 불러오지 못했습니다.", en: "Failed to load model status." }} />
          </p>
        ) : !modalityTabs.length ? (
          <p className="mt-4 text-sm text-muted-foreground">
            <Lang text={{ ko: "표시할 모델이 없습니다.", en: "No models to display." }} />
          </p>
        ) : (
          <Tabs value={activeModality} onValueChange={setSelectedModality} className="mt-4 w-full">
            <TabsList className="w-full" scrollable>
              {modalityTabs.map((tab) => (
                <TabsTrigger key={tab.modality} value={tab.modality} className="group">
                  <Lang text={MODALITY_LABEL[tab.modality]} />
                  <span className="ml-1.5 text-xs tabular-nums text-muted-foreground group-data-[state=active]:text-white/80">
                    {tab.enabledCount}/{tab.totalCount}
                  </span>
                  {tab.attentionCount > 0 ? (
                    <span className="ml-1.5 rounded-full bg-amber-200 px-1.5 text-xxs font-semibold text-amber-950">
                      {tab.attentionCount}
                    </span>
                  ) : null}
                </TabsTrigger>
              ))}
            </TabsList>
            {modalityTabs.map((tab) => (
              <TabsContent key={tab.modality} value={tab.modality} className="mt-4 flex flex-col gap-4">
                {tab.providerGroups.map(([key, items]) => (
                  <ModelGroup key={key} provider={key.slice(tab.modality.length + 1)} items={items} />
                ))}
              </TabsContent>
            ))}
          </Tabs>
        )}
      </section>
    </div>
  );
}
