import marketingOopsWorkspaceImage from "src/assets/marketing-oops/marketing-oops-workspace-v1.png";
import { MARKETING_DEFAULT_CONTENT_CHANNELS } from "consts/marketing/queue";
import { MARKETING_OPERATION_TABS } from "consts/marketing/public";

/**
 * Marketing Oops 공개 랜딩 카피·비주얼 상수.
 *
 * 정책 근거
 *  - 서비스 상태: 출시 준비 중 — Marketing Charter §2, §6.3.
 *    어떤 분기에도 체험 유도 CTA("지금 시작하세요" 류)를 붙이지 않는다.
 *  - 수치 주장 금지: Charter §6.4. 사용자 수·성과 수치·아바타 군집·고객 로고·후기를 만들지 않는다.
 *    노출 가능한 숫자는 "사용자 수"가 아니라 "다루는 범위"이며, 아래 FACTS는 모두 코드에서 확인된 값이다.
 *  - 정의문·대조표 원문: .agent/amu-platform-guide/marketing-oops/Branding.md
 *  - 근거 보고서: .agent/docs/node-app/2026/08/20260802_083020__marketing-oops-landing-design-improvement.md
 */

/** 실제 운영 화면 캡처 — 히어로의 시각 증거(다이어그램 대체) */
export const MARKETING_OOPS_WORKSPACE_PREVIEW = marketingOopsWorkspaceImage;

/** 워크스페이스 운영 탭 — consts/marketing/public.ts의 MARKETING_OPERATION_TABS (셸 라우팅과 동일 원장) */
export const MARKETING_OOPS_WORKSPACE_TAB_COUNT = MARKETING_OPERATION_TABS.length;

/** 콘텐츠 발행 채널 — consts/marketing/queue.ts의 MARKETING_DEFAULT_CONTENT_CHANNELS */
export const MARKETING_OOPS_CONTENT_CHANNEL_COUNT = MARKETING_DEFAULT_CONTENT_CHANNELS.length;

/** 히어로 — 브랜드 + 헤드라인 1 + 보조문장 1 + 1차 CTA 1 */
export const MARKETING_OOPS_HERO_COPY = {
  status: { ko: "출시 준비 중", en: "Preparing for launch" },
  headline: {
    ko: "1인 사업자의\nAI 마케팅 운영팀",
    en: "An AI marketing ops team\nfor solo founders",
  },
  lead: {
    ko: "목표를 정하고, 채널에 맞게 만들고, 발행하고, 성과까지 하나의 흐름으로 잇습니다.",
    en: "Set the goal, shape it per channel, publish it, and connect the results — in one flow.",
  },
  previewAlt: {
    ko: "Marketing Oops 워크스페이스 운영 화면",
    en: "Marketing Oops workspace screen",
  },
} as const;

/** ② Oops 스트립 — 브랜드명이 왜 Oops인지 (Branding.md §Oops의 의미 정의) */
export const MARKETING_OOPS_STORY_COPY = {
  headline: { ko: "마케팅의 실수를, 다음 성장의 기회로.", en: "Every marketing oops becomes your next opportunity." },
  lead: {
    ko: "놓친 고객, 놓친 콘텐츠, 놓친 전환을 다시 연결합니다.",
    en: "Reconnect the customers, the content, and the conversions you missed.",
  },
} as const;

/**
 * ③ 운영 루프 — 5단계를 워크스페이스의 실제 탭에 매핑한다.
 * 라벨의 탭명은 MarketingOperationsShell.tsx의 MARKETING_TABS에 실재하는 값만 쓴다.
 */
export const MARKETING_OOPS_LOOP_SECTION_ID = "marketing-loop";

export const MARKETING_OOPS_LOOP_STEPS = [
  {
    step: { ko: "기획", en: "Plan" },
    tab: { ko: "키워드 · 광고", en: "Keyword · Ads" },
    body: {
      ko: "타깃과 키워드를 먼저 정하고, 캠페인 단위로 묶어 무엇을 왜 만들지 결정합니다.",
      en: "Define the audience and keywords first, then group them into campaigns.",
    },
    surface: "var(--primary-sub)",
  },
  {
    step: { ko: "생성", en: "Create" },
    tab: { ko: "Queue 등록 · 생성 설정", en: "Queue · Generation" },
    body: {
      ko: "하나의 주제를 채널마다 똑같이 복사하지 않고, 채널 문법에 맞게 다시 씁니다.",
      en: "One topic is rewritten per channel instead of copied across them.",
    },
    surface: "var(--secondary-sub)",
  },
  {
    step: { ko: "검수", en: "Review" },
    tab: { ko: "검수", en: "Review" },
    body: {
      ko: "발행 전에 사람이 확인합니다. 승인된 원고만 다음 단계로 넘어갑니다.",
      en: "A human checks before publishing. Only approved drafts move on.",
    },
    surface: "var(--accent)",
  },
  {
    step: { ko: "발행", en: "Publish" },
    tab: { ko: "프로모션 · 운영 상태", en: "Promotion · System" },
    body: {
      ko: "채널별 발행 일정과 매거진 프로모션 슬롯을 같은 원장에서 관리합니다.",
      en: "Publishing schedules and magazine promotion slots live in one ledger.",
    },
    surface: "var(--marketing-oops-badge)",
  },
  {
    step: { ko: "측정", en: "Measure" },
    tab: { ko: "성과", en: "Performance" },
    body: {
      ko: "canonical + UTM 규칙으로 발행한 링크의 성과를 캠페인·소재 단위로 되돌려 붙입니다.",
      en: "Canonical + UTM links tie performance back to campaigns and creatives.",
    },
    surface: "var(--primary)",
  },
] as const;

/**
 * 검증 가능한 사실만 — 사용자 수가 아니라 "다루는 범위" (Charter §6.4).
 * 세 값 모두 상수 원장에서 파생하므로 코드가 바뀌면 랜딩 숫자도 함께 바뀐다.
 */
export const MARKETING_OOPS_SCOPE_FACTS = [
  { value: MARKETING_OOPS_CONTENT_CHANNEL_COUNT, label: { ko: "발행 채널", en: "Publishing channels" } },
  { value: MARKETING_OOPS_WORKSPACE_TAB_COUNT, label: { ko: "운영 탭", en: "Operation tabs" } },
  { value: MARKETING_OOPS_LOOP_STEPS.length, label: { ko: "단계 루프", en: "Loop stages" } },
] as const;

/**
 * ④ 무엇이 다른가 — 근거 없는 후기·고객 로고 없이 신뢰를 만드는 유일한 방법.
 * 원문: Branding.md §무엇과 다른가.
 *
 * 3행의 우변은 모두 현재 구현된 범위로 한정했다.
 *  - "다음 행동 추천"은 GUIDE.md에서 확장 로드맵 항목이므로 주장하지 않는다 (Charter §11).
 *  - 대신 실재하는 성과 귀속(consts/marketing/queue.ts의 MARKETING_PERFORMANCE_ENTITY_TYPES,
 *    consts/marketing/tracking.ts의 MARKETING_CANONICAL_POLICY)으로 대체했다.
 */
export const MARKETING_OOPS_DIFFERENCE_COPY = {
  headline: {
    ko: "콘텐츠를 만드는 도구가 아니라,\n마케팅을 운영하는 시스템입니다",
    en: "Not a tool that makes content —\na system that runs marketing",
  },
  rows: [
    {
      other: { ko: "생성 도구는 만듭니다", en: "Generators make things" },
      oops: { ko: "Oops는 왜 만들지를 먼저 정합니다", en: "Oops decides why it gets made" },
    },
    {
      other: { ko: "자동화 도구는 예약합니다", en: "Schedulers queue posts" },
      oops: { ko: "Oops는 어디에 발행할지를 정합니다", en: "Oops decides where it gets published" },
    },
    {
      other: { ko: "분석 도구는 보여줍니다", en: "Analytics tools show numbers" },
      oops: {
        ko: "Oops는 성과를 캠페인·소재까지 귀속합니다",
        en: "Oops attributes results to campaigns and creatives",
      },
    },
  ],
} as const;

/** ⑤ 연결 — 실제 연동 대상만 나열한다 */
export const MARKETING_OOPS_CONNECT_COPY = {
  headline: { ko: "이미 쓰고 있는 채널에 붙습니다", en: "It connects to the channels you already use" },
  lead: {
    ko: "유니버스별로 채널 계정과 분석 계정을 연결하면, 위 5단계가 그 계정 위에서 돌아갑니다.",
    en: "Connect channel and analytics accounts per universe, and the five stages run on top of them.",
  },
  groups: [
    {
      title: { ko: "콘텐츠 발행", en: "Content publishing" },
      items: ["Threads", "Instagram", "LinkedIn", "Naver Blog"],
    },
    {
      title: { ko: "광고 · 분석", en: "Ads · Analytics" },
      items: ["Naver Ads", "Google Ads", "Google Analytics 4"],
    },
    {
      title: { ko: "AMU 서비스", en: "AMU services" },
      items: ["Gen Studio", "AMU Magazine"],
    },
  ],
} as const;

/** CTA — 권한 3분기 공통 문구 (Charter §6.3: 체험 유도 문구 없음) */
export const MARKETING_OOPS_CTA_COPY = {
  explore: { ko: "서비스 살펴보기", en: "See how it works" },
  openWorkspace: { ko: "워크스페이스 열기", en: "Open workspace" },
  connect: { ko: "서비스 연결", en: "Connect services" },
  noAccessNote: {
    ko: "운영 권한이 있는 계정에서 워크스페이스를 열 수 있습니다.",
    en: "The workspace opens for accounts with operator access.",
  },
} as const;
