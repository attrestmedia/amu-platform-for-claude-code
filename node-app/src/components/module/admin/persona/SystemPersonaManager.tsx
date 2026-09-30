"use client";

import { useCallback, useEffect, useState } from "react";
import { listSystemPersonas, upsertSystemPersona, deleteSystemPersona } from "libs/api/universe";
import { Button, Input, Textarea, Switch, Preloader, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, dialog } from "@amu-labs/ui";
import { Lang } from "components/module/i18n";
import { logger } from "utils/log";
import { normalizeKey } from "utils/normalize";
import { getSystemPersonaPreviewText } from "utils/ai/systemPersonaPreview";
import { THEME_OVERRIDE_CLASS } from "utils/theme";
import { cn } from "utils/common";
import type {
  SystemPersonaTutorAnswerStyleType,
  SystemPersonaTutorOperationModeType,
  SystemPersonaTutorsPolicyDefaultsType,
  SystemPersonaUsageType,
  SystemPersonaLifecycleType,
  SystemPersonaPresetKindType,
  SystemPersonaSafetyProfileType,
} from "types/ai";
import {
  normalizeSystemPersonaTutorsPolicyDefaults,
  normalizeSystemPersonaLifecycleMetadata,
  normalizeSystemPersonaUsageType,
  SYSTEM_PERSONA_TUTOR_ANSWER_STYLE_VALUES,
  SYSTEM_PERSONA_TUTOR_OPERATION_MODE_VALUES,
  SYSTEM_PERSONA_USAGE_OPTIONS,
  SYSTEM_PERSONA_LIFECYCLE_VALUES,
  SYSTEM_PERSONA_PRESET_KIND_VALUES,
} from "types/ai";
import {
  TUTOR_CONVERSATION_LEVEL_OPTIONS,
  TUTOR_GOAL_TYPE_OPTIONS,
  type TutorConversationLevel,
  type TutorGoalType,
} from "consts/tutors";
import { DEFAULT_FANTASY_UNIVERSE } from "consts/app";

type Row = {
  key: string;
  title: string;
  category?: string;
  summary?: string;
  enabled: boolean;
  forUniverses?: SystemPersonaUsageType;
  tutorsPolicyDefaults?: SystemPersonaTutorsPolicyDefaultsType;
  prompt: string;
  updatedAt?: string;
  universeId?: string | null;
  personaPid?: string | null;
  presetKind?: SystemPersonaPresetKindType;
  lifecycle?: SystemPersonaLifecycleType;
  runtimeResolvable?: boolean;
  replacementKey?: string;
  revision?: number;
  safetyProfile?: SystemPersonaSafetyProfileType;
};

type UniverseFilterValue = "__ALL__" | "__GLOBAL__" | string;
const SYSTEM_PERSONA_META_UNSET_VALUE = "__unset__";
const getRowIdentity = (row: Pick<Row, "key" | "universeId">) => [row.key, row.universeId || "__GLOBAL__"].join(":");
const getRowScope = (row: Pick<Row, "universeId">) => ({
  universeId: row.universeId || null,
});
const getUsageLabel = (value?: string | null) =>
  SYSTEM_PERSONA_USAGE_OPTIONS.find((opt) => opt.value === normalizeSystemPersonaUsageType(value))?.label || "All";

export function SystemPersonaManager() {
  const [list, setList] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState<Row | null>(null);
  const [selectedIdentity, setSelectedIdentity] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [universeFilter, setUniverseFilter] = useState<UniverseFilterValue>("__ALL__");

  const CATEGORY_OPTIONS = [
    "common", // 범용 기본 대화/분석
    "analysis", // 비판/논증/관점 확장
    "education", // 학습/지식 전달/튜터링
    "coaching", // 코칭/멘탈/라이프 가이드
    "health", // 건강/의료 관련 조언
    "relationship", // 친구/연애/정서적 교감
    "storytelling", // 스토리텔링/서사/세계관
    "sales", // 세일즈/마케팅/쇼핑 호스트
    "support", // 고객지원/CS
    "entertainment", // 유머/캐릭터 플레이/가벼운 재미
    "experimental", // 실험적/특수 목적
  ] as const;

  const fetchList = useCallback(async () => {
    setLoading(true);
    try {
      const rows = (await listSystemPersonas({ q, includePrompt: true })) as Row[];
      setList(
        rows
          .filter((row) => !row.personaPid)
          .map((row) => {
            const lifecycle = normalizeSystemPersonaLifecycleMetadata(row);
            return {
              ...row,
              forUniverses: normalizeSystemPersonaUsageType(row.forUniverses),
              tutorsPolicyDefaults: normalizeSystemPersonaTutorsPolicyDefaults(row.tutorsPolicyDefaults),
              presetKind: row.presetKind || lifecycle.presetKind,
              lifecycle: row.lifecycle || lifecycle.lifecycle,
              runtimeResolvable: row.runtimeResolvable !== false && lifecycle.runtimeResolvable,
              replacementKey: row.replacementKey || lifecycle.replacementKey,
              revision: Number(row.revision || lifecycle.revision),
              safetyProfile: row.safetyProfile || lifecycle.safetyProfile,
              personaPid: null,
            };
          }),
      );
    } catch (e) {
      logger.error("시스템 페르소나 목록 조회 실패:", e);
    } finally {
      setLoading(false);
    }
  }, [q]);

  useEffect(
    function fetchSystemPersonaListOnMount() {
      // 마운트 시 외부 API에서 시스템 페르소나 목록 fetch
      // eslint-disable-next-line react-hooks/set-state-in-effect
      fetchList();
    },
    [fetchList],
  );

  // 유니크한 universeId 목록 추출
  const universeIdSet = new Set<string>();
  list.forEach((r) => {
    if (r.universeId) universeIdSet.add(r.universeId);
  });
  const universeOptions = Array.from(universeIdSet).sort();

  // 유니버스 필터 적용된 리스트
  const filteredList = list.filter((r) => {
    if (universeFilter === "__ALL__") return true; // 전체
    if (universeFilter === "__GLOBAL__") return !r.universeId; // universeId 없는 공용
    return r.universeId === universeFilter; // 특정 유니버스만
  });

  const startCreate = () => {
    // 현재 유니버스 필터가 특정 유니버스면 그걸 기본값으로 사용
    const universeIdForNew =
      universeFilter === "__ALL__" || universeFilter === "__GLOBAL__" ? "" : (universeFilter as string);

    setSelectedIdentity(null);
    setEditing({
      key: "",
      title: "",
      category: "core",
      summary: "",
      enabled: true,
      forUniverses: "all",
      presetKind: "system-persona",
      lifecycle: "published",
      runtimeResolvable: true,
      replacementKey: "",
      revision: 1,
      safetyProfile: "standard",
      tutorsPolicyDefaults: {},
      prompt: "",
      universeId: universeIdForNew,
    });
  };

  const editByKey = (row: Row) => {
    setSelectedIdentity(getRowIdentity(row));
    setEditing({
      ...row,
      summary: row.summary || "",
      prompt: row.prompt || "",
      forUniverses: normalizeSystemPersonaUsageType(row.forUniverses),
      presetKind: row.presetKind || "system-persona",
      lifecycle: row.lifecycle || "published",
      runtimeResolvable: row.runtimeResolvable !== false,
      replacementKey: row.replacementKey || "",
      revision: Number(row.revision || 1),
      safetyProfile: row.safetyProfile || "standard",
      tutorsPolicyDefaults: normalizeSystemPersonaTutorsPolicyDefaults(row.tutorsPolicyDefaults),
      universeId: row.universeId ?? "",
    });
  };

  const closeEditor = () => {
    setEditing(null);
    setSelectedIdentity(null);
  };

  const patchTutorsPolicyDefaults = (patch: Partial<SystemPersonaTutorsPolicyDefaultsType>) => {
    if (!editing) return;

    setEditing({
      ...editing,
      tutorsPolicyDefaults: normalizeSystemPersonaTutorsPolicyDefaults({
        ...(editing.tutorsPolicyDefaults || {}),
        ...patch,
      }),
    });
  };

  const removeTutorsPolicyDefault = (key: keyof SystemPersonaTutorsPolicyDefaultsType) => {
    if (!editing) return;

    const next = { ...(editing.tutorsPolicyDefaults || {}) };
    delete next[key];
    setEditing({ ...editing, tutorsPolicyDefaults: next });
  };

  const save = async () => {
    if (!editing) return;
    const key = normalizeKey(editing.key);
    if (!key || !editing.title.trim()) return;

    const universeId = (editing.universeId || "").trim();
    setSaving(true);
    try {
      const saved = await upsertSystemPersona({
        key,
        title: editing.title.trim(),
        category: editing.category || "core",
        summary: editing.summary || "",
        prompt: editing.prompt,
        forUniverses: normalizeSystemPersonaUsageType(editing.forUniverses),
        presetKind: editing.presetKind,
        lifecycle: editing.lifecycle,
        runtimeResolvable: editing.runtimeResolvable,
        replacementKey: editing.replacementKey,
        revision: editing.revision,
        safetyProfile: editing.safetyProfile,
        tutorsPolicyDefaults: normalizeSystemPersonaTutorsPolicyDefaults(editing.tutorsPolicyDefaults),
        enabled: editing.enabled !== false,
        universeId: universeId || null, // 빈 값은 global
        personaPid: null, // 공통 시스템 페르소나 관리에서는 캐릭터 귀속형을 다루지 않음
      });
      await fetchList();
      editByKey({
        ...saved,
        prompt: saved.prompt || editing.prompt,
        personaPid: null,
      });
    } catch (e) {
      logger.error("저장 실패:", e);
    } finally {
      setSaving(false);
    }
  };

  const remove = async (row: Row) => {
    if (
      !(await dialog.confirm({
        variant: "danger",
        message: "해당 시스템 페르소나를 삭제할까요? 이 작업은 되돌릴 수 없습니다.",
      }))
    )
      return;
    const rowIdentity = getRowIdentity(row);
    try {
      await deleteSystemPersona(row.key, getRowScope(row));
      await fetchList();
      if (selectedIdentity === rowIdentity) closeEditor();
    } catch (e) {
      logger.error("삭제 실패:", e);
    }
  };

  return (
    <div
      className={cn("flex h-full min-h-0 flex-col gap-4 overflow-y-auto p-2 lg:overflow-hidden", THEME_OVERRIDE_CLASS)}
    >
      {/* 검색/액션 바 + 유니버스 필터 */}
      <div className="flex shrink-0 flex-col gap-2 sm:flex-row">
        <div className="flex-1 flex flex-col sm:flex-row gap-2">
          <div className="flex-1">
            <Input
              placeholder="키/제목/내용 검색..."
              value={q}
              onChange={(e) => setQ(e.target.value)}
              className="w-full"
            />
          </div>
          {universeOptions.length > 0 && (
            <div className="w-full sm:w-56">
              <Select value={universeFilter} onValueChange={(v) => setUniverseFilter(v as UniverseFilterValue)}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="유니버스 필터" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__ALL__">전체 유니버스</SelectItem>
                  <SelectItem value="__GLOBAL__">공용 (universeId 없음)</SelectItem>
                  {universeOptions.map((uid) => (
                    <SelectItem key={uid} value={uid}>
                      {uid}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={fetchList}>
            검색
          </Button>
          <Button onClick={startCreate}>+ 신규</Button>
        </div>
      </div>

      <div className="flex flex-col gap-4 lg:min-h-0 lg:flex-1 lg:flex-row">
        {/* 우측: 상세 편집 영역. 모바일에서는 기존처럼 목록보다 먼저 표시 */}
        <section className="order-1 flex min-h-[18rem] flex-col overflow-hidden rounded-xl border border-border/70 bg-surface shadow-sm lg:order-2 lg:flex-1">
          <div className="flex shrink-0 items-center justify-between gap-3 border-b border-border/70 bg-background/80 px-4 py-3">
            <div>
              <h3 className="text-base font-semibold text-primary-text">
                <Lang text={{ ko: "시스템 페르소나 정보", en: "System Persona Information" }} />
              </h3>
              <p className="mt-1 text-xs text-secondary-text">
                <Lang
                  text={{
                    ko: "선택한 공통 시스템 페르소나의 데이터와 Tutors 기본 정책을 편집합니다.",
                    en: "Edit the selected system persona and its default Tutors policy.",
                  }}
                />
              </p>
            </div>
            {editing?.key ? (
              <code className="max-w-[45%] truncate rounded-lg bg-background px-2.5 py-1 text-xs text-secondary-text">
                {editing.key}
              </code>
            ) : null}
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto">
            {editing ? (
              <div className="space-y-3 p-4">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <label className="text-xs text-gray-500">Key (영문 소문자/하이픈)</label>
                    <Input value={editing.key} onChange={(e) => setEditing({ ...editing, key: e.target.value })} />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500">Title</label>
                    <Input value={editing.title} onChange={(e) => setEditing({ ...editing, title: e.target.value })} />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500">Category</label>
                    <Select
                      value={editing.category || "core"}
                      onValueChange={(v) => setEditing({ ...editing, category: v as string })}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Select a category" />
                      </SelectTrigger>
                      <SelectContent>
                        {CATEGORY_OPTIONS.map((opt) => (
                          <SelectItem key={opt} value={opt}>
                            {opt}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex items-center gap-2 pt-6">
                    <Switch checked={editing.enabled} onCheckedChange={(v) => setEditing({ ...editing, enabled: v })} />
                    <span className="text-sm">Enabled</span>
                  </div>
                </div>

                <div>
                  <label className="text-xs text-gray-500">Prompt</label>
                  <Textarea
                    rows={8}
                    value={editing.prompt || ""}
                    onChange={(e) => setEditing({ ...editing, prompt: e.target.value })}
                  />
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <div>
                    <label className="text-xs text-gray-500">Preset kind</label>
                    <Select
                      value={editing.presetKind || "system-persona"}
                      onValueChange={(value) =>
                        setEditing({ ...editing, presetKind: value as SystemPersonaPresetKindType })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {SYSTEM_PERSONA_PRESET_KIND_VALUES.map((value) => (
                          <SelectItem key={value} value={value}>
                            {value}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <label className="text-xs text-gray-500">Lifecycle</label>
                    <Select
                      value={editing.lifecycle || "published"}
                      onValueChange={(value) =>
                        setEditing({ ...editing, lifecycle: value as SystemPersonaLifecycleType })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {SYSTEM_PERSONA_LIFECYCLE_VALUES.map((value) => (
                          <SelectItem key={value} value={value}>
                            {value}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <label className="text-xs text-gray-500">Revision</label>
                    <Input
                      type="number"
                      min={1}
                      step={1}
                      value={editing.revision || 1}
                      onChange={(e) =>
                        setEditing({ ...editing, revision: Math.max(1, Number(e.target.value || 1)) })
                      }
                    />
                  </div>
                  <div className="flex items-center gap-2 pt-6">
                    <Switch
                      checked={editing.runtimeResolvable !== false}
                      onCheckedChange={(value) => setEditing({ ...editing, runtimeResolvable: value })}
                    />
                    <span className="text-sm">Runtime resolvable</span>
                  </div>
                </div>

                <div>
                  <label className="text-xs text-gray-500">Summary</label>
                  <Textarea
                    rows={3}
                    value={editing.summary || ""}
                    onChange={(e) => setEditing({ ...editing, summary: e.target.value })}
                    placeholder="사용자에게 보여줄 핵심 성격/역할 요약"
                  />
                </div>

                {/* forUniverses 편집 */}
                <div>
                  <label className="text-xs text-gray-500">
                    <Lang text={{ ko: "적용 서비스", en: "Target Service" }} />
                  </label>
                  <Select
                    value={normalizeSystemPersonaUsageType(editing.forUniverses)}
                    onValueChange={(v) => setEditing({ ...editing, forUniverses: v as SystemPersonaUsageType })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="All" />
                    </SelectTrigger>
                    <SelectContent>
                      {SYSTEM_PERSONA_USAGE_OPTIONS.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="mt-1 text-xxs text-gray-500">
                    <Lang
                      text={{
                        ko: "이 페르소나를 사용할 서비스 범위를 지정합니다. All은 모든 서비스를 의미합니다.",
                        en: "Choose which service can use this persona. All includes every service.",
                      }}
                    />
                  </p>
                </div>

                <div className="rounded-xl border border-border/60 bg-background p-4">
                  <div className="mb-3">
                    <h4 className="text-sm font-semibold text-primary-text">Tutors 기본 정책 메타</h4>
                    <p className="mt-1 text-xxs leading-5 text-gray-500">
                      이 시스템 페르소나를 Tutors 기본 성격 프리셋으로 선택할 때 자동 적용할 정책 기본값입니다. 비워둔
                      항목은 기존 튜터 기본값 또는 사용자가 입력한 값을 유지합니다.
                    </p>
                  </div>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    <div>
                      <label className="text-xs text-gray-500">목표 카테고리</label>
                      <Select
                        value={editing.tutorsPolicyDefaults?.goalType || SYSTEM_PERSONA_META_UNSET_VALUE}
                        onValueChange={(value) => {
                          if (value === SYSTEM_PERSONA_META_UNSET_VALUE) {
                            removeTutorsPolicyDefault("goalType");
                            return;
                          }
                          patchTutorsPolicyDefaults({ goalType: value as TutorGoalType });
                        }}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="설정 안 함" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={SYSTEM_PERSONA_META_UNSET_VALUE}>설정 안 함</SelectItem>
                          {TUTOR_GOAL_TYPE_OPTIONS.map((option) => (
                            <SelectItem key={option.value} value={option.value}>
                              <Lang text={option.label} />
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div>
                      <label className="text-xs text-gray-500">대화 수준</label>
                      <Select
                        value={
                          editing.tutorsPolicyDefaults?.conversationLevel ||
                          SYSTEM_PERSONA_META_UNSET_VALUE
                        }
                        onValueChange={(value) => {
                          if (value === SYSTEM_PERSONA_META_UNSET_VALUE) {
                            const next = { ...(editing.tutorsPolicyDefaults || {}) };
                            delete next.conversationLevel;
                            setEditing({ ...editing, tutorsPolicyDefaults: next });
                            return;
                          }
                          patchTutorsPolicyDefaults({
                            conversationLevel: value as TutorConversationLevel,
                          });
                        }}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="설정 안 함" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={SYSTEM_PERSONA_META_UNSET_VALUE}>설정 안 함</SelectItem>
                          {TUTOR_CONVERSATION_LEVEL_OPTIONS.map((option) => (
                            <SelectItem key={option.value} value={option.value}>
                              {option.level}. <Lang text={option.label} />
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div>
                      <label className="text-xs text-gray-500">운영 모드</label>
                      <Select
                        value={editing.tutorsPolicyDefaults?.operationMode || SYSTEM_PERSONA_META_UNSET_VALUE}
                        onValueChange={(value) => {
                          if (value === SYSTEM_PERSONA_META_UNSET_VALUE) {
                            removeTutorsPolicyDefault("operationMode");
                            return;
                          }
                          patchTutorsPolicyDefaults({
                            operationMode: value as SystemPersonaTutorOperationModeType,
                          });
                        }}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="설정 안 함" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={SYSTEM_PERSONA_META_UNSET_VALUE}>설정 안 함</SelectItem>
                          {SYSTEM_PERSONA_TUTOR_OPERATION_MODE_VALUES.map((value) => (
                            <SelectItem key={value} value={value}>
                              {value}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div>
                      <label className="text-xs text-gray-500">답변 스타일</label>
                      <Select
                        value={editing.tutorsPolicyDefaults?.answerStyle || SYSTEM_PERSONA_META_UNSET_VALUE}
                        onValueChange={(value) => {
                          if (value === SYSTEM_PERSONA_META_UNSET_VALUE) {
                            removeTutorsPolicyDefault("answerStyle");
                            return;
                          }
                          patchTutorsPolicyDefaults({ answerStyle: value as SystemPersonaTutorAnswerStyleType });
                        }}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="설정 안 함" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={SYSTEM_PERSONA_META_UNSET_VALUE}>설정 안 함</SelectItem>
                          {SYSTEM_PERSONA_TUTOR_ANSWER_STYLE_VALUES.map((value) => (
                            <SelectItem key={value} value={value}>
                              {value}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div>
                      <label className="text-xs text-gray-500">교정 강도 (0~3)</label>
                      <Input
                        type="number"
                        min={0}
                        max={3}
                        step={1}
                        value={
                          typeof editing.tutorsPolicyDefaults?.correctionStrength === "number"
                            ? editing.tutorsPolicyDefaults.correctionStrength
                            : ""
                        }
                        onChange={(e) => {
                          const raw = e.target.value.trim();
                          if (!raw) {
                            removeTutorsPolicyDefault("correctionStrength");
                            return;
                          }
                          patchTutorsPolicyDefaults({
                            correctionStrength: Math.max(0, Math.min(3, Number(raw || 0))),
                          });
                        }}
                        placeholder="설정 안 함"
                      />
                    </div>

                    <div>
                      <label className="text-xs text-gray-500">엄격 모드</label>
                      <Select
                        value={
                          typeof editing.tutorsPolicyDefaults?.strict === "boolean"
                            ? editing.tutorsPolicyDefaults.strict
                              ? "true"
                              : "false"
                            : SYSTEM_PERSONA_META_UNSET_VALUE
                        }
                        onValueChange={(value) => {
                          if (value === SYSTEM_PERSONA_META_UNSET_VALUE) {
                            removeTutorsPolicyDefault("strict");
                            return;
                          }
                          patchTutorsPolicyDefaults({ strict: value === "true" });
                        }}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="설정 안 함" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={SYSTEM_PERSONA_META_UNSET_VALUE}>설정 안 함</SelectItem>
                          <SelectItem value="true">true</SelectItem>
                          <SelectItem value="false">false</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>

                {/* 스코프 지정 영역: universe */}
                <div>
                  <label className="text-xs text-gray-500">
                    <Lang text={{ ko: "유니버스 적용 범위 (선택)", en: "Universe Scope (Optional)" }} />
                  </label>
                  <Input
                    value={editing.universeId || ""}
                    onChange={(e) => setEditing({ ...editing, universeId: e.target.value })}
                    placeholder={`예: ${DEFAULT_FANTASY_UNIVERSE}, smartstore`}
                  />
                  <p className="mt-1 text-xxs text-gray-500">
                    <Lang
                      text={{
                        ko: "비워두면 공통 설정으로 사용됩니다. ID를 입력하면 해당 유니버스에서 같은 Key의 공통 설정보다 우선 적용됩니다.",
                        en: "Leave blank for the global setting. An ID overrides the global setting with the same key in that universe.",
                      }}
                    />
                  </p>
                </div>

                <div className="flex justify-end gap-2">
                  <Button variant="outline" onClick={closeEditor}>
                    취소
                  </Button>
                  <Button onClick={save} disabled={saving}>
                    {saving ? "저장중..." : "저장"}
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex min-h-64 items-center justify-center p-6 text-center">
                <p className="text-sm text-secondary-text">
                  <Lang
                    text={{
                      ko: "좌측 목록에서 시스템 페르소나를 선택하거나 새로 생성해 주세요.",
                      en: "Select a system persona from the list or create a new one.",
                    }}
                  />
                </p>
              </div>
            )}
          </div>
        </section>

        {/* 좌측: 시스템 페르소나 목록 */}
        <section className="order-2 flex min-h-[20rem] w-full flex-col overflow-hidden rounded-xl border border-border/70 bg-background/70 shadow-sm lg:order-1 lg:w-80 lg:shrink-0 xl:w-96">
          <div className="flex items-center gap-1.5 shrink-0 border-b border-border/70 bg-background/80 px-4 py-3">
            <h3 className="text-base font-semibold text-primary-text">
              <Lang text={{ ko: "시스템 페르소나 목록", en: "System Persona List" }} />
            </h3>
            <span className="text-xs text-secondary-text">({filteredList.length})</span>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto p-3 scrollbar-ghost">
            {loading ? (
              <div className="flex justify-center py-12">
                <Preloader variant="spin" />
              </div>
            ) : filteredList.length === 0 ? (
              <div className="py-12 text-center text-sm text-secondary-text">
                <Lang text={{ ko: "검색/필터 결과가 없습니다.", en: "No matching system personas." }} />
              </div>
            ) : (
              <ul className="space-y-2">
                {filteredList.map((row) => {
                  const rowIdentity = getRowIdentity(row);
                  const isSelected = selectedIdentity === rowIdentity;
                  const previewText = getSystemPersonaPreviewText(row);

                  return (
                    <li key={rowIdentity}>
                      <div
                        className={cn(
                          "group flex items-start gap-2 rounded-xl border px-3 py-2.5 transition-colors",
                          isSelected
                            ? "border-primary/30 bg-primary/10"
                            : "border-border/70 bg-surface hover:border-primary/40",
                        )}
                      >
                        <Button
                          variant="blank"
                          noWrap={false}
                          className="min-w-0 flex-1 text-left"
                          onClick={() => editByKey(row)}
                        >
                          <div className={cn("truncate text-sm font-medium", isSelected && "text-primary")}>
                            {row.title || "(no title)"}
                          </div>
                          <div className="mt-0.5 truncate font-mono text-xs text-secondary-text">{row.key}</div>
                          <div className="mt-1 truncate text-xxs text-secondary-text">
                            {row.category} · {row.enabled ? "활성" : "비활성"}
                            {` · ${getUsageLabel(row.forUniverses)}`}
                            {row.universeId ? ` · u:${row.universeId}` : ""}
                          </div>
                          {previewText ? (
                            <p className="mt-1 line-clamp-2 text-xxs leading-5 text-secondary-text">{previewText}</p>
                          ) : null}
                        </Button>
                        <Button
                          variant="blank"
                          className="shrink-0 px-1 text-xs text-secondary-text hover:text-danger"
                          onClick={() => remove(row)}
                        >
                          <Lang text={{ ko: "삭제", en: "Delete" }} />
                        </Button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
