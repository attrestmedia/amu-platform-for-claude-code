/**
 * # 기본 정책
 * - 기본 비용 책정은 서버/유지보수/관리 등의 비즈니스 및 인프라 유지를 고려하여,
 * - original api 토큰 보다 약 35% ~ 40% 차감 (원가 대비 약 1.54 ~ 1.67배)
 * - { input: number, output: number } => "코인 1개당" 사용 가능한 토큰 수
 * - D22 R3 사용자 결정(2026-09-29): 해당 산정의 비교 기준은 input/output 공통 provider COGS $0.000336/coin이다.
 *   TOKENS_PER_COIN은 공식 USD/1M token 단가로부터 역산하고, 지정 fixed charge는 USD/$0.000336을 올림한다.
 * - 비용과 모델은 각 api 프로바이더에 따라 변동될 수 있음. 주기적으로 체크할 것
 */

/**
 * # key 규칙: `${provider}:${model}[:${variant}][:${modality}]`
 * - provider: google/openai/claude/deepseek/xai
 * - variant: short/long/720p/1024x1792 등 “같은 모델군 내 옵션”
 * - modality: text/audio/image (있으면 항상 마지막 segment)
 * - alias 내부 표준 단일 키. 업스트림 실모델ID는 modelRole.ts에서 변환
 */

type TokenPerCoin = Readonly<{ input: number; output: number }>;
type FixedCost = Readonly<{
  perSecond?: number;
  perMinute?: number;
  perImage?: number;
  perVideo?: number;
  /** EL-203 — 문자 1,000자당 코인. provider TTS 청구 단위(character)에 맞춘다. */
  perThousandCharacters?: number;
  /** EL-203 — provider credit 1개당 코인. */
  perCredit?: number;
}>;

export const TOKENS_PER_COIN = {
  // ----- OpenAI 텍스트 -----
  "openai:gpt-5.6-sol": { input: 84, output: 14 },
  "openai:gpt-5.6-terra": { input: 168, output: 28 },
  "openai:gpt-5.6-luna": { input: 420, output: 70 },

  // D22 R3 / ROUND Y-2: user-selected reference is $0.000336 provider COGS per coin on both axes.
  // Official GPT-6 input costs retain providerCost.ts's conservative cache-write/large-context bounds.
  // Base uses the long-context price; :short/:long are selected from actual request size.
  "openai:gpt-6-astra": { input: 13.44, output: 4.48 },
  "openai:gpt-6-astra:short": { input: 26.88, output: 6.72 },
  "openai:gpt-6-astra:long": { input: 13.44, output: 4.48 },
  "openai:gpt-6-sol": { input: 67.2, output: 22.4 },
  "openai:gpt-6-sol:short": { input: 134.4, output: 33.6 },
  "openai:gpt-6-sol:long": { input: 67.2, output: 22.4 },
  "openai:gpt-6-luna": { input: 1344, output: 448 },
  "openai:gpt-6-luna:short": { input: 2688, output: 672 },
  "openai:gpt-6-luna:long": { input: 1344, output: 448 },

  // D22 R3 / ROUND Y-2: retain the approved providerCost.ts Model Studio Singapore rates.
  "qwen:qwen3.8-omni-flash": { input: 2240, output: 714.89 },
  "qwen:qwen-audio-3.1-asr-flash": { input: 2240, output: 714.89 },

  // ----- OpenAI 멀티모달 (토큰 과금형) -----
  // TUTORS-196 2026-09-15 — gpt-audio-mini 실호출 검증 시 공식 단가를 재조회해 기존 값을 확인했다.
  // 공식(developers.openai.com/api/docs/pricing): text in $0.60 / audio in $10.00 /
  //   text out $2.40 / audio out $20.00 per 1M.
  // audio input 35 tokens/coin은 OpenAI speech 계열의 $0.00035/coin과 정확히 일치한다
  //   (gpt-4o-transcribe audio 140 × $2.5/M = $0.00035). 기존 값을 그대로 둔다.
  "openai:gpt-audio:text": { input: 160, output: 35 },
  "openai:gpt-audio:audio": { input: 12, output: 5 },
  "openai:gpt-audio-mini:text": { input: 720, output: 160 },
  "openai:gpt-audio-mini:audio": { input: 35, output: 18 },

  // gpt-image-2.5 계열은 gpt-image-2와 공식 토큰 단가가 동일하다
  // (text in $5 / image in $8 / image out $30 per 1M — "Token rates match GPT Image 2").
  // 장당 토큰 소모량은 공개되지 않아 fixed 최소요금 + 토큰 초과분 hybrid로 청구한다.
  "openai:gpt-image-2.5-flare:text": { input: 80, output: 0 },
  "openai:gpt-image-2.5-flare:image": { input: 50, output: 8 },
  "openai:gpt-image-2.5-sunburst:text": { input: 80, output: 0 },
  "openai:gpt-image-2.5-sunburst:image": { input: 50, output: 8 },

  // ----- OpenAI Speech -----
  "openai:gpt-4o-mini-tts:text": { input: 720, output: 0 },
  "openai:gpt-4o-mini-tts:audio": { input: 0, output: 30 },
  "openai:gpt-4o-mini-transcribe:audio": { input: 280, output: 0 },
  "openai:gpt-4o-mini-transcribe:text": { input: 0, output: 72 },
  "openai:gpt-4o-transcribe:audio": { input: 140, output: 0 },
  "openai:gpt-4o-transcribe:text": { input: 0, output: 35 },
  "openai:gpt-4o-transcribe-diarize:audio": { input: 140, output: 0 },
  "openai:gpt-4o-transcribe-diarize:text": { input: 0, output: 35 },
  "openai:whisper-1:audio": { input: 70, output: 35 },

  // ----- Claude 텍스트 (실사용 모델 ID 기준) -----
  "claude:claude-haiku-4-5": { input: 420, output: 75 },
  "claude:claude-opus-5-5": { input: 105, output: 18.75 },
  "claude:claude-sonnet-5": { input: 210, output: 37 },
  "claude:claude-opus-5": { input: 84, output: 15 },
  "claude:claude-fable-5-1": { input: 42, output: 7 },
  "claude:claude-fable-5": { input: 42, output: 7 },

  // ----- DeepSeek 텍스트 -----
  "deepseek:deepseek-v4-flash": { input: 3000, output: 1500 },
  "deepseek:deepseek-v4-pro": { input: 965, output: 482 },

  // ----- Z.ai(GLM) 텍스트 -----
  "zai:glm-5.3": { input: 300, output: 95 },
  "zai:glm-5.3-flash": { input: 2800, output: 840 },

  // ----- Gemini 텍스트 -----
  // 2026-12-31까지 Gemini 3.8 Flash introductory rate($0.75/$3.75 per 1M) 기준.
  // 2027-01-01 공식 단가 인상 전에 recurring sync에서 재산정한다.
  "google:gemini-3.8-flash": { input: 1816, output: 368 },
  "google:gemini-3.6-flash": { input: 908, output: 184 },
  "google:gemini-3.1-pro-preview:short": { input: 220, output: 30 },
  "google:gemini-3.1-pro-preview:long": { input: 110, output: 20 },
  "google:gemini-3.5-flash-lite": { input: 2917, output: 156 },

  // ----- xAI(Grok) 텍스트 -----
  // D22 R3 / ROUND Y-2: xAI official short $2/$6, long $4/$12 per 1M use $0.000336/coin on both axes.
  // Base는 long 요율을 보수 fallback으로 둔다. 호출자는 실제 usage에 따라 short/long을 선택한다.
  "xai:grok-4.7": { input: 84, output: 28 },
  "xai:grok-4.7:short": { input: 168, output: 56 },
  "xai:grok-4.7:long": { input: 84, output: 28 },
  "xai:grok-4.6": { input: 10.5, output: 3.5 },
  "xai:grok-4.6:short": { input: 21, output: 7 },
  "xai:grok-4.6:long": { input: 10.5, output: 3.5 },
  "xai:grok-4.5": { input: 21, output: 7 },
  "xai:grok-4.3": { input: 34, output: 17 },
  "xai:grok-build-0.1": { input: 42, output: 21 },
  "xai:grok-4.20-0309-reasoning": { input: 34, output: 17 },
} as const satisfies Record<string, TokenPerCoin>;

export const FIXED_COSTS = {
  // ----- OpenAI Speech fixed fallback -----
  // 공식 pricing의 minute estimate 기반 사전 차단용 fallback.
  // D22 R3 / ROUND Y-2: ceil($0.0045 official provider cost / $0.000336 per coin) = 14 coins/minute.
  "openai:gpt-transcribe": { perMinute: 14 },
  "openai:gpt-4o-mini-transcribe": { perMinute: 6 },
  "openai:gpt-4o-transcribe": { perMinute: 12 },
  "openai:gpt-4o-transcribe-diarize": { perMinute: 12 },
  "openai:whisper-1": { perMinute: 12 },
  "openai:gpt-realtime-whisper": { perMinute: 34 },
  "openai:gpt-realtime-translate": { perMinute: 68 },

  // D22 R3 / ROUND Y-2: ceil($0.04 official provider cost / $0.000336 per coin) = 120 coins/image.
  "qwen:qwen-image-3.0-pro:1K": { perImage: 120 },

  // ----- OpenAI Images -----
  // - 프로젝트 내부 코인 정책으로 가격 책정함
  "openai:gpt-image-2.5-flare": { perImage: 150 },
  "openai:gpt-image-2.5-sunburst": { perImage: 150 },

  // ----- Google Movs -----
  "google:veo-3.1-generate-preview:720p": { perSecond: 955 },
  "google:veo-3.1-generate-preview:1080p": { perSecond: 955 },
  "google:veo-3.1-generate-preview:4K": { perSecond: 1430 },
  "google:veo-3.1-fast-generate-preview:720p": { perSecond: 239 },
  "google:veo-3.1-fast-generate-preview:1080p": { perSecond: 286 },
  "google:veo-3.1-fast-generate-preview:4K": { perSecond: 716 },
  "google:veo-3.1-lite-generate-preview:720p": { perSecond: 119 },
  "google:veo-3.1-lite-generate-preview:1080p": { perSecond: 191 },

  // ----- xAI video (image input pricing is tracked separately by upstream usage) -----
  "xai:grok-imagine-video-1.5:480p": { perSecond: 191 },
  "xai:grok-imagine-video-1.5:720p": { perSecond: 334 },
  "xai:grok-imagine-video-1.5:1080p": { perSecond: 596 },

  // ----- Z.ai video (catalog-only; execution job is not implemented) -----
  "zai:cogvideox-3": { perVideo: 477 },

  // ----- Google Images -----
  "google:gemini-2.5-flash-image": { perImage: 90 },
  "google:gemini-3.1-flash-image-preview": { perImage: 160 },
  "google:gemini-3.1-flash-image-preview:512": { perImage: 105 },
  "google:gemini-3.1-flash-image-preview:1K": { perImage: 160 },
  "google:gemini-3.1-flash-image-preview:2K": { perImage: 240 },
  "google:gemini-3.1-flash-image-preview:4K": { perImage: 355 },
  "google:gemini-3-pro-image-preview": { perImage: 320 },
  "google:gemini-3-pro-image-preview:1K": { perImage: 320 },
  "google:gemini-3-pro-image-preview:2K": { perImage: 320 },
  "google:gemini-3-pro-image-preview:4K": { perImage: 362 },

  // ----- xAI Images -----
  "xai:grok-imagine-image": { perImage: 23 },
  "xai:grok-imagine-image-2.0": { perImage: 46 },

  // ----- Z.ai Images -----
  "zai:glm-image": { perImage: 36 },

  // ----- PhotoRoom Remove Background -----
  "photoroom:remove-bg": { perImage: 50 },

  // ----- Pixian AI Remove Background -----
  "pixian:remove-bg": { perImage: 50 },
} as const satisfies Record<string, FixedCost>;

export const SUBSCRIPTION_PLANS = [
  { tier: 1, amount: 30000 },
  { tier: 2, amount: 50000 },
  { tier: 3, amount: 100000 },
];
