"use client";

import { Input, Textarea, Select, SelectTrigger, SelectValue, SelectContent, SelectItem, RadioGroup, RadioGroupItem, dialog } from "@amu-labs/ui";
import type { ReactNode } from "react";
import {
  OPENAI_APPROVED_VOICE_CATALOG,
  getOpenAiVoiceCatalogEntry,
  isOpenAiVoiceAllowedForGenderHint,
  OPENAI_DEFAULT_TTS_MODEL,
  PERSONA_BINARY_GENDER_OPTIONS,
  resolvePersonaBinaryGenderValue,
  resolveOpenAiVoiceGenderHint,
} from "consts/ai";
import { ELEVENLABS_DEFAULT_TTS_MODEL, getElevenLabsVoiceCatalogEntry } from "consts/ai/voiceCatalog";
import VoicePreviewButton from "components/module/persona/VoicePreviewButton";
import type {
  IPersonaProfileMap,
  IPersonaSprite,
  PersonaType,
  PersonaFormBaseType,
  PersonaFormValuesType,
} from "types/ai";
import type { IUniverse } from "types/game";
import { switchPersonaType } from "utils/admin/formUtils";
import { SpriteSheetEditor } from "./SpriteSheetEditor";
import { ProfilesEditor } from "./ProfilesEditor";
import { DEFAULT_FANTASY_UNIVERSE } from "consts/app";
import { ChevronDown } from "lucide-react";
import { cn } from "utils/common";
import { Lang, lang } from "components/module/i18n";

interface PersonaEditorProps {
  value: PersonaFormValuesType;
  onChange: (next: PersonaFormValuesType) => void;
  disabledFields?: Partial<Record<keyof PersonaFormValuesType | "personaType", boolean>>;
  universeIdMode?: "editable" | "readonly" | "hidden";
  universeOptions?: Pick<IUniverse, "id" | "name">[];
  // personaType 변경/편집 시 universeId 자동 보정
  getUniverseIdForType?: (type: PersonaType) => string | undefined;
  spriteSectionMode?: "visible" | "hidden";
  profilesSectionMode?: "visible" | "hidden";
  systemPersonaFieldMode?: "visible" | "hidden";
  sectionMode?: "plain" | "accordion";
  personaTypeControl?: "select" | "radio";
  personaTypeLabel?: { ko: string; en: string };
  canViewInternalIds?: boolean;
  // 기본 정보 설정 섹션 상단에 임의 노드 삽입 (예: 시스템 페르소나 프리셋 선택기)
  presetSlot?: ReactNode;
  /** EL-603 파일럿 노출이 허용한 승인 ElevenLabs Voice. 기본 빈 배열(미노출). */
  pilotVoices?: readonly string[];
}

const DEFAULT_PERSONA_TYPE_LABEL = { ko: "페르소나 타입", en: "Persona Type" } as const;
const SPEECH_STYLE_CUSTOM_VALUE = "custom";
const genderRadioClass =
  "flex min-h-10 flex-1 cursor-pointer items-center gap-2 rounded-xl border border-border/60 bg-background p-3 text-sm font-medium text-primary-text";
const SPEECH_STYLE_PRESETS = [
  {
    key: "polite-friendly",
    label: { ko: "정중하고 친절한 존댓말", en: "Polite and friendly" },
    value: {
      ko: "항상 정중한 존댓말을 사용합니다. 설명은 부드럽고 친절하게 시작하고, 핵심 피드백은 명확하게 전달합니다. 사용자를 비하하거나 압박하는 표현은 사용하지 않습니다.",
      en: "Always use polite, friendly language. Start explanations gently, deliver key feedback clearly, and never use insulting or pressuring expressions.",
    },
  },
  {
    key: "casual-direct",
    label: { ko: "친근하고 단호한 반말", en: "Casual and direct" },
    value: {
      ko: "친근한 반말을 사용합니다. 문장은 짧고 단호하게 씁니다. 사용자를 '너'라고 부르되 비하 표현은 사용하지 않습니다.",
      en: "Use a friendly casual register. Keep sentences short and direct. Address the user informally without insults or demeaning expressions.",
    },
  },
  {
    key: "warm-coach",
    label: { ko: "따뜻한 코치형 말투", en: "Warm coaching tone" },
    value: {
      ko: "따뜻하고 격려하는 존댓말을 사용합니다. 먼저 잘한 점을 짚고, 개선할 행동을 한 번에 하나씩 제안합니다. 과장된 칭찬이나 모호한 표현은 피합니다.",
      en: "Use a warm and encouraging polite tone. Acknowledge what went well first, then suggest one improvement at a time. Avoid exaggerated praise and vague wording.",
    },
  },
  {
    key: "strict-command",
    label: { ko: "엄격한 명령조", en: "Strict command tone" },
    value: {
      ko: "짧고 엄격한 명령조를 사용합니다. 해야 할 행동과 금지할 행동을 분명히 구분합니다. 모욕, 위협, 인신공격은 사용하지 않습니다.",
      en: "Use a short, strict command tone. Clearly separate required and prohibited actions. Never use insults, threats, or personal attacks.",
    },
  },
  {
    key: "ancient-monster",
    label: { ko: "고대 몬스터 현자 말투", en: "Ancient monster sage" },
    value: {
      ko: "고대 몬스터 현자처럼 말합니다. '~하라', '~일지니' 같은 어미를 자주 사용하되, 설명은 현대 한국어로 이해할 수 있게 유지합니다. 같은 어미를 모든 문장에 반복하지 않습니다.",
      en: "Speak like an ancient monster sage. Use archaic, commanding turns of phrase while keeping explanations understandable in modern English. Do not repeat the same ending in every sentence.",
    },
  },
] as const;

export function PersonaEditor({
  value,
  onChange,
  disabledFields = {},
  universeIdMode = "editable",
  universeOptions,
  getUniverseIdForType,
  spriteSectionMode = "visible",
  profilesSectionMode = "visible",
  systemPersonaFieldMode = "visible",
  sectionMode = "plain",
  personaTypeControl = "select",
  personaTypeLabel = DEFAULT_PERSONA_TYPE_LABEL,
  canViewInternalIds = false,
  presetSlot,
  pilotVoices = [],
}: PersonaEditorProps) {
  const universeId = value.universeId || "";
  const pid = value.pid || undefined;
  const voiceGenderHint = resolveOpenAiVoiceGenderHint(value.gender);
  const currentVoiceId = String(value.voiceProfile?.voiceId || "").trim();
  const hasVoiceOverride = Boolean(currentVoiceId);
  const selectedVoiceEntry = getOpenAiVoiceCatalogEntry(currentVoiceId);
  const labelClass = "text-xs font-medium text-secondary-text whitespace-nowrap";
  const helperTextClass = "mt-1 text-xxs leading-5 text-secondary-text";
  const groupedSectionClass = "space-y-2 rounded-2xl border border-border/60 bg-surface/60 p-4";
  const isFieldDisabled = (field: keyof PersonaFormValuesType | "personaType") => Boolean(disabledFields[field]);
  const currentSpeechStyle = String(value.speechStyle || "").trim();
  const selectedSpeechStylePreset =
    SPEECH_STYLE_PRESETS.find((preset) =>
      Object.values(preset.value).some((presetValue) => presetValue === currentSpeechStyle),
    )?.key || SPEECH_STYLE_CUSTOM_VALUE;
  const renderSection = (title: string, children: ReactNode, className: string, defaultOpen = true) => {
    if (sectionMode !== "accordion") return <div className={className}>{children}</div>;

    return (
      <details open={defaultOpen} className="group overflow-hidden rounded-2xl border border-border/60 bg-surface/70">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-4 marker:hidden">
          <span className="text-sm font-semibold text-primary-text">{title}</span>
          <ChevronDown className="h-4 w-4 shrink-0 text-primary transition-transform group-open:rotate-180" />
        </summary>
        <div className="border-t border-border/40 p-4">{children}</div>
      </details>
    );
  };

  // tutors 등에서 universeId를 서버/정책으로 고정해야 할 때
  const enforceUniverseId = (next: PersonaFormValuesType): PersonaFormValuesType => {
    if (universeIdMode === "editable") return next;
    const forced = getUniverseIdForType?.(next.personaType);
    if (!forced) return next;
    if (next.universeId === forced) return next;
    return { ...next, universeId: forced };
  };

  // 공통 필드 핸들러
  const handleBaseChange = <K extends keyof PersonaFormBaseType>(key: K, v: PersonaFormBaseType[K]) => {
    onChange(enforceUniverseId({ ...value, [key]: v } as PersonaFormValuesType));
  };

  const confirmVoiceGenderMismatch = async (voiceId: string, gender: unknown) => {
    if (!voiceId || isOpenAiVoiceAllowedForGenderHint(voiceId, resolveOpenAiVoiceGenderHint(gender))) return true;
    const voice = getOpenAiVoiceCatalogEntry(voiceId);
    return dialog.confirm(
      lang({
        ko: `${voice?.label || voiceId} 음성은 현재 성별 설정과 다를 수 있습니다. 의도한 설정이면 확인을 눌러 유지하세요.`,
        en: `${voice?.label || voiceId} may not match the current gender setting. Confirm to keep this intentional pairing.`,
      }),
    );
  };

  const applyGenderChange = async (nextGender: string) => {
    const next = { ...value, gender: resolvePersonaBinaryGenderValue(nextGender) || nextGender };
    if (!(await confirmVoiceGenderMismatch(next.voiceProfile?.voiceId || "", next.gender))) return;
    onChange(enforceUniverseId(next));
  };

  const renderGenderRadio = () => (
    <div>
      <label className={labelClass}>
        <Lang text={{ ko: "성별", en: "Gender" }} />
      </label>
      <RadioGroup
        value={resolvePersonaBinaryGenderValue(value.gender)}
        onValueChange={applyGenderChange}
        className="mt-2 flex flex-row gap-2"
        disabled={isFieldDisabled("gender")}
      >
        {PERSONA_BINARY_GENDER_OPTIONS.map((option) => (
          <label
            key={option.value}
            className={cn(genderRadioClass, isFieldDisabled("gender") && "cursor-not-allowed opacity-50")}
          >
            <RadioGroupItem value={option.value} />
            <Lang text={option.label} />
          </label>
        ))}
      </RadioGroup>
    </div>
  );

  // Human 전용 필드 핸들러
  const handleHumanChange = <K extends keyof PersonaFormValuesType>(key: K, v: PersonaFormValuesType[K]) => {
    if (value.personaType !== "human") return;
    const current = value as PersonaFormValuesType;
    onChange(enforceUniverseId({ ...current, [key]: v }));
  };

  // Monster 전용 필드 핸들러
  const handleMonsterChange = <K extends keyof PersonaFormValuesType>(key: K, v: PersonaFormValuesType[K]) => {
    if (value.personaType !== "monster") return;
    const current = value as PersonaFormValuesType;
    onChange(enforceUniverseId({ ...current, [key]: v }));
  };

  const handlePersonaTypeChange = (nextType: PersonaType) => {
    const next = switchPersonaType(value, nextType);
    onChange(enforceUniverseId(next));
  };

  const handleVoiceProfileChange = async (patch: Partial<NonNullable<PersonaFormValuesType["voiceProfile"]>>) => {
    const current = value.voiceProfile && typeof value.voiceProfile === "object" ? value.voiceProfile : {};
    const merged = {
      ...current,
      ...patch,
      provider: "openai" as const,
      source: "persona-profile",
    };
    const voiceId = String(merged.voiceId || "")
      .trim()
      .toLowerCase();
    const modelName = String(merged.modelName || "").trim();
    const locale = String(merged.locale || "").trim();
    const instructions = String(merged.instructions || "").trim();

    if (!voiceId) {
      handleBaseChange("voiceProfile", undefined);
      return;
    }

    if (!(await confirmVoiceGenderMismatch(voiceId, value.gender))) return;

    handleBaseChange("voiceProfile", {
      provider: "openai",
      voiceId,
      modelName: modelName || OPENAI_DEFAULT_TTS_MODEL,
      locale: locale || undefined,
      instructions: instructions || undefined,
      source: "persona-profile",
    } as PersonaFormBaseType["voiceProfile"]);
  };

  // EL-603 파일럿 승인 Voice(ElevenLabs) — surface.exposableVoices만 선택지로 쓴다. 기본 0개.
  const handlePilotVoiceChange = (nextVoiceId: string) => {
    const entry = getElevenLabsVoiceCatalogEntry(nextVoiceId);
    if (!entry) return;
    handleBaseChange("voiceProfile", {
      provider: "elevenlabs",
      voiceId: entry.voiceId,
      voiceRevision: entry.voiceRevision,
      provenance: "approved_catalog",
      rightsStatus: entry.rightsStatus,
      modelName: ELEVENLABS_DEFAULT_TTS_MODEL,
      locale: entry.locales[0] || "ko",
      source: "persona-profile",
    } as PersonaFormBaseType["voiceProfile"]);
  };

  return (
    <div className="space-y-4">
      {/* 공통 영역 */}
      {renderSection(
        lang({ ko: "기본 정보 설정", en: "Basic Information Settings" }),
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className={cn(personaTypeControl === "radio" && "md:col-span-2")}>
              <label className={labelClass}>
                <Lang text={personaTypeLabel} />
              </label>
              {personaTypeControl === "radio" ? (
                <RadioGroup
                  value={value.personaType}
                  onValueChange={(v) => handlePersonaTypeChange(v as PersonaType)}
                  className="mt-2 flex flex-row gap-2"
                  disabled={isFieldDisabled("personaType")}
                >
                  {(["human", "monster"] as PersonaType[]).map((type) => (
                    <label
                      key={type}
                      className={cn(
                        "flex min-h-10 flex-1 cursor-pointer items-start gap-2 rounded-xl border border-border/60 bg-background p-3 text-sm font-medium text-primary-text",
                        isFieldDisabled("personaType") && "cursor-not-allowed opacity-50",
                      )}
                    >
                      <RadioGroupItem value={type} />
                      <div className="flex flex-col gap-1">
                        {type === "human" ? "Human" : "Monster"}
                        {!isFieldDisabled("personaType") && (
                          <span className="text-xxs text-secondary-text">
                            {type === "human"
                              ? lang({ ko: "인간 타입의 페르소나를 만들어요.", en: "Create a human-type persona." })
                              : lang({
                                  ko: "몬스터 타입의 페르소나를 만들어요.",
                                  en: "Create a monster-type persona.",
                                })}
                          </span>
                        )}
                      </div>
                    </label>
                  ))}
                </RadioGroup>
              ) : (
                <Select
                  value={value.personaType}
                  onValueChange={(v) => handlePersonaTypeChange(v as PersonaType)}
                  disabled={isFieldDisabled("personaType")}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={lang({ ko: "타입 선택", en: "Select type" })} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="human">Human</SelectItem>
                    <SelectItem value="monster">Monster</SelectItem>
                  </SelectContent>
                </Select>
              )}
            </div>

            {canViewInternalIds && (
              <div>
                <label className={labelClass}>PID</label>
                <Input
                  value={value.pid || ""}
                  readOnly
                  disabled
                  placeholder={lang({ ko: "저장 시 자동 생성됩니다.", en: "Automatically generated upon saving." })}
                  className="flex-1"
                />
                <p className={helperTextClass}>
                  <Lang
                    text={{
                      ko: "pid는 모든 유니버스에서 유일한 값으로 자동 발급되며, 저장 후에는 변경할 수 없습니다.",
                      en: "The PID is automatically issued as a unique value across the entire universe and cannot be changed after saving.",
                    }}
                  />
                </p>
              </div>
            )}

            {canViewInternalIds && universeIdMode !== "hidden" && (
              <div>
                <label className={labelClass}>Universe ID</label>
                {universeIdMode === "editable" && Array.isArray(universeOptions) && universeOptions.length > 0 ? (
                  <Select
                    value={value.universeId || undefined}
                    onValueChange={(nextValue) =>
                      handleBaseChange("universeId", Array.isArray(nextValue) ? nextValue[0] || "" : nextValue)
                    }
                  >
                    <SelectTrigger className="flex-1">
                      <SelectValue placeholder={lang({ ko: "유니버스 선택", en: "Select universe" })} />
                    </SelectTrigger>
                    <SelectContent>
                      {universeOptions.map((universe) => (
                        <SelectItem key={universe.id} value={universe.id}>
                          {universe.name}
                          <span className="ml-2 text-xs text-secondary-text">({universe.id})</span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <Input
                    value={value.universeId || ""}
                    onChange={(e) => handleBaseChange("universeId", e.target.value)}
                    placeholder={lang({
                      ko: `예: ${DEFAULT_FANTASY_UNIVERSE}, my-universe 등`,
                      en: `e.g. ${DEFAULT_FANTASY_UNIVERSE}, my-universe`,
                    })}
                    disabled={universeIdMode === "readonly"}
                    readOnly={universeIdMode === "readonly"}
                    className="flex-1"
                  />
                )}

                {universeIdMode === "readonly" && (
                  <p className={helperTextClass}>
                    <Lang
                      text={{
                        ko: "정책에 의해 자동 지정되며 수정할 수 없습니다.",
                        en: "Automatically assigned by policy and cannot be edited.",
                      }}
                    />
                  </p>
                )}
              </div>
            )}

            {systemPersonaFieldMode === "visible" ? (
              <div>
                <label className={labelClass}>
                  <Lang text={{ ko: "시스템 페르소나 키", en: "System Persona Key" }} />
                </label>
                <Input
                  value={value.systemPersonaKey || ""}
                  onChange={(e) => handleBaseChange("systemPersonaKey", e.target.value)}
                  placeholder={lang({
                    ko: "선택적: system persona key",
                    en: "Optional: system persona key",
                  })}
                  disabled={isFieldDisabled("systemPersonaKey")}
                  readOnly={isFieldDisabled("systemPersonaKey")}
                />
              </div>
            ) : null}

            <div>
              <label className={labelClass}>
                <Lang text={{ ko: "이름", en: "Name" }} />
              </label>
              <Input
                value={value.name || ""}
                onChange={(e) => handleBaseChange("name", e.target.value)}
                disabled={isFieldDisabled("name")}
                readOnly={isFieldDisabled("name")}
                placeholder={
                  value.personaType === "human"
                    ? lang({ ko: "민아", en: "Min-a" })
                    : lang({ ko: "파이어테일", en: "Firetail" })
                }
              />
            </div>

            <div>
              <label className={labelClass}>
                <Lang text={{ ko: "나이", en: "Age" }} />
              </label>
              <Input
                value={value.age || ""}
                onChange={(e) => handleBaseChange("age", e.target.value)}
                disabled={isFieldDisabled("age")}
                readOnly={isFieldDisabled("age")}
              />
            </div>

            {/* Human 인라인 필드 */}
            {value.personaType === "human" && (
              <>
                {renderGenderRadio()}
                <div>
                  <label className={labelClass}>
                    <Lang text={{ ko: "사용 언어", en: "Languages" }} />
                  </label>
                  <Input
                    value={value.language || ""}
                    onChange={(e) => handleHumanChange("language", e.target.value)}
                    placeholder="ko"
                    disabled={isFieldDisabled("language")}
                    readOnly={isFieldDisabled("language")}
                  />
                  <p className={helperTextClass}>
                    <Lang
                      text={{
                        ko: "콤마로 구분하세요. 예: 영어, 한국어, 일본어",
                        en: "Separate with commas. e.g. English, Korean, Japanese",
                      }}
                    />
                  </p>
                </div>
                <div>
                  <label className={labelClass}>
                    <Lang text={{ ko: "국적", en: "Nationality" }} />
                  </label>
                  <Input
                    value={value.nationality || ""}
                    onChange={(e) => handleHumanChange("nationality", e.target.value)}
                    disabled={isFieldDisabled("nationality")}
                    readOnly={isFieldDisabled("nationality")}
                  />
                </div>
                <div>
                  <label className={labelClass}>
                    <Lang text={{ ko: "직업", en: "Job" }} />
                  </label>
                  <Input
                    value={value.job || ""}
                    onChange={(e) => handleHumanChange("job", e.target.value)}
                    disabled={isFieldDisabled("job")}
                    readOnly={isFieldDisabled("job")}
                  />
                </div>
                <div>
                  <label className={labelClass}>
                    <Lang text={{ ko: "가치관", en: "Values" }} />
                  </label>
                  <Input
                    value={value.values || ""}
                    onChange={(e) => handleHumanChange("values", e.target.value)}
                    disabled={isFieldDisabled("values")}
                    readOnly={isFieldDisabled("values")}
                  />
                </div>
                <div className="md:col-span-2">
                  <label className={labelClass}>
                    <Lang text={{ ko: "좋아하는 것들", en: "Preferences" }} />
                  </label>
                  <Input
                    value={value.preferences || ""}
                    onChange={(e) => handleHumanChange("preferences", e.target.value)}
                    disabled={isFieldDisabled("preferences")}
                    readOnly={isFieldDisabled("preferences")}
                  />
                  <p className={helperTextClass}>
                    <Lang
                      text={{
                        ko: "콤마로 구분하세요.",
                        en: "Separate with commas.",
                      }}
                    />
                  </p>
                </div>
              </>
            )}

            {/* Monster 인라인 필드 */}
            {value.personaType === "monster" && (
              <>
                {renderGenderRadio()}
                <div>
                  <label className={labelClass}>
                    <Lang text={{ ko: "종족", en: "Species" }} />
                  </label>
                  <Input
                    value={value.species || ""}
                    onChange={(e) => handleMonsterChange("species", e.target.value)}
                    disabled={isFieldDisabled("species")}
                    readOnly={isFieldDisabled("species")}
                  />
                </div>
                <div>
                  <label className={labelClass}>
                    <Lang text={{ ko: "서식지", en: "Habitat" }} />
                  </label>
                  <Input
                    value={value.habitat || ""}
                    onChange={(e) => handleMonsterChange("habitat", e.target.value)}
                    disabled={isFieldDisabled("habitat")}
                    readOnly={isFieldDisabled("habitat")}
                  />
                </div>
                <div>
                  <label className={labelClass}>
                    <Lang text={{ ko: "위험도", en: "Threat Level" }} />
                  </label>
                  <Input
                    value={value.threatLevel || ""}
                    onChange={(e) => handleMonsterChange("threatLevel", e.target.value)}
                    disabled={isFieldDisabled("threatLevel")}
                    readOnly={isFieldDisabled("threatLevel")}
                  />
                </div>
                <div className="md:col-span-2">
                  <label className={labelClass}>
                    <Lang text={{ ko: "특수 능력", en: "Special Abilities" }} />
                  </label>
                  <Input
                    value={value.specialAbilities || ""}
                    onChange={(e) => handleMonsterChange("specialAbilities", e.target.value)}
                    disabled={isFieldDisabled("specialAbilities")}
                    readOnly={isFieldDisabled("specialAbilities")}
                  />
                </div>
              </>
            )}
          </div>

          {presetSlot ? <div>{presetSlot}</div> : null}
        </div>,
        "",
      )}

      {renderSection(
        lang({ ko: "페르소나 상세 설정", en: "Persona Details" }),
        <div className="space-y-3">
          <div>
            <label className={labelClass}>
              <Lang text={{ ko: "외형", en: "Appearance" }} />
            </label>
            <Textarea
              rows={3}
              value={value.appearance || ""}
              onChange={(e) => handleBaseChange("appearance", e.target.value)}
              disabled={isFieldDisabled("appearance")}
              readOnly={isFieldDisabled("appearance")}
            />
          </div>
          <div>
            <label className={labelClass}>
              <Lang text={{ ko: "배경", en: "Background" }} />
            </label>
            <Textarea
              rows={3}
              value={value.background || ""}
              onChange={(e) => handleBaseChange("background", e.target.value)}
              disabled={isFieldDisabled("background")}
              readOnly={isFieldDisabled("background")}
            />
          </div>
          <div>
            <label className={labelClass}>
              <Lang text={{ ko: "성격", en: "Personality" }} />
            </label>
            <Textarea
              rows={3}
              value={value.personality || ""}
              onChange={(e) => handleBaseChange("personality", e.target.value)}
              disabled={isFieldDisabled("personality")}
              readOnly={isFieldDisabled("personality")}
            />
          </div>
          <div>
            <label className={labelClass}>{lang({ ko: "말투 / 어투", en: "Speech Style" })}</label>
            <Select
              value={selectedSpeechStylePreset}
              onValueChange={(nextValue) => {
                const preset = SPEECH_STYLE_PRESETS.find((item) => item.key === nextValue);
                if (preset) handleBaseChange("speechStyle", lang(preset.value));
              }}
              disabled={isFieldDisabled("speechStyle")}
            >
              <SelectTrigger>
                <SelectValue placeholder={lang({ ko: "말투 예시 선택", en: "Select a speech style example" })} />
              </SelectTrigger>
              <SelectContent>
                {SPEECH_STYLE_PRESETS.map((preset) => (
                  <SelectItem key={preset.key} value={preset.key}>
                    <Lang text={preset.label} />
                  </SelectItem>
                ))}
                <SelectItem value={SPEECH_STYLE_CUSTOM_VALUE}>
                  <Lang text={{ ko: "직접 입력", en: "Custom" }} />
                </SelectItem>
              </SelectContent>
            </Select>
            <Textarea
              className="mt-2"
              rows={3}
              value={value.speechStyle || ""}
              onChange={(e) => handleBaseChange("speechStyle", e.target.value)}
              placeholder={lang({
                ko: "예: 반말. 짧고 단호하게. 사용자를 '너'라고 부르되 비하 표현은 절대 금지.",
                en: "e.g. Casual, short, and direct. Call the user 'you' without insulting them.",
              })}
              disabled={isFieldDisabled("speechStyle")}
              readOnly={isFieldDisabled("speechStyle")}
            />
            <p className={helperTextClass}>
              <Lang
                text={{
                  ko: "페르소나 정체성을 설정합니다. 존댓말/반말, 호칭, 명령조, 문장 길이, 금지 표현을 명시하세요.",
                  en: "This is persona identity. Define register, address terms, command tone, sentence length, and banned expressions.",
                }}
              />
            </p>
          </div>
          <div>
            <label className={labelClass}>
              <Lang text={{ ko: "요약", en: "Summary" }} />
            </label>
            <Textarea
              rows={3}
              value={value.summary || ""}
              onChange={(e) => handleBaseChange("summary", e.target.value)}
              disabled={isFieldDisabled("summary")}
              readOnly={isFieldDisabled("summary")}
            />
          </div>
        </div>,
        groupedSectionClass,
      )}

      {renderSection(
        lang({ ko: "음성 설정 덮어쓰기", en: "Voice Override" }),
        <>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div>
              <label className={labelClass}>
                <Lang text={{ ko: "음성", en: "Voice" }} />
              </label>
              <Select
                value={currentVoiceId || "auto"}
                disabled={isFieldDisabled("voiceProfile")}
                onValueChange={(nextValue) =>
                  handleVoiceProfileChange({
                    voiceId:
                      (Array.isArray(nextValue) ? nextValue[0] : nextValue) === "auto"
                        ? undefined
                        : Array.isArray(nextValue)
                          ? nextValue[0]
                          : nextValue,
                  })
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder={lang({ ko: "자동 선택", en: "Auto select" })} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="auto">
                    {voiceGenderHint
                      ? lang({ ko: "자동 선택 (성별 기반)", en: "Auto select by gender" })
                      : lang({ ko: "자동 선택", en: "Auto select" })}
                  </SelectItem>
                  {OPENAI_APPROVED_VOICE_CATALOG.map((voice) => (
                    <SelectItem key={voice.voiceId} value={voice.voiceId}>
                      {voice.label} ({voice.tags.join(", ")})
                      {voiceGenderHint && !isOpenAiVoiceAllowedForGenderHint(voice.voiceId, voiceGenderHint)
                        ? ` · ${lang({ ko: "성별과 다름", en: "gender mismatch" })}`
                        : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectedVoiceEntry ? (
                <VoicePreviewButton
                  key={`${selectedVoiceEntry.voiceId}:${value.voiceProfile?.modelName || OPENAI_DEFAULT_TTS_MODEL}:${value.voiceProfile?.locale || "ko"}`}
                  voiceId={selectedVoiceEntry.voiceId}
                  modelName={value.voiceProfile?.modelName || OPENAI_DEFAULT_TTS_MODEL}
                  universeId={universeId}
                  locale={value.voiceProfile?.locale || "ko"}
                  className="mt-2"
                />
              ) : null}
              {pilotVoices.length > 0 ? (
                <div className="mt-3">
                  <label className={labelClass}>
                    <Lang text={{ ko: "파일럿 승인 Voice", en: "Pilot approved voice" }} />
                  </label>
                  <Select
                    value={pilotVoices.includes(currentVoiceId) ? currentVoiceId : ""}
                    disabled={isFieldDisabled("voiceProfile")}
                    onValueChange={(nextValue) =>
                      handlePilotVoiceChange(Array.isArray(nextValue) ? nextValue[0] : nextValue)
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={lang({ ko: "선택 안 함", en: "None" })} />
                    </SelectTrigger>
                    <SelectContent>
                      {pilotVoices.map((voiceId) => (
                        <SelectItem key={voiceId} value={voiceId}>
                          {getElevenLabsVoiceCatalogEntry(voiceId)?.label || voiceId}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ) : null}
            </div>

            <div>
              <label className={labelClass}>
                <Lang text={{ ko: "TTS 모델", en: "TTS Model" }} />
              </label>
              <Input
                value={value.voiceProfile?.modelName || OPENAI_DEFAULT_TTS_MODEL}
                onChange={(e) => handleVoiceProfileChange({ modelName: e.target.value })}
                placeholder={OPENAI_DEFAULT_TTS_MODEL}
                disabled={!hasVoiceOverride || isFieldDisabled("voiceProfile")}
                readOnly={isFieldDisabled("voiceProfile")}
              />
            </div>

            <div>
              <label className={labelClass}>
                <Lang text={{ ko: "언어/지역", en: "Locale" }} />
              </label>
              <Input
                value={value.voiceProfile?.locale || ""}
                onChange={(e) => handleVoiceProfileChange({ locale: e.target.value })}
                placeholder="ko / en / ja"
                disabled={!hasVoiceOverride || isFieldDisabled("voiceProfile")}
                readOnly={isFieldDisabled("voiceProfile")}
              />
            </div>

            <div className="md:col-span-2">
              <label className={labelClass}>
                <Lang text={{ ko: "음성 지침", en: "Voice Instructions" }} />
              </label>
              <Textarea
                rows={3}
                value={value.voiceProfile?.instructions || ""}
                onChange={(e) => handleVoiceProfileChange({ instructions: e.target.value })}
                placeholder={lang({
                  ko: "예: 차분하고 명확하게, 일관된 톤으로 말하기",
                  en: "e.g. Speak calmly, clearly, and with a consistent tone",
                })}
                disabled={!hasVoiceOverride || isFieldDisabled("voiceProfile")}
                readOnly={isFieldDisabled("voiceProfile")}
              />
            </div>
          </div>
        </>,
        groupedSectionClass,
        false,
      )}

      {/* Human/Monster 전용 필드는 기본 정보 그리드에 인라인 통합되어 별도 섹션 미사용 */}

      {/* Profiles */}
      {profilesSectionMode === "visible" ? (
        <div className={groupedSectionClass}>
          <label className={labelClass}>
            <Lang text={{ ko: "프로필", en: "Profiles" }} />
          </label>
          <ProfilesEditor
            universeId={universeId}
            pid={pid}
            value={value.profiles || { default: [] }}
            onChange={(next: IPersonaProfileMap) => handleBaseChange("profiles", next)}
          />
        </div>
      ) : null}

      {spriteSectionMode === "visible" && (
        <div className={groupedSectionClass}>
          <label className={labelClass}>
            <Lang text={{ ko: "스프라이트", en: "Sprite" }} />
          </label>
          <SpriteSheetEditor
            universeId={universeId}
            pid={pid}
            value={value.sprite || null}
            onChange={(next: IPersonaSprite | null) => handleBaseChange("sprite", next)}
          />
        </div>
      )}
    </div>
  );
}
