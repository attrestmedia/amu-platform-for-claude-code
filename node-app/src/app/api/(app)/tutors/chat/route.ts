import { NextResponse } from "next/server";
import { withAuth } from "libs/server-utils/api/apiMiddleware";
import { withApiTimeout } from "libs/server-utils/api/withApiTimeout";
import { getModel } from "libs/database/modelCache";
import { UserSchema } from "models/user";
import type { IUserDocument } from "models/user";
import { MONGODB_USER_MODEL_PREFIX } from "consts/db";
import { handleUnifiedTextChatRequest } from "libs/server-utils/api/unifiedChat";
import { normalizeTutorsState } from "libs/services/tutors/tutorsState";
import { saveConversationMessageServer } from "libs/server-utils/chat/saveConversationMessage";
import { MONGODB_USERS_URL } from "consts/env/server";
import { toUnknownRecord } from "utils/common/typeUtils";
import { TUTORS_NAMESPACE_KEY } from "consts/app";
import { resolveChatModelPolicy } from "libs/server-utils/chat/chatModelPolicy";
import { resolveTutorPersonaReadAccess } from "libs/services/tutors/tutorGiftGrants";
import { normalizeTutorsChatImageInput } from "libs/server-utils/tutors/tutorsChatImageInput";
import { getMagazineEmbedSession } from "libs/server-utils/magazine/magazineEmbedSession";
import {
  evaluateTutorsAudioTurn,
  normalizeChatInputModality,
  resolveTutorsAudioTurnPolicy,
} from "libs/server-utils/audio";

/**
 * @docHint
 * @purpose API 라우트((app) / tutors / chat) 기능 요청 처리
 * @process 요청 요청 파싱  인증/권한 검증  핵심 처리  JSON 응답 반환
 * @domain tutors
 * @scope api
 */

// “주간 락”: KST 기준 다음 월요일 00:00까지 잠금
type UserDocumentWithTutorsSelection = Omit<IUserDocument, "selectedPersonas"> & {
  selectedPersonas?: Record<string, unknown>;
};

function nextMondayKstIso(now = new Date()) {
  const KST = 9 * 60 * 60 * 1000;
  const k = new Date(now.getTime() + KST);

  // 서버 런타임 타임존 영향을 제거하기 위해 UTC getter 사용
  const day = k.getUTCDay(); // 0 Sun ... 1 Mon
  const daysToNextMon = (8 - day) % 7 || 7;

  const next = new Date(k);
  next.setUTCDate(k.getUTCDate() + daysToNextMon);
  next.setUTCHours(0, 0, 0, 0);

  const utc = new Date(next.getTime() - KST);
  return utc.toISOString();
}

export const POST = withAuth(
  async (data, user) => {
    return withApiTimeout(async () => {
      const uid = String(user?.uid || "");
      if (!uid) return NextResponse.json({ error: "인증 정보가 없습니다." }, { status: 401 });

      const personaId = String(data?.personaId || data?.npcId || "").trim();
      const message = String(data?.message || "").trim();
      const sessionId = String(data?.sessionId || "").trim();
      const inputModality = normalizeChatInputModality(data?.inputModality);
      const embedSessionId = String(data?.embedSessionId || "").trim();
      // Tutors 메시지와 provider 과금의 멱등 키는 서버가 같은 userClientId에서 파생한다.
      // assistantClientId를 클라이언트 입력에 맡기면 재시도마다 assistant 문서가 새로 생길 수 있다.
      const userClientId = String(data?.userClientId || data?.clientId || "").trim() || crypto.randomUUID();
      const assistantClientId = `tutors-assistant:${userClientId}`.slice(0, 160);
      const magazineClientId = userClientId;
      const magazineSession = embedSessionId ? await getMagazineEmbedSession(embedSessionId).catch(() => null) : null;
      if (embedSessionId && (!magazineSession || magazineSession.serviceKey !== "tutors")) {
        return NextResponse.json(
          { error: "기사 연결 문맥이 만료되었거나 유효하지 않습니다.", errorCode: "MAGAZINE_CONTEXT_INVALID" },
          { status: 409 },
        );
      }
      // TUTORS-GATE-STT-DISCLOSURE가 닫힌 동안 음성 메타데이터는 서버 경계를 넘지 않는다.
      // 클라이언트가 보낸 원본 voiceInput은 prompt·응답·analytics에 사용하지 않는다.
      const voiceInputMeta = undefined;
      // 게이트 전 저장 허용 범위: 실제 음성 입력 여부만 서버가 재구성한다.
      // source 판별 외의 transcript·score·consent 등 클라이언트 메타데이터는 읽거나 저장하지 않는다.
      const rawVoiceInput = toUnknownRecord(data?.voiceInput);
      const voiceUsageMeta =
        rawVoiceInput.source === "microphone_transcript"
          ? ({ inputMode: "voice", voiceInputCount: 1 } as const)
          : undefined;

      if (!personaId)
        return NextResponse.json({ error: "personaId가 필요합니다.", errorCode: "PERSONA_REQUIRED" }, { status: 400 });
      if (!message)
        return NextResponse.json({ error: "message가 비어있습니다.", errorCode: "MESSAGE_REQUIRED" }, { status: 400 });
      if (!sessionId)
        return NextResponse.json({ error: "sessionId가 필요합니다.", errorCode: "SESSION_REQUIRED" }, { status: 400 });

      // user doc 로드 (tutors 상태 검증 + 락 업데이트)
      const modelKey = `${MONGODB_USER_MODEL_PREFIX}${uid}`;
      const UserModel = await getModel<IUserDocument>(MONGODB_USERS_URL, modelKey, UserSchema, modelKey);
      const doc = await UserModel.findOne({ uid });
      if (!doc) return NextResponse.json({ error: "유저 데이터를 찾을 수 없습니다." }, { status: 404 });

      const userDoc = doc as UserDocumentWithTutorsSelection;
      const docSelectedPersonas = toUnknownRecord(userDoc.selectedPersonas);
      const tutorsState = normalizeTutorsState(toUnknownRecord(docSelectedPersonas.tutors));
      const selected = tutorsState.selected.find((p) => p.personaId === personaId);

      if (!selected && !magazineSession) {
        return NextResponse.json(
          { error: "선택되지 않은 선생님입니다. 먼저 선택해주세요.", errorCode: "TUTORS_PERSONA_NOT_SELECTED" },
          { status: 400 },
        );
      }

      const resolvedAccess = await resolveTutorPersonaReadAccess(user, personaId);
      if (!resolvedAccess.persona || !resolvedAccess.access) {
        return NextResponse.json(
          { error: "접근할 수 없는 선생님입니다.", errorCode: "TUTORS_PERSONA_ACCESS_DENIED" },
          { status: 403 },
        );
      }

      // Article Experience는 기사에 고정된 기본 튜터 외에도, 공개 템플릿과
      // 현재 사용자가 만든 튜터만 선택할 수 있다. 선물·임의 외부 persona는 차단한다.
      if (magazineSession && magazineSession.contextKey !== personaId) {
        const selectable = resolvedAccess.access.kind === "public" || resolvedAccess.access.kind === "owner";
        if (!selectable) {
          return NextResponse.json(
            { error: "기사에서 선택할 수 없는 튜터입니다.", errorCode: "MAGAZINE_PERSONA_NOT_ALLOWED" },
            { status: 403 },
          );
        }
      }

      const universeId = String(selected?.universeId || resolvedAccess.persona.universeId || "").trim();
      if (!universeId) {
        return NextResponse.json(
          { error: "선생님의 universeId가 비어있습니다.", errorCode: "TUTORS_UNIVERSE_MISSING" },
          { status: 500 },
        );
      }

      const imageInput = await normalizeTutorsChatImageInput(data?.imageInput);

      const resolvedModel = await resolveChatModelPolicy({
        uid,
        service: "tutors",
        actor: { user },
        universeId,
        personaId,
        tutorsState,
        allowUnselectedTutor: Boolean(magazineSession),
        inputModality,
      });

      if (inputModality === "audio") {
        const audioCapableModelKeys = resolvedModel.options
          .filter((option) => option.state === "available" && option.audioEligible)
          .map((option) => option.key);
        // resolveChatModelPolicy has already read and normalized the same server gate. Its
        // reason distinguishes a closed gate from an open gate with no eligible model, so
        // this route can reuse that decision without a second settings read.
        const audioTurnPolicy = resolveTutorsAudioTurnPolicy({
          enabled:
            resolvedModel.audioTurnAvailable || resolvedModel.audioTurnReasonCode === "no_audio_capable_model",
        });
        const decision = evaluateTutorsAudioTurn(audioTurnPolicy, {
          inputModality,
          selectedModel: resolvedModel.selected,
          audioCapableModelKeys,
        });
        if (!decision.allowed) {
          return NextResponse.json(
            {
              error: "음성 대화 모드는 아직 준비 중입니다.",
              errorCode: "TUTORS_AUDIO_TURN_GATE_CLOSED",
              fallback: "text_only",
              reasonCode: decision.outcome,
            },
            { status: 403 },
          );
        }
      }

      // 서버 권위 주입용: composeSystemPromptOrThrow에서 활용할 수 있게 서버에서만 심어줌
      const serverUser = {
        ...toUnknownRecord(user),
        __tutorsState: tutorsState,
        __tutorsPersonaAccess: {
          kind: resolvedAccess.access.kind,
          sourceCollection: resolvedAccess.access.sourceCollection,
        },
      };

      // UnifiedChat 호출 (routeHint 강제)
      const unified = await handleUnifiedTextChatRequest(
        resolvedModel.selected.provider,
        {
          ...data,
          provider: resolvedModel.selected.provider,
          modelName: resolvedModel.selected.modelName,
          routeHint: "tutors",
          universeId,
          npcId: personaId,
          message,
          inputModality,
          voiceInput: voiceInputMeta,
          imageInput,
          ...(magazineSession
            ? {
                operationId: `magazine:tutors:${embedSessionId}:${magazineClientId}`.slice(0, 240),
                magazineContext: {
                  source: "article-experience",
                  title: magazineSession.articleContext?.title || (magazineSession.contentRef.kind === "wp_post" ? magazineSession.contentRef.postSlug : magazineSession.contentRef.slug),
                  question: magazineSession.articleContext?.question || "",
                  sectionId: magazineSession.sectionId,
                  returnSectionId: magazineSession.returnSectionId,
                },
              }
            : { operationId: `tutors:chat:${uid}:${sessionId}:${userClientId}`.slice(0, 240) }),
          // history는 data.history 그대로 전달(서버 sanitize가 이미 있음)
        },
        serverUser,
      );

      // (중요) 여기서부터는 “저장 실패가 재시도 과금 중복”으로 이어질 수 있음
      // => 저장 실패는 throw하지 말고 meta로 내려서 “저장만 재시도”하게 만드는 게 안전함

      const nowIso = new Date().toISOString();

      let saveOk = true;

      try {
        // user message save
        const r1 = await saveConversationMessageServer({
          user,
          personaId,
          userPersonaId: TUTORS_NAMESPACE_KEY,
          sessionId,
          message: {
            role: "user",
            content: message,
            clientId: userClientId,
            timestamp: nowIso,
            voiceInput: voiceUsageMeta,
          },
          location: "tutors",
        });
        if (!r1.ok) saveOk = false;

        // assistant message save
        const r2 = await saveConversationMessageServer({
          user,
          personaId,
          userPersonaId: TUTORS_NAMESPACE_KEY,
          sessionId,
          message: {
            role: "assistant",
            content: unified?.result ?? "",
            clientId: assistantClientId,
            timestamp: nowIso,
            translation: unified?.translation,
            systemCode: unified?.systemCode || [],
            productCode: unified?.productCode || [],
          },
          location: "tutors",
          relationshipUpdate: { intimacyDeltaHint: true },
        });
        if (!r2.ok) saveOk = false;
      } catch {
        saveOk = false;
      }

      // 첫 대화 락만 적용한다. 학습일은 유효 세션 종료 정산에서 기록한다.
      let lockApplied = false;
      try {
        const nextState = normalizeTutorsState(toUnknownRecord(toUnknownRecord(userDoc.selectedPersonas).tutors));
        const t = nextState.selected.find((p) => p.personaId === personaId);
        if (t) {
          if (!t.firstChatAt) {
            t.firstChatAt = nowIso;
            t.lockedUntil = nextMondayKstIso(new Date());
            t.lockReason = "first_chat_weekly_lock";
            lockApplied = true;
          }

          userDoc.selectedPersonas = {
            ...toUnknownRecord(userDoc.selectedPersonas),
            tutors: nextState,
          };
          doc.markModified("selectedPersonas");
          await doc.save();
        }
      } catch {
        lockApplied = false;
      }

      // IAiResponse 형태로 응답 (클라 호환성)
      return NextResponse.json(
        {
          ok: true,
          result: unified?.result ?? "",
          content: unified?.result ?? "",
          isError: false,
          model: unified?.model,
          usage: unified?.usage,
          billing: unified?.billing,
          translation: unified?.translation,
          systemCode: unified?.systemCode || [],
          productCode: unified?.productCode || [],
          isValidJson: unified?.isValidJson,
          meta: {
            saveOk,
            lockApplied,
            modelResolution: resolvedModel.selected,
            tutorsPersonaId: personaId,
            tutorsUniverseId: universeId,
            userClientId,
            assistantClientId,
            voiceInput: voiceInputMeta,
            imageAttached: Boolean(imageInput),
          },
        },
        { status: 200 },
      );
    }, 20000);
  },
  undefined,
  "tutors/chat_post",
);
