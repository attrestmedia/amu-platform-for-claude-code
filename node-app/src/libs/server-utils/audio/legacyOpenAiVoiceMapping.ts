/**
 * @docHint
 * @purpose Play CharacterChat 구 OpenAI voice profile을 승인된 ElevenLabs voice ID로 매핑
 * @process legacy voice key 정규화  승인 voice ID 매핑 반환
 * @domain audio.voice
 * @scope server
 */

/**
 * 구 OpenAI voice profile → 승인된 ElevenLabs ko voice의 결정적 매핑.
 * 매핑 미확정 voice는 null이며 임의 Voice나 OpenAI fallback으로 대체하지 않는다.
 */
export const LEGACY_OPENAI_TO_ELEVENLABS_VOICE: Readonly<Record<string, string>> = {
  alloy: "5I7B1di44aCL15NkP0jn", // Kanna - Calm & Friendly
  ash: "CxErO97xpQgQXYmapDKX", // Theo - Warm, Smooth and Soft
  ballad: "Lb7qkOn5hF8p7qfCDH8q", // Annie - Friendly, Soft and Clear
  coral: "zXNMXSB7uul4lbmpaVAn", // Dahye - Clear Korean Explainer
  echo: "CxErO97xpQgQXYmapDKX", // Theo - Warm, Smooth and Soft
  fable: "4JJwo477JUAx3HV0T7n7", // Yohan Koo - Encouraging, Clear and Airy
  nova: "Lb7qkOn5hF8p7qfCDH8q", // Annie - Friendly, Soft and Clear
  onyx: "uyVNoMrnUku1dZyVEXwD", // Anna Kim - Tender, Calm and Clear
  sage: "uyVNoMrnUku1dZyVEXwD", // Anna Kim - Tender, Calm and Clear
  shimmer: "uyVNoMrnUku1dZyVEXwD", // Anna Kim - Tender, Calm and Clear
  verse: "4JJwo477JUAx3HV0T7n7", // Yohan Koo - Encouraging, Clear and Airy
  marin: "5I7B1di44aCL15NkP0jn", // Kanna - Calm & Friendly
  cedar: "CxErO97xpQgQXYmapDKX", // Theo - Warm, Smooth and Soft
};

export function resolveLegacyOpenAiVoiceToElevenLabs(legacyVoiceId: unknown): string | null {
  const key = String(legacyVoiceId || "")
    .trim()
    .toLowerCase();
  if (!key) return null;
  const mapped = LEGACY_OPENAI_TO_ELEVENLABS_VOICE[key];
  return mapped || null;
}
