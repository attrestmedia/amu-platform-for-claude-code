"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { DEFAULT_TEXT_MODEL, TEXT_MODEL_GUIDE_BY_MODEL, TEXT_MODELS } from "consts/ai";
import { resolveCharacterGenesisShellPresentation } from "consts/app";
import { Button, Input, Textarea, Preloader, Dialog, DialogContent, DialogHeader, DialogTitle, RadioGroup, RadioGroupItem, dialog } from "@amu-labs/ui";
import { ModelSelectField } from "components/module/model-select";
import { ImageBox } from "components/module/image";
import { toast } from "sonner";
import type { PersonaFormValuesType, PersonaType } from "types/ai";
import type { CharacterGenesisSurfaceType } from "types/ui/characterGenesis";
import {
  listTutorsPersonas,
  getTutorsPersona,
  saveTutorsPersona,
  deleteTutorsPersona,
  generateTutorsPersonaDraft,
} from "libs/api/tutors/personas";
import { createTutorProfileImageRequestId, prepareTutorProfileImageForSave } from "libs/api/tutors/profileImage";
import { cn } from "utils/common";
import { logger } from "utils/log";
import { toErrorMessage } from "utils/common/typeUtils";
import { ChevronDown, ChevronLeft, ChevronRight, Sparkles } from "lucide-react";
import { Lang, lang, useLocalize } from "components/module/i18n";
import { safeString } from "utils/common";
import { THEME_OVERRIDE_CLASS } from "utils/theme";
import { PersonaEditor } from "./PersonaEditor";
import { TutorIntroSection } from "components/template/tutors/modules/TutorSettingsEditor";
import { makeEmptyTutor, resolveTutorLocalizedDefaults, resolveTutorUniverseId } from "utils/app/tutorsOnboarding";
import SystemPersonaPresetPicker, {
  type SystemPersonaPresetOption,
} from "components/module/persona/SystemPersonaPresetPicker";
import TutorProfileImageSection from "components/module/persona/TutorProfileImageSection";
import { useUserData } from "hooks/auth";
import type { LanguageType } from "types/language";
import {
  getPrimaryProfileImage,
  getTutorProfileImageMissingRequiredFields,
  TUTOR_PROFILE_IMAGE_REQUIRED_FIELD_LABELS,
} from "utils/app/tutorProfileImage";
import { persistCoinUpdated } from "utils/payment";
import { inferTextProviderFromModelNameRaw } from "utils/ai/providerHelper";
import { TUTOR_REGISTRATION_LOCK_CONFIRM_TEXT } from "utils/app/tutorsEditPolicy";

type UserPersonaManagerProps = {
  initialPid?: string;
  showHeader?: boolean;
  hideList?: boolean;
  initialDraft?: Partial<PersonaFormValuesType>;
  onSaved?: (saved: PersonaFormValuesType) => void | Promise<void>;
  saveButtonText?: string;
  surface: CharacterGenesisSurfaceType;
  imageGenerationPresentation?: "sheet" | "embedded";
};

type TutorProfileSetupModeType = "choice" | "editor";

const TEXT_PROVIDER_LABEL: Record<string, string> = {
  google: "Google",
  openai: "OpenAI",
  claude: "Claude",
  deepseek: "DeepSeek",
  xai: "xAI",
  zai: "Z.ai",
};

const TEXT_MODEL_TITLE_MAP: Record<string, string> = {
  "gemini-3.6-flash": "Gemini 3.6 Flash",
  "gemini-3.1-pro-preview": "Gemini 3.1 Pro Preview",
  "gemini-3.5-flash-lite": "Gemini 3.5 Flash-Lite",
  "gpt-5.6-sol": "GPT-5.6 Sol",
  "gpt-5.6-terra": "GPT-5.6 Terra",
  "gpt-5.6-luna": "GPT-5.6 Luna",
  "claude-haiku-4-5": "Claude Haiku 4.5",
  "claude-fable-5": "Claude Fable 5",
  "claude-opus-5": "Claude Opus 5",
  "claude-sonnet-5": "Claude Sonnet 5",
  "deepseek-v4-flash": "DeepSeek V4 Flash",
  "deepseek-v4-pro": "DeepSeek V4 Pro",
  "grok-4.5": "Grok 4.5",
  "grok-4.3": "Grok 4.3",
  "grok-build-0.1": "Grok Build 0.1",
  "grok-4.20-0309-reasoning": "Grok 4.20 Reasoning",
  "glm-5.3": "GLM 5.3",
  "glm-5.3-flash": "GLM 5.3 Flash",
};

const AUTO_TEXT_MODEL_OPTIONS = (TEXT_MODELS as readonly string[]).map((modelName) => {
  const provider = inferTextProviderFromModelNameRaw(modelName);
  const providerLabel = TEXT_PROVIDER_LABEL[provider || ""] || "AI";
  const guide = TEXT_MODEL_GUIDE_BY_MODEL[modelName as keyof typeof TEXT_MODEL_GUIDE_BY_MODEL];
  return {
    value: modelName,
    title: `${providerLabel} ${TEXT_MODEL_TITLE_MAP[modelName] || modelName}`,
    providerLabel,
    description: modelName,
    note: guide ? lang(guide.note) : undefined,
    badgeText: providerLabel,
  };
});

const SAVED_TUTOR_PERSONA_DISABLED_FIELDS = {
  personaType: true,
  universeId: true,
  systemPersonaKey: true,
  name: true,
} satisfies Partial<Record<keyof PersonaFormValuesType | "personaType", boolean>>;

function TutorEditorSection({
  title,
  description,
  defaultOpen = true,
  children,
}: {
  title: { ko: string; en: string };
  description?: { ko: string; en: string };
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  return (
    <details open={defaultOpen} className="group overflow-hidden rounded-2xl border border-border/60 bg-surface/70">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-4 marker:hidden">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-primary-text">
            <Lang text={title} />
          </h3>
          {description ? (
            <p className="mt-1 text-xs leading-5 text-secondary-text">
              <Lang text={description} />
            </p>
          ) : null}
        </div>
        <ChevronDown className="h-4 w-4 shrink-0 text-primary transition-transform group-open:rotate-180" />
      </summary>
      <div className="border-t border-border/40 p-4">{children}</div>
    </details>
  );
}

function buildInitialPersonaDraft(
  initialDraft?: Partial<PersonaFormValuesType>,
  preferredUiLanguage: LanguageType = "ko",
  learnerAge?: number,
) {
  const baseDraft = makeEmptyTutor(preferredUiLanguage, learnerAge);
  const localizedDefaults = resolveTutorLocalizedDefaults(preferredUiLanguage);

  return {
    ...baseDraft,
    ...(initialDraft || {}),
    universeId: resolveTutorUniverseId(initialDraft?.personaType || "human"),
    tutorsPolicy: {
      ...baseDraft.tutorsPolicy,
      ...(initialDraft?.tutorsPolicy && typeof initialDraft.tutorsPolicy === "object" ? initialDraft.tutorsPolicy : {}),
      targetLanguage:
        String(initialDraft?.tutorsPolicy?.targetLanguage || "").trim() || localizedDefaults.targetLanguage,
      topic: String(initialDraft?.tutorsPolicy?.topic || "").trim() || localizedDefaults.topic,
      learningGoal: String(initialDraft?.tutorsPolicy?.learningGoal || "").trim() || localizedDefaults.learningGoal,
    },
  } as PersonaFormValuesType;
}

function resolveAutoDraftStatusText(args: { hasReferenceImage: boolean; hasStyleText: boolean }) {
  if (args.hasReferenceImage) {
    return {
      ko: "등록된 이미지를 분석하여 프로필을 생성합니다.",
      en: "The profile will be generated by analyzing the registered image.",
    };
  }

  if (args.hasStyleText) {
    return {
      ko: "제시된 스타일에 맞추어 프로필을 생성합니다.",
      en: "The profile will be generated to match the requested style.",
    };
  }

  return {
    ko: "추천 스타일로 프로필을 생성합니다.",
    en: "The profile will be generated with a recommended style.",
  };
}

export function UserPersonaManager({
  initialPid = "",
  showHeader = true,
  hideList = false,
  initialDraft,
  onSaved,
  saveButtonText = "저장",
  surface,
  imageGenerationPresentation = "sheet",
}: UserPersonaManagerProps) {
  const { language } = useLocalize();
  const { userData } = useUserData();
  const preferredUiLanguage: LanguageType = userData?.userInfo?.language || language || "ko";
  const learnerAge = typeof userData?.userInfo?.age === "number" ? userData.userInfo.age : undefined;
  const presentation = resolveCharacterGenesisShellPresentation(surface);
  const isAdmin = (userData?.roles || []).includes("administrator");
  const headerActionButtonClass = presentation.headerActionButtonClass;
  const listPanelClass = presentation.listPanelClass;
  const listItemClass = (isSelected: boolean) =>
    cn(
      "group w-full rounded-2xl border px-4 py-3 text-left transition-colors",
      isSelected
        ? "border-primary/35 bg-primary/10 text-primary shadow-sm"
        : "border-border/50 bg-background/70 text-primary-text hover:border-primary/30 hover:bg-surface/80",
    );

  const [loading, setLoading] = useState(true);
  const [list, setList] = useState<PersonaFormValuesType[]>([]);
  const [search, setSearch] = useState("");
  const [selectedPid, setSelectedPid] = useState<string>("");

  const [editing, setEditing] = useState<PersonaFormValuesType | null>(
    hideList && !initialPid ? buildInitialPersonaDraft(initialDraft, preferredUiLanguage, learnerAge) : null,
  );
  const profileImageSaveRequestRef = useRef<{ clientRequestId: string; inputSignature: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [autoGenerating, setAutoGenerating] = useState(false);
  const [autoBrief, setAutoBrief] = useState("");
  const [autoModelName, setAutoModelName] = useState<string>(DEFAULT_TEXT_MODEL);
  const [autoResultMessage, setAutoResultMessage] = useState("");
  const [autoDraftOpen, setAutoDraftOpen] = useState(false);
  const [selectedSystemPersonaOption, setSelectedSystemPersonaOption] = useState<SystemPersonaPresetOption | null>(
    null,
  );
  // AI 페르소나 자동 생성을 완료하면 편집 헤더의 "AI로 생성하기" 버튼을 숨김
  const [autoDraftGenerated, setAutoDraftGenerated] = useState(false);
  const [createMode, setCreateMode] = useState<"idle" | "manual">(hideList && !initialPid ? "manual" : "idle");
  const [profileSetupMode, setProfileSetupMode] = useState<TutorProfileSetupModeType>(
    hideList && !initialPid ? "choice" : "editor",
  );
  // 프로필 설정 위저드 단계: 1) 프로필(타입/프리셋) → 2) 이미지 만들기
  const [profileSetupStep, setProfileSetupStep] = useState<"profile" | "image">("profile");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return list;
    return list.filter((p) => {
      const name = safeString(p.name).toLowerCase();
      const pid = safeString(p.pid).toLowerCase();
      return name.includes(q) || pid.includes(q);
    });
  }, [list, search]);
  const savedTutorPidSet = useMemo(
    () => new Set(list.map((persona) => safeString(persona.pid)).filter(Boolean)),
    [list],
  );
  const editingPid = safeString(editing?.pid);
  const isSavedTutor = Boolean(editingPid && (createMode !== "manual" || savedTutorPidSet.has(editingPid)));
  const isExistingTutor = isSavedTutor;
  const editingProfileImageUrl = getPrimaryProfileImage(editing?.profiles);
  const personaDisabledFields = useMemo(() => {
    const base = isExistingTutor ? SAVED_TUTOR_PERSONA_DISABLED_FIELDS : {};
    // 페르소나 이미지 생성을 완료한 단계(프로필 이미지 존재)에서는 personaType은 disabled 적용
    if (editingProfileImageUrl) return { ...base, personaType: true };
    return base;
  }, [isExistingTutor, editingProfileImageUrl]);
  const autoDraftReferenceImageUrl = editingProfileImageUrl;
  const shouldGateTutorProfileSetup = Boolean(editing && !isSavedTutor);
  const shouldShowProfileSetupChoice = shouldGateTutorProfileSetup && profileSetupMode !== "editor";
  const shouldShowPersonaEditor = Boolean(editing) && (!shouldGateTutorProfileSetup || profileSetupMode === "editor");
  const autoDraftStatusText = resolveAutoDraftStatusText({
    hasReferenceImage: Boolean(autoDraftReferenceImageUrl),
    hasStyleText: Boolean(autoBrief.trim()),
  });
  const selectedPersonaTypeText =
    editing?.personaType === "monster" ? { ko: "Monster", en: "Monster" } : { ko: "Human", en: "Human" };
  const selectedSystemPersonaTitle =
    selectedSystemPersonaOption?.title ||
    safeString(editing?.systemPersonaKey) ||
    lang({ ko: "선택 안함", en: "No selection" });
  const selectedSystemPersonaSummary =
    selectedSystemPersonaOption?.summary ||
    (safeString(editing?.systemPersonaKey)
      ? lang({ ko: "선택한 역할 프리셋입니다.", en: "Selected role preset." })
      : lang({ ko: "직접 설정한 성격과 역할을 사용합니다.", en: "Uses custom personality and role settings." }));

  function patchEditingSystemPersonaKey(nextValue: string, option?: SystemPersonaPresetOption) {
    const nextSystemPersonaKey = safeString(nextValue);
    setSelectedSystemPersonaOption(option || null);

    setEditing((prev) => {
      const base = prev || buildInitialPersonaDraft(initialDraft, preferredUiLanguage, learnerAge);
      const currentPolicy = base.tutorsPolicy && typeof base.tutorsPolicy === "object" ? base.tutorsPolicy : {};
      const tutorsPolicyDefaults = option?.tutorsPolicyDefaults || {};

      return {
        ...base,
        systemPersonaKey: nextSystemPersonaKey,
        tutorsPolicy: {
          ...currentPolicy,
          ...tutorsPolicyDefaults,
        },
      } as PersonaFormValuesType;
    });
  }

  function patchEditingPersonaType(nextType: PersonaType) {
    setEditing((prev) => {
      const base = prev || buildInitialPersonaDraft(initialDraft, preferredUiLanguage, learnerAge);

      return {
        ...base,
        personaType: nextType,
        universeId: resolveTutorUniverseId(nextType),
      } as PersonaFormValuesType;
    });
  }

  async function fetchList() {
    setLoading(true);
    try {
      const rows = await listTutorsPersonas();
      setList(rows || []);
    } catch (e) {
      logger.error("[UserPersonaManager] 목록 조회 실패:", e);
      setList([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(function fetchUserPersonaListOnMount() {
    // 마운트 시 외부 API에서 사용자 페르소나 목록 fetch
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchList();
  }, []);

  useEffect(
    function syncSelectedPidFromInitialProp() {
      if (!initialPid) return;
      // initialPid prop(외부 입력) 변경 시 내부 selectedPid 동기화
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSelectedPid(initialPid);
    },
    [initialPid],
  );

  useEffect(
    function applyTutorLocalizedDefaultsToEditing() {
      if (!editing || selectedPid || createMode !== "manual" || editing.pid) return;

      const hasMeaningfulManualInput = [
        editing.name,
        editing.summary,
        editing.background,
        editing.personality,
        editing.speechStyle,
        editing.tutorIntro,
        editing.job,
        editing.language,
      ].some((value) => safeString(value).trim().length > 0);

      if (hasMeaningfulManualInput) return;

      const localizedDefaults = resolveTutorLocalizedDefaults(preferredUiLanguage);
      const currentPolicy =
        editing?.tutorsPolicy && typeof editing.tutorsPolicy === "object" ? editing.tutorsPolicy : {};

      if (
        safeString(currentPolicy.targetLanguage).trim() === localizedDefaults.targetLanguage &&
        safeString(currentPolicy.topic).trim() === localizedDefaults.topic &&
        safeString(currentPolicy.learningGoal).trim() === localizedDefaults.learningGoal
      ) {
        return;
      }

      // 외부 입력(preferredUiLanguage)로부터 파생된 tutor 기본값을 editing에 반영
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setEditing((prev: PersonaFormValuesType | null) => {
        if (!prev || prev.pid) return prev;

        const nextPolicy = prev.tutorsPolicy && typeof prev.tutorsPolicy === "object" ? prev.tutorsPolicy : {};

        return {
          ...prev,
          tutorsPolicy: {
            ...nextPolicy,
            targetLanguage: localizedDefaults.targetLanguage,
            topic: localizedDefaults.topic,
            learningGoal: localizedDefaults.learningGoal,
          },
        } as PersonaFormValuesType;
      });
    },
    [createMode, editing, preferredUiLanguage, selectedPid],
  );

  // 선택 pid 변경 시 단건 로드
  useEffect(() => {
    let alive = true;

    (async () => {
      if (!selectedPid) {
        if (createMode !== "manual") {
          setEditing(null);
        }
        return;
      }

      try {
        const full = await getTutorsPersona(selectedPid);
        const base = full || list.find((x) => x.pid === selectedPid) || null;

        if (!alive) return;

        setEditing(base);
        setCreateMode("idle");
        setProfileSetupMode("editor");
        setSelectedSystemPersonaOption(null);
        setAutoDraftGenerated(false);
      } catch (e) {
        logger.error("[UserPersonaManager] 단건 로드 실패:", e);
      }
    })();

    return () => {
      alive = false;
    };
  }, [createMode, list, selectedPid]);

  function createNew() {
    setSelectedPid("");
    setEditing(buildInitialPersonaDraft(initialDraft, preferredUiLanguage, learnerAge));
    setCreateMode("manual");
    setProfileSetupMode("choice");
    setProfileSetupStep("profile");
    setAutoResultMessage("");
    setSelectedSystemPersonaOption(null);
    setAutoDraftGenerated(false);
  }

  async function generateAutoDraft() {
    if (!editing) return;

    setAutoGenerating(true);
    setAutoResultMessage("");

    try {
      const seed = editing;
      // 참고 이미지(base64)는 클라이언트에서 변환하지 않는다.
      // private Gen Studio 이미지(worker/signed URL)를 브라우저에서 fetch하면 CORS/인증 문제로
      // "Failed to fetch"가 발생하므로, 서버가 seed.profiles의 대표 이미지 URL을 직접 해석한다.
      const generated = await generateTutorsPersonaDraft({
        modelName: autoModelName,
        systemPersonaKey: safeString(seed?.systemPersonaKey),
        brief: autoBrief,
        outputLanguage: preferredUiLanguage,
        seed,
      });

      const merged: PersonaFormValuesType = {
        ...seed,
        ...generated.data,
        pid: isSavedTutor ? safeString(seed.pid) : "",
        systemPersonaKey: safeString(generated.data?.systemPersonaKey) || safeString(seed?.systemPersonaKey),
        tutorsPolicy: {
          ...(seed?.tutorsPolicy && typeof seed.tutorsPolicy === "object" ? seed.tutorsPolicy : {}),
          ...(generated.data?.tutorsPolicy && typeof generated.data.tutorsPolicy === "object"
            ? generated.data.tutorsPolicy
            : {}),
        },
        tutorsUi: seed?.tutorsUi,
      };

      setEditing(merged);
      setProfileSetupMode("editor");
      setAutoDraftGenerated(true);
      setAutoResultMessage(`AI 초안을 생성했습니다. 이번 생성에 ${generated.billing.coins}코인이 사용되었습니다.`);
      setAutoDraftOpen(false);
    } catch (error) {
      logger.error("[UserPersonaManager] AI 초안 생성 실패:", error);
      void dialog.alert({ variant: "danger", message: toErrorMessage(error, "AI 초안 생성에 실패했습니다.") });
    } finally {
      setAutoGenerating(false);
    }
  }

  async function save() {
    if (!editing) return;
    if (!safeString(editing.name).trim()) {
      void dialog.alert("이름(name)은 필수입니다.");
      return;
    }

    const missingFieldText = getTutorProfileImageMissingRequiredFields(editing)
      .map((fieldKey) => lang(TUTOR_PROFILE_IMAGE_REQUIRED_FIELD_LABELS[fieldKey]))
      .join(", ");

    if (!getPrimaryProfileImage(editing.profiles) && missingFieldText) {
      void dialog.alert(
        lang({
          ko: `프로필 이미지를 자동 생성하려면 ${missingFieldText} 항목을 먼저 입력해주세요.`,
          en: `Fill in ${missingFieldText} before auto-generating a profile image.`,
        }),
      );
      return;
    }

    if (!isSavedTutor && !(await dialog.confirm(lang(TUTOR_REGISTRATION_LOCK_CONFIRM_TEXT)))) {
      return;
    }

    setSaving(true);
    try {
      let payload: PersonaFormValuesType = {
        ...editing,
        universeId: resolveTutorUniverseId(editing.personaType || "human"),
      };

      let saveMessage = "저장되었습니다.";

      if (!getPrimaryProfileImage(payload.profiles)) {
        const inputSignature = JSON.stringify(payload);
        const previousRequest = profileImageSaveRequestRef.current;
        const clientRequestId =
          previousRequest?.inputSignature === inputSignature
            ? previousRequest.clientRequestId
            : createTutorProfileImageRequestId();
        profileImageSaveRequestRef.current = { clientRequestId, inputSignature };
        const prepared = await prepareTutorProfileImageForSave({
          persona: payload,
          clientRequestId,
        });
        payload = {
          ...prepared.nextPersona,
          universeId: resolveTutorUniverseId(prepared.nextPersona.personaType || "human"),
        };

        if (prepared.billingCoins > 0) {
          persistCoinUpdated({ scope: "user", amount: -prepared.billingCoins });
        }

        saveMessage = `페르소나 정보를 바탕으로 프로필 이미지를 자동 생성한 뒤 저장했습니다. ${prepared.billingCoins}코인이 사용되었습니다.`;
      } else {
        profileImageSaveRequestRef.current = null;
      }

      const saved = await saveTutorsPersona(payload);
      await fetchList();

      if (saved?.pid) setSelectedPid(saved.pid);
      await onSaved?.(saved);
      profileImageSaveRequestRef.current = null;
      toast.success(saveMessage);
    } catch (e) {
      logger.error("[UserPersonaManager] 저장 실패:", e);
      void dialog.alert({ variant: "danger", message: toErrorMessage(e, "저장에 실패했습니다.") });
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!editing?.pid) {
      void dialog.alert("삭제할 대상이 없습니다.");
      return;
    }
    if (!(await dialog.confirm({ variant: "danger", message: "해당 페르소나를 삭제할까요?" }))) return;

    setRemoving(true);
    try {
      await deleteTutorsPersona(editing.pid);
      await fetchList();
      setSelectedPid("");
      setEditing(null);
      toast.success("삭제되었습니다.");
    } catch (e) {
      logger.error("[UserPersonaManager] 삭제 실패:", e);
      void dialog.alert({ variant: "danger", message: "삭제에 실패했습니다." });
    } finally {
      setRemoving(false);
    }
  }

  const hasRightContent = !!editing;
  const renderProfileImageSection = (
    persona: PersonaFormValuesType,
    layoutVariant: "card" | "embedded" = "card",
    imageActionMode: "create" | "edit" = "edit",
  ) => (
    <TutorProfileImageSection
      value={persona}
      onChange={(next) => setEditing(next)}
      disabled={autoGenerating || saving || removing}
      canViewProfileUsageNote={isAdmin}
      layoutVariant={layoutVariant}
      imageActionMode={imageActionMode}
      generationPresentation={imageGenerationPresentation}
    />
  );

  const editorPanel = editing ? (
    <div className="space-y-3">
      <div className="min-w-0 space-y-3">
        {shouldShowProfileSetupChoice ? (
          <div className="overflow-hidden rounded-2xl border border-border/60 bg-surface/70 shadow-sm">
            <div className="flex items-start justify-between gap-3 border-b border-border/40 px-4 py-4 sm:px-5">
              <div className="min-w-0">
                <h3 className="text-sm font-semibold text-primary-text">
                  {profileSetupStep === "profile" ? (
                    <Lang text={{ ko: "1. Tutor 프로필 설정하기", en: "1. Set up tutor profile" }} />
                  ) : (
                    <Lang text={{ ko: "2. 튜터 이미지 만들기", en: "2. Create tutor image" }} />
                  )}
                </h3>
                <p className="mt-1 text-xs leading-5 text-secondary-text">
                  {profileSetupStep === "profile" ? (
                    <Lang
                      text={{
                        ko: "필수 프로필 정보를 선택하세요.",
                        en: "Choose the required profile information.",
                      }}
                    />
                  ) : (
                    <Lang
                      text={{
                        ko: "프로필 이미지를 등록하거나 AI로 생성하세요.",
                        en: "Register a profile image or generate one with AI.",
                      }}
                    />
                  )}
                </p>
              </div>
              <span className="shrink-0 rounded-full bg-primary/10 px-2.5 py-1 text-xxs font-semibold text-primary">
                {profileSetupStep === "profile" ? "1 / 2" : "2 / 2"}
              </span>
            </div>

            {profileSetupStep === "profile" ? (
              <>
                <div className="space-y-4 p-4 sm:p-5">
                  <div className="space-y-2">
                    <label className="flex items-center gap-1 text-xs font-medium text-secondary-text">
                      <Lang text={{ ko: "Persona Type", en: "Persona Type" }} />
                      <span className="text-danger">*</span>
                    </label>
                    <RadioGroup
                      value={editing.personaType || "human"}
                      onValueChange={(nextValue) => patchEditingPersonaType(nextValue as PersonaType)}
                      className="grid grid-cols-1 gap-2 sm:grid-cols-2"
                      disabled={saving || removing || autoGenerating}
                    >
                      {(["human", "monster"] as PersonaType[]).map((type) => (
                        <label
                          key={type}
                          className="flex min-h-16 cursor-pointer items-start gap-2 rounded-xl border border-border/60 bg-background p-3 text-sm font-medium text-primary-text"
                        >
                          <RadioGroupItem value={type} />
                          <div className="flex flex-col gap-1">
                            <Lang
                              text={type === "human" ? { ko: "Human", en: "Human" } : { ko: "Monster", en: "Monster" }}
                            />
                            <span className="text-xxs text-secondary-text">
                              {type === "human"
                                ? lang({
                                    ko: "인간 타입의 페르소나를 만들어요.",
                                    en: "Create a human-type persona.",
                                  })
                                : lang({
                                    ko: "몬스터 타입의 페르소나를 만들어요.",
                                    en: "Create a monster-type persona.",
                                  })}
                            </span>
                          </div>
                        </label>
                      ))}
                    </RadioGroup>
                  </div>

                  <div className="space-y-2">
                    <div>
                      <p className="text-sm font-medium">
                        <Lang text={{ ko: "기본 역할", en: "Base Persona" }} />
                      </p>
                      <p className="mt-1 text-xs leading-5 text-secondary-text">
                        <Lang
                          text={{
                            ko: "튜터의 기본 역할을 선택하세요.",
                            en: "A preset that defines the tutor's role.",
                          }}
                        />
                      </p>
                    </div>
                    <SystemPersonaPresetPicker
                      value={safeString(editing?.systemPersonaKey)}
                      onChange={patchEditingSystemPersonaKey}
                      disabled={saving || removing || autoGenerating}
                      showNoneOption
                      placeholderText={lang({ ko: "기본 성격을 선택해주세요", en: "Select a base persona tone" })}
                      placeholderDescriptionText={lang({
                        ko: "튜터의 기본 성격을 선택하세요.",
                        en: "Please select the tutor's personality.",
                      })}
                      onResolvedOption={setSelectedSystemPersonaOption}
                      noneOptionLabelText={lang({ ko: "선택 안함", en: "No selection" })}
                      noneOptionDescriptionText={lang({
                        ko: "직접 튜터의 배경, 성격 등을 설정합니다.",
                        en: "Directly set the tutor's background, personality, etc.",
                      })}
                    />
                  </div>
                </div>

                <div className="flex items-center justify-end border-t border-border/40 bg-background/50 p-4">
                  <Button
                    className="min-h-10 rounded-xl px-5 text-sm font-semibold shadow-sm"
                    onClick={() => setProfileSetupStep("image")}
                    disabled={saving || removing || autoGenerating}
                  >
                    <Lang as="span" text={{ ko: "다음 단계로", en: "Next step" }} />
                    <ChevronRight size={14} />
                  </Button>
                </div>
              </>
            ) : (
              <>
                <div className="p-4 sm:p-5">
                  <div className="mx-auto w-full max-w-md">
                    {renderProfileImageSection(editing, "embedded", "create")}
                  </div>
                </div>

                <div className="space-y-3 border-t border-border/40 bg-background/50 p-4">
                  {editingProfileImageUrl ? (
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                      <Button
                        variant="outline"
                        className="min-h-10 rounded-xl px-4 text-sm font-semibold"
                        onClick={() => setProfileSetupMode("editor")}
                        disabled={saving || removing || autoGenerating}
                      >
                        <Lang text={{ ko: "직접 작성하기", en: "Write manually" }} />
                      </Button>
                      <Button
                        className="min-h-10 rounded-xl px-4 text-sm font-semibold shadow-sm"
                        onClick={() => setAutoDraftOpen(true)}
                        disabled={saving || removing || autoGenerating}
                      >
                        <Sparkles size={14} />
                        <Lang text={{ ko: "AI로 프로필 생성하기", en: "Generate profile with AI" }} />
                      </Button>
                    </div>
                  ) : null}
                  <div className="flex justify-start">
                    <Button
                      variant="ghost"
                      className="min-h-9 rounded-xl px-3 text-xs font-medium text-secondary-text"
                      onClick={() => setProfileSetupStep("profile")}
                      disabled={saving || removing || autoGenerating}
                    >
                      <ChevronLeft size={14} />
                      <Lang text={{ ko: "이전 단계", en: "Previous step" }} />
                    </Button>
                  </div>
                </div>
              </>
            )}
          </div>
        ) : (
          renderProfileImageSection(editing)
        )}

        {shouldShowPersonaEditor ? (
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2 border-b border-border/60 bg-background/85 py-3">
              <div className="flex min-w-0 items-center gap-2">
                <div className="truncate text-sm font-semibold">
                  <Lang text={{ ko: "내 튜터 편집", en: "Edit My Tutor" }} />
                </div>
              </div>
              {!autoDraftGenerated && (
                <Button
                  size="xs"
                  rounded="full"
                  className={cn(presentation.inlineActionButtonClass)}
                  onClick={() => setAutoDraftOpen(true)}
                  disabled={autoGenerating || saving || removing}
                >
                  <Sparkles className="icon-xs" />
                  <Lang text={{ ko: "AI로 프로필 생성하기", en: "Generate Profile with AI" }} />
                </Button>
              )}
            </div>
            <PersonaEditor
              value={editing}
              onChange={(next) =>
                setEditing({
                  ...next,
                  universeId: resolveTutorUniverseId(next.personaType),
                } as PersonaFormValuesType)
              }
              disabledFields={personaDisabledFields}
              universeIdMode="readonly"
              getUniverseIdForType={(type) => resolveTutorUniverseId(type)}
              canViewInternalIds={isAdmin}
              profilesSectionMode="hidden"
              spriteSectionMode="hidden"
              systemPersonaFieldMode="hidden"
              sectionMode={presentation.personaEditorSectionMode}
              personaTypeControl="radio"
              personaTypeLabel={{ ko: "튜터 타입", en: "Tutor Type" }}
            />

            <TutorEditorSection
              title={{ ko: "Tutor 소개", en: "Tutor Intro" }}
              description={{
                ko: "사용자에게 보여줄 튜터 소개 문구를 작성합니다.",
                en: "Write the short intro shown to learners.",
              }}
            >
              <TutorIntroSection
                value={editing}
                onChange={(next) => setEditing(next)}
                disabled={autoGenerating || saving || removing}
              />
            </TutorEditorSection>

            <div className="flex justify-end gap-2">
              <Button
                variant="destructive"
                className={cn("min-h-10 rounded-xl px-4 text-sm font-semibold", presentation.destructiveActionExtraClass)}
                onClick={remove}
                disabled={removing || saving || !isSavedTutor}
              >
                {removing ? lang({ ko: "삭제중...", en: "Deleting..." }) : lang({ ko: "삭제", en: "Delete" })}
              </Button>
              <Button
                className="min-h-10 rounded-xl px-5 text-sm font-semibold shadow-sm"
                onClick={save}
                disabled={saving || removing}
              >
                {saving
                  ? lang({
                      ko: isSavedTutor ? "저장중..." : "등록중...",
                      en: isSavedTutor ? "Saving..." : "Registering...",
                    })
                  : lang({
                      ko: isSavedTutor ? saveButtonText : "페르소나 등록",
                      en: isSavedTutor ? "Save" : "Register Persona",
                    })}
              </Button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  ) : null;

  return (
    <div className={cn("space-y-4", presentation.applyThemeOverride && THEME_OVERRIDE_CLASS)}>
      {showHeader ? (
        <div className="flex items-center justify-between gap-2">
          <div>
            <div className="text-lg font-semibold">
              <Lang text={{ ko: "페르소나 관리", en: "Persona Manager" }} />
            </div>
            <div className="text-xs text-muted-foreground">
              <Lang text={{ ko: "내 계정의 페르소나를 관리합니다.", en: "Manage your personas." }} />
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="secondary" className={headerActionButtonClass} onClick={fetchList} disabled={loading}>
              <Lang text={{ ko: "새로고침", en: "Refresh" }} />
            </Button>
            <Button className={headerActionButtonClass} onClick={createNew}>
              <Lang text={{ ko: "+ 신규", en: "+ New" }} />
            </Button>
          </div>
        </div>
      ) : null}

      <div className={cn("flex flex-col md:flex-row gap-3", !hasRightContent && !hideList && "md:block")}>
        {/* Left: list */}
        {!hideList ? (
          <div className={cn(hasRightContent ? "hidden md:block md:w-80 md:shrink-0" : "", listPanelClass)}>
            <Input
              placeholder={lang({ ko: "이름/pid 검색...", en: "Search name/pid..." })}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />

            {loading ? (
              <div className="p-6">
                <Preloader variant="spin" />
              </div>
            ) : filtered.length === 0 ? (
              <div className="p-3 text-sm text-muted-foreground">
                <Lang text={{ ko: "목록이 없습니다.", en: "No items." }} />
              </div>
            ) : (
              <ul className="space-y-2">
                {filtered.map((p) => (
                  <li key={p.pid}>
                    <Button
                      variant="blank"
                      className={listItemClass(selectedPid === p.pid)}
                      onClick={() => setSelectedPid(p.pid)}
                    >
                      <div className="font-medium truncate">{p.name || "(no name)"}</div>
                      <div
                        className={cn(
                          "mt-1 text-xs truncate font-mono",
                          selectedPid === p.pid ? "text-primary/80" : "text-secondary-text",
                        )}
                      >
                        {p.pid}
                      </div>
                    </Button>
                  </li>
                ))}
              </ul>
            )}

            {!hasRightContent && (
              <div className="mt-2 text-xs text-muted-foreground">
                <Lang
                  text={{
                    ko: "항목을 선택하거나 +신규로 편집을 시작하세요.",
                    en: "Select an item or click +New to start.",
                  }}
                />
              </div>
            )}
          </div>
        ) : null}

        {editing ? <div className="flex-1">{editorPanel}</div> : null}
      </div>

      <Dialog open={autoDraftOpen} onOpenChange={setAutoDraftOpen}>
        <DialogContent className="w-[95vw] max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              <Lang text={{ ko: "AI 초안 생성", en: "Generate AI Draft" }} />
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-4 max-h-[calc(100dvh-16rem)] overflow-y-auto scrollbar-ghost -mr-2 pr-2">
              <div className="grid grid-cols-1 gap-3">
                <div>
                  <label className="text-xs text-muted-foreground">
                    <Lang text={{ ko: "생성할 AI 모델", en: "AI model to be generated" }} />
                  </label>
                  <ModelSelectField
                    value={autoModelName}
                    onChange={(value) => setAutoModelName(safeString(value))}
                    options={AUTO_TEXT_MODEL_OPTIONS}
                    title={lang({ ko: "AI 모델 선택", en: "Select AI model" })}
                    placeholder={lang({ ko: "텍스트 모델을 선택하세요", en: "Select a text model" })}
                    // 부모 Dialog가 fixed-center(transform)라 fixed 컨테이닝 블록이 되므로,
                    // 바텀시트는 Portal(body)로 띄워 transform 조상을 벗어나야 전체화면 오버레이로 정상 표시됨
                    portal
                  />
                </div>

                <div>
                  <label className="text-xs text-muted-foreground">
                    <Lang text={{ ko: "원하는 스타일 (선택)", en: "Desired Style (Optional)" }} />
                  </label>
                  <Textarea
                    rows={2}
                    value={autoBrief}
                    onChange={(e) => setAutoBrief(e.target.value)}
                    placeholder={lang({
                      ko: "캐릭터 프로필 생성 시 추가하고 싶은 스타일이 있으면 입력하세요.",
                      en: "Please enter any additional style for creating the character profile.",
                    })}
                  />
                </div>
              </div>

              <div className="space-y-3 rounded-xl border border-border/40 bg-muted/30 px-3 py-3 text-xs leading-5 text-secondary-text">
                <p>
                  <Lang
                    text={{
                      ko: "초안 생성 시 이전 단계에서 선택한 기본 성격과 역할, 이미지를 참고합니다. 아래 내용을 다시 한번 확인하세요.",
                      en: "The draft will use the personality, role, and image selected earlier. Please review the details below.",
                    }}
                  />
                </p>
                <div className="flex gap-2 sm:grid-cols-3">
                  {autoDraftReferenceImageUrl ? (
                    <ImageBox
                      src={autoDraftReferenceImageUrl}
                      alt="tutor-profile-reference"
                      width={100}
                      objectFit="object-cover"
                      objectPosition="object-top"
                      className="rounded-lg"
                    />
                  ) : (
                    <div className="flex h-14 w-10 shrink-0 items-center justify-center rounded-lg border border-dashed border-border/60 text-xxs text-muted-foreground">
                      <Lang text={{ ko: "없음", en: "None" }} />
                    </div>
                  )}

                  <div className="flex flex-col gap-2 flex-1">
                    <div className="rounded-lg border border-border/40 bg-background/50 px-3 py-2">
                      <div className="text-xxs font-semibold uppercase tracking-wide text-muted-foreground">
                        <Lang text={{ ko: "타입", en: "Type" }} />
                      </div>
                      <div className="mt-1 font-semibold text-primary-text">
                        <Lang text={selectedPersonaTypeText} />
                      </div>
                    </div>
                    <div className="rounded-lg border border-border/40 bg-background/50 px-3 py-2 sm:col-span-2">
                      <div className="flex flex-col items-start gap-2">
                        <div className="min-w-0 w-full">
                          <div className="flex items-center justify-between">
                            <Lang
                              text={{ ko: "기본 역할", en: "Base Role" }}
                              className=" text-xxs font-semibold uppercase tracking-wide text-muted-foreground"
                            />
                            {selectedSystemPersonaOption?.category ? (
                              <span className="shrink-0 rounded-full bg-primary/10 px-2 text-xxs font-semibold text-primary">
                                {selectedSystemPersonaOption.category}
                              </span>
                            ) : null}
                          </div>
                          <div className="mt-1 truncate font-semibold text-primary-text">
                            {selectedSystemPersonaTitle}
                          </div>
                        </div>
                      </div>
                      <p className="mt-2 line-clamp-3 text-xxs leading-4 text-secondary-text">
                        {selectedSystemPersonaSummary}
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="rounded-xl border border-sky-200/60 bg-sky-50/70 px-3 py-3 text-xs leading-5 text-sky-900 dark:border-sky-900/60 dark:bg-sky-950/20 dark:text-sky-100">
                <Lang text={autoDraftStatusText} />
              </div>

              {autoResultMessage ? <div className="text-xs text-emerald-700">{autoResultMessage}</div> : null}
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setAutoDraftOpen(false)} disabled={autoGenerating}>
                <Lang text={{ ko: "닫기", en: "Close" }} />
              </Button>
              <Button onClick={generateAutoDraft} disabled={autoGenerating || !editing}>
                {autoGenerating
                  ? lang({ ko: "생성중...", en: "Generating..." })
                  : lang({ ko: "초안 생성", en: "Generate Draft" })}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {autoGenerating && (
        <Preloader
          variant="spin"
          size="lg"
          container
          fullScreen
          text={lang({ ko: "프로필을 생성하고 있어요.", en: "Creating your profile..." })}
        />
      )}
    </div>
  );
}
