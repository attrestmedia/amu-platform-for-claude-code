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
import { RETIRED_TUTORS_ROUTE_HINT } from "consts/app";
import { logger } from "utils/log";
import { QWEN_ASR_MODEL, assertQwenProviderCallReady } from "libs/server-utils/audio/providers/qwenSpeech";
import { QWEN_ASR_AUDIO_CONSENT_PURPOSE_ID } from "consts/legal/voiceDataConsent";
import {
  FEATURE_ACCESS_DENIED_ERROR_CODE,
  FEATURE_ACCESS_DENIED_MESSAGE,
  resolveFeatureAccess,
} from "libs/server-utils/auth/featureAccessPolicy";
import { VOICE_FEATURE_KEYS } from "consts/system/featureRollout";
import {
  PLAY_SPEECH_BUDGET_OWNER,
  resolvePlayCharacterChatSpeechCutover,
  resolvePlayCharacterChatSttRoleOrThrow,
} from "libs/server-utils/audio/playCharacterChatSpeechRole";

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
      if (String(form.get("routeHint") || "").trim() === RETIRED_TUTORS_ROUTE_HINT) {
        return NextResponse.json(
          {
            error: "Tutors 음성 입력은 현재 텍스트 전용입니다.",
            errorCode: "TUTORS_SPEECH_GATE_CLOSED",
            fallback: "text_only",
            routeHint: RETIRED_TUTORS_ROUTE_HINT,
          },
          { status: 403 },
        );
      }
      const voiceIntent = normalizeVoiceIntent(form.get("voiceIntent"));
      if (voiceIntent === "pronunciation_assessment") {
        const pronunciationAccess = await resolveFeatureAccess({
          featureKey: VOICE_FEATURE_KEYS.pronunciationAssessment,
          user,
        });
        if (!pronunciationAccess.allowed) {
          return NextResponse.json(
            { error: FEATURE_ACCESS_DENIED_MESSAGE, errorCode: FEATURE_ACCESS_DENIED_ERROR_CODE },
            { status: 403 },
          );
        }
      }
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
      });

      const speechCutover = await resolvePlayCharacterChatSpeechCutover({
        routeHint: routeContext.routeHint,
        user,
      });
      const playSttRole = speechCutover.cutover
        ? resolvePlayCharacterChatSttRoleOrThrow({
            requestedProvider: form.get("provider"),
            requestedModelName: normalizeOptionalSpeechString(form.get("modelName") || form.get("model"), 120),
          })
        : null;
      const requestedProvider = normalizeOptionalSpeechProvider(form.get("provider"));
      const configuredProvider = normalizeOptionalSpeechProvider(routeContext.universeMetadata?.voiceConfig?.defaultSttProvider);
      const transcriptionProvider = playSttRole?.provider ?? requestedProvider ??
        (configuredProvider === "openai" ? "elevenlabs" : configuredProvider) ?? "elevenlabs";
      const requestedModelName = normalizeOptionalSpeechString(form.get("modelName") || form.get("model"), 120) || undefined;
      const configuredModelName = configuredProvider === transcriptionProvider
        ? normalizeOptionalSpeechString(routeContext.universeMetadata?.voiceConfig?.defaultSttModel, 120) || undefined
        : undefined;
      const transcriptionModelName = playSttRole?.modelName ?? requestedModelName ?? configuredModelName;
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
      const speechFile = {
        buffer,
        filename: file.name,
        mimeType: file.type,
        sizeBytes: file.size,
        durationMs: normalizeOptionalSpeechNumber(form.get("durationMs")),
      };
      const transcriptionBillingContext = buildSpeechBillingContext({
        user,
        routeHint: routeContext.routeHint,
        universeId: routeContext.universeId,
        sessionId: routeContext.sessionId,
        npcId: routeContext.npcId,
        clientId: routeContext.clientId,
        operation: "speech_transcribe",
      });
      const transcriptionBilling = playSttRole
        ? {
            ...transcriptionBillingContext,
            meta: { ...transcriptionBillingContext.meta, budgetOwner: PLAY_SPEECH_BUDGET_OWNER },
          }
        : transcriptionBillingContext;
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
            user,
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
