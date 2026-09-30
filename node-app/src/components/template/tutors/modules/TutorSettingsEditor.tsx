"use client";

import { useMemo, useState } from "react";
import { Button, Input, Textarea, Switch, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, dialog } from "@amu-labs/ui";
import { Lang } from "components/module/i18n";
import TutorLanguageCombobox from "components/module/persona/TutorLanguageCombobox";
import type { PersonaFormValuesType } from "types/ai";
import {
  TUTOR_GOAL_TYPE_OPTIONS,
  TUTOR_CONVERSATION_LEVEL_OPTIONS,
  getTutorConversationLevelOption,
  getTutorGoalTypeOption,
  normalizeTutorConversationLevel,
  normalizeTutorGoalType,
  normalizeTutorTargetLanguage,
  type TutorGoalType,
  type TutorConversationLevel,
} from "consts/tutors";
import { cn } from "utils/common";
import { toErrorMessage } from "utils/common/typeUtils";
import { jsonPretty } from "utils/data";

type KnowledgeSourceItem = {
  id: string;
  enabled?: boolean;
  type?: "manual" | "text-file";
  label?: string;
  content?: string;
  fileName?: string;
  mimeType?: string;
  charCount?: number;
};

type OperationModeType = "tutor" | "coach" | "proofread" | "chat";

type answerStyleType = "short" | "balanced" | "detailed";

type TutorsUiViewMode = "visual" | "text";

type TutorsUiShape = {
  defaultViewMode?: TutorsUiViewMode;
  autoAiResponse?: boolean;
  subtitle?: { enabled?: boolean };
  conversationHint?: { enabled?: boolean };
  [key: string]: unknown;
};

type TutorsPolicyShape = {
  operationMode?: OperationModeType;
  correctionStrength?: number; // 0~3
  strict?: boolean;
  answerStyle?: answerStyleType;
  targetLanguage?: string;
  conversationLevel?: TutorConversationLevel | string;
  goalType?: TutorGoalType | string;
  knowledgeSources?: KnowledgeSourceItem[];
  [key: string]: unknown;
};

function parseJsonSafe(text: string): { ok: true; value: unknown } | { ok: false; error: string } {
  const t = (text ?? "").trim();
  if (!t) return { ok: true, value: null };
  try {
    return { ok: true, value: JSON.parse(t) };
  } catch (e: unknown) {
    return { ok: false, error: toErrorMessage(e, "Invalid JSON") };
  }
}

function uid() {
  return `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

function normalizeKnowledgeText(value: string, limit = 2500) {
  return String(value || "")
    .replace(/\r\n?/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, limit);
}

function buildKnowledgeLabel(fileName: string) {
  const safeName = String(fileName || "").trim();
  if (!safeName) return "텍스트 문서";
  return safeName.slice(0, 80);
}

export interface TutorSettingsEditorProps {
  value: PersonaFormValuesType;
  onChange: (next: PersonaFormValuesType) => void;
  disabled?: boolean;
  className?: string;
  /** true일 때만 JSON 편집(정책), Tutors UI 설정 섹션 표시 */
  isAdmin?: boolean;
  hideIntroSection?: boolean;
}

type TutorIntroSectionProps = {
  value: PersonaFormValuesType;
  onChange: (next: PersonaFormValuesType) => void;
  disabled?: boolean;
  className?: string;
};

export function TutorIntroSection({ value, onChange, disabled, className }: TutorIntroSectionProps) {
  const tutorIntro: string = value?.tutorIntro ?? "";
  const introCount = tutorIntro.length;
  const introMax = 240;

  return (
    <div className={cn("backdrop-blur-sm overflow-hidden", className)}>
      <div className="space-y-2">
        <Textarea
          rows={3}
          value={tutorIntro}
          disabled={disabled}
          onChange={(e) => {
            const next = e.target.value.slice(0, introMax);
            onChange({ ...value, tutorIntro: next });
          }}
          placeholder="예) 저는 영어 스피킹을 실전처럼 교정해주는 튜터예요. 짧고 정확한 피드백을 먼저 주고, 필요하면 예문을 더 드릴게요."
          className="resize-none"
        />
        <div className="flex justify-end">
          <span
            className={cn(
              "text-xxs tabular-nums",
              introCount > introMax * 0.9 ? "text-amber-600" : "text-secondary-text/60",
            )}
          >
            {introCount}/{introMax}
          </span>
        </div>
      </div>
    </div>
  );
}

export function TutorSettingsEditor({
  value,
  onChange,
  disabled,
  className,
  isAdmin = false,
  hideIntroSection = false,
}: TutorSettingsEditorProps) {
  const tutorsPolicy = (value?.tutorsPolicy ?? null) as TutorsPolicyShape | null;
  const tutorsUi = (value?.tutorsUi ?? null) as TutorsUiShape | null;

  const [policyJson, setPolicyJson] = useState<string>(() => jsonPretty(tutorsPolicy));
  const [policyJsonErr, setPolicyJsonErr] = useState<string>("");

  const [uiJson, setUiJson] = useState<string>(() => jsonPretty(tutorsUi));
  const [uiJsonErr, setUiJsonErr] = useState<string>("");

  // 업스트림 값이 바뀔 때만 JSON 에디터를 재동기화 (effect setState 회피 — adjusting state during render 패턴)
  const [trackedPolicy, setTrackedPolicy] = useState(tutorsPolicy);
  if (trackedPolicy !== tutorsPolicy) {
    setTrackedPolicy(tutorsPolicy);
    setPolicyJson(jsonPretty(tutorsPolicy));
    setPolicyJsonErr("");
  }

  const [trackedUi, setTrackedUi] = useState(tutorsUi);
  if (trackedUi !== tutorsUi) {
    setTrackedUi(tutorsUi);
    setUiJson(jsonPretty(tutorsUi));
    setUiJsonErr("");
  }

  const [showAdvancedPolicy, setShowAdvancedPolicy] = useState(false);
  const [showAdvancedUi, setShowAdvancedUi] = useState(false);

  // quick fields (policy)
  const derivedPolicy = useMemo<TutorsPolicyShape>(
    () => (tutorsPolicy && typeof tutorsPolicy === "object" ? tutorsPolicy : {}),
    [tutorsPolicy],
  );

  const operationMode = derivedPolicy.operationMode ?? "tutor";
  const correctionStrength = Number.isFinite(derivedPolicy.correctionStrength)
    ? Number(derivedPolicy.correctionStrength)
    : 2;
  const strict = !!derivedPolicy.strict;
  const answerStyle = derivedPolicy.answerStyle ?? "balanced";
  const targetLanguage = derivedPolicy.targetLanguage ?? "";
  const goalType = normalizeTutorGoalType(derivedPolicy.goalType);
  const selectedGoalTypeOption = getTutorGoalTypeOption(goalType);
  const conversationLevel = normalizeTutorConversationLevel(derivedPolicy.conversationLevel);
  const selectedConversationLevelOption = getTutorConversationLevelOption(conversationLevel);
  const knowledgeSources = Array.isArray(derivedPolicy.knowledgeSources) ? derivedPolicy.knowledgeSources : [];

  const patchValue = (patch: Partial<PersonaFormValuesType>) => {
    onChange({ ...value, ...patch });
  };

  // === tutorsUi derived ===
  const derivedUi = useMemo<TutorsUiShape>(
    () => (tutorsUi && typeof tutorsUi === "object" ? tutorsUi : {}),
    [tutorsUi],
  );

  const uiViewMode = derivedUi.defaultViewMode ?? "visual";
  const uiAutoAiResponse = !!derivedUi.autoAiResponse;
  const uiSubtitleEnabled = !!derivedUi.subtitle?.enabled;
  const uiConversationHintEnabled = derivedUi.conversationHint?.enabled !== false;

  const patchUi = (patch: Partial<TutorsUiShape>) => {
    const next = { ...(derivedUi || {}), ...(patch || {}) };
    patchValue({ tutorsUi: next });
  };

  const patchPolicy = (patch: Partial<TutorsPolicyShape>) => {
    const next = { ...(derivedPolicy || {}), ...(patch || {}) };
    patchValue({ tutorsPolicy: next });
  };

  const patchKnowledgeSource = (id: string, patch: Partial<KnowledgeSourceItem>) => {
    const next = knowledgeSources.map((s) => (s.id === id ? { ...s, ...patch } : s));
    patchPolicy({ knowledgeSources: next });
  };

  const addKnowledgeSource = (type: KnowledgeSourceItem["type"] = "manual") => {
    const next: KnowledgeSourceItem = {
      id: uid(),
      enabled: true,
      type,
      label: type === "text-file" ? "텍스트 문서" : "직접 입력 지식",
      content: "",
      fileName: "",
      mimeType: "",
      charCount: 0,
    };
    patchPolicy({ knowledgeSources: [...knowledgeSources, next] });
  };

  const removeKnowledgeSource = (id: string) => {
    patchPolicy({ knowledgeSources: knowledgeSources.filter((s) => s.id !== id) });
  };

  const importKnowledgeFile = async (id: string, file: File | null) => {
    if (!file) return;

    const lowerName = file.name.toLowerCase();
    const isSupportedTextFile =
      file.type.startsWith("text/") ||
      lowerName.endsWith(".txt") ||
      lowerName.endsWith(".md") ||
      lowerName.endsWith(".markdown");

    if (!isSupportedTextFile) {
      void dialog.alert("현재는 txt, md, markdown처럼 바로 텍스트로 읽을 수 있는 문서만 등록할 수 있습니다.");
      return;
    }

    try {
      const raw = await file.text();
      const normalized = normalizeKnowledgeText(raw, 2500);

      if (!normalized) {
        void dialog.alert({ variant: "danger", message: "문서에서 저장할 텍스트를 추출하지 못했습니다." });
        return;
      }

      patchKnowledgeSource(id, {
        type: "text-file",
        label: buildKnowledgeLabel(file.name),
        fileName: file.name,
        mimeType: file.type || "text/plain",
        content: normalized,
        charCount: normalized.length,
      });
    } catch {
      void dialog.alert({ variant: "danger", message: "문서 텍스트를 읽는 중 오류가 발생했습니다." });
    }
  };

  const applyPolicyJson = () => {
    const parsed = parseJsonSafe(policyJson);
    if (!parsed.ok) {
      setPolicyJsonErr(parsed.error);
      return;
    }
    setPolicyJsonErr("");
    patchValue({ tutorsPolicy: parsed.value as Record<string, unknown> | null });
  };

  const prettifyPolicyJson = () => {
    const parsed = parseJsonSafe(policyJson);
    if (!parsed.ok) {
      setPolicyJsonErr(parsed.error);
      return;
    }
    setPolicyJsonErr("");
    setPolicyJson(jsonPretty(parsed.value));
  };

  const applyUiJson = () => {
    const parsed = parseJsonSafe(uiJson);
    if (!parsed.ok) {
      setUiJsonErr(parsed.error);
      return;
    }
    setUiJsonErr("");
    patchValue({ tutorsUi: parsed.value as Record<string, unknown> | null });
  };

  const prettifyUiJson = () => {
    const parsed = parseJsonSafe(uiJson);
    if (!parsed.ok) {
      setUiJsonErr(parsed.error);
      return;
    }
    setUiJsonErr("");
    setUiJson(jsonPretty(parsed.value));
  };

  return (
    <div className={cn("space-y-5", className)}>
      {!hideIntroSection && <TutorIntroSection value={value} onChange={onChange} disabled={disabled} />}

      {/* Tutors Policy */}
      <div className="rounded-2xl border border-border/50 bg-card/80 backdrop-blur-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-border/30">
          <div className="flex items-start justify-between gap-4">
            <h3 className="font-semibold text-base text-primary-text">Tutors 정책</h3>
            {isAdmin && (
              <Button variant="outline" size="xs" disabled={disabled} onClick={() => setShowAdvancedPolicy((v) => !v)}>
                {showAdvancedPolicy ? "고급(JSON) 닫기" : "고급(JSON) 편집"}
              </Button>
            )}
          </div>

          <p className="text-xs text-secondary-text mt-2">목표 카테고리, 대화 수준, 교정 강도 등을 설정합니다.</p>
        </div>

        <div className="px-5 py-4 space-y-5">
          {/* Quick Settings */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-primary-text">
                <Lang text={{ ko: "목표 카테고리", en: "Goal category" }} />
              </label>
              <Select
                value={goalType}
                onValueChange={(v) => patchPolicy({ goalType: v as TutorGoalType })}
                disabled={disabled}
              >
                <SelectTrigger>
                  <SelectValue placeholder="목표 선택" />
                </SelectTrigger>
                <SelectContent>
                  {TUTOR_GOAL_TYPE_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      <Lang text={option.label} />
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xxs text-secondary-text/70 leading-relaxed">
                <Lang text={selectedGoalTypeOption.description} />
              </p>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-primary-text">운영 모드</label>
              <Select
                value={operationMode}
                onValueChange={(v) => patchPolicy({ operationMode: v as OperationModeType })}
                disabled={disabled}
              >
                <SelectTrigger>
                  <SelectValue placeholder="모드 선택" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="tutor">Tutor (설명+과제)</SelectItem>
                  <SelectItem value="coach">Coach (행동/습관 코칭)</SelectItem>
                  <SelectItem value="proofread">Proofread (교정 중심)</SelectItem>
                  <SelectItem value="chat">Chat (자유 대화)</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xxs text-secondary-text/70 leading-relaxed">
                서버 프롬프트 합성 시 정책 힌트로 사용됩니다.
              </p>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-primary-text">교정 강도 (0~3)</label>
              <Input
                type="number"
                min={0}
                max={3}
                step={1}
                disabled={disabled}
                value={correctionStrength}
                onChange={(e) =>
                  patchPolicy({ correctionStrength: Math.max(0, Math.min(3, Number(e.target.value || 0))) })
                }
              />
              <p className="text-xxs text-secondary-text/70 leading-relaxed">0: 거의 안함 / 3: 매우 엄격</p>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-primary-text">답변 스타일</label>
              <Select
                value={answerStyle}
                onValueChange={(v) => patchPolicy({ answerStyle: v as answerStyleType })}
                disabled={disabled}
              >
                <SelectTrigger>
                  <SelectValue placeholder="스타일 선택" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="short">짧게</SelectItem>
                  <SelectItem value="balanced">균형</SelectItem>
                  <SelectItem value="detailed">자세히</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xxs text-secondary-text/70 leading-relaxed">설명의 기본 길이 성향입니다.</p>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-primary-text">타겟 언어</label>
              <TutorLanguageCombobox
                disabled={disabled}
                value={normalizeTutorTargetLanguage(targetLanguage, "")}
                onChange={(nextLanguage) => patchPolicy({ targetLanguage: nextLanguage })}
              />
              <p className="text-xxs text-secondary-text/70 leading-relaxed">
                페르소나가 답변할 언어를 지정합니다.
              </p>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-primary-text">
                <Lang text={{ ko: "대화 수준", en: "Conversation level" }} />
              </label>
              <Select
                value={conversationLevel}
                onValueChange={(v) =>
                  patchPolicy({
                    conversationLevel: v as TutorConversationLevel,
                  })
                }
                disabled={disabled}
              >
                <SelectTrigger>
                  <SelectValue placeholder="수준 선택" />
                </SelectTrigger>
                <SelectContent>
                  {TUTOR_CONVERSATION_LEVEL_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.level}. <Lang text={option.label} />
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xxs text-secondary-text/70 leading-relaxed">
                <Lang text={selectedConversationLevelOption.description} />
              </p>
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-medium text-primary-text">
                  <Lang text={{ ko: "엄격 모드", en: "Strict Mode" }} />
                </label>
                <Switch
                  size="sm"
                  checked={strict}
                  onCheckedChange={(v) => patchPolicy({ strict: v })}
                  disabled={disabled}
                />
              </div>
              <p className="text-xxs text-secondary-text/70 leading-relaxed">
                <Lang
                  text={{
                    ko: "규칙 위반/형식 요구를 강하게 적용합니다.",
                    en: "Strictly enforces rule compliance and formatting requirements.",
                  }}
                />
              </p>
            </div>
          </div>

          {/* Knowledge Sources */}
          <div className="rounded-xl border border-border/30 bg-surface/30 p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h4 className="text-sm font-semibold text-primary-text">Knowledge Sources</h4>
                <p className="text-xxs text-secondary-text/70 mt-0.5 leading-relaxed">
                  직접 입력한 지식이나 txt/md 문서에서 추출한 텍스트를 관리할 수 있습니다.
                </p>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => addKnowledgeSource("manual")} disabled={disabled}>
                  텍스트 추가
                </Button>
                <Button variant="outline" size="sm" onClick={() => addKnowledgeSource("text-file")} disabled={disabled}>
                  문서 추가
                </Button>
              </div>
            </div>

            {knowledgeSources.length === 0 ? (
              <div className="mt-3 rounded-lg border border-dashed border-border/40 py-6 text-center text-xs text-secondary-text/60">
                등록된 지식 소스가 없습니다.
              </div>
            ) : (
              <div className="mt-4 space-y-3">
                {knowledgeSources.map((src) => (
                  <div key={src.id} className="rounded-xl border border-border/30 bg-card/80 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div className="space-y-1">
                          <label className="text-xxs text-secondary-text">Label</label>
                          <Input
                            value={src.label ?? ""}
                            disabled={disabled}
                            onChange={(e) => patchKnowledgeSource(src.id, { label: e.target.value })}
                            placeholder="예: 여행 회화 메모, 발음 규칙 문서"
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-xxs text-secondary-text">Type</label>
                          <Input value={src.type === "text-file" ? "text-file" : "manual"} disabled readOnly />
                        </div>
                        <div className="md:col-span-2 space-y-1">
                          <label className="text-xxs text-secondary-text">
                            {src.type === "text-file" ? "Stored Text" : "Knowledge Text"}
                          </label>
                          <Textarea
                            rows={src.type === "text-file" ? 8 : 6}
                            value={src.content ?? ""}
                            disabled={disabled}
                            className="resize-none"
                            onChange={(e) => {
                              const normalized = normalizeKnowledgeText(e.target.value, 2500);
                              patchKnowledgeSource(src.id, {
                                content: normalized,
                                charCount: normalized.length,
                              });
                            }}
                            placeholder={
                              src.type === "text-file"
                                ? "txt / md 문서를 불러오면 추출된 텍스트가 여기에 저장됩니다."
                                : "튜터가 참고해야 할 규칙, 배경지식, 문장 패턴을 직접 입력하세요."
                            }
                          />
                          <div className="flex flex-col gap-1 text-xxs text-secondary-text/60 sm:flex-row sm:items-center sm:justify-between">
                            <span>
                              {src.type === "text-file"
                                ? `문서명: ${src.fileName || "선택되지 않음"}`
                                : "직접 입력한 텍스트가 저장됩니다."}
                            </span>
                            <span className="tabular-nums">
                              {Number(src.charCount || (src.content || "").length || 0)}/2500
                            </span>
                          </div>
                          {src.type === "text-file" ? (
                            <div className="mt-2">
                              <Input
                                type="file"
                                accept=".txt,.md,.markdown,text/plain,text/markdown"
                                disabled={disabled}
                                onChange={(e) => {
                                  const file = e.target.files?.[0] || null;
                                  void importKnowledgeFile(src.id, file);
                                  e.target.value = "";
                                }}
                              />
                              <p className="mt-1.5 text-xxs text-secondary-text/60">
                                txt, md, markdown 파일만 지원합니다.
                              </p>
                            </div>
                          ) : null}
                        </div>
                      </div>

                      <div className="flex flex-col items-end gap-3">
                        <div className="flex items-center gap-2">
                          <Switch
                            checked={src.enabled !== false}
                            onCheckedChange={(v) => patchKnowledgeSource(src.id, { enabled: v })}
                            disabled={disabled}
                          />
                          <span className="text-xs font-medium">활성</span>
                        </div>
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => removeKnowledgeSource(src.id)}
                          disabled={disabled}
                        >
                          삭제
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Advanced JSON (admin only) */}
          {isAdmin && showAdvancedPolicy && (
            <div className="rounded-xl border border-border/30 p-4 bg-surface/30">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h4 className="text-sm font-semibold text-primary-text">고급 정책(JSON)</h4>
                  <p className="text-xxs text-secondary-text/70 mt-0.5">정책 전체를 JSON으로 직접 편집합니다.</p>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={prettifyPolicyJson} disabled={disabled}>
                    Pretty
                  </Button>
                  <Button size="sm" onClick={applyPolicyJson} disabled={disabled}>
                    적용
                  </Button>
                </div>
              </div>

              <div className="mt-3">
                <Textarea
                  rows={10}
                  className="font-mono text-sm resize-none"
                  value={policyJson}
                  disabled={disabled}
                  onChange={(e) => setPolicyJson(e.target.value)}
                  placeholder='예: { "operationMode": "tutor", "correctionStrength": 2 }'
                />
                {policyJsonErr && <p className="mt-2 text-xs text-red-600">JSON 오류: {policyJsonErr}</p>}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Tutors UI 설정 — 어드민 전용 (게임 스테이지 옵션) */}
      {isAdmin && (
        <div className="rounded-2xl border border-border/50 bg-card/80 backdrop-blur-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-border/30 flex items-start justify-between gap-4">
            <div>
              <h3 className="font-semibold text-base text-primary-text">Tutors UI 설정</h3>
              <p className="text-xs text-secondary-text mt-0.5">
                채팅 화면의 보기 모드, 자동 응답, 자막 등 튜터 전용 UI 동작을 설정합니다.
              </p>
            </div>

            <Button variant="outline" size="sm" disabled={disabled} onClick={() => setShowAdvancedUi((v) => !v)}>
              {showAdvancedUi ? "고급(JSON) 닫기" : "고급(JSON) 편집"}
            </Button>
          </div>

          <div className="px-5 py-4 space-y-5">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-primary-text">기본 보기 모드</label>
                <Select
                  value={uiViewMode}
                  onValueChange={(v) => patchUi({ defaultViewMode: v as TutorsUiViewMode })}
                  disabled={disabled}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="모드 선택" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="visual">비주얼 (3D/캐릭터)</SelectItem>
                    <SelectItem value="text">텍스트 전용</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xxs text-secondary-text/70 leading-relaxed">
                  비주얼 모드와 텍스트 전용 모드 중 기본값을 선택합니다.
                </p>
              </div>

              <div className="flex items-center gap-3 rounded-xl border border-border/30 bg-surface/50 px-4 py-3">
                <Switch
                  checked={uiAutoAiResponse}
                  onCheckedChange={(v) => patchUi({ autoAiResponse: v })}
                  disabled={disabled}
                />
                <div className="flex flex-col">
                  <span className="text-xs font-medium text-primary-text">자동 AI 응답</span>
                  <span className="text-xxs text-secondary-text/70">AI가 먼저 인사합니다.</span>
                </div>
              </div>

              <div className="flex items-center gap-3 rounded-xl border border-border/30 bg-surface/50 px-4 py-3">
                <Switch
                  checked={uiSubtitleEnabled}
                  onCheckedChange={(v) => patchUi({ subtitle: { ...derivedUi.subtitle, enabled: v } })}
                  disabled={disabled}
                />
                <div className="flex flex-col">
                  <span className="text-xs font-medium text-primary-text">대화 자막</span>
                  <span className="text-xxs text-secondary-text/70">캐릭터 대사를 자막으로 표시합니다.</span>
                </div>
              </div>

              <div className="flex items-center gap-3 rounded-xl border border-border/30 bg-surface/50 px-4 py-3">
                <Switch
                  checked={uiConversationHintEnabled}
                  onCheckedChange={(v) => patchUi({ conversationHint: { ...derivedUi.conversationHint, enabled: v } })}
                  disabled={disabled}
                />
                <div className="flex flex-col gap-0.5">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-primary-text">
                      <Lang text={{ ko: "대화 힌트 사용", en: "Use conversation hints" }} />
                    </span>
                    <span className="rounded-full border border-border/40 px-2 py-0.5 text-xxs text-secondary-text/80">
                      <Lang text={uiConversationHintEnabled ? { ko: "사용", en: "On" } : { ko: "미사용", en: "Off" }} />
                    </span>
                  </div>
                  <span className="text-xxs text-secondary-text/70">
                    <Lang
                      text={{
                        ko: "사용 시 매 대화턴마다 캐릭터 응답에 맞는 다음 문장 예시를 표시합니다.",
                        en: "When on, each tutor reply shows learner reply suggestions matched to the conversation.",
                      }}
                    />
                  </span>
                </div>
              </div>
            </div>

            {showAdvancedUi && (
              <div className="rounded-xl border border-border/30 p-4 bg-surface/30">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h4 className="text-sm font-semibold text-primary-text">고급 UI 설정 (JSON)</h4>
                    <p className="text-xxs text-secondary-text/70 mt-0.5">
                      추가 설정이 필요할 때 JSON으로 직접 편집합니다.
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={prettifyUiJson} disabled={disabled}>
                      Pretty
                    </Button>
                    <Button size="sm" onClick={applyUiJson} disabled={disabled}>
                      적용
                    </Button>
                  </div>
                </div>

                <div className="mt-3">
                  <Textarea
                    rows={8}
                    className="font-mono text-sm resize-none"
                    value={uiJson}
                    disabled={disabled}
                    onChange={(e) => setUiJson(e.target.value)}
                    placeholder='예: { "defaultViewMode": "visual", "autoAiResponse": false }'
                  />
                  {uiJsonErr && <p className="mt-2 text-xs text-red-600">JSON 오류: {uiJsonErr}</p>}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default TutorSettingsEditor;
