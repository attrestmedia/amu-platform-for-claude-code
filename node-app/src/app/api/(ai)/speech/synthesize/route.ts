import { NextResponse } from "next/server";
import { withAuth } from "libs/server-utils/api/apiMiddleware";
import { withApiTimeout } from "libs/server-utils/api/withApiTimeout";
import {
  buildMessageAudioMeta,
  persistResolvedPersonaVoiceProfile,
  resolveSpeechSynthesisContentType,
  resolveVoiceProfile,
  synthesizeSpeech,
} from "libs/server-utils/audio";
import { assertSpeechProviderCapabilityOrThrow } from "libs/server-utils/audio/speechProviderPolicy";
import {
  buildSpeechBillingContext,
  normalizeOptionalSpeechObject,
  normalizeOptionalSpeechNumber,
  normalizeOptionalSpeechProvider,
  normalizeOptionalSpeechString,
  resolveSpeechRouteContext,
} from "libs/server-utils/audio/routeUtils";
import { buildLegacyVoiceFingerprint } from "libs/server-utils/audio/cacheKeys";
import {
  buildChatVoiceStorageKey,
  getExistingVoiceAssetPlaybackUrl,
  resolveAudioExt,
  saveVoiceBufferToR2,
} from "libs/server-utils/audio/voiceAssetStorage";
import type { SpeechSynthesisFormat } from "libs/server-utils/audio/types";
import { createTextHash, toUnknownRecord } from "utils/common";

/**
 * @docHint
 * @purpose API 라우트((ai) / speech / synthesize) 기능 요청 처리
 * @process JSON 요청 파싱  인증/권한 검증  speech 합성 처리  JSON 응답 반환
 * @domain speech
 * @scope api
 */

export const runtime = "nodejs";

export const POST = withAuth(
  async (data, user) => {
    return withApiTimeout(async () => {
      const routeContext = await resolveSpeechRouteContext({
        user,
        routeHintRaw: data?.routeHint,
        universeIdRaw: data?.universeId,
        npcIdRaw: data?.npcId,
        sessionIdRaw: data?.sessionId,
        clientIdRaw: data?.assistantClientId || data?.clientId,
        clientIdFieldLabel: "assistantClientId",
        rejectTutorsPersona: true,
      });

      // EL-602: Tutors 응답 TTS는 비동기 job 경로가 소유한다. 기존 동기 /speech/synthesize로
      // 신규 OpenAI TTS를 포함한 provider 호출이 발생하지 않도록 서버에서 차단한다.
      if (routeContext.routeHint === "tutors") {
        return NextResponse.json(
          {
            error: "Tutors 음성 응답은 비동기 job 경로를 사용합니다.",
            errorCode: "TUTORS_TTS_JOB_REQUIRED",
            fallback: "text_only",
          },
          { status: 409 },
        );
      }

      const provider = normalizeOptionalSpeechProvider(
        data?.provider || routeContext.universeMetadata?.voiceConfig?.defaultTtsProvider,
      ) || "openai";
      if (provider === "qwen") {
        return NextResponse.json(
          { error: "현재 O1 단계에서는 OpenAI 음성만 지원합니다.", errorCode: "UNSUPPORTED_SPEECH_PROVIDER" },
          { status: 400 },
        );
      }
      const text = normalizeOptionalSpeechString(data?.text || data?.content || data?.message, 4096);
      if (!text) {
        return NextResponse.json({ error: "text가 필요합니다.", errorCode: "TTS_TEXT_REQUIRED" }, { status: 400 });
      }
      const format = (normalizeOptionalSpeechString(data?.format || data?.responseFormat, 16) || "mp3") as SpeechSynthesisFormat;
      const modelName =
        normalizeOptionalSpeechString(
          data?.modelName || data?.model || routeContext.universeMetadata?.voiceConfig?.defaultTtsModel,
          120,
        ) || undefined;
      const speed = normalizeOptionalSpeechNumber(data?.speed ?? routeContext.universeMetadata?.voiceConfig?.defaultTtsSpeed);
      const locale =
        normalizeOptionalSpeechString(data?.locale || routeContext.universeMetadata?.voiceConfig?.defaultLocale, 16) ||
        undefined;
      const voiceProfile = normalizeOptionalSpeechObject(data?.voiceProfile);
      const userRec = toUnknownRecord(user);
      if (provider === "elevenlabs") {
        // cache hit도 provider 활성화 게이트를 우회하지 않도록 cache 조회 전에 판정한다.
        await assertSpeechProviderCapabilityOrThrow({
          provider,
          modelName,
          role: "speech_tts",
          capability: "tts_http",
        });
      }
      const resolvedVoice = resolveVoiceProfile({
        provider,
        modelName,
        text,
        format,
        speed,
        locale,
        routeHint: routeContext.routeHint,
        persona: routeContext.persona,
        universeMetadata: routeContext.universeMetadata,
        voiceProfile,
      });
      const contentHash = createTextHash(text.normalize("NFC"));
      const cachedAudioMeta = buildMessageAudioMeta({
        assistantClientId: routeContext.clientId,
        voiceProfile: resolvedVoice,
        contentType: resolveSpeechSynthesisContentType(format),
        status: "ready",
        tenantScope: String(userRec.uid || userRec.ID || "").trim(),
        contentHash,
        format,
        speed,
        settings: resolvedVoice.settings,
        speechIntent: resolvedVoice.speechIntent,
      });
      const chatStorageKey = buildChatVoiceStorageKey({
        uid: String(userRec.uid || userRec.ID || "").trim(),
        routeHint: routeContext.routeHint,
        universeId: routeContext.universeId,
        npcId: routeContext.npcId,
        sessionId: routeContext.sessionId,
        cacheKey: cachedAudioMeta.cacheKey || routeContext.clientId,
        ext: resolveAudioExt("", format),
      });
      const cachedStorage = {
        driver: "r2" as const,
        access: "private" as const,
        bucket: String(process.env.R2_PRIVATE_BUCKET || "").trim(),
        key: chatStorageKey,
        temporary: true,
      };
      let cachedPlayback = await getExistingVoiceAssetPlaybackUrl(cachedStorage);
      let cachedMeta = cachedAudioMeta;
      if (!cachedPlayback?.url && provider === "openai") {
        // v2 fingerprint는 신규 축을 포함한다. 기존 OpenAI R2 자산은 읽기 호환만 유지한다.
        const legacyVoiceFingerprint = buildLegacyVoiceFingerprint(resolvedVoice);
        const legacyMeta = buildMessageAudioMeta({
          assistantClientId: routeContext.clientId,
          voiceProfile: { ...resolvedVoice, voiceFingerprint: legacyVoiceFingerprint },
          contentType: resolveSpeechSynthesisContentType(format),
          status: "ready",
        });
        const legacyStorage = {
          ...cachedStorage,
          key: buildChatVoiceStorageKey({
            uid: String(userRec.uid || userRec.ID || "").trim(),
            routeHint: routeContext.routeHint,
            universeId: routeContext.universeId,
            npcId: routeContext.npcId,
            sessionId: routeContext.sessionId,
            cacheKey: legacyMeta.cacheKey || routeContext.clientId,
            ext: resolveAudioExt("", format),
          }),
        };
        cachedPlayback = await getExistingVoiceAssetPlaybackUrl(legacyStorage);
        if (cachedPlayback?.url) {
          cachedStorage.key = legacyStorage.key;
          cachedMeta = legacyMeta;
        }
      }
      if (cachedPlayback?.url) {
        return NextResponse.json(
          {
            audioUrl: cachedPlayback.url,
            contentType: cachedMeta.contentType,
            durationMs: cachedMeta.durationMs,
            voice: {
              provider: resolvedVoice.provider,
              voiceId: resolvedVoice.voiceId,
              modelName: resolvedVoice.modelName,
              locale: resolvedVoice.locale,
            },
            usage: undefined,
            billing: { ok: true, coins: 0 },
            meta: {
              routeHint: routeContext.routeHint,
              universeId: routeContext.universeId,
              npcId: routeContext.npcId,
              sessionId: routeContext.sessionId,
              assistantClientId: routeContext.clientId,
              voiceFingerprint: cachedMeta.voiceFingerprint,
              audioCacheKey: cachedMeta.cacheKey,
              audioMeta: {
                ...cachedMeta,
                storage: cachedStorage,
              },
              resolvedVoice,
              voiceProfilePersisted: false,
              reused: true,
              audioUrlKind: cachedPlayback.urlKind,
            },
          },
          { status: 200 },
        );
      }

      const serviceResult = await synthesizeSpeech({
        provider,
        modelName,
        text,
        format,
        speed,
        locale,
        routeHint: routeContext.routeHint,
        persona: routeContext.persona,
        universeMetadata: routeContext.universeMetadata,
        voiceProfile,
        settings: resolvedVoice.settings,
        speechIntent: resolvedVoice.speechIntent,
        user,
        billing: buildSpeechBillingContext({
          user,
          routeHint: routeContext.routeHint,
          universeId: routeContext.universeId,
          sessionId: routeContext.sessionId,
          npcId: routeContext.npcId,
          clientId: routeContext.clientId,
          operation: "speech_synthesize",
        }),
      });
      const voiceProfilePersisted = await persistResolvedPersonaVoiceProfile({
        user,
        routeHint: routeContext.routeHint,
        universeId: routeContext.universeId,
        personaId: routeContext.npcId,
        persona: routeContext.persona,
        currentVoiceProfile: routeContext.persona?.voiceProfile,
        resolvedVoice: serviceResult.resolvedVoice,
      }).catch(() => false);
      const audioMeta = buildMessageAudioMeta({
        assistantClientId: routeContext.clientId,
        voiceProfile: serviceResult.resolvedVoice,
        contentType: serviceResult.contentType,
        bytes: serviceResult.bytes,
        durationMs: serviceResult.durationMs,
        status: "ready",
        tenantScope: String(userRec.uid || userRec.ID || "").trim(),
        contentHash,
        format,
        speed,
        settings: serviceResult.resolvedVoice.settings,
        speechIntent: serviceResult.resolvedVoice.speechIntent,
      });
      const storage = await saveVoiceBufferToR2({
        key: buildChatVoiceStorageKey({
          uid: String(userRec.uid || userRec.ID || "").trim(),
          routeHint: routeContext.routeHint,
          universeId: routeContext.universeId,
          npcId: routeContext.npcId,
          sessionId: routeContext.sessionId,
          cacheKey: audioMeta.cacheKey || routeContext.clientId,
          ext: resolveAudioExt(serviceResult.contentType, format),
        }),
        body: serviceResult.audioBuffer,
        contentType: serviceResult.contentType || "audio/mpeg",
        access: "private",
        temporary: true,
      });
      const playback = await getExistingVoiceAssetPlaybackUrl(storage);
      if (!playback?.url) throw new Error("VOICE_ASSET_PLAYBACK_URL_UNAVAILABLE");
      const resolvedAudioMeta = { ...audioMeta, storage };

      return NextResponse.json(
        {
          audioUrl: playback.url,
          contentType: serviceResult.contentType,
          durationMs: serviceResult.durationMs,
          voice: serviceResult.voice,
          usage: serviceResult.usage,
          billing: serviceResult.billing,
          meta: {
            ...serviceResult.meta,
            routeHint: routeContext.routeHint,
            universeId: routeContext.universeId,
            npcId: routeContext.npcId,
            sessionId: routeContext.sessionId,
            assistantClientId: routeContext.clientId,
            voiceFingerprint: resolvedAudioMeta.voiceFingerprint,
            audioCacheKey: resolvedAudioMeta.cacheKey,
            audioMeta: resolvedAudioMeta,
            resolvedVoice: serviceResult.resolvedVoice,
            voiceProfilePersisted,
            audioUrlKind: playback.urlKind,
          },
        },
        { status: 200 },
      );
    }, 30000);
  },
  undefined,
  "speech/synthesize_post",
  { bodyParser: "json" },
);
