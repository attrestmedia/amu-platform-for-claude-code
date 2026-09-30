import type {
  PlatformCredentialDefinition,
  PlatformCredentialEnvironment,
} from "types/secure/platformCredentials";

export const PLATFORM_CREDENTIAL_DEFINITIONS = [
  {
    key: "ai.openai.default",
    provider: "openai",
    category: "ai",
    label: { ko: "OpenAI", en: "OpenAI" },
    description: { ko: "텍스트·이미지·음성 생성 API", en: "Text, image, and speech generation API" },
    fields: [{ key: "apiKey", label: { ko: "API 키", en: "API key" }, secret: true }],
  },
  {
    key: "ai.anthropic.default",
    provider: "anthropic",
    category: "ai",
    label: { ko: "Anthropic", en: "Anthropic" },
    description: { ko: "Claude 텍스트 생성 API", en: "Claude text generation API" },
    fields: [{ key: "apiKey", label: { ko: "API 키", en: "API key" }, secret: true }],
  },
  {
    key: "ai.xai.default",
    provider: "xai",
    category: "ai",
    label: { ko: "xAI", en: "xAI" },
    description: { ko: "Grok 텍스트·이미지 생성 API", en: "Grok text and image generation API" },
    fields: [{ key: "apiKey", label: { ko: "API 키", en: "API key" }, secret: true }],
  },
  {
    key: "ai.deepseek.default",
    provider: "deepseek",
    category: "ai",
    label: { ko: "DeepSeek", en: "DeepSeek" },
    description: { ko: "DeepSeek V4 텍스트 전용 API", en: "DeepSeek V4 text-only API" },
    fields: [{ key: "apiKey", label: { ko: "API 키", en: "API key" }, secret: true }],
  },
  {
    key: "ai.zai.default",
    provider: "zai",
    category: "ai",
    label: { ko: "Z.ai (GLM)", en: "Z.ai (GLM)" },
    description: { ko: "GLM 텍스트·이미지 생성 API", en: "GLM text and image generation API" },
    fields: [{ key: "apiKey", label: { ko: "API 키", en: "API key" }, secret: true }],
  },
  {
    key: "ai.google.gemini",
    provider: "google",
    category: "ai",
    label: { ko: "Google Gemini", en: "Google Gemini" },
    description: { ko: "Gemini 텍스트·이미지 생성 API", en: "Gemini text and image generation API" },
    fields: [{ key: "apiKey", label: { ko: "API 키", en: "API key" }, secret: true }],
  },
  {
    key: "ai.qwen.default",
    provider: "qwen",
    category: "ai",
    label: { ko: "Alibaba Cloud Model Studio (Singapore PAYG)", en: "Alibaba Cloud Model Studio (Singapore PAYG)" },
    description: {
      ko: "Model Studio Singapore 워크스페이스 API — PAYG",
      en: "Model Studio Singapore workspace API — PAYG",
    },
    fields: [{ key: "apiKey", label: { ko: "API 키", en: "API key" }, secret: true }],
    activationUnavailable: true,
    notice: {
      ko: "Singapore Model Studio PAYG 키만 저장할 수 있습니다. 저장하면 새 버전이 pending으로 생성됩니다. 조회 전용 모델 목록 API는 키 인증만 확인하며, 모델 권한·가격 준비·사용자 호출 승인을 확인하지 않습니다. 현재 출시/법무 게이트가 닫혀 있어 활성화와 사용자 호출은 차단됩니다. 기존 QwenCloud 저장 버전은 재해석하지 않으며 관리자 이관 후 별도 pending 버전이 필요합니다.",
      en: "Only Singapore Model Studio PAYG keys can be saved. Saving creates a new pending version. The read-only model-list API checks key authentication only; it does not confirm model entitlement, pricing readiness, or approval for user calls. Activation and user calls remain blocked while release/legal gates are closed. Existing QwenCloud versions are not reinterpreted; an administrator must explicitly create a separate pending migration version.",
    },
  },
  // EL-201. **자격증명 등록이 곧 기능 활성화가 아니다.** 음성 모델 카탈로그가 전부 routable=false라
  // SPEECH_PROVIDER_ROUTABLE.elevenlabs가 false이고, 활성 키가 있어도 provider 호출은 차단된다.
  // 이 상태를 전제로 service-facts.json은 dataShared를 비워 두고 있다 — 실제 전송 경로를 여는 변경은
  // 처리위탁·국외 이전 고지(G-EL-LEGAL-DESIGN)를 먼저 통과해야 한다.
  // 계약 고정: test/elevenlabsCredentialContract.test.ts
  {
    key: "ai.elevenlabs.default",
    provider: "elevenlabs",
    category: "ai",
    label: { ko: "ElevenLabs", en: "ElevenLabs" },
    description: {
      ko: "음성 합성(TTS)·음성 인식(STT) API — Startup Grant 계정",
      en: "Speech synthesis (TTS) and recognition (STT) API — Startup Grant account",
    },
    fields: [{ key: "apiKey", label: { ko: "API 키", en: "API key" }, secret: true }],
    notice: {
      ko: "키를 활성화해도 음성 기능은 켜지지 않습니다. 음성 모델이 전부 미검증(routable=false)이라 provider 호출은 계속 차단되며 이용자 데이터도 전송되지 않습니다.\n키 발급 시 크레딧 quota·endpoint 권한·IP 제한을 함께 설정하세요. 검증에는 모델 목록 조회 권한이 필요합니다.",
      en: "Activating this key does not turn on speech features. Every speech model is still unverified (routable=false), so provider calls stay blocked and no user data is sent.\nSet a credit quota, endpoint permissions, and IP restrictions when issuing the key. Verification requires the model-list read permission.",
    },
  },
  // JEV safe-off. 키를 저장·활성화해도 runtime controls 전까지 JEV 호출은 연결되지 않는다.
  // 계약 고정: test/typesafeCredentialContract.test.ts
  {
    key: "ai.typesafe.default",
    provider: "typesafe",
    category: "ai",
    label: { ko: "TypeSafe (JEV)", en: "TypeSafe (JEV)" },
    description: {
      ko: "JEV System One 판단 API — 빠른 판단 계층(Decision Fabric)",
      en: "JEV System One decision API — fast decision layer (Decision Fabric)",
    },
    fields: [{ key: "apiKey", label: { ko: "API 키", en: "API key" }, secret: true }],
    notice: {
      ko: "저장·활성화만으로는 JEV 기능이 켜지지 않습니다. 실제 사용 여부는 JEV runtime controls에서 결정됩니다.\n검증은 모델 목록 조회(GET /v1/models)만 호출하며 판단 요청은 보내지 않습니다.",
      en: "Saving or activating this key does not turn on JEV features. Actual use is decided by the JEV runtime controls.\nVerification only calls the model-list endpoint (GET /v1/models) and never sends decision requests.",
    },
    disableConfirmation: {
      ko: "TypeSafe (JEV) 활성 자격증명을 비활성화할까요? JEV 사용이 중지되고 선택 지점은 Standard 경로로 돌아갑니다.",
      en: "Disable the active TypeSafe (JEV) credential? JEV use stops and decision points fall back to the Standard path.",
    },
  },
  {
    key: "ai.photoroom.remove-bg",
    provider: "photoroom",
    category: "ai",
    label: { ko: "PhotoRoom 배경 제거", en: "PhotoRoom background removal" },
    description: { ko: "PhotoRoom Segment API", en: "PhotoRoom Segment API" },
    fields: [{ key: "apiKey", label: { ko: "API 키", en: "API key" }, secret: true }],
  },
  {
    key: "ai.pixian.remove-bg",
    provider: "pixian",
    category: "ai",
    label: { ko: "Pixian 배경 제거", en: "Pixian background removal" },
    description: { ko: "Pixian HTTP Basic 자격증명", en: "Pixian HTTP Basic credentials" },
    fields: [
      { key: "apiId", label: { ko: "API ID", en: "API ID" }, secret: true },
      { key: "apiSecret", label: { ko: "API Secret", en: "API secret" }, secret: true },
    ],
  },
  {
    key: "integration.wordpress.rest",
    provider: "wordpress",
    category: "integration",
    label: { ko: "WordPress REST", en: "WordPress REST" },
    description: {
      ko: "비공개 글 조회·편집용 Application Password",
      en: "Application Password for private post access",
    },
    fields: [
      { key: "username", label: { ko: "사용자명", en: "Username" }, secret: false },
      {
        key: "applicationPassword",
        label: { ko: "Application Password", en: "Application Password" },
        secret: true,
      },
    ],
  },
  {
    key: "infra.aws.ses",
    provider: "aws_ses",
    category: "messaging",
    label: { ko: "Amazon SES", en: "Amazon SES" },
    description: {
      ko: "IAM Role 기반 이메일 발송 설정 — 정적 AWS 액세스 키를 저장하지 않습니다.",
      en: "IAM Role-based email delivery settings — static AWS access keys are not stored.",
    },
    fields: [
      { key: "region", label: { ko: "AWS 리전", en: "AWS region" }, secret: false },
      {
        key: "transactionalIdentity",
        label: { ko: "트랜잭션 identity", en: "Transactional identity" },
        secret: false,
      },
      {
        key: "transactionalConfigurationSet",
        label: { ko: "트랜잭션 configuration set", en: "Transactional configuration set" },
        secret: false,
      },
      {
        key: "newsletterIdentity",
        label: { ko: "뉴스레터 identity", en: "Newsletter identity" },
        secret: false,
      },
      {
        key: "newsletterConfigurationSet",
        label: { ko: "뉴스레터 configuration set", en: "Newsletter configuration set" },
        secret: false,
      },
    ],
  },
  {
    key: "stock.pexels.search",
    provider: "pexels",
    category: "stock_image",
    label: { ko: "Pexels 이미지 검색", en: "Pexels image search" },
    description: { ko: "서버 이미지 검색 프록시 키", en: "Server image search proxy key" },
    fields: [{ key: "apiKey", label: { ko: "API 키", en: "API key" }, secret: true }],
  },
  {
    key: "stock.pixabay.search",
    provider: "pixabay",
    category: "stock_image",
    label: { ko: "Pixabay 이미지 검색", en: "Pixabay image search" },
    description: { ko: "서버 이미지 검색 프록시 키", en: "Server image search proxy key" },
    fields: [{ key: "apiKey", label: { ko: "API 키", en: "API key" }, secret: true }],
  },
  {
    key: "stock.unsplash.search",
    provider: "unsplash",
    category: "stock_image",
    label: { ko: "Unsplash 이미지 검색", en: "Unsplash image search" },
    description: { ko: "서버 이미지 검색 프록시 키", en: "Server image search proxy key" },
    fields: [{ key: "apiKey", label: { ko: "API 키", en: "API key" }, secret: true }],
  },
  // Private Trade Lab — 운영자 본인 계좌 전용. 서비스가 아니며 이용자 데이터를 처리하지 않는다.
  // 별도 스토어를 만들지 않고 이 저장소를 재사용한다: 최고 관리자·개발 담당·소유자가 동일인이라 분리할 주체가 없다.
  // 주식 로드맵 §2.2 / 통합 보고서 §1.2
  {
    key: "trading.upbit.exchange",
    provider: "upbit",
    category: "trading",
    label: { ko: "업비트 Open API", en: "Upbit Open API" },
    description: {
      ko: "개인 거래 파일럿 전용 — 자산조회·주문조회·주문하기.\n출금 권한이 있는 키는 시스템 거부",
      en: "Private trading pilot only — asset, order inquiry, and order placement.\nKeys with withdrawal scope are rejected",
    },
    fields: [
      { key: "accessKey", label: { ko: "Access Key", en: "Access key" }, secret: true },
      { key: "secretKey", label: { ko: "Secret Key", en: "Secret key" }, secret: true },
    ],
  },
  {
    key: "trading.toss.securities",
    provider: "toss_securities",
    category: "trading",
    label: { ko: "토스증권 Open API", en: "Toss Securities Open API" },
    description: {
      ko: "개인 거래 파일럿 전용 — 시세·계좌·주문 API",
      en: "Private trading pilot only — market data, account, and order API",
    },
    fields: [
      { key: "clientId", label: { ko: "Client ID", en: "Client ID" }, secret: true },
      { key: "clientSecret", label: { ko: "Client Secret", en: "Client secret" }, secret: true },
    ],
  },
] as const satisfies readonly PlatformCredentialDefinition[];

export type PlatformCredentialKey = (typeof PLATFORM_CREDENTIAL_DEFINITIONS)[number]["key"];

export const PLATFORM_CREDENTIAL_KEYS = PLATFORM_CREDENTIAL_DEFINITIONS.map((definition) => definition.key);

export function getPlatformCredentialDefinition(key: string): PlatformCredentialDefinition | undefined {
  return PLATFORM_CREDENTIAL_DEFINITIONS.find((definition) => definition.key === key);
}

export function getPlatformCredentialEnvironment(): PlatformCredentialEnvironment {
  const configured = String(process.env.PLATFORM_CREDENTIAL_ENV || "")
    .trim()
    .toLowerCase();
  if (configured === "development" || configured === "production") return configured;
  return process.env.NODE_ENV === "production" ? "production" : "development";
}
