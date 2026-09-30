import "server-only";
import {
  ELEVENLABS_DEFAULT_TTS_MODEL,
  ELEVENLABS_TTS_SPEED_RANGE,
  ELEVENLABS_APPROVED_VOICE_CATALOG,
  OPENAI_APPROVED_VOICE_CATALOG,
  OPENAI_DEFAULT_TTS_MODEL,
  getOpenAiVoiceCatalogForGenderHint,
  getOpenAiVoiceCatalogEntry,
  getOpenAiVoiceGenderTag,
  resolveOpenAiVoiceGenderHint,
} from "consts/ai/voiceCatalog";
import type { IOpenAiVoiceCatalogEntry } from "consts/ai/voiceCatalog";
import { buildVoiceFingerprint } from "./cacheKeys";
import { createSpeechError } from "./guards";
import type { IResolvedVoiceProfile, ISpeechSynthesizeRequest } from "./types";

type WeightedVoiceTag = {
  tag: string;
  weight: number;
  reason: string;
};

const KEYWORD_TAG_RULES = [
  {
    tag: "mentor",
    weight: 3,
    keywords: ["teacher", "tutor", "mentor", "coach", "교사", "선생", "튜터", "멘토", "가이드", "설명"],
    reason: "교육/가이드 성격",
  },
  {
    tag: "scholarly",
    weight: 3,
    keywords: ["professor", "scholar", "research", "intellectual", "학자", "교수", "연구", "지적", "분석"],
    reason: "지적/연구 성향",
  },
  {
    tag: "warm",
    weight: 2,
    keywords: ["kind", "warm", "gentle", "caring", "다정", "따뜻", "친절", "배려"],
    reason: "따뜻한 상호작용 성향",
  },
  {
    tag: "calm",
    weight: 2,
    keywords: ["calm", "quiet", "steady", "차분", "평온", "안정", "침착"],
    reason: "차분한 분위기",
  },
  {
    tag: "bright",
    weight: 2,
    keywords: ["bright", "cheerful", "friendly", "명랑", "밝", "유쾌", "친근"],
    reason: "밝고 친근한 분위기",
  },
  {
    tag: "energetic",
    weight: 2,
    keywords: ["energetic", "passionate", "active", "열정", "활발", "에너지"],
    reason: "에너지 높은 캐릭터",
  },
  {
    tag: "playful",
    weight: 2,
    keywords: ["playful", "fun", "mischief", "장난", "재미", "발랄"],
    reason: "놀이성/경쾌함",
  },
  {
    tag: "dramatic",
    weight: 3,
    keywords: ["hero", "villain", "epic", "dramatic", "영웅", "악당", "전설", "극적"],
    reason: "극적 세계관",
  },
  {
    tag: "mysterious",
    weight: 3,
    keywords: ["mysterious", "secret", "shadow", "mystic", "신비", "비밀", "그림자", "마법"],
    reason: "신비/미스터리 성향",
  },
  {
    tag: "authoritative",
    weight: 2,
    keywords: ["leader", "commander", "boss", "captain", "리더", "지휘", "권위", "통솔"],
    reason: "권위/리더십 성향",
  },
  {
    tag: "soft",
    weight: 1,
    keywords: ["soft", "elegant", "graceful", "부드", "우아", "섬세"],
    reason: "부드럽고 섬세한 표현",
  },
  {
    tag: "serious",
    weight: 2,
    keywords: ["serious", "stoic", "cold", "진지", "엄격", "냉정"],
    reason: "무게감 있는 캐릭터",
  },
  {
    tag: "clear",
    weight: 3,
    keywords: ["clear", "precise", "professional", "명확", "정확", "전문"],
    reason: "명확한 발화 선호",
  },
] as const;

function uniq(list: string[]) {
  return Array.from(new Set(list.filter(Boolean)));
}

function inferLocale(args: ISpeechSynthesizeRequest) {
  const fromRequest = String(args.locale || "").trim().toLowerCase();
  if (fromRequest) return fromRequest;

  const fromUniverse = String(args.universeMetadata?.voiceConfig?.defaultLocale || "").trim().toLowerCase();
  if (fromUniverse) return fromUniverse;

  const fromPersona = String(args.persona?.language || "").trim().toLowerCase();
  if (fromPersona.includes("ko") || fromPersona.includes("korean") || fromPersona.includes("한국")) return "ko";
  if (fromPersona.includes("ja") || fromPersona.includes("japanese") || fromPersona.includes("일본")) return "ja";
  if (fromPersona.includes("en") || fromPersona.includes("english") || fromPersona.includes("영어")) return "en";

  return "ko";
}

function collectPersonaText(args: ISpeechSynthesizeRequest) {
  const persona = args.persona;
  return [
    persona?.name,
    persona?.summary,
    persona?.personality,
    persona?.background,
    persona?.job,
    persona?.tutorIntro,
    persona?.values,
    persona?.preferences,
    persona?.species,
    persona?.specialAbilities,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function pushWeightedTag(collection: WeightedVoiceTag[], tag: string, weight: number, reason: string) {
  const normalizedWeight = Number.isFinite(weight) ? Math.max(1, Math.round(weight)) : 1;
  const existing = collection.find((item) => item.tag === tag && item.reason === reason);
  if (existing) {
    existing.weight = Math.max(existing.weight, normalizedWeight);
    return;
  }
  collection.push({ tag, weight: normalizedWeight, reason });
}

function collectTargetTags(args: ISpeechSynthesizeRequest) {
  const weightedTags: WeightedVoiceTag[] = [];
  const reasons: string[] = [];
  const personaText = collectPersonaText(args);
  const personaType = String(args.persona?.personaType || "").trim().toLowerCase();
  const genderHint = args.routeHint === "tutors" ? resolveOpenAiVoiceGenderHint(args.persona?.gender) : undefined;
  const tutorsPolicy = args.persona?.tutorsPolicy && typeof args.persona.tutorsPolicy === "object" ? args.persona.tutorsPolicy : null;

  if (args.routeHint === "tutors") {
    pushWeightedTag(weightedTags, "mentor", 5, "Tutors 기본 음성 톤");
    pushWeightedTag(weightedTags, "clear", 4, "Tutors 기본 음성 톤");
    pushWeightedTag(weightedTags, "scholarly", 4, "Tutors 기본 음성 톤");
    pushWeightedTag(weightedTags, "warm", 3, "Tutors 기본 음성 톤");
    pushWeightedTag(weightedTags, "calm", 2, "Tutors 기본 음성 톤");
    reasons.push("Tutors 기본 음성 톤");
  } else if (args.routeHint === "commerce") {
    pushWeightedTag(weightedTags, "clear", 4, "Commerce 응대 기본 톤");
    pushWeightedTag(weightedTags, "warm", 3, "Commerce 응대 기본 톤");
    pushWeightedTag(weightedTags, "authoritative", 2, "Commerce 응대 기본 톤");
    reasons.push("Commerce 응대 기본 톤");
  } else {
    pushWeightedTag(weightedTags, "expressive", 3, "Play/AI 대화 기본 톤");
    pushWeightedTag(weightedTags, "warm", 2, "Play/AI 대화 기본 톤");
    reasons.push("Play/AI 대화 기본 톤");
  }

  const genderTag = getOpenAiVoiceGenderTag(genderHint);
  if (genderTag) {
    pushWeightedTag(weightedTags, genderTag, 8, "튜터 성별 표현");
    reasons.push("튜터 성별 표현");
  }

  if (args.routeHint === "tutors") {
    const policyRec = (tutorsPolicy || {}) as Record<string, unknown>;
    const operationMode = String(policyRec.operationMode || "").trim().toLowerCase();
    const correctionStrength = Number(policyRec.correctionStrength);

    if (operationMode === "proofread") {
      pushWeightedTag(weightedTags, "clear", 4, "교정 중심 Tutors 모드");
      pushWeightedTag(weightedTags, "serious", 2, "교정 중심 Tutors 모드");
    } else if (operationMode === "coach") {
      pushWeightedTag(weightedTags, "mentor", 4, "코칭형 Tutors 모드");
      pushWeightedTag(weightedTags, "warm", 2, "코칭형 Tutors 모드");
    } else if (operationMode === "chat") {
      pushWeightedTag(weightedTags, "bright", 2, "대화형 Tutors 모드");
    }

    if (Number.isFinite(correctionStrength) && correctionStrength >= 2) {
      pushWeightedTag(weightedTags, "clear", 3, "강한 교정 강도");
      pushWeightedTag(weightedTags, "scholarly", 2, "강한 교정 강도");
    }
  } else if (args.routeHint === "ai") {
    if (personaType === "monster") {
      pushWeightedTag(weightedTags, "mysterious", 4, "몬스터 캐릭터 기본 톤");
      pushWeightedTag(weightedTags, "dramatic", 3, "몬스터 캐릭터 기본 톤");
    } else {
      pushWeightedTag(weightedTags, "expressive", 2, "플레이 캐릭터 기본 톤");
    }
  }

  for (const rule of KEYWORD_TAG_RULES) {
    if (!rule.keywords.some((keyword) => personaText.includes(keyword))) continue;
    pushWeightedTag(weightedTags, rule.tag, rule.weight, rule.reason);
    reasons.push(rule.reason);
  }

  const tagWeights = weightedTags.reduce<Record<string, number>>((acc, item) => {
    acc[item.tag] = Math.max(acc[item.tag] || 0, item.weight);
    return acc;
  }, {});

  return {
    tags: Object.keys(tagWeights),
    tagWeights,
    reasons: uniq(reasons),
  };
}

function resolveElevenLabsVoiceProfile(args: ISpeechSynthesizeRequest): IResolvedVoiceProfile {
  const requested = args.voiceProfile || args.persona?.voiceProfile || {};
  const voiceId = String(requested.voiceId || "").trim();
  if (!voiceId) {
    throw createSpeechError("ElevenLabs voiceId가 필요합니다.", "VOICE_ID_REQUIRED", 400, {
      provider: "elevenlabs",
    });
  }
  if (!/^[A-Za-z0-9_-]{8,128}$/.test(voiceId)) {
    throw createSpeechError("ElevenLabs voiceId 형식이 올바르지 않습니다.", "UNSUPPORTED_VOICE_ID", 400, { voiceId });
  }

  // 계정 voice의 권리·소유 범위를 확인할 수 없는 동안에는 실제 승인 목록을 비워 둔다.
  // EL-201/G-EL-LEGAL-DESIGN이 해소되기 전 arbitrary upstream ID를 승인하지 않는다.
  const approved = ELEVENLABS_APPROVED_VOICE_CATALOG.find((entry) => entry.voiceId === voiceId);
  if (!approved) {
    throw createSpeechError("아직 승인되지 않은 ElevenLabs voiceId 입니다.", "VOICE_NOT_APPROVED", 503, {
      provider: "elevenlabs",
      voiceId,
    });
  }

  const requestedLocale = String(requested.locale || args.locale || "ko").trim();
  const requestedLanguage = requestedLocale.toLowerCase().split("-")[0];
  const localeSupported = approved.locales.some((locale) => {
    const normalizedLocale = String(locale).toLowerCase();
    return normalizedLocale === requestedLocale.toLowerCase() || normalizedLocale.split("-")[0] === requestedLanguage;
  });
  if (approved.locales.length > 0 && !localeSupported) {
    throw createSpeechError("선택한 ElevenLabs voice가 요청 언어를 지원하지 않습니다.", "VOICE_LOCALE_NOT_SUPPORTED", 400, {
      voiceId,
      locale: requestedLocale,
    });
  }
  const settings = requested.settings || args.settings || {};
  const speed = Number(requested.speed ?? args.speed ?? settings.speed ?? 1);
  if (!Number.isFinite(speed) || speed < ELEVENLABS_TTS_SPEED_RANGE.min || speed > ELEVENLABS_TTS_SPEED_RANGE.max) {
    throw createSpeechError("ElevenLabs speed는 0.7에서 1.2 사이여야 합니다.", "INVALID_VOICE_SETTINGS", 400);
  }
  const modelName = String(requested.modelName || args.modelName || ELEVENLABS_DEFAULT_TTS_MODEL).trim();
  const locale = requestedLocale;
  const profile: IResolvedVoiceProfile = {
    provider: "elevenlabs",
    voiceId,
    modelName,
    locale,
    instructions: String(requested.instructions || "").trim() || undefined,
    voiceRevision: approved.voiceRevision,
    provenance: "approved_catalog",
    rightsStatus: approved.rightsStatus,
    settings: {
      stability: settings.stability,
      similarityBoost: settings.similarityBoost,
      style: settings.style,
      speakerBoost: settings.speakerBoost,
      speed,
    },
    speechIntent: args.speechIntent || requested.speechIntent,
    format: args.format,
    speed,
    profileVersion: Number(requested.profileVersion || 1),
    source: args.voiceProfile ? "request-override" : "persona-profile",
    score: 999,
    matchedTags: [...(approved.tags || [])],
    matchedReasons: ["승인된 ElevenLabs voice profile"],
    voiceFingerprint: buildVoiceFingerprint(
      {
        provider: "elevenlabs",
        voiceId,
        modelName,
        locale,
        voiceRevision: approved.voiceRevision,
        settings,
        speechIntent: args.speechIntent || requested.speechIntent,
        format: args.format,
        speed,
        profileVersion: Number(requested.profileVersion || 1),
      },
      { format: args.format, speed, settings, speechIntent: args.speechIntent || requested.speechIntent },
    ),
  };

  return profile;
}

export function resolveVoiceProfile(args: ISpeechSynthesizeRequest): IResolvedVoiceProfile {
  const provider = args.provider || "openai";
  if (provider === "elevenlabs") return resolveElevenLabsVoiceProfile(args);
  if (provider !== "openai") {
    throw createSpeechError("현재 O1 단계에서는 OpenAI 음성만 지원합니다.", "UNSUPPORTED_SPEECH_PROVIDER", 400, {
      provider,
    });
  }

  const locale = inferLocale(args);
  const genderHint = args.routeHint === "tutors" ? resolveOpenAiVoiceGenderHint(args.persona?.gender) : undefined;
  const requestedVoiceId = String(args.voiceProfile?.voiceId || "").trim().toLowerCase();
  const requestedEntry = requestedVoiceId ? getOpenAiVoiceCatalogEntry(requestedVoiceId) : undefined;

  if (requestedVoiceId && !requestedEntry) {
    throw createSpeechError("승인되지 않은 voiceId 입니다.", "UNSUPPORTED_VOICE_ID", 400, {
      voiceId: requestedVoiceId,
    });
  }

  if (requestedEntry) {
    return {
      provider: "openai",
      voiceId: requestedEntry.voiceId,
      modelName: String(args.voiceProfile?.modelName || args.modelName || OPENAI_DEFAULT_TTS_MODEL).trim(),
      locale,
      instructions: String(args.voiceProfile?.instructions || requestedEntry.instructions || "").trim() || undefined,
      voiceFingerprint: buildVoiceFingerprint({
        provider: "openai",
        voiceId: requestedEntry.voiceId,
        modelName: String(args.voiceProfile?.modelName || args.modelName || OPENAI_DEFAULT_TTS_MODEL).trim(),
        locale,
        instructions: String(args.voiceProfile?.instructions || requestedEntry.instructions || "").trim() || undefined,
      }),
      source: "request-override",
      score: 999,
      matchedTags: [...requestedEntry.tags],
      matchedReasons: ["명시적 voice override"],
    };
  }

  const personaVoiceId = String(args.persona?.voiceProfile?.voiceId || "").trim().toLowerCase();
  const personaVoiceEntry = personaVoiceId ? getOpenAiVoiceCatalogEntry(personaVoiceId) : undefined;
  if (personaVoiceEntry) {
    const personaModelName =
      String(args.persona?.voiceProfile?.modelName || args.modelName || OPENAI_DEFAULT_TTS_MODEL).trim() ||
      OPENAI_DEFAULT_TTS_MODEL;
    const personaInstructions =
      String(args.persona?.voiceProfile?.instructions || personaVoiceEntry.instructions || "").trim() || undefined;

    return {
      provider: "openai",
      voiceId: personaVoiceEntry.voiceId,
      modelName: personaModelName,
      locale: String(args.persona?.voiceProfile?.locale || locale).trim() || locale,
      instructions: personaInstructions,
      voiceFingerprint: buildVoiceFingerprint({
        provider: "openai",
        voiceId: personaVoiceEntry.voiceId,
        modelName: personaModelName,
        locale: String(args.persona?.voiceProfile?.locale || locale).trim() || locale,
        instructions: personaInstructions,
      }),
      source: "persona-profile",
      score: 950,
      matchedTags: [...personaVoiceEntry.tags],
      matchedReasons: ["persona.voiceProfile 고정값"],
    };
  }

  const target = collectTargetTags(args);
  const preferredModel =
    String(args.modelName || args.universeMetadata?.voiceConfig?.defaultTtsModel || OPENAI_DEFAULT_TTS_MODEL).trim() ||
    OPENAI_DEFAULT_TTS_MODEL;

  let best: IOpenAiVoiceCatalogEntry = OPENAI_APPROVED_VOICE_CATALOG[0];
  let bestScore = -1;

  for (const entry of getOpenAiVoiceCatalogForGenderHint(genderHint) as readonly IOpenAiVoiceCatalogEntry[]) {
    let score = 0;
    if ((entry.locales as readonly string[]).includes(locale)) score += 4;
    for (const tag of target.tags) {
      if ((entry.tags as readonly string[]).includes(tag)) score += target.tagWeights[tag] || 1;
    }
    if (score > bestScore) {
      best = entry;
      bestScore = score;
    }
  }

  return {
    provider: "openai",
    voiceId: best.voiceId,
    modelName: preferredModel,
    locale,
    instructions: best.instructions,
    voiceFingerprint: buildVoiceFingerprint({
      provider: "openai",
      voiceId: best.voiceId,
      modelName: preferredModel,
      locale,
      instructions: best.instructions,
    }),
    source: "catalog-auto",
    score: bestScore,
    matchedTags: best.tags.filter((tag) => target.tags.includes(tag)),
    matchedReasons: target.reasons,
  };
}
