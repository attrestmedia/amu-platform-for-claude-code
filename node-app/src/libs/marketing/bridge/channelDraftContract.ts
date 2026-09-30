import type { MarketingChannel } from "consts/marketing/queue";

export function getMarketingChannelDraftSchemaExample(channel: MarketingChannel) {
  if (channel === "threads") {
    return {
      channel: "threads",
      title: "운영 검수용 제목",
      text: "본문(500자 초과 시 reply thread로 분할 발행)",
      linkUrl: "canonical url(링크 발행이 필요 없으면 빈 문자열)",
      hashtags: ["#tag"],
      cta: "짧은 CTA",
    };
  }

  if (channel === "instagram") {
    return {
      channel: "instagram",
      title: "운영 검수용 제목",
      caption: "Instagram caption",
      body: "Instagram caption",
      imageUrl: "public image url",
      linkUrl: "canonical url",
      hashtags: ["#tag"],
      cta: "짧은 CTA",
      semanticCards: [
        {
          role: "cover",
          eyebrow: "기사 주제",
          headline: "한 장에는 하나의 메시지만 담습니다",
          body: "본문의 핵심을 의미 구조로 나누고 템플릿이 배치를 결정합니다.",
          evidence: { assetId: "source.genStudioImageAssetId" },
          altText: "기사 대표 이미지가 포함된 카드뉴스 표지",
        },
        {
          role: "body",
          eyebrow: "핵심 포인트",
          headline: "중요한 내용을 순서대로 연결합니다",
          body: "이 값은 semantic content 예시이며 좌표·폰트·외부 원본 URL을 포함하지 않습니다.",
          altText: "기사 핵심 포인트 카드",
        },
        {
          role: "closing",
          eyebrow: "AMU MAGAZINE",
          headline: "자세한 내용은 원문에서 확인하세요",
          cta: "저장하고 다시 읽어보세요",
          altText: "카드뉴스 마무리 카드",
        },
      ],
    };
  }

  if (channel === "linkedin") {
    return {
      channel: "linkedin",
      headline: "LinkedIn 헤드라인",
      body: "LinkedIn 본문",
      text: "LinkedIn 본문",
      summary: "짧은 요약",
      commentLink: "canonical url",
      hashtags: ["#tag"],
      cta: "CTA",
      suggestedMode: "buffer_schedule",
    };
  }

  return {
    channel: "naver_blog",
    title: "네이버 블로그 제목",
    summary: "네이버 블로그 요약",
    body: "검토 화면에 표시할 본문",
    html: "<p>...</p>",
    plainText: "서식 제거 본문",
    linkUrl: "canonical url",
    tags: ["태그"],
    cta: "CTA",
  };
}
