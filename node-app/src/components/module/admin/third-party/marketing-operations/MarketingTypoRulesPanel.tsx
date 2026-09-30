"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Badge, Button, Checkbox, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, Input, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Textarea, dialog } from "@amu-labs/ui";
import { Lang, lang } from "components/module/i18n";
import fetchClient from "libs/api/fetchClient";
import { Check, Edit, Plus, RefreshCw, Save, Search, Shield, Trash, X } from "lucide-react";
import { toast } from "sonner";
import { cn } from "utils/common";
import {
  MARKETING_CONTENT_CHANNEL_OPTIONS,
  MARKETING_TYPO_RULES_API,
  REVIEW_FILTER_ALL_VALUE,
  REVIEW_PANEL_EMPTY_CLASS,
  REVIEW_PANEL_LABEL_CLASS,
  REVIEW_PANEL_SUBTLE_CLASS,
} from "./MarketingOpsConstants";
import type {
  MarketingTypoRule,
  MarketingTypoRuleFormState,
  MarketingTypoRuleSeverity,
  MarketingTypoRuleStatus,
} from "./MarketingOpsTypes";
import { formatDate, getChannelLabel, getMarketingOperatorErrorMessage, toSafeString } from "./MarketingOpsUtils";

const TYPO_RULE_STATUS_OPTIONS: Array<{
  value: MarketingTypoRuleStatus | typeof REVIEW_FILTER_ALL_VALUE;
  label: { ko: string; en: string };
}> = [
  { value: "candidate", label: { ko: "검수 후보", en: "Candidates" } },
  { value: "active", label: { ko: "활성 규칙", en: "Active" } },
  { value: "ignored", label: { ko: "무시됨", en: "Ignored" } },
  { value: "disabled", label: { ko: "비활성", en: "Disabled" } },
  { value: REVIEW_FILTER_ALL_VALUE, label: { ko: "전체 상태", en: "All statuses" } },
];

const TYPO_RULE_SEVERITY_OPTIONS: Array<{
  value: MarketingTypoRuleSeverity | typeof REVIEW_FILTER_ALL_VALUE;
  label: { ko: string; en: string };
}> = [
  { value: REVIEW_FILTER_ALL_VALUE, label: { ko: "전체 심각도", en: "All severities" } },
  { value: "review", label: { ko: "검토", en: "Review" } },
  { value: "warning", label: { ko: "경고", en: "Warning" } },
  { value: "blocking", label: { ko: "차단", en: "Blocking" } },
];

const TYPO_RULE_TYPE_OPTIONS = [
  { value: "literal", label: { ko: "일반 문구", en: "Literal" } },
  { value: "regex", label: { ko: "정규식", en: "Regex" } },
] as const;

const INITIAL_TYPO_RULE_FORM: MarketingTypoRuleFormState = {
  pattern: "",
  type: "literal",
  status: "active",
  severity: "warning",
  expected: "",
  reason: "",
  channels: [],
};

function getStatusLabel(status?: string) {
  switch (status) {
    case "active":
      return lang({ ko: "활성", en: "Active" });
    case "ignored":
      return lang({ ko: "무시", en: "Ignored" });
    case "disabled":
      return lang({ ko: "비활성", en: "Disabled" });
    default:
      return lang({ ko: "후보", en: "Candidate" });
  }
}

function getStatusClass(status?: string) {
  switch (status) {
    case "active":
      // accent 틴트(accent-sub) 위 텍스트는 잉크를 쓴다. text-accent는 라임 위 라임이라 1.18:1이다.
      return "border-accent bg-accent-sub text-primary-text";
    case "ignored":
      return "border-slate-300 bg-slate-100 text-slate-600";
    case "disabled":
      return "border-danger/30 bg-[color-mix(in_srgb,var(--danger)_8%,var(--surface))] text-danger";
    default:
      return "border-primary/30 bg-[color-mix(in_srgb,var(--primary)_8%,var(--surface))] text-primary";
  }
}

function getSeverityLabel(severity?: string) {
  switch (severity) {
    case "blocking":
      return lang({ ko: "차단", en: "Blocking" });
    case "warning":
      return lang({ ko: "경고", en: "Warning" });
    default:
      return lang({ ko: "검토", en: "Review" });
  }
}

function getRuleContext(rule: MarketingTypoRule) {
  const lastSeen = rule.lastSeen || {};
  return toSafeString(lastSeen.context) || toSafeString(rule.evidence?.[rule.evidence.length - 1]?.context);
}

function toRuleTextList(value: unknown) {
  return Array.isArray(value) ? value.map(toSafeString).filter(Boolean) : [];
}

function getRuleFormState(rule?: MarketingTypoRule | null): MarketingTypoRuleFormState {
  if (!rule) return INITIAL_TYPO_RULE_FORM;
  return {
    pattern: toSafeString(rule.pattern),
    type: rule.type || "literal",
    status: rule.status || "active",
    severity: rule.severity || "warning",
    expected: toRuleTextList(rule.expected).join(", "),
    reason: toSafeString(rule.reason),
    channels: toRuleTextList(rule.channels),
  };
}

export function MarketingTypoRulesPanel({
  universeId,
  isGlobalScope = false,
}: {
  universeId?: string;
  isGlobalScope?: boolean;
}) {
  const [rules, setRules] = useState<MarketingTypoRule[]>([]);
  const [statusFilter, setStatusFilter] = useState<string>(REVIEW_FILTER_ALL_VALUE);
  const [severityFilter, setSeverityFilter] = useState<string>(REVIEW_FILTER_ALL_VALUE);
  const [channelFilter, setChannelFilter] = useState<string>(REVIEW_FILTER_ALL_VALUE);
  const [patternDraft, setPatternDraft] = useState("");
  const [patternFilter, setPatternFilter] = useState("");
  const [severityDrafts, setSeverityDrafts] = useState<Record<string, MarketingTypoRuleSeverity>>({});
  const [formOpen, setFormOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<MarketingTypoRule | null>(null);
  const [ruleForm, setRuleForm] = useState<MarketingTypoRuleFormState>(INITIAL_TYPO_RULE_FORM);
  const [loading, setLoading] = useState(false);
  const [busyRuleId, setBusyRuleId] = useState("");
  const [savingRule, setSavingRule] = useState(false);
  const [deduplicating, setDeduplicating] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const latestLoadRequestRef = useRef(0);

  const hasActiveSearch = Boolean(
    statusFilter !== REVIEW_FILTER_ALL_VALUE ||
    severityFilter !== REVIEW_FILTER_ALL_VALUE ||
    channelFilter !== REVIEW_FILTER_ALL_VALUE ||
    patternFilter,
  );

  const visibleRuleCountLabel = useMemo(
    () =>
      lang({
        ko: `${rules.length.toLocaleString()}개 규칙`,
        en: `${rules.length.toLocaleString()} rule(s)`,
      }),
    [rules.length],
  );
  const canManageRules = Boolean(toSafeString(universeId));

  const loadRules = useCallback(async () => {
    const requestId = latestLoadRequestRef.current + 1;
    latestLoadRequestRef.current = requestId;
    try {
      setLoading(true);
      setErrorMessage("");
      const response = await fetchClient.get<{ data?: { items?: MarketingTypoRule[] } }>(MARKETING_TYPO_RULES_API, {
        params: {
          ...(universeId ? { universeId } : {}),
          status: statusFilter === REVIEW_FILTER_ALL_VALUE ? "" : statusFilter,
          severity: severityFilter === REVIEW_FILTER_ALL_VALUE ? "" : severityFilter,
          channel: channelFilter === REVIEW_FILTER_ALL_VALUE ? "" : channelFilter,
          pattern: patternFilter,
          limit: 80,
        },
      });
      if (requestId !== latestLoadRequestRef.current) return;
      const items = response.data?.data?.items || [];
      setRules(items);
      setSeverityDrafts((prev) => {
        const next = { ...prev };
        items.forEach((rule) => {
          const ruleId = toSafeString(rule.ruleId);
          if (ruleId && !next[ruleId]) next[ruleId] = rule.severity || "review";
        });
        return next;
      });
    } catch (error) {
      if (requestId !== latestLoadRequestRef.current) return;
      setRules([]);
      setErrorMessage(
        getMarketingOperatorErrorMessage(
          error,
          lang({ ko: "오탈자 사전 조회에 실패했습니다.", en: "Failed to load typo rules." }),
        ),
      );
    } finally {
      if (requestId === latestLoadRequestRef.current) setLoading(false);
    }
  }, [channelFilter, patternFilter, severityFilter, statusFilter, universeId]);

  useEffect(
    function loadTypoRulesOnFilterChange() {
      // 외부 API에서 오탈자 사전 상태 fetch — loadRules 내부에서 목록/로딩 상태를 동기화
      // eslint-disable-next-line react-hooks/set-state-in-effect
      void loadRules();
    },
    [loadRules],
  );

  const updateRuleStatus = async (rule: MarketingTypoRule, nextStatus: MarketingTypoRuleStatus) => {
    const ruleId = toSafeString(rule.ruleId);
    const ruleUniverseId = toSafeString(universeId);
    if (!ruleId || !ruleUniverseId) return;

    try {
      setBusyRuleId(ruleId);
      const severity = severityDrafts[ruleId] || rule.severity || (nextStatus === "active" ? "warning" : "review");
      await fetchClient.post(MARKETING_TYPO_RULES_API, {
        universeId: ruleUniverseId,
        ruleId,
        status: nextStatus,
        severity,
      });
      toast.success(
        lang({
          ko: "오탈자 사전 상태를 업데이트했습니다.",
          en: "Typo rule status updated.",
        }),
      );
      await loadRules();
    } catch (error) {
      toast.error(
        getMarketingOperatorErrorMessage(
          error,
          lang({ ko: "오탈자 사전 상태 변경에 실패했습니다.", en: "Failed to update typo rule." }),
        ),
      );
    } finally {
      setBusyRuleId("");
    }
  };

  const openCreateRuleForm = () => {
    setEditingRule(null);
    setRuleForm(INITIAL_TYPO_RULE_FORM);
    setFormOpen(true);
  };

  const openEditRuleForm = (rule: MarketingTypoRule) => {
    setEditingRule(rule);
    setRuleForm(getRuleFormState(rule));
    setFormOpen(true);
  };

  const closeRuleForm = () => {
    if (savingRule) return;
    setFormOpen(false);
    setEditingRule(null);
    setRuleForm(INITIAL_TYPO_RULE_FORM);
  };

  const setRuleFormField = <K extends keyof MarketingTypoRuleFormState>(
    key: K,
    value: MarketingTypoRuleFormState[K],
  ) => {
    setRuleForm((prev) => ({ ...prev, [key]: value }));
  };

  const toggleFormChannel = (channel: string, checked: boolean) => {
    setRuleForm((prev) => {
      const channels = new Set(prev.channels);
      if (checked) channels.add(channel);
      else channels.delete(channel);
      return { ...prev, channels: Array.from(channels) };
    });
  };

  const saveRuleForm = async () => {
    const targetUniverseId = toSafeString(universeId);
    const pattern = toSafeString(ruleForm.pattern);
    const filtersAlreadyReset =
      statusFilter === REVIEW_FILTER_ALL_VALUE &&
      severityFilter === REVIEW_FILTER_ALL_VALUE &&
      channelFilter === REVIEW_FILTER_ALL_VALUE &&
      !patternFilter;
    if (!targetUniverseId) {
      toast.error(lang({ ko: "수동 등록 대상 유니버스를 먼저 선택해주세요.", en: "Select a target universe first." }));
      return;
    }
    if (!pattern) {
      toast.error(lang({ ko: "등록할 한글/단어/문구를 입력해주세요.", en: "Enter a typo pattern." }));
      return;
    }

    try {
      setSavingRule(true);
      await fetchClient.post(MARKETING_TYPO_RULES_API, {
        action: editingRule ? "update" : "create",
        universeId: targetUniverseId,
        ruleId: editingRule?.ruleId,
        pattern,
        type: ruleForm.type,
        status: ruleForm.status,
        severity: ruleForm.severity,
        expected: ruleForm.expected,
        reason: ruleForm.reason,
        channels: ruleForm.channels,
      });
      toast.success(
        lang({
          ko: editingRule ? "오탈자 사전 항목을 수정했습니다." : "오탈자 사전 항목을 등록했습니다.",
          en: editingRule ? "Typo rule updated." : "Typo rule created.",
        }),
      );
      setFormOpen(false);
      setEditingRule(null);
      setRuleForm(INITIAL_TYPO_RULE_FORM);
      setStatusFilter(REVIEW_FILTER_ALL_VALUE);
      setSeverityFilter(REVIEW_FILTER_ALL_VALUE);
      setChannelFilter(REVIEW_FILTER_ALL_VALUE);
      setPatternDraft("");
      setPatternFilter("");
      if (filtersAlreadyReset) await loadRules();
    } catch (error) {
      toast.error(
        getMarketingOperatorErrorMessage(
          error,
          lang({ ko: "오탈자 사전 저장에 실패했습니다.", en: "Failed to save typo rule." }),
        ),
      );
    } finally {
      setSavingRule(false);
    }
  };

  const disableRule = async (rule: MarketingTypoRule) => {
    const confirmed = await dialog.confirm(
      lang({
        ko: "이 항목을 검증에서 제외하고 비활성 상태로 전환할까요? 기록은 삭제되지 않습니다.",
        en: "Disable this rule and exclude it from validation? The record will be kept.",
      }),
    );
    if (!confirmed) return;
    await updateRuleStatus(rule, "disabled");
  };

  const deduplicateRules = async () => {
    const targetUniverseId = toSafeString(universeId);
    if (!targetUniverseId) return;
    const confirmed = await dialog.confirm(
      lang({
        ko: "전체 유니버스의 오탈자 사전을 공통 스코프로 병합하고 중복 레코드를 제거할까요? 상태, 심각도, 발견 횟수와 증거는 보존됩니다.",
        en: "Merge typo rules from every universe into the shared scope and remove duplicates? Status, severity, occurrence counts, and evidence are preserved.",
      }),
    );
    if (!confirmed) return;

    try {
      setDeduplicating(true);
      const response = await fetchClient.post(MARKETING_TYPO_RULES_API, {
        action: "deduplicate",
        universeId: targetUniverseId,
      });
      const removedCount = Number(response.data?.data?.removedCount || 0);
      const scopeMigratedCount = Number(response.data?.data?.scopeMigratedCount || 0);
      toast.success(
        lang({
          ko: `공통 오탈자 사전 정리를 완료했습니다. 중복 ${removedCount.toLocaleString()}건 제거, ${scopeMigratedCount.toLocaleString()}건 공통 전환했습니다.`,
          en: `Shared typo dictionary cleanup completed. Removed ${removedCount.toLocaleString()} duplicate(s) and migrated ${scopeMigratedCount.toLocaleString()} rule(s).`,
        }),
      );
      await loadRules();
    } catch (error) {
      toast.error(
        getMarketingOperatorErrorMessage(
          error,
          lang({ ko: "오탈자 사전 중복 정리에 실패했습니다.", en: "Failed to deduplicate typo rules." }),
        ),
      );
    } finally {
      setDeduplicating(false);
    }
  };

  const resetFilters = () => {
    setStatusFilter(REVIEW_FILTER_ALL_VALUE);
    setSeverityFilter(REVIEW_FILTER_ALL_VALUE);
    setChannelFilter(REVIEW_FILTER_ALL_VALUE);
    setPatternDraft("");
    setPatternFilter("");
  };

  return (
    <section className="space-y-4">
      <div className="flex items-center gap-1.5">
        <Lang text={{ ko: "공통 오탈자 사전/검수", en: "Shared typo dictionary review" }} />
        <Badge variant="outline" size="xs">
          {visibleRuleCountLabel}
        </Badge>
      </div>

      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0">
          <p className="mt-1 text-xs leading-5 text-secondary-text">
            <Lang
              text={{
                ko: "모든 유니버스가 하나의 사전을 공유합니다. AI 후보를 활성화하면 이후 모든 콘텐츠의 채널 draft 검증에 반영됩니다.",
                en: "Every universe shares this dictionary. Activating an AI candidate applies it to later channel draft validation for all content.",
              }}
            />
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            size="xs"
            onClick={openCreateRuleForm}
            disabled={!canManageRules || loading || deduplicating || !!busyRuleId}
          >
            <Plus className="icon-xxs" />
            <span>{lang({ ko: "수동 등록", en: "Add rule" })}</span>
          </Button>
          <Button
            variant="outline"
            size="xs"
            onClick={() => void deduplicateRules()}
            disabled={!canManageRules || loading || deduplicating || !!busyRuleId}
          >
            <RefreshCw className={cn(deduplicating ? "animate-spin" : "", "icon-xxs")} />
            <span>{lang({ ko: "중복 정리", en: "Deduplicate" })}</span>
          </Button>
          <Button variant="outline" size="xs" onClick={() => void loadRules()} disabled={loading || deduplicating || !!busyRuleId}>
            <RefreshCw className={cn(loading ? "animate-spin" : "", "icon-xxs")} />
            <span>{lang({ ko: "새로고침", en: "Refresh" })}</span>
          </Button>
        </div>
      </div>

      {!toSafeString(universeId) ? (
        <p className="rounded-lg border border-dashed border-border bg-muted/20 px-3 py-2 text-xs leading-5 text-secondary-text">
          <Lang
            text={{
              ko: "공통 사전은 전체 범위로 조회됩니다. 등록·편집 권한을 확인할 유니버스를 먼저 선택하세요.",
              en: "The shared dictionary is listed globally. Select a universe first to authorize create or edit actions.",
            }}
          />
        </p>
      ) : null}

      <div className="grid gap-3 md:grid-cols-4">
        <div>
          <label className={REVIEW_PANEL_LABEL_CLASS}>
            <Lang text={{ ko: "상태", en: "Status" }} />
          </label>
          <Select
            value={statusFilter}
            onValueChange={(value) => setStatusFilter(Array.isArray(value) ? value[0] || "candidate" : value)}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TYPO_RULE_STATUS_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {lang(option.label)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div>
          <label className={REVIEW_PANEL_LABEL_CLASS}>
            <Lang text={{ ko: "심각도", en: "Severity" }} />
          </label>
          <Select
            value={severityFilter}
            onValueChange={(value) =>
              setSeverityFilter(Array.isArray(value) ? value[0] || REVIEW_FILTER_ALL_VALUE : value)
            }
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TYPO_RULE_SEVERITY_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {lang(option.label)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div>
          <label className={REVIEW_PANEL_LABEL_CLASS}>
            <Lang text={{ ko: "채널", en: "Channel" }} />
          </label>
          <Select
            value={channelFilter}
            onValueChange={(value) =>
              setChannelFilter(Array.isArray(value) ? value[0] || REVIEW_FILTER_ALL_VALUE : value)
            }
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={REVIEW_FILTER_ALL_VALUE}>{lang({ ko: "전체 채널", en: "All channels" })}</SelectItem>
              {MARKETING_CONTENT_CHANNEL_OPTIONS.map((channel) => (
                <SelectItem key={channel.value} value={channel.value}>
                  {channel.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div>
          <label className={REVIEW_PANEL_LABEL_CLASS}>
            <Lang text={{ ko: "패턴 검색", en: "Pattern search" }} />
          </label>
          <div className="flex gap-2">
            <Input
              value={patternDraft}
              onChange={(event) => setPatternDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") setPatternFilter(patternDraft.trim());
              }}
              placeholder={lang({ ko: "정확한 후보 문구", en: "Exact typo pattern" })}
            />
            <Button variant="outline" size="icon-sm" onClick={() => setPatternFilter(patternDraft.trim())}>
              <Search className="icon-xxs" />
              <span className="sr-only">{lang({ ko: "검색", en: "Search" })}</span>
            </Button>
          </div>
        </div>
      </div>

      {hasActiveSearch ? (
        <div className="flex justify-end">
          <Button variant="blank" size="xs" onClick={resetFilters} className="flex items-center gap-1">
            <X className="icon-xxs" />
            <span>{lang({ ko: "필터 초기화", en: "Reset filters" })}</span>
          </Button>
        </div>
      ) : null}

      {errorMessage ? (
        <div className="rounded-lg border border-danger/30 bg-[color-mix(in_srgb,var(--danger)_8%,var(--surface))] px-3 py-2 text-xs text-danger">
          {errorMessage}
        </div>
      ) : null}

      {loading ? (
        <p className={REVIEW_PANEL_EMPTY_CLASS}>
          <Lang text={{ ko: "오탈자 사전을 불러오는 중입니다.", en: "Loading typo rules." }} />
        </p>
      ) : rules.length === 0 ? (
        <p className={REVIEW_PANEL_EMPTY_CLASS}>
          <Lang
            text={{
              ko: "현재 조건에 맞는 오탈자 사전 항목이 없습니다.",
              en: "No typo rules match the current filters.",
            }}
          />
        </p>
      ) : (
        <div className="space-y-3">
          {rules.map((rule) => {
            const ruleId = toSafeString(rule.ruleId);
            const expected = toRuleTextList(rule.expected);
            const channels = toRuleTextList(rule.channels);
            const context = getRuleContext(rule);
            const busy = busyRuleId === ruleId;
            const severity = severityDrafts[ruleId] || rule.severity || "review";

            return (
              <article key={ruleId} className="rounded-xl border border-border bg-surface-2 px-3 py-3">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1">
                      <Badge variant="outline" size="xs" className={getStatusClass(rule.status)}>
                        {getStatusLabel(rule.status)}
                      </Badge>
                      <Badge variant="outline" size="xs">
                        {rule.type || "literal"}
                      </Badge>
                      <Badge variant="outline" size="xs">
                        {getSeverityLabel(severity)}
                      </Badge>
                      {isGlobalScope ? (
                        <Badge variant="outlineMuted" size="xs">
                          {lang({ ko: "전체 유니버스 공통", en: "Shared globally" })}
                        </Badge>
                      ) : null}
                      <span className="font-mono text-[11px] text-muted-text">
                        {lang({
                          ko: `감지 ${Number(rule.occurrenceCount || 0)}회`,
                          en: `${Number(rule.occurrenceCount || 0)} hits`,
                        })}
                      </span>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="flex items-center gap-1 5">
                        <p className="mt-2 break-all text-sm font-semibold text-primary-text">{rule.pattern || "-"}</p>
                        {expected.length > 0 ? (
                          <p className="mt-1 text-xs text-secondary-text">
                            {lang({ ko: "수정 후보", en: "Expected" })}: {expected.join(", ")}
                          </p>
                        ) : null}
                        {rule.reason ? (
                          <p className="mt-1 text-xs leading-5 text-secondary-text">{rule.reason}</p>
                        ) : null}
                        {context ? <p className={cn(REVIEW_PANEL_SUBTLE_CLASS, "mt-2 break-all")}>{context}</p> : null}
                      </div>
                      <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-muted-text">
                        <span>
                          {lang({ ko: "채널", en: "Channels" })}:{" "}
                          {channels.length > 0
                            ? channels.map(getChannelLabel).join(" / ")
                            : lang({ ko: "전체", en: "All" })}
                        </span>
                        <span>
                          {lang({ ko: "최근", en: "Last" })}: {formatDate(rule.lastSeenAt || rule.updatedAt)}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <Select
                      size="xs"
                      value={severity}
                      disabled={!canManageRules || busy}
                      onValueChange={(value) =>
                        setSeverityDrafts((prev) => ({
                          ...prev,
                          [ruleId]: (Array.isArray(value) ? value[0] || "review" : value) as MarketingTypoRuleSeverity,
                        }))
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="review">{lang({ ko: "검토", en: "Review" })}</SelectItem>
                        <SelectItem value="warning">{lang({ ko: "경고", en: "Warning" })}</SelectItem>
                        <SelectItem value="blocking">{lang({ ko: "차단", en: "Blocking" })}</SelectItem>
                      </SelectContent>
                    </Select>
                    <Button variant="outline" size="xs" onClick={() => openEditRuleForm(rule)} disabled={!canManageRules || busy}>
                      <Edit className="icon-xxs" />
                      <span>{lang({ ko: "편집", en: "Edit" })}</span>
                    </Button>
                    <Button
                      size="xs"
                      onClick={() => void updateRuleStatus(rule, "active")}
                      disabled={!canManageRules || busy || rule.status === "active"}
                    >
                      <Shield className="icon-xxs" />
                      <span>{lang({ ko: "활성", en: "Activate" })}</span>
                    </Button>
                    <Button
                      variant="outline"
                      size="xs"
                      onClick={() => void updateRuleStatus(rule, "ignored")}
                      disabled={!canManageRules || busy || rule.status === "ignored"}
                    >
                      <Check className="icon-xxs" />
                      <span>{lang({ ko: "정상/무시", en: "Ignore" })}</span>
                    </Button>
                    <Button
                      variant="outline"
                      size="xs"
                      onClick={() => void disableRule(rule)}
                      disabled={!canManageRules || busy || rule.status === "disabled"}
                    >
                      <Trash className="icon-xxs" />
                      <span>{lang({ ko: "제거", en: "Remove" })}</span>
                    </Button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}

      <Dialog open={formOpen} onOpenChange={(open) => (open ? setFormOpen(true) : closeRuleForm())}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              <Lang
                text={{
                  ko: editingRule ? "오탈자 사전 항목 편집" : "오탈자 사전 수동 등록",
                  en: editingRule ? "Edit typo rule" : "Add typo rule",
                }}
              />
            </DialogTitle>
            <DialogDescription className="text-left text-sm leading-6 text-secondary-text">
              <Lang
                text={{
                  ko: "검증에서 감지할 한글/단어/문구와 수정 후보, 적용 채널, 차단 강도를 설정합니다.",
                  en: "Set the Korean word or phrase to detect, expected replacement, channels, and validation severity.",
                }}
              />
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-3 md:grid-cols-2">
            <div className="md:col-span-2">
              <label className={REVIEW_PANEL_LABEL_CLASS}>
                <Lang text={{ ko: "감지할 한글/단어/문구", en: "Pattern" }} />
              </label>
              <Input
                value={ruleForm.pattern}
                onChange={(event) => setRuleFormField("pattern", event.target.value)}
                placeholder={lang({ ko: "예: 잘못된 표현", en: "Example: typo phrase" })}
              />
            </div>

            <div>
              <label className={REVIEW_PANEL_LABEL_CLASS}>
                <Lang text={{ ko: "감지 방식", en: "Match type" }} />
              </label>
              <Select
                value={ruleForm.type}
                onValueChange={(value) =>
                  setRuleFormField(
                    "type",
                    (Array.isArray(value) ? value[0] || "literal" : value) as "literal" | "regex",
                  )
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TYPO_RULE_TYPE_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {lang(option.label)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className={REVIEW_PANEL_LABEL_CLASS}>
                <Lang text={{ ko: "상태", en: "Status" }} />
              </label>
              <Select
                value={ruleForm.status}
                onValueChange={(value) =>
                  setRuleFormField(
                    "status",
                    (Array.isArray(value) ? value[0] || "active" : value) as MarketingTypoRuleStatus,
                  )
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TYPO_RULE_STATUS_OPTIONS.filter((option) => option.value !== REVIEW_FILTER_ALL_VALUE).map(
                    (option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {lang(option.label)}
                      </SelectItem>
                    ),
                  )}
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className={REVIEW_PANEL_LABEL_CLASS}>
                <Lang text={{ ko: "심각도", en: "Severity" }} />
              </label>
              <Select
                value={ruleForm.severity}
                onValueChange={(value) =>
                  setRuleFormField(
                    "severity",
                    (Array.isArray(value) ? value[0] || "warning" : value) as MarketingTypoRuleSeverity,
                  )
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TYPO_RULE_SEVERITY_OPTIONS.filter((option) => option.value !== REVIEW_FILTER_ALL_VALUE).map(
                    (option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {lang(option.label)}
                      </SelectItem>
                    ),
                  )}
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className={REVIEW_PANEL_LABEL_CLASS}>
                <Lang text={{ ko: "수정 후보", en: "Expected" }} />
              </label>
              <Input
                value={ruleForm.expected}
                onChange={(event) => setRuleFormField("expected", event.target.value)}
                placeholder={lang({ ko: "쉼표로 구분", en: "Comma separated" })}
              />
            </div>

            <div className="md:col-span-2">
              <label className={REVIEW_PANEL_LABEL_CLASS}>
                <Lang text={{ ko: "적용 채널", en: "Channels" }} />
              </label>
              <div className="grid gap-2 md:grid-cols-4">
                {MARKETING_CONTENT_CHANNEL_OPTIONS.map((channel) => (
                  <label
                    key={channel.value}
                    className="flex items-center gap-2 rounded-md border border-border bg-surface px-3 py-2 text-xs text-primary-text"
                  >
                    <Checkbox
                      checked={ruleForm.channels.includes(channel.value)}
                      onCheckedChange={(checked) => toggleFormChannel(channel.value, Boolean(checked))}
                      aria-label={lang({ ko: `${channel.label} 적용`, en: `Apply to ${channel.label}` })}
                    />
                    <span>{channel.label}</span>
                  </label>
                ))}
              </div>
              <p className="mt-1 text-xxs text-secondary-text">
                <Lang
                  text={{
                    ko: "아무 채널도 선택하지 않으면 전체 채널에 적용됩니다.",
                    en: "When no channel is selected, the rule applies to all channels.",
                  }}
                />
              </p>
            </div>

            <div className="md:col-span-2">
              <label className={REVIEW_PANEL_LABEL_CLASS}>
                <Lang text={{ ko: "등록/수정 사유", en: "Reason" }} />
              </label>
              <Textarea
                rows={3}
                value={ruleForm.reason}
                onChange={(event) => setRuleFormField("reason", event.target.value)}
                placeholder={lang({
                  ko: "운영자가 이 표현을 관리해야 하는 이유",
                  en: "Why this expression should be managed",
                })}
              />
            </div>
          </div>

          <DialogFooter className="flex gap-2">
            <Button variant="outline" onClick={closeRuleForm} disabled={savingRule}>
              <X className="icon-xs" />
              <span>{lang({ ko: "취소", en: "Cancel" })}</span>
            </Button>
            <Button onClick={() => void saveRuleForm()} loading={savingRule}>
              <Save className="icon-xs" />
              <span>{lang({ ko: "저장", en: "Save" })}</span>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
