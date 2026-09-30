export const NEWSLETTER_UTM_CONTRACT = {
  utm_source: "newsletter",
  utm_medium: "email",
} as const;

type NewsletterStory = {
  title: string;
  excerpt: string;
  url: string;
  commercialLabel?: "ad" | "affiliate";
};

type NewsletterTopic = {
  title: string;
  summary: string;
  url: string;
};

function safeString(value: unknown) {
  return String(value || "").trim();
}

function trackedUrl(canonicalUrl: string, issueId: string, content: string) {
  const parsed = new URL(canonicalUrl);
  if (!/^https?:$/.test(parsed.protocol)) throw new Error("NEWSLETTER_TRACKING_URL_INVALID");
  ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"].forEach((key) => parsed.searchParams.delete(key));
  parsed.searchParams.set("utm_source", NEWSLETTER_UTM_CONTRACT.utm_source);
  parsed.searchParams.set("utm_medium", NEWSLETTER_UTM_CONTRACT.utm_medium);
  parsed.searchParams.set("utm_campaign", issueId);
  parsed.searchParams.set("utm_content", content);
  return parsed.toString();
}

export function buildNewsletterTrackedContent(input: {
  issueId: string;
  stories: readonly NewsletterStory[];
  topic: NewsletterTopic;
}) {
  const issueId = safeString(input.issueId);
  if (!issueId || issueId.length > 200) throw new Error("INVALID_NEWSLETTER_ISSUE_ID");

  return {
    stories: input.stories.map((story, index) => ({
      ...story,
      url: trackedUrl(story.url, issueId, String(index + 1)),
    })),
    topic: {
      ...input.topic,
      url: trackedUrl(input.topic.url, issueId, "topic"),
    },
  };
}
