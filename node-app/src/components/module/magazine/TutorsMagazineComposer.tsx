"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import Image from "next/image";
import { ArrowLeft, Check, Send } from "lucide-react";
import { Button } from "@amu-labs/ui";
import type { IChatMessage, PersonaFormValuesType, PublicTutorGalleryItemType } from "types/ai";
import type { IExtendedNpcData } from "types/game";
import { listPublicTutorGallery, listTutorsPersonas } from "libs/api/tutors/personas";
import { getTutorProfileImageForDisplay } from "utils/app/tutorProfileImage";
import { genUniqueId } from "utils/common";
import { CharacterChatHeader } from "components/module/game/character/chat-modules/views/CharacterChatHeader";
import { ChatBackground } from "components/module/game/character/chat-modules/views/ChatBackground";
import { ChatMessageBubble } from "components/module/game/character/chat-modules/messages/ChatMessageBubble";
import { ConversationHintBar } from "components/module/game/character/chat-modules/controls/ConversationHintBar";

type ComposerProps = {
  embedSessionId: string;
  personaId: string;
  articleQuestion: string;
  onQuestion: (question: string) => void;
  onAnswer: () => void;
  onReturn: () => void;
};

type MagazineTutorOption = {
  pid: string;
  name: string;
  imageUrl: string;
  source: "public" | "mine" | "article-default";
  persona?: PersonaFormValuesType;
};

const RECOMMENDED_QUESTIONS = [
  "로고나 레터링이 있는 상품이면 어디까지 AI 착용샷을 써도 될까요?",
  "무지 티셔츠와 패턴 상품의 검수 기준은 어떻게 달라야 하나요?",
  "상품 페이지 대표 이미지로 쓰기 전에 무엇을 먼저 확인해야 하나요?",
];

const IDLE_PLAYBACK_STATE = {
  available: false,
  status: "idle",
  errorMessage: null,
  deferText: false,
} as const;

function createMessage(args: { text: string; isUser: boolean; clientId: string }): IChatMessage {
  return {
    id: args.clientId,
    clientId: args.clientId,
    text: args.text,
    isUser: args.isUser,
    timestamp: new Date(),
  };
}

function toCharacter(option: MagazineTutorOption): IExtendedNpcData {
  const tutor = option.persona;
  return {
    ...(tutor || {}),
    pid: option.pid,
    name: option.name || tutor?.name || "AI Tutor",
    personaType: tutor?.personaType || "human",
    profiles: tutor?.profiles || (option.imageUrl ? { default: [option.imageUrl] } : { default: [] }),
    sprite: tutor?.sprite || null,
  } as IExtendedNpcData;
}

function TutorOptionAvatar({ option }: { option: MagazineTutorOption }) {
  const initial = option.name.trim().slice(0, 1).toUpperCase() || "T";

  return (
    <span className="relative block size-10 shrink-0 overflow-hidden rounded-full border border-white/20 bg-white/10 text-center text-sm font-bold leading-10 text-white">
      {option.imageUrl ? (
        <Image src={option.imageUrl} alt="" fill sizes="40px" className="object-cover object-top" />
      ) : (
        initial
      )}
    </span>
  );
}

/**
 * @docHint
 * @purpose Magazine article experience용 Tutors 축소 surface
 * @process persona 표시 정보 로드  기존 Tutors 시각 컴포넌트 조합  embedSessionId 기반 텍스트 대화
 * @domain magazine-content-experience
 * @scope client-component
 *
 * CharacterChat 전체를 넣으면 iframe 안에 설정/기록/음성/이미지/모델 패널까지 따라온다.
 * 이 adapter는 기사에서 필요한 텍스트 질문과 본문 복귀만 유지하고, 배경·헤더·말풍선은
 * 실제 Tutors 화면의 컴포넌트를 그대로 재사용한다.
 */
export function TutorsMagazineComposer({
  embedSessionId,
  personaId,
  articleQuestion,
  onQuestion,
  onAnswer,
  onReturn,
}: ComposerProps) {
  const [publicTutors, setPublicTutors] = useState<PublicTutorGalleryItemType[]>([]);
  const [myTutors, setMyTutors] = useState<PersonaFormValuesType[]>([]);
  const [tutorsLoading, setTutorsLoading] = useState(true);
  const [tutorsLoadFailed, setTutorsLoadFailed] = useState(false);
  const [selectedPersonaId, setSelectedPersonaId] = useState("");
  const [message, setMessage] = useState("");
  const [messages, setMessages] = useState<IChatMessage[]>([]);
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [pendingRequest, setPendingRequest] = useState<{ clientId: string; message: string } | null>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const [sessionId, setSessionId] = useState(() => genUniqueId("magazine-session"));

  const tutorOptions = useMemo(() => {
    const seen = new Set<string>();
    const options: MagazineTutorOption[] = [];
    const add = (option: MagazineTutorOption) => {
      if (!option.pid || seen.has(option.pid)) return;
      seen.add(option.pid);
      options.push(option);
    };

    publicTutors.forEach((item) =>
      add({
        pid: item.pid,
        name: item.name,
        imageUrl: item.imageUrl || "",
        source: "public",
      }),
    );
    myTutors.forEach((item) => {
      if (!item.pid || item.tutorsAccess?.kind === "gift") return;
      add({
        pid: item.pid,
        name: item.name || "내 튜터",
        imageUrl: getTutorProfileImageForDisplay(item),
        source: "mine",
        persona: item,
      });
    });
    if (!seen.has(personaId)) {
      add({ pid: personaId, name: "AI Tutor", imageUrl: "", source: "article-default" });
    }
    return options;
  }, [myTutors, personaId, publicTutors]);

  const selectedOption = useMemo<MagazineTutorOption>(() => {
    const explicitSelection = selectedPersonaId ? tutorOptions.find((option) => option.pid === selectedPersonaId) : null;
    return (
      explicitSelection ||
      tutorOptions.find((option) => option.pid === personaId && option.imageUrl) ||
      tutorOptions.find((option) => option.pid === personaId) ||
      tutorOptions.find((option) => option.imageUrl) ||
      { pid: personaId, name: "AI Tutor", imageUrl: "", source: "article-default" }
    );
  }, [personaId, selectedPersonaId, tutorOptions]);
  const activePersonaId = selectedOption.pid;
  const character = useMemo(() => toCharacter(selectedOption), [selectedOption]);
  const profileImage = useMemo(
    () => selectedOption.imageUrl || getTutorProfileImageForDisplay(selectedOption.persona),
    [selectedOption],
  );
  const showTutorPicker = tutorsLoading || tutorOptions.some((option) => option.source !== "article-default");

  useEffect(() => {
    let cancelled = false;
    void Promise.allSettled([
      listPublicTutorGallery(12, { includeNoImage: true }),
      listTutorsPersonas(),
    ]).then(([publicResult, ownResult]) => {
      if (cancelled) return;
      setPublicTutors(publicResult.status === "fulfilled" ? publicResult.value : []);
      setMyTutors(ownResult.status === "fulfilled" ? ownResult.value : []);
      setTutorsLoadFailed(publicResult.status === "rejected" && ownResult.status === "rejected");
      setTutorsLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const container = messagesContainerRef.current;
    if (!container) return;
    container.scrollTo({ top: container.scrollHeight, behavior: "smooth" });
  }, [messages, status]);

  const handleTutorSelect = (option: MagazineTutorOption) => {
    if (status === "loading" || option.pid === activePersonaId) return;
    setSelectedPersonaId(option.pid);
    setSessionId(genUniqueId("magazine-session"));
    setMessages([]);
    setMessage("");
    setPendingRequest(null);
    setStatus("idle");
  };

  const submit = async () => {
    const question = message.trim();
    if (!question || status === "loading") return;

    const isRetry = pendingRequest?.message === question;
    const request = isRetry
      ? pendingRequest
      : { clientId: genUniqueId("magazine-question"), message: question };
    if (!request) return;

    setPendingRequest(request);
    setMessage("");
    if (!isRetry) {
      setMessages((current) => [...current, createMessage({ text: question, isUser: true, clientId: request.clientId })]);
    }
    onQuestion(question);
    setStatus("loading");
    try {
      const response = await fetch("/tutors/chat", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          personaId: activePersonaId,
          message: question,
          sessionId,
          userClientId: request.clientId,
          embedSessionId,
        }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok || !body?.ok) throw new Error(String(body?.errorCode || "tutors_request_failed"));
      const answer = String(body.result || body.content || "").trim();
      if (answer) {
        setMessages((current) => [
          ...current,
          createMessage({ text: answer, isUser: false, clientId: genUniqueId("magazine-answer") }),
        ]);
      }
      setStatus("idle");
      setPendingRequest(null);
      onAnswer();
    } catch {
      setStatus("error");
    }
  };

  const handleInputKeyDown = (event: ReactKeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) return;
    event.preventDefault();
    void submit();
  };

  return (
    <section
      className="relative isolate mx-auto flex min-h-[36rem] w-full max-w-[35rem] flex-col overflow-hidden rounded-2xl bg-black/85 shadow-2xl ring-1 ring-white/10"
      data-amu-magazine-tutors="true"
      aria-label="Tutors 기사 연결 대화"
    >
      <ChatBackground
        character={character}
        userName=""
        showUserCharacter={false}
        npcSrc={profileImage || null}
        userSrc={null}
      />
      <div className="absolute inset-0 z-0 bg-gradient-to-b from-black/35 via-black/50 to-black/80" aria-hidden="true" />

      <div className="relative z-10 flex min-h-[36rem] flex-1 flex-col overflow-hidden">
        <CharacterChatHeader
          character={character}
          npcSprite={character.sprite || null}
          npcPortraitSrc={profileImage || null}
          currentPersonaData={null}
          systemCodes={null}
        />

        {showTutorPicker ? (
          <div className="mx-4 mt-2 rounded-xl border border-white/15 bg-black/30 px-3 py-2.5 text-white backdrop-blur-sm">
            <div className="flex items-center justify-between gap-3">
              <p className="text-xxs font-semibold uppercase tracking-[0.16em] text-white/65">튜터 선택</p>
              <p className="text-xxs text-white/50">
                {tutorsLoading ? "목록을 불러오는 중" : `${tutorOptions.length}명`}
              </p>
            </div>

            {tutorsLoading ? (
              <div className="mt-2 h-12 animate-pulse rounded-lg bg-white/10" aria-busy="true" />
            ) : (
              <div
                role="listbox"
                aria-label="기사에서 대화할 튜터 선택"
                className="mt-2 flex max-w-full gap-2 overflow-x-auto pb-1 scrollbar-ghost"
              >
                {tutorOptions.map((option) => {
                  const selected = option.pid === activePersonaId;
                  const sourceLabel = option.source === "mine" ? "내 튜터" : option.source === "public" ? "공개" : "기본";

                  return (
                    <button
                      key={option.pid}
                      type="button"
                      role="option"
                      aria-selected={selected}
                      aria-label={`${option.name} ${sourceLabel} 튜터 선택`}
                      disabled={status === "loading"}
                      onClick={() => handleTutorSelect(option)}
                      className={`relative flex min-h-11 min-w-[9.5rem] shrink-0 items-center gap-2 rounded-lg border px-2.5 py-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] motion-reduce:transition-none ${
                        selected
                          ? "border-[var(--accent)] bg-[var(--accent)]/20"
                          : "border-white/15 bg-black/20 hover:border-white/35 hover:bg-white/10"
                      }`}
                    >
                      <TutorOptionAvatar option={option} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold text-white">{option.name}</span>
                        <span className="mt-0.5 block truncate text-xxs text-white/55">{sourceLabel} 튜터</span>
                      </span>
                      {selected ? <Check className="size-4 shrink-0 text-[var(--accent)]" aria-hidden="true" /> : null}
                    </button>
                  );
                })}
              </div>
            )}

            {tutorsLoadFailed ? (
              <p className="mt-2 text-xs leading-5 text-white/60" role="status">
                튜터 목록을 불러오지 못해 기사 기본 튜터로 시작합니다.
              </p>
            ) : null}
          </div>
        ) : null}

        <div className="mx-4 mt-2 rounded-xl border border-white/15 bg-black/30 px-3 py-2.5 text-sm text-white/85 backdrop-blur-sm">
          <p className="text-xxs font-semibold uppercase tracking-[0.16em] text-white/60">기사에서 이어서 묻기</p>
          <p className="mt-1 leading-6">{articleQuestion}</p>
        </div>

        <div
          ref={messagesContainerRef}
          className="character-chat-messages min-h-0 flex-1 overflow-y-auto p-4 flex flex-col gap-3 relative scrollbar-ghost"
          aria-live="polite"
        >
          {messages.length === 0 ? (
            <div className="mt-auto space-y-3">
              <p className="text-center text-sm leading-6 text-white/70">이 기사에서 다룬 기준을 내 상황에 맞춰 물어보세요.</p>
            </div>
          ) : null}

          {messages.map((item, index) => (
            <ChatMessageBubble
              key={item.id}
              message={item}
              viewMode="visual"
              isLast={index === messages.length - 1}
              characterName={character.name}
              npcSprite={character.sprite || null}
              npcPortraitSrc={profileImage || null}
              isInitialized
              autoAiResponse={false}
              hasUserMessages={messages.some((candidate) => candidate.isUser)}
              showInlinePrompt={false}
              isUserMessageAnimating={false}
              onUserMessageAnimationComplete={() => undefined}
              scrollToBottom={() => undefined}
              renderTalkContent={(text) => <span className="whitespace-pre-wrap">{text}</span>}
              playbackState={IDLE_PLAYBACK_STATE}
              onTogglePlayback={() => undefined}
            />
          ))}

          {status === "loading" ? (
            <div className="message relative max-w-[80%] self-start" role="status" aria-label="답변을 준비하고 있습니다">
              <div className="relative rounded-[1.15rem] rounded-tl-none bg-background/90 p-4 text-xl text-foreground shadow-[0_1px_3px_rgba(0,0,0,0.35)]">
                <span className="inline-flex items-center gap-1" aria-hidden="true">
                  <span className="size-2 animate-loading-dot rounded-full bg-current" />
                  <span className="size-2 animate-loading-dot rounded-full bg-current" style={{ animationDelay: "150ms" }} />
                  <span className="size-2 animate-loading-dot rounded-full bg-current" style={{ animationDelay: "300ms" }} />
                </span>
              </div>
            </div>
          ) : null}
        </div>

        <div className="character-chat-input-container px-4 pt-3 pb-4">
          <ConversationHintBar
            hints={RECOMMENDED_QUESTIONS}
            disabled={status === "loading"}
            onPick={setMessage}
          />
          <div className="flex items-end gap-2 rounded-full bg-black/40 p-2 shadow-[0_1px_0_rgba(255,255,255,0.1)]">
            <textarea
              value={message}
              onChange={(event) => {
                const nextMessage = event.target.value;
                setMessage(nextMessage);
                setPendingRequest((current) => (current && current.message !== nextMessage.trim() ? null : current));
                if (status === "error") setStatus("idle");
              }}
              onKeyDown={handleInputKeyDown}
              placeholder="대화를 입력하세요."
              aria-label="Tutors 질문"
              rows={1}
              disabled={status === "loading"}
              className="min-h-12 max-h-36 flex-1 resize-none overflow-y-auto bg-transparent px-3 py-3 text-lg text-white outline-none placeholder:text-white/35"
            />
            <Button
              type="button"
              variant="accent"
              rounded="full"
              size="icon-lg"
              onClick={() => void submit()}
              disabled={!message.trim() || status === "loading"}
              aria-label="질문 보내기"
            >
              <Send className="icon-xs" aria-hidden="true" />
            </Button>
          </div>
          {status === "error" ? (
            <p role="alert" className="mt-2 px-2 text-sm leading-6 text-red-200">
              로그인했거나 선택한 튜터를 사용할 수 있을 때 질문할 수 있습니다. 다시 시도하거나 본문 기준으로 계속 확인해 주세요.
            </p>
          ) : null}
          <button
            type="button"
            onClick={onReturn}
            className="mt-2 inline-flex min-h-11 items-center gap-1 px-2 text-sm text-white/75 underline underline-offset-4 transition-colors hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80"
          >
            <ArrowLeft className="size-4" aria-hidden="true" />
            본문 기준으로 돌아가기
          </button>
        </div>
      </div>
    </section>
  );
}
