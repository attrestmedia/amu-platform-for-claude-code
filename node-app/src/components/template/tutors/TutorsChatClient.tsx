"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Preloader } from "@amu-labs/ui";
import { Lang, lang } from "components/module/i18n";
import CharacterChat from "components/module/game/character/CharacterChat";
import type { PersonaFormValuesType, PersonaImageLibraryAssetType } from "types/ai";
import type { IExtendedNpcData } from "types/game";
import { getTutorsPersona } from "libs/api/tutors/personas";
import { useAuthStore } from "store/auth";
import { ArrowLeft, RefreshCcw } from "lucide-react";
import { logger } from "utils/log";
import { listPersonaImageLibraryAssets } from "libs/api/persona/imageLibrary";
import { getPrimaryProfileImage } from "utils/app/tutorProfileImage";
import { toUnknownRecord } from "utils/common/typeUtils";

// TutorsChatClient
// - tutors 페르소나(pid)를 로드한 뒤, 기존 CharacterChat UI로 대화 화면 구성
// - 닫기(onOpenChange=false) 시 /tutors로 복귀
export default function TutorsChatClient({ pid }: { pid: string }) {
  const router = useRouter();
  const hasHydrated = useAuthStore((state) => state.hasHydrated);
  const isLoggedIn = useAuthStore((state) => Boolean(state.hasHydrated && state.isAuthenticated && state.user?.id));

  const [open, setOpen] = useState(true);
  const [loading, setLoading] = useState(true);
  const [tutor, setTutor] = useState<PersonaFormValuesType | null>(null);
  const [personaArtifacts, setPersonaArtifacts] = useState<PersonaImageLibraryAssetType[]>([]);

  const chatPath = useMemo(() => `/tutors/${encodeURIComponent(pid)}`, [pid]);
  const loginPath = useMemo(() => `/login?next=${encodeURIComponent(chatPath)}`, [chatPath]);

  const loadTutor = useCallback(async () => {
    if (!isLoggedIn) return;

    setLoading(true);
    try {
      const data = await getTutorsPersona(decodeURIComponent(pid || ""));
      setTutor(data);
      if (data?.pid) {
        const linkedProfileImageUrl = getPrimaryProfileImage(data.profiles);
        const assets = await listPersonaImageLibraryAssets({
          personaId: data.pid,
          linkedProfileImageUrl: linkedProfileImageUrl || undefined,
          source: "uploaded_reference",
          referenceKind: "profile_reference_sketch",
          limit: 100,
        }).catch((error) => {
          logger.warn("[TutorsChatClient] artifact 목록 조회 실패:", error);
          return [];
        });
        setPersonaArtifacts(assets);
      } else {
        setPersonaArtifacts([]);
      }
    } catch (e) {
      logger.error("[TutorsChatClient] getTutorsPersona 실패:", e);
      setTutor(null);
      setPersonaArtifacts([]);
    } finally {
      setLoading(false);
    }
  }, [isLoggedIn, pid]);

  useEffect(() => {
    if (!hasHydrated) return;
    if (!isLoggedIn) {
      const timer = window.setTimeout(() => {
        setLoading(false);
        setTutor(null);
      }, 0);
      return () => window.clearTimeout(timer);
    }

    const timer = window.setTimeout(() => {
      void loadTutor();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [hasHydrated, isLoggedIn, loadTutor]);

  // CharacterChat이 기대하는 최소 필드를 tutor가 이미 가지고 있으므로 캐스팅(런타임 안전)
  const character = useMemo(() => {
    if (!tutor) return null;
    return {
      ...tutor,
      pid: tutor.pid,
      name: tutor.name,
      profiles: tutor.profiles,
      sprite: tutor.sprite,
    } as unknown as IExtendedNpcData;
  }, [tutor]);

  const initialMessage = useMemo(() => {
    if (!tutor) return undefined;

    const tutorIntro = String(tutor.tutorIntro || tutor.summary || "").trim();
    if (tutorIntro) return tutorIntro;

    const policy = tutor.tutorsPolicy && typeof tutor.tutorsPolicy === "object" ? tutor.tutorsPolicy : null;
    const targetLanguage = String(policy?.targetLanguage || "").trim();
    const learningGoal = String(policy?.learningGoal || "").trim();

    if (!targetLanguage && !learningGoal) return undefined;

    return lang({
      ko: `${tutor.name || "튜터"}와 대화를 시작해보세요.${targetLanguage ? ` 학습 언어는 ${targetLanguage}입니다.` : ""}${learningGoal ? ` 목표는 ${learningGoal}` : ""}`,
      en: `Start chatting with ${tutor.name || "your tutor"}.${targetLanguage ? ` The target language is ${targetLanguage}.` : ""}${learningGoal ? ` Goal: ${learningGoal}` : ""}`,
    });
  }, [tutor]);

  const handleBack = () => router.push("/tutors");
  const handleLogin = () => router.push(loginPath);
  const tutorsUi = toUnknownRecord(tutor?.tutorsUi);
  const conversationHint = toUnknownRecord(tutorsUi.conversationHint);
  const tutorsPolicy = toUnknownRecord(tutor?.tutorsPolicy);

  if (!hasHydrated) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <Preloader variant="spin" />
      </div>
    );
  }

  if (!isLoggedIn) {
    return (
      <div className="max-w-5xl mx-auto px-4 py-10">
        <h1 className="text-2xl font-semibold">
          <Lang text={{ ko: "Tutors", en: "Tutors" }} />
        </h1>
        <p className="mt-2 text-sm text-gray-600">
          <Lang
            text={{
              ko: "튜터와 실제로 대화하며 학습하려면 로그인이 필요합니다.",
              en: "Login is required to chat with the tutor and continue learning.",
            }}
          />
        </p>
        <div className="mt-4 flex gap-2">
          <Button variant="primary" onClick={handleLogin}>
            <Lang text={{ ko: "로그인", en: "Log in" }} />
          </Button>
          <Button variant="outline" onClick={handleBack}>
            <ArrowLeft className="mr-2" size={16} />
            <Lang text={{ ko: "돌아가기", en: "Back" }} />
          </Button>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <Preloader variant="spin" />
      </div>
    );
  }

  if (!tutor || !character) {
    return (
      <div className="max-w-5xl mx-auto px-4 py-10">
        <h1 className="text-2xl font-semibold">
          <Lang text={{ ko: "튜터를 찾을 수 없습니다", en: "Tutor not found" }} />
        </h1>
        <p className="mt-2 text-sm text-gray-600">
          <Lang
            text={{
              ko: "요청한 튜터 정보를 찾지 못했습니다.",
              en: "The requested tutor information could not be found.",
            }}
          />
        </p>
        <div className="mt-4 flex gap-2">
          <Button variant="outline" onClick={handleBack}>
            <ArrowLeft className="mr-2" size={16} />
            <Lang text={{ ko: "목록으로", en: "Back to list" }} />
          </Button>
          <Button variant="outline" onClick={() => void loadTutor()}>
            <RefreshCcw className="mr-2" size={16} />
            <Lang text={{ ko: "다시 시도", en: "Retry" }} />
          </Button>
        </div>
      </div>
    );
  }

  return (
    <CharacterChat
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) router.push("/tutors");
      }}
      character={character}
      personaArtifacts={personaArtifacts}
      startSessionOnOpen
      autoAiResponseOverride={tutor.tutorsUi?.autoAiResponse === true}
      tutorsConversationHint={{
        enabled: conversationHint.enabled !== false,
        targetLanguage: String(tutorsPolicy.targetLanguage || character.language || "English"),
        topic: String(tutorsPolicy.topic || ""),
      }}
      tutorsConversationLevel={String(tutorsPolicy.conversationLevel || "")}
      tutorsImageInputEnabled
      initialMessage={initialMessage}
    />
  );
}
