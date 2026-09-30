"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "store/auth";
import { Lang, lang, useLocalize } from "components/module/i18n";
import { BottomSheetDialog, Button, Badge, NameConfirmDialog, Preloader, TooltipBasic, dialog } from "@amu-labs/ui";
import { toast } from "sonner";
import { CharacterViewMode } from "components/module/game";
import type { ICarouselRef } from "components/module/carousel";
import { getTutorsVoicePilotSurface } from "libs/api/ai/speechClient";
import { UserPersonaManager } from "components/module/persona/UserPersonaManager";
import type { PersonaFormValuesType, PersonaVisibilityType } from "types/ai";
import type { IExtendedNpcData } from "types/game";
import type { LanguageType } from "types/language";
import type { ITutorsState } from "types/app";
import { createTutorProfileImageRequestId, prepareTutorProfileImageForSave } from "libs/api/tutors/profileImage";
import {
  acceptTutorsPersonaGift,
  deleteTutorsPersona,
  deleteTutorsPersonaTemplate,
  forkTutorsPersonaTemplate,
  giftTutorsPersona,
  listSharedTutorsPersonaTemplates,
  listTutorsPersonas,
  publishTutorsPersonaTemplate,
  rejectTutorsPersonaGift,
  saveTutorsPersona,
  updateTutorsPersonaTemplate,
} from "libs/api/tutors/personas";
import { getTutorsState, updateTutorsSelected } from "libs/api/tutors/state";
import {
  getSharedTutorsProgress,
  getTutorsProgress,
  type SharedTutorProgressItem,
  type TutorsProgressOverview,
} from "libs/api/tutors/progress";
import { listFriends, type FriendshipItem } from "libs/api/social/friends";
import { logger } from "utils/log";
import { cn } from "utils/common";
import { toUnknownRecord } from "utils/common/typeUtils";
import { useUserData } from "hooks/auth";
import {
  Plus,
  MessageCircle,
  Trash2,
  Sparkles,
  Settings,
  Languages,
  BookOpen,
  Download,
  Package,
  XCircle,
  CheckCircle2,
  X,
  Pencil,
} from "lucide-react";
import { TutorGenesisProfilePanel } from "./modules/TutorGenesisProfilePanel";
import { makeEmptyTutor, resolveTutorUniverseId } from "utils/app/tutorsOnboarding";
import {
  getPrimaryProfileImage,
  getTutorProfileImageForDisplay,
  getTutorProfileImageMissingRequiredFields,
  TUTOR_PROFILE_IMAGE_REQUIRED_FIELD_LABELS,
} from "utils/app/tutorProfileImage";
import { TUTOR_REGISTRATION_LOCK_CONFIRM_TEXT } from "utils/app/tutorsEditPolicy";
import { persistCoinUpdated } from "utils/payment";
import { TUTORS_MAX_SELECTED } from "consts/app";
import { CharacterSpriteAvatar } from "../../module/game/character/chat-modules/CharacterSpriteAvatar";
import { getKorParticle } from "src/utils/language";

const SHARED_TEMPLATE_LIMIT = 12;
const TEMPLATE_VISIBILITY_OPTIONS: PersonaVisibilityType[] = ["private", "unlisted", "public"];

type TemplateScopeType = "public" | "mine";

function readTutorMeta(tutor: PersonaFormValuesType) {
  const policy = tutor.tutorsPolicy;

  return {
    tutorIntro: tutor.tutorIntro || tutor.summary || "",
    mode: String(policy?.operationMode || "tutor"),
    targetLang: String(policy?.targetLanguage || ""),
    job: String(tutor?.job || ""),
    language: String(tutor?.language || ""),
  };
}

function getTemplateVisibilityMeta(visibility?: PersonaVisibilityType) {
  switch (visibility) {
    case "private":
      return {
        label: { ko: "비공개", en: "Private" },
        description: {
          ko: "나만 볼 수 있는 템플릿입니다. 내 발행본 탭에서만 확인할 수 있습니다.",
          en: "Only you can see this template. It appears only in your published list.",
        },
        className: "bg-muted text-secondary-text",
      };
    case "unlisted":
      return {
        label: { ko: "친구에게만 공개", en: "Friends Only" },
        description: {
          ko: "공개 목록에는 노출되지 않고, 링크를 아는 사람만 사용할 수 있어요.",
          en: "Hidden from public listings and usable only by people with the link.",
        },
        className: "bg-amber-100/80 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
      };
    default:
      return {
        label: { ko: "모두에게 공개", en: "Public" },
        description: {
          ko: "공개 템플릿 목록에 노출되어 다른 사용자가 바로 가져올 수 있어요.",
          en: "Visible in the public template list so others can import it directly.",
        },
        className: "bg-secondary/10 text-secondary",
      };
  }
}

function getPublishedTemplateSourceId(tutor: PersonaFormValuesType) {
  return String(tutor.sourcePersonaId || tutor.pid || "").trim();
}

function isGiftedTutor(tutor: PersonaFormValuesType | null | undefined) {
  return tutor?.tutorsAccess?.kind === "gift" || tutor?.tutorsAccess?.canEdit === false;
}

function isPendingGiftTutor(tutor: PersonaFormValuesType | null | undefined) {
  return isGiftedTutor(tutor) && tutor?.tutorsAccess?.grantStatus === "pending";
}

const READ_ONLY_PERSONA_DISABLED_FIELDS = {
  personaType: true,
  universeId: true,
  systemPersonaKey: true,
  name: true,
  age: true,
  gender: true,
  language: true,
  nationality: true,
  job: true,
  values: true,
  preferences: true,
  species: true,
  habitat: true,
  threatLevel: true,
  specialAbilities: true,
  appearance: true,
  background: true,
  personality: true,
  speechStyle: true,
  summary: true,
  voiceProfile: true,
} satisfies Partial<Record<keyof PersonaFormValuesType | "personaType", boolean>>;

const EDITABLE_TUTOR_PERSONA_DISABLED_FIELDS = {
  personaType: true,
  universeId: true,
  systemPersonaKey: true,
  name: true,
} satisfies Partial<Record<keyof PersonaFormValuesType | "personaType", boolean>>;

const TEMPLATE_PERSONA_DISABLED_FIELDS = {
  personaType: true,
  universeId: true,
  systemPersonaKey: true,
} satisfies Partial<Record<keyof PersonaFormValuesType | "personaType", boolean>>;

export default function TutorsHome() {
  const router = useRouter();
  const isAuthenticated = useAuthStore((state) => state.isLogged());
  const { language } = useLocalize();
  const { userData } = useUserData();
  const preferredUiLanguage: LanguageType = userData?.userInfo?.language || language || "ko";
  const learnerAge = typeof userData?.userInfo?.age === "number" ? userData.userInfo.age : undefined;
  const isAdmin = (userData?.roles || []).includes("administrator");

  const isLoggedIn = useMemo(() => {
    return isAuthenticated;
  }, [isAuthenticated]);

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const profileImageSaveRequestRef = useRef<{ clientRequestId: string; inputSignature: string } | null>(null);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [items, setItems] = useState<PersonaFormValuesType[]>([]);
  const [editing, setEditing] = useState<PersonaFormValuesType | null>(null);
  const [onboardingKey, setOnboardingKey] = useState(0);
  const [sharedTemplates, setSharedTemplates] = useState<PersonaFormValuesType[]>([]);
  const [tutorsState, setTutorsState] = useState<ITutorsState | null>(null);
  const [progress, setProgress] = useState<TutorsProgressOverview | null>(null);
  const [sharedProgress, setSharedProgress] = useState<SharedTutorProgressItem[]>([]);
  const [sharedProgressLoading, setSharedProgressLoading] = useState(false);
  // EL-603 Stream B: 파일럿 승인 Voice(ElevenLabs). 서버 설정 미비 시 빈 배열(default deny).
  const [pilotVoices, setPilotVoices] = useState<string[]>([]);

  useEffect(() => {
    let disposed = false;
    void (async () => {
      try {
        const surface = await getTutorsVoicePilotSurface();
        if (!disposed) setPilotVoices(surface?.data?.exposableVoices || []);
      } catch (error) {
        // 조회 실패 시 닫힘 유지(빈 목록).
        logger.warn("[TutorsHome] voice pilot surface 조회 실패:", error);
      }
    })();
    return () => {
      disposed = true;
    };
  }, []);
  const [templateScope, setTemplateScope] = useState<TemplateScopeType>("public");
  const [templatesLoading, setTemplatesLoading] = useState(false);
  const [forkingTemplatePid, setForkingTemplatePid] = useState("");
  const [publishVisibility, setPublishVisibility] = useState<PersonaVisibilityType>("private");
  const [publishedTemplate, setPublishedTemplate] = useState<PersonaFormValuesType | null>(null);
  const [publicationLoading, setPublicationLoading] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<PersonaFormValuesType | null>(null);
  const [templateEditorOpen, setTemplateEditorOpen] = useState(false);
  const [templateEditorVisibility, setTemplateEditorVisibility] = useState<PersonaVisibilityType>("private");
  const [templateSaving, setTemplateSaving] = useState(false);
  const [deletingTemplatePid, setDeletingTemplatePid] = useState("");
  const [settingsSheetOpen, setSettingsSheetOpen] = useState(false);
  const [profileEditUnlocked, setProfileEditUnlocked] = useState(false);
  const [profileEditConfirmOpen, setProfileEditConfirmOpen] = useState(false);
  const [deleteConfirmTarget, setDeleteConfirmTarget] = useState<PersonaFormValuesType | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [giftTargetTutor, setGiftTargetTutor] = useState<PersonaFormValuesType | null>(null);
  const [giftFriends, setGiftFriends] = useState<FriendshipItem[]>([]);
  const [giftFriendsLoading, setGiftFriendsLoading] = useState(false);
  const [giftingFriendId, setGiftingFriendId] = useState("");
  const tutorCarouselRef = useRef<ICarouselRef | null>(null);
  const publicationRequestRef = useRef(0);
  const actorId = useMemo(() => {
    const userRecord = toUnknownRecord(userData);
    return String(
      userRecord.uid || userRecord.ID || userRecord.id || userRecord.userEmailLower || userRecord.userEmail || "",
    ).trim();
  }, [userData]);

  const fetchList = useCallback(async () => {
    if (!isLoggedIn) return;
    setLoading(true);
    try {
      const [rows, state, nextProgress, nextSharedProgress] = await Promise.all([
        listTutorsPersonas(),
        getTutorsState().catch(() => null),
        getTutorsProgress().catch(() => null),
        getSharedTutorsProgress().catch(() => []),
      ]);
      setItems(rows);
      setTutorsState(state);
      setProgress(nextProgress);
      setSharedProgress(nextSharedProgress || []);
      setShowOnboarding(rows.length === 0 && nextProgress?.canCreate !== false);
      setEditing((current) => current || rows[0] || makeEmptyTutor(preferredUiLanguage, learnerAge));
    } catch (e) {
      logger.error("[TutorsHome] listTutorsPersonas 실패:", e);
    } finally {
      setLoading(false);
    }
  }, [isLoggedIn, learnerAge, preferredUiLanguage]);

  const fetchTemplates = useCallback(
    async (scope: TemplateScopeType) => {
      if (!isLoggedIn) return;
      setTemplatesLoading(true);
      try {
        const rows = await listSharedTutorsPersonaTemplates({
          mine: scope === "mine",
          limit: SHARED_TEMPLATE_LIMIT,
        });
        setSharedTemplates(rows);
      } catch (e) {
        logger.error("[TutorsHome] listSharedTutorsPersonaTemplates 실패:", e);
      } finally {
        setTemplatesLoading(false);
      }
    },
    [isLoggedIn],
  );

  useEffect(() => {
    if (!isLoggedIn) return;

    const timer = window.setTimeout(() => {
      void fetchList();
      void fetchTemplates(templateScope);
    }, 0);

    return () => window.clearTimeout(timer);
  }, [fetchList, fetchTemplates, isLoggedIn, templateScope]);

  const getTutorImageMissingFieldText = (persona: PersonaFormValuesType) =>
    getTutorProfileImageMissingRequiredFields(persona)
      .map((fieldKey) => lang(TUTOR_PROFILE_IMAGE_REQUIRED_FIELD_LABELS[fieldKey]))
      .join(", ");

  const handleCreateNew = () => {
    if (progress?.canCreate === false) {
      const remaining = progress.remainingSessionsForNextTutor ?? 1;
      void dialog.alert(
        lang({
          ko: `다음 튜터를 만들려면 유효 학습 세션이 ${remaining}회 더 필요합니다.`,
          en: `${remaining} more valid learning sessions are needed to create the next tutor.`,
        }),
      );
      return;
    }
    setOnboardingKey((k) => k + 1);
    setPublishVisibility("private");
    setShowOnboarding(true);
  };

  const handleTemplateScopeChange = (scope: TemplateScopeType) => {
    setTemplateScope(scope);
    void fetchTemplates(scope);
  };

  const loadPublishedTemplate = useCallback(async (tutor: PersonaFormValuesType) => {
    const requestId = publicationRequestRef.current + 1;
    publicationRequestRef.current = requestId;
    setPublicationLoading(true);

    try {
      const sourcePersonaId = getPublishedTemplateSourceId(tutor);
      const rows = await listSharedTutorsPersonaTemplates({ mine: true, limit: 100 });
      const found = rows.find((template) => template.sourcePersonaId === sourcePersonaId) || null;
      if (publicationRequestRef.current !== requestId) return;

      setPublishedTemplate(found);
      setPublishVisibility(found?.visibility || "private");
    } catch (e) {
      if (publicationRequestRef.current !== requestId) return;
      logger.warn("[TutorsHome] 발행 템플릿 상태 조회 실패:", e);
      setPublishedTemplate(null);
      setPublishVisibility("private");
    } finally {
      if (publicationRequestRef.current === requestId) {
        setPublicationLoading(false);
      }
    }
  }, []);

  const startChatWithTutor = async (target: PersonaFormValuesType) => {
    if (!target?.pid) return;
    if (isPendingGiftTutor(target) || target.tutorsAccess?.canUse === false) {
      void dialog.alert(
        lang({
          ko: "선물받은 튜터를 먼저 수락해야 대화할 수 있습니다.",
          en: "Accept this gifted tutor before starting a chat.",
        }),
      );
      return;
    }

    try {
      const currentState = tutorsState || (await getTutorsState());
      const currentSelected = currentState?.selected || [];
      const isAlreadySelected = currentSelected.some((item) => item.personaId === target.pid);

      if (!isAlreadySelected) {
        const visiblePersonaIds = new Set(items.map((item) => item.pid).filter(Boolean));
        const selectableCurrent = currentSelected.filter((item) => visiblePersonaIds.has(item.personaId));
        if (selectableCurrent.length >= TUTORS_MAX_SELECTED) {
          void dialog.alert(
            lang({
              ko: `선택 가능한 튜터는 최대 ${TUTORS_MAX_SELECTED}명입니다. 기존 선택을 정리한 뒤 다시 시도해주세요.`,
              en: `You can select up to ${TUTORS_MAX_SELECTED} tutors. Remove an existing selection and try again.`,
            }),
          );
          return;
        }

        const nextState = await updateTutorsSelected([
          ...selectableCurrent.map(({ personaId, universeId }) => ({ personaId, universeId })),
          { personaId: target.pid, universeId: target.universeId || "" },
        ]);
        if (nextState) setTutorsState(nextState);
      }
    } catch (e) {
      logger.warn("[TutorsHome] updateTutorsSelected 실패:", e);
      void dialog.alert(
        lang({
          ko: "튜터 선택 상태를 갱신하지 못했습니다. 잠시 후 다시 시도해주세요.",
          en: "Could not update the tutor selection. Please try again.",
        }),
      );
      return;
    }

    router.push(`/tutors/${encodeURIComponent(target.pid)}`);
  };

  const visualTutorItems = useMemo(
    () =>
      items.map((tutor) => {
        const { tutorIntro } = readTutorMeta(tutor);
        return {
          ...tutor,
          summary: tutorIntro || tutor.summary || tutor.job || "",
        };
      }),
    [items],
  );

  const tutorByPid = useMemo(() => new Map(items.map((tutor) => [tutor.pid, tutor])), [items]);
  const savedTutorPidSet = useMemo(() => new Set(items.map((tutor) => tutor.pid).filter(Boolean)), [items]);
  const editingPid = String(editing?.pid || "").trim();
  const isExistingTutor = Boolean(editingPid && savedTutorPidSet.has(editingPid));

  const handleTutorCardSelect = (pid: string) => {
    const tutor = tutorByPid.get(pid);
    if (!tutor) return;
    void startChatWithTutor(tutor);
  };

  const openTutorSettings = (tutor: PersonaFormValuesType) => {
    setEditing(tutor);
    setShowOnboarding(false);
    setProfileEditUnlocked(false);
    setProfileEditConfirmOpen(false);
    setSettingsSheetOpen(true);
    if (isGiftedTutor(tutor)) {
      setPublishedTemplate(null);
      setPublishVisibility("private");
      setPublicationLoading(false);
      return;
    }
    void loadPublishedTemplate(tutor);
  };

  const closeTutorSettings = () => {
    setSettingsSheetOpen(false);
    setProfileEditUnlocked(false);
    setProfileEditConfirmOpen(false);
  };

  const handleRequestProfileEdit = () => {
    if (!editing?.pid || isGiftedTutor(editing)) return;
    if (!editing.name?.trim()) {
      void dialog.alert(lang({ ko: "튜터 이름을 확인할 수 없습니다.", en: "Could not verify the tutor name." }));
      return;
    }
    setProfileEditConfirmOpen(true);
  };

  const syncPublishedTemplate = async (personaPid: string, visibility: PersonaVisibilityType) => {
    const savedTemplate = await publishTutorsPersonaTemplate(personaPid, visibility);
    setPublishedTemplate(savedTemplate);
    setPublishVisibility(savedTemplate.visibility || visibility);
    await fetchTemplates(templateScope);
    return savedTemplate;
  };

  const openTemplateSettings = (template: PersonaFormValuesType) => {
    setEditingTemplate(template);
    setTemplateEditorVisibility(template.visibility || "private");
    setTemplateEditorOpen(true);
  };

  const handleSaveTemplate = async () => {
    if (!editingTemplate?.pid) return;
    if (!editingTemplate.name?.trim()) {
      void dialog.alert(lang({ ko: "템플릿 이름은 필수입니다.", en: "Template name is required." }));
      return;
    }

    setTemplateSaving(true);
    try {
      const saved = await updateTutorsPersonaTemplate(
        editingTemplate.pid,
        {
          ...editingTemplate,
          visibility: templateEditorVisibility,
        },
        templateEditorVisibility,
      );
      setEditingTemplate(saved);
      setSharedTemplates((prev) => prev.map((template) => (template.pid === saved.pid ? saved : template)));
      setPublishedTemplate((current) => (current?.pid === saved.pid ? saved : current));
      await fetchTemplates(templateScope);
      toast.success(lang({ ko: "템플릿이 저장되었습니다.", en: "Template saved." }));
    } catch (e) {
      logger.error("[TutorsHome] updateTutorsPersonaTemplate 실패:", e);
      void dialog.alert({
        variant: "danger",
        message: lang({ ko: "템플릿 저장 중 오류가 발생했습니다.", en: "Error saving template." }),
      });
    } finally {
      setTemplateSaving(false);
    }
  };

  const handleDeleteTemplate = async (template: PersonaFormValuesType) => {
    if (!template?.pid) return;
    if (
      !(await dialog.confirm({
        variant: "danger",
        message: lang({
          ko: `"${template.name || "템플릿"}" 템플릿을 삭제할까요? 원본 튜터와 가져온 튜터에는 영향을 주지 않습니다.`,
          en: `Delete "${template.name || "template"}"? This will not affect the original tutor or imported tutors.`,
        }),
      }))
    ) {
      return;
    }

    setDeletingTemplatePid(template.pid);
    try {
      const ok = await deleteTutorsPersonaTemplate(template.pid);
      if (!ok) throw new Error("delete_template_failed");
      setSharedTemplates((prev) => prev.filter((item) => item.pid !== template.pid));
      setPublishedTemplate((current) => (current?.pid === template.pid ? null : current));
      if (editingTemplate?.pid === template.pid) {
        setEditingTemplate(null);
        setTemplateEditorOpen(false);
      }
      await fetchTemplates(templateScope);
      toast.success(lang({ ko: "템플릿이 삭제되었습니다.", en: "Template deleted." }));
    } catch (e) {
      logger.error("[TutorsHome] deleteTutorsPersonaTemplate 실패:", e);
      void dialog.alert({
        variant: "danger",
        message: lang({ ko: "템플릿 삭제 중 오류가 발생했습니다.", en: "Error deleting template." }),
      });
    } finally {
      setDeletingTemplatePid("");
    }
  };

  const handleGiftTutor = async (tutor: PersonaFormValuesType) => {
    if (!tutor?.pid || isGiftedTutor(tutor)) return;

    setGiftTargetTutor(tutor);
    setGiftFriendsLoading(true);
    try {
      const rows = await listFriends();
      setGiftFriends(
        rows.filter(
          (item) => item.status === "accepted" && item.capabilities?.giftTutors !== false && item.actorId.trim(),
        ),
      );
    } catch (e) {
      logger.error("[TutorsHome] listFriends 실패:", e);
      setGiftFriends([]);
      void dialog.alert({
        variant: "danger",
        message: lang({ ko: "친구 목록을 불러오지 못했습니다.", en: "Could not load your friends." }),
      });
    } finally {
      setGiftFriendsLoading(false);
    }
  };

  const handleGiftToFriend = async (friend: FriendshipItem) => {
    const tutor = giftTargetTutor;
    if (!tutor?.pid || !friend.actorId) return;

    try {
      setGiftingFriendId(friend.actorId);
      await giftTutorsPersona({ pid: tutor.pid, recipientActorId: friend.actorId });
      toast.success(lang({ ko: "튜터 선물을 보냈습니다.", en: "Tutor gift sent." }));
      setGiftTargetTutor(null);
      setSharedProgressLoading(true);
      setSharedProgress(await getSharedTutorsProgress().catch(() => []));
    } catch (e) {
      logger.error("[TutorsHome] giftTutorsPersona 실패:", e);
      void dialog.alert({
        variant: "danger",
        message: lang({ ko: "튜터 선물 전송 중 오류가 발생했습니다.", en: "Error sending tutor gift." }),
      });
    } finally {
      setGiftingFriendId("");
      setSharedProgressLoading(false);
    }
  };

  const closeGiftSheet = () => {
    if (giftingFriendId) return;
    setGiftTargetTutor(null);
    setGiftFriends([]);
  };

  const getFriendDisplayName = (friend: FriendshipItem) => {
    return friend.displayName || friend.emailHint || friend.actorId;
  };

  const renderSharedProgressSection = () => {
    if (sharedProgressLoading || sharedProgress.length === 0) return null;

    return (
      <section className="mb-8">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <p className="text-xxs font-bold uppercase text-primary">Shared Progress</p>
            <h2 className="text-base font-bold">
              <Lang text={{ ko: "선물한 튜터 진도", en: "Gifted Tutor Progress" }} />
            </h2>
          </div>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {sharedProgress.map((item) => (
            <div
              key={`${item.grantId}:${item.friendActorId}`}
              className="rounded-lg border border-border bg-surface p-4"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-primary-text">{item.tutorName}</p>
                  <p className="truncate text-xs text-secondary-text">{item.friendDisplayName}</p>
                </div>
                <span className="shrink-0 rounded-full bg-primary/10 px-2 py-1 text-xxs font-semibold text-primary">
                  Lv. {item.level}
                </span>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                <div className="rounded-md bg-background px-3 py-2">
                  <p className="text-secondary-text">XP</p>
                  <p className="font-semibold text-primary-text">{item.totalXp}</p>
                </div>
                <div className="rounded-md bg-background px-3 py-2">
                  <p className="text-secondary-text">
                    <Lang text={{ ko: "세션", en: "Sessions" }} />
                  </p>
                  <p className="font-semibold text-primary-text">{item.completedSessionCount}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>
    );
  };

  const handleAcceptGiftTutor = async (tutor: PersonaFormValuesType) => {
    const grantId = String(tutor.tutorsAccess?.grantId || "").trim();
    if (!grantId) return;

    try {
      await acceptTutorsPersonaGift(grantId);
      await fetchList();
      toast.success(lang({ ko: "선물받은 튜터를 수락했습니다.", en: "Gifted tutor accepted." }));
    } catch (e) {
      logger.error("[TutorsHome] acceptTutorsPersonaGift 실패:", e);
      void dialog.alert({
        variant: "danger",
        message: lang({ ko: "선물 수락 중 오류가 발생했습니다.", en: "Error accepting tutor gift." }),
      });
    }
  };

  const handleRejectGiftTutor = async (tutor: PersonaFormValuesType) => {
    const grantId = String(tutor.tutorsAccess?.grantId || "").trim();
    if (!grantId) return;
    if (
      !(await dialog.confirm({
        variant: "danger",
        message: lang({ ko: "선물받은 튜터를 거부할까요?", en: "Reject this gifted tutor?" }),
      }))
    )
      return;

    try {
      await rejectTutorsPersonaGift(grantId);
      const nextItems = items.filter((item) => item.pid !== tutor.pid);
      setItems(nextItems);
      const nextTutorsState = await getTutorsState().catch(() => null);
      if (nextTutorsState) setTutorsState(nextTutorsState);
      if (editing?.pid === tutor.pid) {
        setEditing(nextItems[0] || makeEmptyTutor(preferredUiLanguage, learnerAge));
        setSettingsSheetOpen(false);
      }
      toast.success(lang({ ko: "선물받은 튜터를 거부했습니다.", en: "Gifted tutor rejected." }));
    } catch (e) {
      logger.error("[TutorsHome] rejectTutorsPersonaGift 실패:", e);
      void dialog.alert({
        variant: "danger",
        message: lang({ ko: "선물 거부 중 오류가 발생했습니다.", en: "Error rejecting tutor gift." }),
      });
    }
  };

  const handleSave = async () => {
    if (!editing) return;
    if (isGiftedTutor(editing)) {
      void dialog.alert(lang({ ko: "선물받은 튜터는 편집할 수 없습니다.", en: "Gifted tutors are read-only." }));
      return;
    }
    if (!editing.name?.trim()) {
      void dialog.alert(lang({ ko: "튜터 이름(Name)은 필수입니다.", en: "Tutor name is required." }));
      return;
    }
    if (isExistingTutor && !profileEditUnlocked) {
      void dialog.alert(
        lang({
          ko: "상단의 편집하기를 눌러 편집 모드로 전환한 뒤 저장해주세요.",
          en: "Select Edit at the top to unlock editing before saving.",
        }),
      );
      return;
    }

    if (!getPrimaryProfileImage(editing.profiles) && getTutorProfileImageMissingRequiredFields(editing).length > 0) {
      void dialog.alert(
        lang({
          ko: `프로필 이미지를 자동 생성하려면 ${getTutorImageMissingFieldText(editing)} 항목을 먼저 입력해주세요.`,
          en: `Fill in ${getTutorImageMissingFieldText(editing)} before auto-generating a profile image.`,
        }),
      );
      return;
    }

    if (!isExistingTutor && !(await dialog.confirm(lang(TUTOR_REGISTRATION_LOCK_CONFIRM_TEXT)))) {
      return;
    }

    const savedVisibility = publishedTemplate?.visibility || "private";
    const visibilityChanged = savedVisibility !== publishVisibility;
    const shouldSyncPublishedTemplate = Boolean(publishedTemplate) || publishVisibility !== "private";

    if (
      visibilityChanged &&
      !(await dialog.confirm(
        lang({
          ko: `"${editing.name}" 튜터의 템플릿 공개 범위를 "${lang(
            getTemplateVisibilityMeta(publishVisibility).label,
          )}"(으)로 변경하고 모든 설정을 저장할까요?`,
          en: `Change the template visibility for "${editing.name}" to "${lang(
            getTemplateVisibilityMeta(publishVisibility).label,
          )}" and save all settings?`,
        }),
      ))
    ) {
      return;
    }

    setSaving(true);
    try {
      // universeId는 서버에서 personaType 기반으로 강제되지만, UI도 일치시켜 둠
      let fixed = {
        ...editing,
        universeId: resolveTutorUniverseId(editing.personaType),
      } as PersonaFormValuesType;

      let saveMessage = lang({ ko: "튜터가 저장되었습니다.", en: "The tutor has been saved." });

      if (!getPrimaryProfileImage(fixed.profiles)) {
        const inputSignature = JSON.stringify(fixed);
        const previousRequest = profileImageSaveRequestRef.current;
        const clientRequestId =
          previousRequest?.inputSignature === inputSignature
            ? previousRequest.clientRequestId
            : createTutorProfileImageRequestId();
        profileImageSaveRequestRef.current = { clientRequestId, inputSignature };
        const prepared = await prepareTutorProfileImageForSave({
          persona: fixed,
          clientRequestId,
        });
        fixed = prepared.nextPersona;

        if (prepared.billingCoins > 0) {
          persistCoinUpdated({ scope: "user", amount: -prepared.billingCoins });
        }

        saveMessage = lang({
          ko: `페르소나 정보를 바탕으로 프로필 이미지를 자동 생성한 뒤 저장했습니다. ${prepared.billingCoins}코인이 사용되었습니다.`,
          en: `Saved after auto-generating a profile image from the persona info. ${prepared.billingCoins} coins were used.`,
        });
      } else {
        profileImageSaveRequestRef.current = null;
      }

      const saved = await saveTutorsPersona(fixed);
      const nextTutorsState = await getTutorsState().catch(() => null);
      if (nextTutorsState) setTutorsState(nextTutorsState);

      setItems((prev) => {
        const exists = prev.some((p) => p.pid === saved.pid);
        if (exists) return prev.map((p) => (p.pid === saved.pid ? saved : p));
        return [saved, ...prev];
      });
      setShowOnboarding(false);
      setEditing(saved);
      setProfileEditUnlocked(false);

      if (shouldSyncPublishedTemplate) {
        try {
          await syncPublishedTemplate(saved.pid, publishVisibility);
          saveMessage = lang({
            ko: `${saveMessage} 템플릿 공개 범위와 공유 내용도 함께 반영되었습니다.`,
            en: `${saveMessage} The template visibility and shared content were also updated.`,
          });
        } catch (templateError) {
          logger.error("[TutorsHome] 튜터 저장 후 공유 템플릿 동기화 실패:", templateError);
          void dialog.alert({
            variant: "danger",
            message: lang({
              ko: `${saveMessage} 다만 공유 템플릿 설정은 반영하지 못했습니다. 다시 저장해주세요.`,
              en: `${saveMessage} However, the shared template settings could not be updated. Please save again.`,
            }),
          });
          return;
        }
      }

      profileImageSaveRequestRef.current = null;
      toast.success(saveMessage);
    } catch (e) {
      logger.error("[TutorsHome] saveTutorsPersona 실패:", e);
      const responseData = toUnknownRecord(toUnknownRecord(toUnknownRecord(e).response).data);
      const errorCode = String(responseData.errorCode || "");
      if (errorCode === "TUTORS_PERSONA_FIELD_LOCKED") {
        void dialog.alert({
          variant: "danger",
          message: lang({
            ko: String(responseData.error || "") || "생성 후 잠긴 튜터 정체성 필드는 수정할 수 없습니다.",
            en: String(responseData.error || "") || "Locked tutor identity fields cannot be edited after creation.",
          }),
        });
      } else {
        void dialog.alert({
          variant: "danger",
          message: lang({ ko: "튜터 저장 중 오류가 발생했습니다.", en: "Error saving tutor." }),
        });
      }
    } finally {
      setSaving(false);
    }
  };

  const deleteTutor = async (target: PersonaFormValuesType) => {
    if (!target.pid) return;

    await deleteTutorsPersona(target.pid);
    const nextItems = items.filter((p) => p.pid !== target.pid);
    setItems(nextItems);
    setShowOnboarding(nextItems.length === 0);
    setEditing(nextItems[0] || makeEmptyTutor(preferredUiLanguage, learnerAge));
    setSettingsSheetOpen(false);
    setPublishedTemplate(null);
  };

  const openDeleteConfirm = (target: PersonaFormValuesType) => {
    setDeleteConfirmTarget(target);
  };

  const handleDelete = () => {
    if (!editing?.pid) {
      void dialog.alert(lang({ ko: "저장된 튜터만 삭제할 수 있습니다.", en: "Only saved tutors can be deleted." }));
      return;
    }
    if (isGiftedTutor(editing)) {
      void handleRejectGiftTutor(editing);
      return;
    }
    openDeleteConfirm(editing);
  };

  const handleDeleteConfirm = async () => {
    if (!deleteConfirmTarget?.pid) return false;

    setDeleting(true);
    try {
      await deleteTutor(deleteConfirmTarget);
      toast.success(lang({ ko: "삭제되었습니다.", en: "Deleted." }));
      return true;
    } catch (e) {
      logger.error("[TutorsHome] deleteTutorsPersona 실패:", e);
      void dialog.alert({
        variant: "danger",
        message: lang({ ko: "삭제 중 오류가 발생했습니다.", en: "Error deleting tutor." }),
      });
      return false;
    } finally {
      setDeleting(false);
    }
  };

  const renderTutorCardActions = (character: IExtendedNpcData) => {
    const tutor = tutorByPid.get(character.pid);
    if (!tutor) return null;
    const gifted = isGiftedTutor(tutor);
    const pendingGift = isPendingGiftTutor(tutor);
    const TUTOR_CARD_BUTTON_CLASSNAME =
      "inline-flex icon-md items-center justify-center p-0 text-primary-text shadow-sm bg-surface/80 hover:bg-surface";

    return (
      <>
        <div className="absolute right-3 top-3 z-10 flex gap-1 opacity-100 transition-opacity">
          {pendingGift ? (
            <Button
              variant="blank"
              rounded="full"
              className={TUTOR_CARD_BUTTON_CLASSNAME}
              onClick={(e) => {
                e.stopPropagation();
                void handleAcceptGiftTutor(tutor);
              }}
              aria-label={lang({ ko: `${tutor.name} 선물 수락`, en: `Accept ${tutor.name}` })}
            >
              <CheckCircle2 className="text-secondary icon-xs" />
            </Button>
          ) : (
            <Button
              variant="blank"
              rounded="full"
              className={TUTOR_CARD_BUTTON_CLASSNAME}
              onClick={(e) => {
                e.stopPropagation();
                openTutorSettings(tutor);
              }}
              aria-label={lang({ ko: `${tutor.name} 설정 열기`, en: `Open settings for ${tutor.name}` })}
            >
              <Settings className="icon-xs" />
            </Button>
          )}
          {!gifted ? (
            <Button
              variant="blank"
              rounded="full"
              className={TUTOR_CARD_BUTTON_CLASSNAME}
              onClick={(e) => {
                e.stopPropagation();
                void handleGiftTutor(tutor);
              }}
              aria-label={lang({ ko: `${tutor.name} 선물하기`, en: `Gift ${tutor.name}` })}
            >
              <Package className="icon-xs" />
            </Button>
          ) : null}
          <Button
            variant="blank"
            rounded="full"
            className={TUTOR_CARD_BUTTON_CLASSNAME}
            onClick={(e) => {
              e.stopPropagation();
              if (gifted) {
                void handleRejectGiftTutor(tutor);
              } else {
                setEditing(tutor);
                openDeleteConfirm(tutor);
              }
            }}
            aria-label={lang({
              ko: gifted ? `${tutor.name} 선물 거부` : `${tutor.name} 삭제`,
              en: gifted ? `Reject ${tutor.name}` : `Delete ${tutor.name}`,
            })}
          >
            {gifted ? <XCircle className="text-danger icon-xs" /> : <Trash2 className="text-danger icon-xs" />}
          </Button>
        </div>

        <div className="px-4 pb-4">
          <Button
            className="w-full"
            onClick={(e) => {
              e.stopPropagation();
              void startChatWithTutor(tutor);
            }}
          >
            <MessageCircle className="icon-xs" />
            <Lang text={pendingGift ? { ko: "수락 후 대화", en: "Accept to Talk" } : { ko: "대화하기", en: "Talk" }} />
          </Button>
        </div>
      </>
    );
  };

  // '튜터 추가하기' 플레이스홀더 카드 — 카드 목록 끝(또는 튜터가 없을 때 단독)으로 표시
  const renderAddTutorPlaceholderCard = (variant: "carousel" | "solo") => {
    const disabled = progress?.canCreate === false;
    return (
      <div
        className={cn(
          "flex flex-col items-center justify-center gap-5 rounded-xl border border-muted/40 bg-muted/20 p-6 text-center transition-colors hover:border-primary/40",
          variant === "carousel" ? "h-full min-h-[22rem]" : "min-h-[22rem]",
        )}
      >
        <span className="flex icon-xl items-center justify-center rounded-full bg-primary/10 text-primary">
          <BookOpen className="icon-md" />
        </span>
        <div className="space-y-1">
          <p className="text-base font-semibold text-primary-text">
            <Lang text={{ ko: "새 튜터 추가", en: "Add a Tutor" }} />
          </p>
          <p className="text-sm text-secondary-text">
            <Lang text={{ ko: "나만의 AI 튜터를 만들어보세요", en: "Create your own AI tutor" }} />
          </p>
        </div>
        <Button variant="accent" rounded="full" onClick={handleCreateNew} disabled={disabled}>
          <Plus className="icon-xs" />
          <Lang text={{ ko: "튜터 만들기", en: "Create Tutor" }} />
        </Button>
      </div>
    );
  };

  const handleOnboardingSaved = async (saved: PersonaFormValuesType) => {
    const [nextTutorsState, nextProgress] = await Promise.all([
      getTutorsState().catch(() => null),
      getTutorsProgress().catch(() => null),
    ]);
    if (nextTutorsState) setTutorsState(nextTutorsState);
    if (nextProgress) setProgress(nextProgress);
    setItems((prev) => {
      const exists = prev.some((item) => item.pid === saved.pid);
      if (exists) return prev.map((item) => (item.pid === saved.pid ? saved : item));
      return [saved, ...prev];
    });
    setEditing(saved);
    setShowOnboarding(false);
    setPublishVisibility("private");
  };

  const handleForkTemplate = (template: PersonaFormValuesType) => {
    if (!template?.pid) return;
    if (progress?.canCreate === false) {
      const remaining = progress.remainingSessionsForNextTutor ?? 1;
      void dialog.alert(
        lang({
          ko: `템플릿 가져오기도 새 튜터 생성 정책을 사용합니다. 유효 학습 세션이 ${remaining}회 더 필요합니다.`,
          en: `Importing a template uses the same tutor creation policy. ${remaining} more valid learning sessions are needed.`,
        }),
      );
      return;
    }

    void (async () => {
      setForkingTemplatePid(template.pid);
      try {
        const forked = await forkTutorsPersonaTemplate(template.pid);
        const nextTutorsState = await getTutorsState().catch(() => null);
        if (nextTutorsState) setTutorsState(nextTutorsState);
        const nextProgress = await getTutorsProgress().catch(() => null);
        if (nextProgress) setProgress(nextProgress);
        // 편집 모드로 열기: 바로 목록에 추가하지 않고, 설정을 확인/수정한 후 저장하도록 한다
        setEditing(forked);
        setShowOnboarding(false);
        setProfileEditUnlocked(true);
        setSettingsSheetOpen(true);
        toast.success(
          lang({
            ko: "템플릿을 가져왔습니다. 이름과 설정을 확인한 후 저장 버튼을 눌러주세요.",
            en: "Template imported. Review the name and settings, then press Save.",
          }),
        );
      } catch (e) {
        logger.error("[TutorsHome] forkTutorsPersonaTemplate 실패:", e);
        void dialog.alert({
          variant: "danger",
          message: lang({ ko: "템플릿 가져오기 중 오류가 발생했습니다.", en: "Error importing template." }),
        });
      } finally {
        setForkingTemplatePid("");
      }
    })();
  };

  const renderProfileEditGuide = () => {
    if (!editing?.pid) return null;
    if (isGiftedTutor(editing)) {
      return (
        <div className="rounded-2xl border border-border/40 bg-surface/40 p-4">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-secondary/10 text-secondary">
              <Package className="icon-xs" />
            </span>
            <div className="min-w-0 flex-1">
              <h3 className="text-sm font-semibold text-primary-text">
                <Lang text={{ ko: "선물받은 튜터", en: "Gifted Tutor" }} />
              </h3>
              <p className="mt-1 text-xs leading-relaxed text-secondary-text">
                <Lang
                  text={{
                    ko: isPendingGiftTutor(editing)
                      ? "아직 수락하지 않은 선물입니다. 수락하면 대화할 수 있고, 편집은 보낸 사람만 할 수 있습니다."
                      : "이 튜터는 대화에 사용할 수 있지만 편집은 보낸 사람만 할 수 있습니다. 더 이상 사용하지 않으려면 거부 버튼을 누르세요.",
                    en: isPendingGiftTutor(editing)
                      ? "This gift is still pending. After accepting it, you can chat with the tutor, but only the sender can edit it."
                      : "You can chat with this tutor, but only the sender can edit it. Use reject if you no longer want access.",
                  }}
                />
              </p>
            </div>
          </div>
        </div>
      );
    }

    return (
      <div className="rounded-2xl border border-border/40 bg-surface/40 p-4">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Pencil className="icon-xs" />
          </span>
          <div className="min-w-0 flex-1">
            <h3 className="text-sm font-semibold text-primary-text">
              <Lang text={{ ko: "튜터 프로필 편집", en: "Tutor Profile Editing" }} />
            </h3>
            <p className="mt-1 text-xs leading-relaxed text-secondary-text">
              <Lang
                text={{
                  ko: profileEditUnlocked
                    ? "편집 모드가 켜져 있습니다. 변경 사항은 상단의 튜터 저장을 눌러야 반영됩니다."
                    : "프로필 정보는 기본적으로 잠겨 있습니다. 상단의 편집하기를 누르고 튜터 이름을 입력하면 수정할 수 있습니다.",
                  en: profileEditUnlocked
                    ? "Edit mode is on. Select Save Tutor at the top to apply your changes."
                    : "Profile information is locked by default. Select Edit and type the tutor name to make changes.",
                }}
              />
            </p>
          </div>
        </div>
      </div>
    );
  };

  const renderSettingsContent = () => {
    if (!editing?.pid) return null;
    const gifted = isGiftedTutor(editing);
    const pendingGift = isPendingGiftTutor(editing);
    const isProfileReadOnly = gifted || !profileEditUnlocked;

    return (
      <div className="pb-6">
        <div className="sticky top-0 z-20 flex flex-wrap items-center justify-between gap-3 border-b border-border/50 bg-background/95 px-4 py-3 backdrop-blur sm:px-6">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-primary-text">{editing.name}</p>
            <p className="text-xs text-secondary-text">
              {publicationLoading ? (
                <Lang text={{ ko: "공유 상태 확인 중...", en: "Checking publication status..." }} />
              ) : gifted ? (
                <Lang
                  text={
                    pendingGift
                      ? { ko: "수락 대기 중인 선물", en: "Pending Gift" }
                      : { ko: "선물받은 튜터 · 읽기 전용", en: "Gifted Tutor · Read-only" }
                  }
                />
              ) : (
                <>
                  <Lang text={{ ko: "저장된 템플릿 공개 범위", en: "Saved template visibility" }} />:{" "}
                  <Lang text={getTemplateVisibilityMeta(publishedTemplate?.visibility || "private").label} />
                </>
              )}
            </p>
          </div>
          <div className="flex flex-wrap justify-end gap-2">
            {pendingGift ? (
              <Button size="sm" onClick={() => void handleAcceptGiftTutor(editing)} disabled={saving}>
                <CheckCircle2 className="icon-xs" />
                <Lang text={{ ko: "수락", en: "Accept" }} />
              </Button>
            ) : null}
            <Button variant="outline" size="sm" onClick={handleDelete} disabled={saving}>
              {gifted ? <XCircle className="icon-xs" /> : <Trash2 className="icon-xs" />}
            </Button>
            {gifted ? (
              <Button size="sm" disabled>
                <Lang text={{ ko: "읽기 전용", en: "Read-only" }} />
              </Button>
            ) : profileEditUnlocked ? (
              <Button size="sm" onClick={handleSave} disabled={saving || publicationLoading}>
                <Lang
                  text={{
                    ko: saving ? "저장 중..." : "튜터 저장",
                    en: saving ? "Saving..." : "Save Tutor",
                  }}
                />
              </Button>
            ) : (
              <Button size="sm" onClick={handleRequestProfileEdit} disabled={saving || publicationLoading}>
                <Pencil className="icon-xs" />
                <Lang text={{ ko: "편집하기", en: "Edit" }} />
              </Button>
            )}
          </div>
        </div>

        <div className="px-4 sm:px-6">
          <div className="mb-6 mt-5">{renderProfileEditGuide()}</div>
          {!gifted ? (
            <div className="mb-6 rounded-2xl border border-border/40 bg-surface/40 p-4">
              <div className="flex flex-col gap-3">
                <div>
                  <h3 className="text-sm font-semibold">
                    <Lang text={{ ko: "템플릿 공개 범위", en: "Template Visibility" }} />
                  </h3>
                  <p className="mt-1 text-xs leading-relaxed text-secondary-text">
                    <Lang
                      text={{
                        ko: "선택한 공개 범위를 포함한 모든 튜터 설정은 상단의 튜터 저장 버튼을 누르면 함께 반영됩니다.",
                        en: "The selected visibility and all tutor settings are applied together when you select Save Tutor above.",
                      }}
                    />
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {TEMPLATE_VISIBILITY_OPTIONS.map((visibility) => {
                    const meta = getTemplateVisibilityMeta(visibility);
                    const isSelected = publishVisibility === visibility;

                    return (
                      <Button
                        key={visibility}
                        variant={isSelected ? "secondary" : "outline"}
                        size="sm"
                        onClick={() => setPublishVisibility(visibility)}
                        disabled={publicationLoading || saving || !profileEditUnlocked}
                      >
                        <Lang text={meta.label} />
                      </Button>
                    );
                  })}
                </div>
                <p className="text-xs leading-relaxed text-secondary-text">
                  <Lang text={getTemplateVisibilityMeta(publishVisibility).description} />
                </p>
              </div>
            </div>
          ) : null}
          <div className="mt-6">
            <TutorGenesisProfilePanel
              value={editing}
              onChange={(next) =>
                setEditing({
                  ...next,
                  universeId: resolveTutorUniverseId(next.personaType),
                } as PersonaFormValuesType)
              }
              personaDisabledFields={
                isProfileReadOnly ? READ_ONLY_PERSONA_DISABLED_FIELDS : EDITABLE_TUTOR_PERSONA_DISABLED_FIELDS
              }
              disabled={saving || isProfileReadOnly}
              settingsDisabled={isProfileReadOnly}
              isAdmin={isAdmin}
              pilotVoices={pilotVoices}
              imageGenerationPresentation="embedded"
            />
          </div>
        </div>
      </div>
    );
  };

  const renderTemplateSettingsContent = () => {
    if (!editingTemplate?.pid) return null;

    return (
      <div className="pb-6">
        <div className="sticky top-0 z-20 flex flex-wrap items-center justify-between gap-3 border-b border-border/50 bg-background/95 px-4 py-3 backdrop-blur sm:px-6">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-primary-text">{editingTemplate.name}</p>
            <p className="text-xs text-secondary-text">
              <Lang text={{ ko: "공유 템플릿 직접 편집", en: "Edit shared template directly" }} />
            </p>
          </div>
          <div className="flex flex-wrap justify-end gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => void handleDeleteTemplate(editingTemplate)}
              disabled={templateSaving || deletingTemplatePid === editingTemplate.pid}
            >
              <Trash2 className="icon-xs text-danger" />
            </Button>
            <Button size="sm" onClick={handleSaveTemplate} disabled={templateSaving}>
              <Lang
                text={{
                  ko: templateSaving ? "저장 중..." : "템플릿 저장",
                  en: templateSaving ? "Saving..." : "Save Template",
                }}
              />
            </Button>
          </div>
        </div>

        <div className="px-4 sm:px-6">
          <div className="mb-6 mt-5 rounded-2xl border border-border/40 bg-surface/40 p-4">
            <div className="flex flex-col gap-3">
              <div>
                <h3 className="text-sm font-semibold">
                  <Lang text={{ ko: "템플릿 공개 범위", en: "Template Visibility" }} />
                </h3>
                <p className="mt-1 text-xs leading-relaxed text-secondary-text">
                  <Lang
                    text={{
                      ko: "원본 튜터가 삭제되어도 이 공유 템플릿 도큐먼트의 공개 범위와 내용만 직접 수정됩니다.",
                      en: "Only this shared template document is updated, even if the original tutor no longer exists.",
                    }}
                  />
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {TEMPLATE_VISIBILITY_OPTIONS.map((visibility) => {
                  const meta = getTemplateVisibilityMeta(visibility);
                  const isSelected = templateEditorVisibility === visibility;

                  return (
                    <Button
                      key={visibility}
                      variant={isSelected ? "secondary" : "outline"}
                      size="sm"
                      onClick={() => setTemplateEditorVisibility(visibility)}
                      disabled={templateSaving}
                    >
                      <Lang text={meta.label} />
                    </Button>
                  );
                })}
              </div>
              <p className="text-xs leading-relaxed text-secondary-text">
                <Lang text={getTemplateVisibilityMeta(templateEditorVisibility).description} />
              </p>
            </div>
          </div>

          <div className="mt-6">
            <TutorGenesisProfilePanel
              value={editingTemplate}
              onChange={(next) =>
                setEditingTemplate({
                  ...next,
                  personaType: editingTemplate.personaType,
                  universeId: editingTemplate.universeId || resolveTutorUniverseId(editingTemplate.personaType),
                  systemPersonaKey: editingTemplate.systemPersonaKey,
                } as PersonaFormValuesType)
              }
              personaDisabledFields={TEMPLATE_PERSONA_DISABLED_FIELDS}
              disabled={templateSaving}
              isAdmin={isAdmin}
              pilotVoices={pilotVoices}
              imageGenerationPresentation="embedded"
            />
          </div>
        </div>
      </div>
    );
  };

  if (!isLoggedIn) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Preloader variant="spin" size="lg" />
      </div>
    );
  }

  const shouldRenderTemplateSection = templatesLoading || templateScope !== "public" || sharedTemplates.length > 0;

  // 실제(완료 세션 기준) 생성 가능 여부 — 어드민은 canCreate가 우회로 true가 되므로, 가이드는 baseCanCreate로 판단
  const realCanCreate = progress ? (progress.baseCanCreate ?? progress.canCreate) : undefined;
  const missionLimitReached = realCanCreate === false;
  const adminBypassActive = progress?.adminBypass === true && missionLimitReached;
  const creationUnlockInterval = progress?.creationUnlockSessionInterval ?? 3;
  const remainingSessionsForNextTutor = progress?.remainingSessionsForNextTutor ?? 1;

  return (
    <div className="mx-auto max-w-[72rem] px-4 pt-10 pb-[calc(2.5rem+env(safe-area-inset-bottom))]">
      {/* Header */}
      <div className="mb-8 flex items-center justify-between gap-4">
        <div className="w-full">
          <p className="flex items-center gap-1 text-xxs font-bold uppercase tracking-[0.14em] text-primary mb-1">
            <Sparkles size={12} />
            <Lang text={{ ko: "My Workspace", en: "My Workspace" }} />
          </p>
          <div className="flex items-center justify-between">
            <h1 className="inline-flex items-center gap-2 text-2xl sm:text-3xl font-extrabold tracking-tight">
              <div className="inline-flex items-center">
                <Lang text={{ ko: "내 튜터", en: "My Tutors" }} />
                {missionLimitReached ? (
                  <TooltipBasic
                    side="bottom"
                    align="end"
                    ariaLabel={lang({ ko: "튜터 생성 안내", en: "Tutor Creation info" })}
                  >
                    <div className="space-y-1">
                      <p className="font-semibold text-primary-text">
                        <Lang
                          text={{
                            ko: "지금은 새 튜터를 만들 수 없어요",
                            en: "You can't create a new tutor just yet.",
                          }}
                        />
                      </p>

                      <p>
                        <Lang
                          text={{
                            ko: `새로운 튜터를 만나려면 현재 튜터와 유효한 학습을 ${creationUnlockInterval}회 진행해 주세요.`,
                            en: `Complete ${creationUnlockInterval} valid learning sessions with your current tutor to unlock a new one.`,
                          }}
                        />
                      </p>

                      <p>
                        <Lang
                          text={{
                            ko: "유효한 학습은 사용자와 튜터가 각각 5회 이상 대화를 주고받고, 1분 이상 대화를 이어간 경우 기록됩니다.",
                            en: "A learning session counts when both you and your tutor exchange at least 5 messages each and chat for over 1 minute.",
                          }}
                        />
                      </p>

                      <p className="text-primary font-bold">
                        <Lang
                          text={{
                            ko: `현재 진행도 ${progress?.usedCreationCount ?? 0}/${progress?.allowedCreationCount ?? 1}`,
                            en: `Progress ${progress?.usedCreationCount ?? 0}/${progress?.allowedCreationCount ?? 1}`,
                          }}
                        />
                      </p>
                    </div>
                  </TooltipBasic>
                ) : null}
              </div>
            </h1>

            <div className="flex items-center gap-2">
              {showOnboarding && items.length > 0 ? (
                <Button variant="ghost" size="icon-lg" rounded="full" onClick={() => setShowOnboarding(false)}>
                  <X className="icon-md" />
                  <Lang text={{ ko: "튜터 만들기 취소", en: "Cancel creating a tutor" }} className="sr-only" />
                </Button>
              ) : null}

              {!showOnboarding ? (
                <div className="flex items-center gap-1">
                  <Button
                    variant="accent"
                    rounded="full"
                    onClick={handleCreateNew}
                    disabled={progress?.canCreate === false}
                  >
                    <Plus className="icon-xs" />
                    <Lang text={{ ko: "새 튜터", en: "New Tutor" }} />
                  </Button>
                </div>
              ) : null}
            </div>
          </div>
          {progress ? (
            <p className="mt-2 text-xs text-secondary-text">
              <Lang
                text={{
                  ko: missionLimitReached
                    ? `다음 튜터까지 유효 세션 ${remainingSessionsForNextTutor}회 필요${adminBypassActive ? " · 관리자 테스트 생성 가능" : ""}`
                    : "새 튜터 생성 가능",
                  en: missionLimitReached
                    ? `${remainingSessionsForNextTutor} valid sessions needed for the next tutor${adminBypassActive ? " · admin test bypass" : ""}`
                    : "New tutor available",
                }}
              />
            </p>
          ) : null}
        </div>
      </div>

      {/* Onboarding */}
      {showOnboarding && (
        <div className="mb-8">
          <section>
            <h3 className="text-lg font-semibold text-primary-text">
              <Lang
                text={{
                  ko: "나만의 튜터를 만드세요.",
                  en: "Create your own tutor.",
                }}
              />
            </h3>

            <div className="mt-5">
              <UserPersonaManager
                key={onboardingKey}
                hideList
                showHeader={false}
                onSaved={handleOnboardingSaved}
                surface="tutors"
              />
            </div>
          </section>
        </div>
      )}

      {/* Tutor Cards Slider */}
      {loading ? (
        <div className="py-16 flex justify-center">
          <Preloader variant="spin" />
        </div>
      ) : items.length === 0 ? (
        !showOnboarding ? (
          <div className="mx-auto w-full max-w-[280px]">{renderAddTutorPlaceholderCard("solo")}</div>
        ) : null
      ) : !showOnboarding ? (
        <div className="-mx-4">
          <CharacterViewMode
            personas={visualTutorItems}
            clickedCharacterId={editing?.pid || null}
            savedCharacterId={null}
            handleCharacterSelect={handleTutorCardSelect}
            handleConfirm={handleTutorCardSelect}
            detailModalOpen={false}
            setDetailModalOpen={() => undefined}
            selectedDetailCharacter={null}
            carouselRef={tutorCarouselRef}
            initialViewMode="carousel"
            showViewModeToggle={false}
            showSelectButton={false}
            availabilityMode="all"
            showCardSelectIndicator={false}
            cardActionRenderer={renderTutorCardActions}
            enableCardSelection={false}
            trailingSlot={renderAddTutorPlaceholderCard("carousel")}
            showNav={false}
          />
        </div>
      ) : null}

      {renderSharedProgressSection()}

      {shouldRenderTemplateSection ? (
        <section className="mb-8 overflow-hidden rounded-3xl border border-border bg-card shadow-sm">
          <div className="flex flex-col gap-4 p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="mb-1 text-xxs font-bold uppercase tracking-[0.14em] text-primary">
                  <Lang text={{ ko: "Templates", en: "Templates" }} />
                </p>
                <h2 className="text-base font-bold sm:text-lg">
                  <Lang text={{ ko: "공개 튜터 템플릿 사용하기", en: "Use Public Tutor Templates" }} />
                </h2>
                <p className="mt-1 text-xs leading-relaxed text-secondary-text sm:text-sm">
                  <Lang
                    text={{
                      ko: "공개 템플릿으로 나만의 튜터를 바로 생성하고 대화하세요.",
                      en: "Create your own tutor from a public template and start chat right away.",
                    }}
                  />
                </p>
              </div>
              <div className="flex gap-1">
                <Button
                  variant={templateScope === "public" ? "secondary" : "outline"}
                  size="xs"
                  rounded="full"
                  onClick={() => handleTemplateScopeChange("public")}
                  disabled={templatesLoading}
                >
                  <Lang text={{ ko: "공개 튜터", en: "Public Tutor" }} />
                </Button>
                <Button
                  variant={templateScope === "mine" ? "secondary" : "outline"}
                  size="xs"
                  rounded="full"
                  onClick={() => handleTemplateScopeChange("mine")}
                  disabled={templatesLoading}
                >
                  <Lang text={{ ko: "내 튜터", en: "My Tutor" }} />
                </Button>
              </div>
            </div>
          </div>

          <div className="px-4 pb-4">
            {templatesLoading ? (
              <div className="flex justify-center py-10">
                <Preloader variant="spin" />
              </div>
            ) : sharedTemplates.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-border bg-surface px-4 py-8 text-center">
                <p className="text-sm font-medium">
                  <Lang
                    text={{
                      ko: templateScope === "mine" ? "아직 발행한 템플릿이 없어요." : "아직 공개된 템플릿이 없어요.",
                      en: templateScope === "mine" ? "No published templates yet." : "No public templates yet.",
                    }}
                  />
                </p>
                <p className="mt-1 text-xs text-secondary-text">
                  <Lang
                    text={{
                      ko:
                        templateScope === "mine"
                          ? "튜터 설정 패널에서 지금 쓰는 튜터를 바로 발행할 수 있어요."
                          : "첫 튜터를 만든 뒤 공유 템플릿을 가져와 조합해보세요.",
                      en:
                        templateScope === "mine"
                          ? "You can publish the current tutor from the settings panel."
                          : "Create your first tutor, then combine it with imported shared templates.",
                    }}
                  />
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {sharedTemplates.map((template) => {
                  const { tutorIntro, mode, targetLang, job, language } = readTutorMeta(template);
                  const isMine = !!actorId && template.ownerId === actorId;
                  const isForking = forkingTemplatePid === template.pid;
                  const canManageTemplate = isMine || isAdmin;
                  const isDeletingTemplate = deletingTemplatePid === template.pid;
                  const visibilityMeta = getTemplateVisibilityMeta(template.visibility);
                  const authorName = String(template.authorProfile?.displayName || "").trim();

                  return (
                    <div
                      key={template.pid}
                      className="group rounded-2xl border border-border bg-surface p-5 transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <CharacterSpriteAvatar
                          sprite={template.sprite || null}
                          portraitSrc={getTutorProfileImageForDisplay(template) || null}
                          alt={template.name || lang({ ko: "튜터 템플릿", en: "Tutor template" })}
                          className="border-primary icon-lg rounded-full mt-1"
                          imageClassName="bg-primary object-cover object-top"
                        />

                        <div className="min-w-0 flex-1 space-y-1">
                          <div className="flex items-center justify-between gap-2">
                            <span className="flex-1 truncate text-sm font-semibold sm:text-base">
                              {template.name || lang({ ko: "(이름 없음)", en: "(Unnamed)" })}
                            </span>
                            <span
                              className={cn(
                                "shrink-0 rounded-full px-2 py-1 text-xxs font-medium",
                                visibilityMeta.className,
                              )}
                            >
                              <Lang text={visibilityMeta.label} />
                            </span>
                          </div>

                          {job ? <p className="text-xs leading-relaxed text-secondary-text sm:text-sm">{job}</p> : null}

                          {mode || job || language ? (
                            <div className="flex items-center gap-1.5">
                              {mode ? (
                                <Badge variant="outlinePrimary" size="xs" className="uppercase">
                                  {mode}
                                </Badge>
                              ) : null}
                              {language ? (
                                <Badge variant="outlineSecondary" size="xs" className="uppercase">
                                  {language}
                                </Badge>
                              ) : null}
                            </div>
                          ) : null}
                          <p className="line-clamp-3 text-xs leading-relaxed text-secondary-text sm:text-sm">
                            {tutorIntro ||
                              lang({
                                ko: "소개 문장이 아직 없는 템플릿입니다.",
                                en: "This template does not have an intro yet.",
                              })}
                          </p>
                        </div>
                      </div>

                      <div className="mt-3 flex flex-wrap gap-1.5">
                        {authorName && (
                          <span className="inline-flex items-center rounded-full bg-slate-100/90 px-2 py-0.5 text-xxs font-medium text-slate-700 dark:bg-slate-800/80 dark:text-slate-200">
                            {authorName}
                          </span>
                        )}
                        {targetLang && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100/60 px-2 py-0.5 text-xxs font-medium text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">
                            <Languages className="icon-xxs" />
                            {targetLang}
                          </span>
                        )}
                        <span className="inline-flex items-center gap-1 rounded-full bg-secondary/10 px-2 py-0.5 text-xxs font-medium text-secondary">
                          {mode}
                        </span>
                        {!!template.version && (
                          <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-xxs font-medium text-secondary-text">
                            v{template.version}
                          </span>
                        )}
                        {isMine && (
                          <span className="inline-flex items-center rounded-full bg-sky-100/70 px-2 py-0.5 text-xxs font-medium text-sky-700 dark:bg-sky-900/30 dark:text-sky-300">
                            My Own
                          </span>
                        )}
                      </div>

                      <div className="mt-4 flex flex-wrap items-center gap-1.5">
                        <Button size="sm" onClick={() => handleForkTemplate(template)} disabled={isForking}>
                          <Download className="icon-xs" />
                          <Lang
                            text={{
                              ko: isForking ? "만드는 중..." : "내 튜터 만들기",
                              en: isForking ? "Creating..." : "Create My Tutor",
                            }}
                          />
                        </Button>
                        {canManageTemplate ? (
                          <>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => openTemplateSettings(template)}
                              disabled={isDeletingTemplate}
                            >
                              <Pencil className="icon-xs" />
                              <Lang text={{ ko: "편집", en: "Edit" }} />
                            </Button>
                            <Button
                              variant="outlineDestructive"
                              size="icon-sm"
                              onClick={() => void handleDeleteTemplate(template)}
                              disabled={isDeletingTemplate}
                            >
                              <Trash2 className="icon-xs text-danger" />
                              <Lang
                                text={{
                                  ko: isDeletingTemplate ? "삭제 중..." : "삭제",
                                  en: isDeletingTemplate ? "Deleting..." : "Delete",
                                }}
                                className="sr-only"
                              />
                            </Button>
                          </>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </section>
      ) : null}

      <BottomSheetDialog
        open={Boolean(giftTargetTutor)}
        onClose={closeGiftSheet}
        title={lang({ ko: "튜터 선물하기", en: "Gift Tutor" })}
        description={giftTargetTutor?.name || ""}
        rootClassName="!z-40"
        panelClassName="max-w-lg"
        bodyClassName="p-4"
      >
        {giftFriendsLoading ? (
          <div className="flex justify-center py-10">
            <Preloader variant="spin" />
          </div>
        ) : giftFriends.length ? (
          <div>
            {giftFriends.map((friend) => (
              <button
                key={friend.actorId}
                type="button"
                className="flex w-full items-center justify-between gap-3 border-b border-border/60 py-3 text-left transition-colors hover:bg-surface"
                onClick={() => void handleGiftToFriend(friend)}
                disabled={Boolean(giftingFriendId)}
              >
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold text-primary-text">
                    {getFriendDisplayName(friend)}
                  </span>
                  <span className="block truncate text-xs text-secondary-text">
                    {friend.emailHint || friend.actorId}
                  </span>
                </span>
                <span className="shrink-0 rounded-full bg-primary/10 px-2 py-1 text-xxs font-semibold text-primary">
                  {giftingFriendId === friend.actorId ? (
                    <Lang text={{ ko: "전송 중", en: "Sending" }} />
                  ) : (
                    <Lang text={{ ko: "선물", en: "Gift" }} />
                  )}
                </span>
              </button>
            ))}
          </div>
        ) : (
          <div className="py-10 text-center text-sm text-secondary-text">
            <Lang text={{ ko: "선물할 수 있는 친구가 없습니다.", en: "No friends available for gifting." }} />
          </div>
        )}
      </BottomSheetDialog>

      <BottomSheetDialog
        open={settingsSheetOpen && Boolean(editing?.pid) && !showOnboarding}
        onClose={closeTutorSettings}
        title={lang({ ko: "튜터 설정", en: "Tutor Settings" })}
        rootClassName="!z-40"
        panelClassName="max-w-6xl"
        bodyClassName="p-0"
      >
        {renderSettingsContent()}
      </BottomSheetDialog>
      <BottomSheetDialog
        open={templateEditorOpen && Boolean(editingTemplate?.pid)}
        onClose={() => setTemplateEditorOpen(false)}
        title={lang({ ko: "튜터 템플릿 편집", en: "Edit Tutor Template" })}
        rootClassName="!z-40"
        panelClassName="max-w-6xl"
        bodyClassName="p-0"
      >
        {renderTemplateSettingsContent()}
      </BottomSheetDialog>
      <NameConfirmDialog
        open={profileEditConfirmOpen}
        onOpenChange={setProfileEditConfirmOpen}
        expectedName={editing?.name || ""}
        title={lang({ ko: "프로필 편집 확인", en: "Confirm Profile Edit" })}
        description={
          <Lang
            text={{
              ko: (
                <>
                  튜터의 프로필 정보를 수정하면 대화 중인 튜터의 성격과 행동에 영향을 줄 수 있습니다. 그래도
                  수정하시려면 <span className="font-bold">{editing?.name}</span>
                  {getKorParticle(editing?.name ?? "튜터 이름", "을-를", false)} 입력해주세요.
                </>
              ),
              en: (
                <>
                  Editing the tutor&apos;s profile information may affect the tutor&apos;s personality and behavior
                  during conversations. To continue, please type <span className="font-bold">{editing?.name}</span>.
                </>
              ),
            }}
          />
        }
        inputLabel={lang({ ko: "튜터 이름", en: "Tutor name" })}
        inputPlaceholder={lang({ ko: "튜터 이름 입력", en: "Type the tutor name" })}
        confirmLabel={lang({ ko: "동의하고 편집", en: "I agree, edit" })}
        confirmVariant="primary"
        iconClassName="bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300"
        onConfirm={() => {
          setProfileEditUnlocked(true);
          return true;
        }}
        disabled={!editing?.name?.trim()}
      />
      <NameConfirmDialog
        open={Boolean(deleteConfirmTarget)}
        onOpenChange={(open) => {
          if (!open) setDeleteConfirmTarget(null);
        }}
        expectedName={deleteConfirmTarget?.name || ""}
        onConfirm={handleDeleteConfirm}
        loading={deleting}
        title={lang({ ko: "튜터 삭제 확인", en: "Confirm Tutor Deletion" })}
        description={
          <Lang
            text={{
              ko: (
                <>
                  삭제하려면 아래에{" "}
                  <strong className="font-semibold text-primary-text">{deleteConfirmTarget?.name || ""}</strong>을
                  정확히 입력한 뒤 확인을 눌러주세요. 이 작업은 되돌릴 수 없습니다.
                </>
              ),
              en: (
                <>
                  Type <strong className="font-semibold text-primary-text">{deleteConfirmTarget?.name || ""}</strong>{" "}
                  below, then confirm. This action cannot be undone.
                </>
              ),
            }}
          />
        }
        inputLabel={lang({ ko: "삭제 대상 이름", en: "Name to delete" })}
        confirmLabel={lang({ ko: "삭제", en: "Delete" })}
        confirmVariant="destructive"
      />
    </div>
  );
}
