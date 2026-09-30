import { MARKETING_UPLOAD_POLICY_CHANNELS, type MarketingUploadPolicyChannel } from "consts/marketing/uploadPolicy";

/**
 * @docHint
 * @purpose 콘텐츠 주제·키워드별 채널 업로드 시간대 사전 가중치(benchmark prior)
 * @process 주제 분류(lexicon) → 채널×주제 클래스 시간대 가중치 조회 → 성과 데이터가 부족할 때의 판정 근거로 사용
 * @domain marketing
 * @scope shared
 */

/**
 * 콘텐츠 주제 클래스.
 * 추천 시간대를 "무엇에 대한 글인가"로 갈라야 하므로, 채널 단위 가중치와 별도로 유지한다.
 */
export const MARKETING_CONTENT_TOPIC_CLASSES = [
  "b2b_professional",
  "tech_dev",
  "howto_guide",
  "commerce_promo",
  "trend_news",
  "lifestyle",
  "general",
] as const;

export type MarketingContentTopicClass = (typeof MARKETING_CONTENT_TOPIC_CLASSES)[number];

/**
 * 주제 분류 lexicon. 소문자 비교로 부분 일치를 본다.
 * 한글은 조사가 붙어도 어간이 남으므로 어간만 등록한다(예: "마케팅" → "마케팅을/마케팅이" 모두 매칭).
 */
const TOPIC_CLASS_LEXICON: Record<Exclude<MarketingContentTopicClass, "general">, string[]> = {
  b2b_professional: [
    "b2b", "saas", "마케팅", "브랜딩", "브랜드", "창업", "사업", "매출", "영업", "전략", "커리어", "채용",
    "리더십", "조직", "생산성", "업무", "협업", "고객", "전환", "리드", "퍼널", "kpi", "roi", "성과",
  ],
  tech_dev: [
    "개발", "코드", "코딩", "프로그래밍", "개발자", "api", "sdk", "서버", "데이터베이스", "프론트엔드",
    "백엔드", "정규표현식", "정규식", "regex", "알고리즘", "리팩토링", "배포", "ai", "인공지능", "llm",
    "프롬프트", "자동화", "스크립트", "오픈소스", "github",
  ],
  howto_guide: [
    "방법", "가이드", "튜토리얼", "사용법", "정리", "총정리", "만드는", "따라하기", "입문", "기초",
    "체크리스트", "팁", "노하우", "how to", "guide", "tutorial", "step",
  ],
  commerce_promo: [
    "상품", "제품", "판매", "홍보", "스토어", "쇼핑", "구매", "할인", "쿠폰", "프로모션", "이벤트",
    "포스터", "메뉴", "가게", "매장", "리뷰", "후기", "가격", "주문", "배송",
  ],
  trend_news: [
    "트렌드", "뉴스", "발표", "업데이트", "출시", "전망", "리포트", "동향", "이슈", "속보", "조사",
    "통계", "분석", "2025", "2026", "trend", "news", "report",
  ],
  lifestyle: [
    "일상", "감성", "취미", "여행", "음식", "맛집", "카페", "사진", "인테리어", "운동", "건강", "패션",
    "반려", "주말", "힐링", "레트로",
  ],
};

/**
 * 채널 × 주제 클래스 시간대 가중치(0~1).
 *
 * 근거는 두 층이다.
 * 1) 채널 베이스라인 — 공개 벤치마크(Sprout Social / Buffer / Hootsuite 2024~2025 기준)의 채널별 참여 피크.
 *    Threads·LinkedIn은 평일 업무시간 오전, Instagram은 점심과 저녁, Naver Blog는 검색 수요가 도는
 *    출근 직후와 취침 전 시간대가 강하다.
 * 2) 주제 보정 — 같은 채널이라도 소비 맥락이 다르다. B2B/실무는 업무시간, 커머스·프로모션은 구매 의도가
 *    올라오는 저녁, 개발·기술은 오전 집중 시간과 늦은 밤, 트렌드·뉴스는 이른 아침으로 이동한다.
 *
 * 여기 없는 시간은 BENCHMARK_FALLBACK_WEIGHT를 쓴다. 정책의 preferredHours 밖 시간은 애초에 후보가 아니다.
 */
const BENCHMARK_FALLBACK_WEIGHT = 0.3;

type HourWeightMap = Partial<Record<number, number>>;

type ChannelTopicBenchmark = {
  weekday: HourWeightMap;
  weekend?: HourWeightMap;
};

const THREADS_BASELINE: HourWeightMap = { 7: 0.7, 8: 0.85, 9: 1, 10: 0.95, 11: 0.85, 12: 0.6, 13: 0.7, 14: 0.6, 15: 0.65, 16: 0.5, 17: 0.55, 18: 0.5, 19: 0.45, 20: 0.4, 21: 0.35 };
const INSTAGRAM_BASELINE: HourWeightMap = { 8: 0.5, 9: 0.6, 11: 0.8, 12: 0.9, 13: 0.85, 14: 0.7, 17: 0.7, 18: 0.85, 19: 0.95, 20: 1, 21: 0.95, 22: 0.75 };
const LINKEDIN_BASELINE: HourWeightMap = { 8: 0.7, 9: 0.95, 10: 1, 11: 0.9, 12: 0.7, 13: 0.75, 14: 0.8, 15: 0.85, 16: 0.7, 17: 0.6, 18: 0.4 };
const NAVER_BLOG_BASELINE: HourWeightMap = { 7: 0.6, 8: 0.75, 9: 0.9, 10: 0.85, 11: 0.7, 12: 0.75, 13: 0.8, 14: 0.65, 15: 0.6, 18: 0.75, 19: 0.85, 20: 0.95, 21: 1, 22: 0.85 };

function shiftWeights(base: HourWeightMap, overrides: HourWeightMap): HourWeightMap {
  return { ...base, ...overrides };
}

export const MARKETING_UPLOAD_HOUR_BENCHMARK: Record<
  MarketingUploadPolicyChannel,
  Record<MarketingContentTopicClass, ChannelTopicBenchmark>
> = {
  threads: {
    // 실무·B2B 대화는 업무 시작 직후에 가장 많이 붙는다.
    b2b_professional: { weekday: shiftWeights(THREADS_BASELINE, { 8: 1, 9: 1, 10: 0.95, 13: 0.8, 15: 0.7, 19: 0.3, 21: 0.2 }) },
    // 개발·기술은 오전 집중 시간과 퇴근 후 학습 시간 두 봉우리를 가진다.
    tech_dev: { weekday: shiftWeights(THREADS_BASELINE, { 9: 1, 10: 1, 11: 0.9, 15: 0.7, 21: 0.75, 22: 0.7 }) },
    // 하우투는 점심과 저녁의 "잠깐 읽기" 구간이 강하다. 오전 피크를 함께 낮추지 않으면 주제 보정이 무의미해진다.
    howto_guide: { weekday: shiftWeights(THREADS_BASELINE, { 7: 0.5, 9: 0.75, 11: 0.8, 12: 0.85, 13: 0.95, 17: 0.85, 19: 0.8, 21: 0.6 }) },
    commerce_promo: { weekday: shiftWeights(THREADS_BASELINE, { 7: 0.35, 9: 0.5, 11: 0.7, 12: 0.8, 13: 0.7, 15: 0.75, 17: 0.85, 19: 1, 20: 0.95, 21: 0.85 }) },
    // 트렌드·뉴스는 선점이 전부다. 이른 아침이 가장 강하다.
    trend_news: { weekday: shiftWeights(THREADS_BASELINE, { 7: 1, 8: 1, 9: 0.9, 11: 0.7, 13: 0.6, 15: 0.5, 17: 0.45, 19: 0.35 }) },
    lifestyle: {
      weekday: shiftWeights(THREADS_BASELINE, { 7: 0.35, 9: 0.55, 11: 0.7, 12: 0.8, 13: 0.75, 15: 0.7, 17: 0.8, 19: 0.9, 20: 0.95, 21: 0.9 }),
      weekend: shiftWeights(THREADS_BASELINE, { 7: 0.3, 9: 0.7, 10: 0.9, 11: 1, 13: 0.9, 15: 0.8, 17: 0.8, 19: 0.85, 20: 0.9, 21: 0.85 }),
    },
    general: { weekday: THREADS_BASELINE },
  },
  instagram: {
    b2b_professional: { weekday: shiftWeights(INSTAGRAM_BASELINE, { 9: 0.8, 12: 1, 13: 0.9, 18: 0.8, 19: 0.7, 20: 0.75, 21: 0.6, 22: 0.4 }) },
    tech_dev: { weekday: shiftWeights(INSTAGRAM_BASELINE, { 12: 0.85, 18: 0.8, 19: 0.85, 20: 0.95, 21: 1, 22: 0.9 }) },
    howto_guide: { weekday: shiftWeights(INSTAGRAM_BASELINE, { 12: 0.95, 18: 0.9, 19: 0.9, 20: 1, 21: 0.95 }) },
    commerce_promo: { weekday: shiftWeights(INSTAGRAM_BASELINE, { 9: 0.4, 12: 0.85, 18: 0.9, 19: 0.95, 20: 1, 21: 0.95 }) },
    trend_news: { weekday: shiftWeights(INSTAGRAM_BASELINE, { 9: 0.95, 11: 0.85, 12: 1, 18: 0.8, 19: 0.7, 20: 0.7, 21: 0.6, 22: 0.4 }) },
    lifestyle: {
      weekday: shiftWeights(INSTAGRAM_BASELINE, { 9: 0.45, 19: 0.95, 20: 1, 21: 0.95 }),
      weekend: shiftWeights(INSTAGRAM_BASELINE, { 11: 0.95, 12: 1, 13: 0.9, 19: 0.9, 20: 0.95, 21: 0.9 }),
    },
    general: { weekday: INSTAGRAM_BASELINE },
  },
  linkedin: {
    b2b_professional: { weekday: shiftWeights(LINKEDIN_BASELINE, { 9: 0.95, 10: 1, 11: 0.95, 15: 0.85 }) },
    tech_dev: { weekday: shiftWeights(LINKEDIN_BASELINE, { 10: 1, 11: 0.95, 15: 0.85, 17: 0.7 }) },
    howto_guide: { weekday: shiftWeights(LINKEDIN_BASELINE, { 10: 0.95, 12: 0.9, 15: 0.85 }) },
    // LinkedIn에서 직접적인 프로모션은 업무시간 중반 이후가 그나마 낫다.
    commerce_promo: { weekday: shiftWeights(LINKEDIN_BASELINE, { 10: 0.75, 12: 0.85, 15: 0.9, 17: 0.8 }) },
    trend_news: { weekday: shiftWeights(LINKEDIN_BASELINE, { 8: 0.9, 9: 1, 10: 0.95, 12: 0.7 }) },
    lifestyle: { weekday: shiftWeights(LINKEDIN_BASELINE, { 12: 0.85, 17: 0.75 }) },
    general: { weekday: LINKEDIN_BASELINE },
  },
  naver_blog: {
    // 네이버는 검색 유입이 지배적이라 "검색 수요가 도는 시간"에 색인이 걸려 있어야 한다.
    b2b_professional: { weekday: shiftWeights(NAVER_BLOG_BASELINE, { 9: 1, 10: 0.95, 13: 0.85, 21: 0.7 }) },
    tech_dev: { weekday: shiftWeights(NAVER_BLOG_BASELINE, { 9: 0.95, 13: 0.85, 21: 1, 22: 0.9 }) },
    howto_guide: { weekday: shiftWeights(NAVER_BLOG_BASELINE, { 9: 0.9, 13: 0.9, 20: 0.95, 21: 1 }) },
    commerce_promo: { weekday: shiftWeights(NAVER_BLOG_BASELINE, { 12: 0.85, 18: 0.9, 20: 1, 21: 1, 7: 0.35 }) },
    trend_news: { weekday: shiftWeights(NAVER_BLOG_BASELINE, { 7: 0.9, 8: 1, 9: 1, 21: 0.6 }) },
    lifestyle: { weekday: shiftWeights(NAVER_BLOG_BASELINE, { 20: 1, 21: 1, 22: 0.9 }), weekend: shiftWeights(NAVER_BLOG_BASELINE, { 10: 0.9, 11: 0.95, 20: 0.95, 21: 1 }) },
    general: { weekday: NAVER_BLOG_BASELINE },
  },
};

/** 주제 텍스트(제목·태그·카테고리)를 하나의 소문자 토큰 문자열로 만든다. */
export function toTopicSignalText(values: unknown[]): string {
  return values
    .flatMap((value) => (Array.isArray(value) ? value : [value]))
    .map((value) => (typeof value === "string" ? value : ""))
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

/**
 * 라틴 문자로만 된 짧은 용어는 단어 경계로 맞춘다.
 * `ai`를 부분 문자열로 찾으면 email·detail·main 같은 단어에 전부 걸려 오분류가 난다.
 * 한글은 조사가 붙어 어절이 이어지므로 부분 문자열 매칭을 유지한다.
 */
function matchesTerm(text: string, term: string) {
  if (!/^[a-z0-9 ]+$/.test(term)) return text.includes(term);
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`).test(text);
}

/**
 * 주제 신호 텍스트를 주제 클래스로 분류한다.
 * 여러 클래스에 걸리면 매칭 수가 많은 쪽, 동률이면 선언 순서가 앞선 쪽을 쓴다(결정적).
 */
export function classifyContentTopic(signalText: string): MarketingContentTopicClass {
  const text = toSafeLower(signalText);
  if (!text) return "general";
  let best: MarketingContentTopicClass = "general";
  let bestHits = 0;
  for (const [topicClass, terms] of Object.entries(TOPIC_CLASS_LEXICON) as [
    Exclude<MarketingContentTopicClass, "general">,
    string[],
  ][]) {
    const hits = terms.reduce((count, term) => (matchesTerm(text, term) ? count + 1 : count), 0);
    if (hits > bestHits) {
      best = topicClass;
      bestHits = hits;
    }
  }
  return bestHits > 0 ? best : "general";
}

function toSafeLower(value: unknown) {
  return typeof value === "string" ? value.toLowerCase() : "";
}

/** 채널·주제·요일 기준 시간대 벤치마크 가중치(0~1). */
export function getBenchmarkHourWeight(args: {
  channel: string;
  topicClass: MarketingContentTopicClass;
  hour: number;
  weekend: boolean;
}): number {
  const channel = (MARKETING_UPLOAD_POLICY_CHANNELS as readonly string[]).includes(args.channel)
    ? (args.channel as MarketingUploadPolicyChannel)
    : "instagram";
  const table = MARKETING_UPLOAD_HOUR_BENCHMARK[channel][args.topicClass] || MARKETING_UPLOAD_HOUR_BENCHMARK[channel].general;
  const map = (args.weekend && table.weekend) || table.weekday;
  const weight = map[args.hour];
  return typeof weight === "number" ? weight : BENCHMARK_FALLBACK_WEIGHT;
}
