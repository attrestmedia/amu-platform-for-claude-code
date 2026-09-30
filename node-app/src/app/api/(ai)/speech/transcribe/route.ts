import { NextResponse } from "next/server";
import { withAuth } from "libs/server-utils/api/apiMiddleware";
import { withApiTimeout } from "libs/server-utils/api/withApiTimeout";
import {
  analyzeSpeechAudio,
  assertVoiceDataConsentOrThrow,
  preflightSpeechAudioAnalysis,
  preflightTranscribeSpeech,
  resolveVoiceDataConsent,
  transcribeSpeech,
} from "libs/server-utils/audio";
import {
  buildSpeechBillingContext,
  normalizeOptionalSpeechNumber,
  normalizeOptionalSpeechProvider,
  normalizeOptionalSpeechString,
  resolveSpeechRouteContext,
} from "libs/server-utils/audio/routeUtils";
import {
  evaluateTutorsSttSafety,
  getDefaultTutorsSttSafetyPolicy,
} from "libs/server-utils/audio/tutorsSttSafety";
import {
  assertTutorsSttDailyLimitOrThrow,
  type TutorsSttDailyLimitDecision,
} from "libs/server-utils/audio/tutorsSttDailyLimit";
import {
  resolveTutorsSttServerPolicy,
  runTutorsOpenAiStt,
} from "libs/server-utils/audio/tutorsOpenAiStt";
import { getSpeechRuntimeControls } from "libs/server-utils/system/speechRuntimeControls";
import { normalizeRouteHint } from "utils/normalize";
import { logger } from "utils/log";
import { QWEN_ASR_MODEL, assertQwenProviderCallReady } from "libs/server-utils/audio/providers/qwenSpeech";
import { QWEN_ASR_AUDIO_CONSENT_PURPOSE_ID } from "consts/legal/voiceDataConsent";

/**
 * @docHint
 * @purpose API 라우트((ai) / speech / transcribe) 기능 요청 처리
 * @process multipart 요청 파싱  인증/권한 검증  서버 검증 동의 판정  비용 사전검증  STT/gpt-audio 원음 분석 병렬 처리  JSON 응답 반환
 * @domain speech
 * @scope api
 */

export const runtime = "nodejs";

function normalizeVoiceIntent(value: FormDataEntryValue | null) {
  const raw = String(value || "").trim();
  if (raw === "pronunciation_assessment") return "pronunciation_assessment";
  return "chat_transcript";
}

function normalizeAudioRetention(value: FormDataEntryValue | null) {
  const raw = String(value || "").trim();
  if (raw === "short_ttl") return "short_ttl";
  return "transient";
}

function normalizeBooleanFlag(value: FormDataEntryValue | null) {
  return String(value || "").trim().toLowerCase() === "true";
}

export const POST = withAuth(
  async (_data, user, request) => {
    return withApiTimeout(async () => {
      const contentType = request.headers.get("content-type") || "";
      if (!contentType.toLowerCase().includes("multipart/form-data")) {
        return NextResponse.json(
          { error: "multipart/form-data 요청만 허용됩니다.", errorCode: "INVALID_CONTENT_TYPE" },
          { status: 400 },
        );
      }

      const form = await request.formData();
      const routeHint = normalizeRouteHint(form.get("routeHint"));
      if (routeHint === "tutors") {
        const tutorsSafetyFile = form.get("file") || form.get("audio");
        // TUTORS-192: 하드코딩 닫힘을 서버 런타임 컨트롤 기반으로 전환한다. 설정 미비 시 resolver가 닫힘을 반환한다.
        // 런타임 컨트롤 조회 자체가 불가능한 경우에도 하드코딩 닫힘 기본값으로 fail-closed를 유지한다.
        const tutorsRuntimeControls = await getSpeechRuntimeControls();
        const tutorsPolicy = tutorsRuntimeControls
          ? resolveTutorsSttServerPolicy({ controls: tutorsRuntimeControls, user })
          : resolveTutorsSttServerPolicy(getDefaultTutorsSttSafetyPolicy());
        const tutorsSafetyDecision = evaluateTutorsSttSafety(tutorsPolicy, {
          provider: form.get("provider"),
          model: form.get("modelName") || form.get("model"),
          disclosureAcknowledged: normalizeBooleanFlag(form.get("disclosureAcknowledged")),
          disclosureVersion: form.get("disclosureVersion"),
          language: form.get("language"),
          fileSizeBytes:
            tutorsSafetyFile && typeof tutorsSafetyFile === "object" && "size" in tutorsSafetyFile
              ? Number((tutorsSafetyFile as File).size)
              : undefined,
        });
        // 서버 정책이 닫혀 있으면 byte를 읽기 전에 닫는다. duration_too_long만
        // adapter의 서버 bytes/decoder 검증 단계로 위임한다.
        if (!tutorsSafetyDecision.allowed) {
          if (tutorsSafetyDecision.outcome !== "duration_too_long") {
            return NextResponse.json(
              {
                error: "Tutors 음성 입력은 현재 텍스트 전용입니다.",
                errorCode: "TUTORS_SPEECH_GATE_CLOSED",
                fallback: "text_only",
                routeHint,
              },
              { status: 403 },
            );
          }
        }
        if (
          !tutorsSafetyFile ||
          typeof tutorsSafetyFile !== "object" ||
          !("arrayBuffer" in (tutorsSafetyFile as object))
        ) {
          return NextResponse.json({ error: "file 필드가 필요합니다.", errorCode: "AUDIO_FILE_REQUIRED" }, { status: 400 });
        }
        const tutorsFile = tutorsSafetyFile as File;
        // H2: 인증 uid·선택한 Tutors persona/session 소유권을 byte 처리·일일 한도보다 먼저 확인한다.
        // 이 경로가 기본 정책에서는 도달하지 않으므로 운영 provider 호출은 여전히 0건이다.
        const tutorsRouteContext = await resolveSpeechRouteContext({
          user,
          routeHintRaw: form.get("routeHint"),
          universeIdRaw: form.get("universeId"),
          npcIdRaw: form.get("npcId"),
          sessionIdRaw: form.get("sessionId"),
          clientIdRaw: form.get("userClientId") || form.get("clientId"),
          clientIdFieldLabel: "userClientId",
          rejectTutorsPersona: true,
        });

        // H2: 소유권 확인 뒤, byte read 이전에 서버 인증 uid 기준 사용자별 KST 일일
        // 카운터와 Redis 원자적 INCR/TTL을 확인한다.
        let tutorsDailyLimitDecision: TutorsSttDailyLimitDecision;
        try {
          // TUTORS-192: 일일 cap은 서버 런타임 컨트롤에서 온 값만 쓴다(클라이언트 주장 불신).
          tutorsDailyLimitDecision = await assertTutorsSttDailyLimitOrThrow({
            uid: user?.uid || user?.ID,
            maxRequestsPerUserPerDay: tutorsPolicy.maxRequestsPerUserPerDay,
          });
        } catch (error) {
          const limitStatus = Number((error as { status?: unknown })?.status);
          return NextResponse.json(
            {
              error: "Tutors 음성 입력은 현재 텍스트 전용입니다.",
              errorCode: "TUTORS_SPEECH_GATE_CLOSED",
              fallback: "text_only",
              routeHint,
              reasonCode: (error as { detail?: { outcome?: string } })?.detail?.outcome || "daily_limit_blocked",
            },
            { status: Number.isFinite(limitStatus) && limitStatus >= 400 ? limitStatus : 403 },
          );
        }

        const tutorsResult = await runTutorsOpenAiStt(
          {
            policy: tutorsPolicy,
            uid: user?.uid || user?.ID,
            request: {
              provider: form.get("provider"),
              model: form.get("modelName") || form.get("model"),
              disclosureAcknowledged: normalizeBooleanFlag(form.get("disclosureAcknowledged")),
              disclosureVersion: form.get("disclosureVersion"),
              language: form.get("language"),
              fileSizeBytes: tutorsFile.size,
            },
            file: {
              buffer: Buffer.from(await tutorsFile.arrayBuffer()),
              filename: tutorsFile.name,
              mimeType: tutorsFile.type,
              sizeBytes: tutorsFile.size,
              durationMs: normalizeOptionalSpeechNumber(form.get("durationMs")),
            },
            language: normalizeOptionalSpeechString(form.get("language"), 16) || undefined,
            billing: buildSpeechBillingContext({
              user,
              routeHint: "tutors",
              universeId: tutorsRouteContext.universeId,
              sessionId: tutorsRouteContext.sessionId,
              npcId: tutorsRouteContext.npcId,
              clientId: tutorsRouteContext.clientId,
              operation: "speech_transcribe",
            }),
            user,
          },
          // 일일 한도는 위에서 실제 카운터로 통과했다. adapter의 step(2)는 중복 차감 없이 같은 결정을 재사용한다.
          { assertDailyLimit: async () => tutorsDailyLimitDecision },
        );

        if (!tutorsResult.allowed) {
          // H1: adapter가 계산한 status(403/413/429/503)를 그대로 보존한다.
          // errorCode·fallback·reasonCode·닫힘 순서는 불변이다.
          return NextResponse.json(
            {
              error: "Tutors 음성 입력은 현재 텍스트 전용입니다.",
              errorCode: "TUTORS_SPEECH_GATE_CLOSED",
              fallback: "text_only",
              routeHint,
              reasonCode: tutorsResult.outcome,
            },
            { status: tutorsResult.status },
          );
        }

        return NextResponse.json(
          {
            transcript: tutorsResult.transcript,
            language: tutorsResult.language,
            confidence: tutorsResult.confidence,
            usage: tutorsResult.usage,
            billing: tutorsResult.billing,
            meta: {
              ...tutorsResult.meta,
              routeHint,
              universeId: tutorsRouteContext.universeId,
              npcId: tutorsRouteContext.npcId,
              sessionId: tutorsRouteContext.sessionId,
            },
          },
          { status: 200 },
        );
      }

      const voiceIntent = normalizeVoiceIntent(form.get("voiceIntent"));
      const requestedRetention = normalizeAudioRetention(form.get("audioRetention"));
      // 클라이언트가 보낸 동의 주장. 감사 기록용이며 판정 근거로 쓰지 않는다 (VOICE-001).
      const clientAssertedConsent = normalizeBooleanFlag(form.get("assessmentConsent"));

      if (voiceIntent === "pronunciation_assessment" && !clientAssertedConsent) {
        return NextResponse.json(
          {
            error: "발음 평가 원음 사용은 assessmentConsent=true 계약이 필요합니다.",
            errorCode: "VOICE_ASSESSMENT_CONSENT_REQUIRED",
          },
          { status: 400 },
        );
      }

      const routeContext = await resolveSpeechRouteContext({
        user,
        routeHintRaw: form.get("routeHint"),
        universeIdRaw: form.get("universeId"),
        npcIdRaw: form.get("npcId"),
        sessionIdRaw: form.get("sessionId"),
        clientIdRaw: form.get("userClientId") || form.get("clientId"),
        clientIdFieldLabel: "userClientId",
        rejectTutorsPersona: true,
      });

      const transcriptionProvider = normalizeOptionalSpeechProvider(
        form.get("provider") || routeContext.universeMetadata?.voiceConfig?.defaultSttProvider,
      );
      const transcriptionModelName =
        normalizeOptionalSpeechString(
          form.get("modelName") || form.get("model") || routeContext.universeMetadata?.voiceConfig?.defaultSttModel,
          120,
        ) || undefined;
      if (transcriptionProvider === "qwen") {
        await assertQwenProviderCallReady({
          modelName: transcriptionModelName || QWEN_ASR_MODEL,
          modality: "audio",
          user,
          purposeId: QWEN_ASR_AUDIO_CONSENT_PURPOSE_ID,
        });
      }

      const fileValue = form.get("file") || form.get("audio");
      if (!fileValue || typeof fileValue !== "object" || !("arrayBuffer" in (fileValue as object))) {
        return NextResponse.json({ error: "file 필드가 필요합니다.", errorCode: "AUDIO_FILE_REQUIRED" }, { status: 400 });
      }

      const file = fileValue as File;
      const buffer = Buffer.from(await file.arrayBuffer());
      const voiceMaxSeconds = Number(routeContext.universeMetadata?.voiceConfig?.maxInputSeconds || 0);
      const maxDurationMs = voiceMaxSeconds > 0 ? voiceMaxSeconds * 1000 : undefined;
      const language = normalizeOptionalSpeechString(form.get("language"), 16) || undefined;
      const analysisContext = normalizeOptionalSpeechString(form.get("analysisContext"), 1200) || undefined;
      // 원음 이해 목적의 연령·미성년 보호 설정은 요청 필드가 아니라 서버 런타임 컨트롤에서만 읽는다.
      const voiceRuntimeControls = await getSpeechRuntimeControls();
      const speechFile = {
        buffer,
        filename: file.name,
        mimeType: file.type,
        sizeBytes: file.size,
        durationMs: normalizeOptionalSpeechNumber(form.get("durationMs")),
      };
      const transcriptionBilling = buildSpeechBillingContext({
        user,
        routeHint: routeContext.routeHint,
        universeId: routeContext.universeId,
        sessionId: routeContext.sessionId,
        npcId: routeContext.npcId,
        clientId: routeContext.clientId,
        operation: "speech_transcribe",
      });
      const audioAnalysisBilling = buildSpeechBillingContext({
        user,
        routeHint: routeContext.routeHint,
        universeId: routeContext.universeId,
        sessionId: routeContext.sessionId,
        npcId: routeContext.npcId,
        clientId: routeContext.clientId,
        operation: "speech_audio_analyze",
      });
      // 서버 검증 동의. 요청 필드가 아니라 저장된 동의 원장과 성인 eligibility로 판정한다.
      const voiceDataConsent = resolveVoiceDataConsent({
        user,
        intent: voiceIntent,
        requestedRetention,
        clientAsserted: clientAssertedConsent,
        audience: "unknown",
        minorProtectionReady: voiceRuntimeControls.tutorsStt.minorProtectionReady,
        allowUnknownAudience: voiceRuntimeControls.tutorsStt.allowUnknownAudience,
      });
      if (voiceIntent === "pronunciation_assessment" || requestedRetention === "short_ttl") {
        assertVoiceDataConsentOrThrow(voiceDataConsent);
      }
      // 보존 정책도 클라이언트 주장이 아니라 서버 판정 결과를 따른다.
      const audioRetention = voiceDataConsent.allowed ? requestedRetention : "transient";
      const shouldAnalyzeOriginalAudio =
        voiceIntent === "pronunciation_assessment" && voiceDataConsent.allowed;
      const transcriptionArgs = {
        provider: transcriptionProvider,
        modelName: transcriptionModelName,
        language,
        prompt: normalizeOptionalSpeechString(form.get("prompt"), 2000) || undefined,
        maxDurationMs,
        file: speechFile,
        billing: transcriptionBilling,
        user,
      };

      await preflightTranscribeSpeech(transcriptionArgs);
      if (shouldAnalyzeOriginalAudio) {
        await preflightSpeechAudioAnalysis({
          file: speechFile,
          maxDurationMs,
          billing: audioAnalysisBilling,
        });
      }

      const transcriptionPromise = transcribeSpeech(transcriptionArgs);
      const analysisPromise = shouldAnalyzeOriginalAudio
        ? analyzeSpeechAudio({
            file: speechFile,
            maxDurationMs,
            targetLanguage: language,
            conversationContext: analysisContext,
            billing: audioAnalysisBilling,
          }).catch((error) => {
            if (!(error as { audioAnalysisFallbackAllowed?: boolean })?.audioAnalysisFallbackAllowed) throw error;
            logger.warn("[speech/transcribe] gpt-audio 원음 분석 실패, STT 근거로 fallback:", error);
            return null;
          })
        : Promise.resolve(null);
      const [result, audioAnalysis] = await Promise.all([transcriptionPromise, analysisPromise]);
      const combinedBilling = audioAnalysis?.billing
        ? {
            ok: Boolean((result.billing?.ok ?? true) && audioAnalysis.billing.ok),
            coins: Math.max(0, Number(result.billing?.coins || 0)) + Math.max(0, Number(audioAnalysis.billing.coins || 0)),
          }
        : result.billing;

      return NextResponse.json(
        {
          ...result,
          billing: combinedBilling,
          meta: {
            ...result.meta,
            audioAnalysis: audioAnalysis?.assessment,
            audioAnalysisUsage: audioAnalysis?.usage,
            audioAnalysisMeta: audioAnalysis?.meta,
            routeHint: routeContext.routeHint,
            universeId: routeContext.universeId,
            npcId: routeContext.npcId,
            sessionId: routeContext.sessionId,
            userClientId: routeContext.clientId,
            voiceInput: {
              source: "microphone_upload",
              intent: voiceIntent,
              audioRetention,
              retentionTtlSeconds: audioRetention === "short_ttl" ? 300 : 0,
              audioForwarding: audioAnalysis ? "gpt_audio_direct" : "derived_acoustic_evidence",
              assessmentConsent: voiceDataConsent.allowed,
              consentSource: "server_verified",
              clientAssertedConsent,
              consentDecision: {
                allowed: voiceDataConsent.allowed,
                reasonCode: voiceDataConsent.reasonCode,
                consentVersion: voiceDataConsent.consentVersion,
                adultEligibility: voiceDataConsent.adultEligibility,
                evaluatedAt: voiceDataConsent.evaluatedAt,
              },
              requestedAudioRetention: requestedRetention,
              pronunciationAssessmentEnabled: Boolean(audioAnalysis),
              acousticEvidenceEnabled: Boolean(result.confidence || result.meta?.acousticEvidence),
            },
          },
        },
        { status: 200 },
      );
    }, 60000);
  },
  undefined,
  "speech/transcribe_post",
  {
    bodyParser: "none",
  },
);
