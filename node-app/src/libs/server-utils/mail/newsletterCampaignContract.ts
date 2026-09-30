import type { NewsletterIssueData, NewsletterIssueStory, NewsletterIssueTopic } from "./templates";

export type NewsletterCurationSource = "top_article" | "related_behavior";

export type NewsletterCurationStory = NewsletterIssueStory & {
  source: NewsletterCurationSource;
  sourceRef: string;
};

export type NewsletterClaimCheck = {
  text: string;
  sourceRef: string;
  sourceUrl: string;
  verified: boolean;
};

export type NewsletterCurationDraft = {
  issueId: string;
  issueTitle: string;
  intro: string;
  stories: readonly NewsletterCurationStory[];
  topic: NewsletterIssueTopic;
  claims: readonly NewsletterClaimCheck[];
};

export type NewsletterCurationInput = Omit<NewsletterCurationDraft, "stories"> & {
  topArticles: readonly NewsletterCurationStory[];
  relatedBehaviorArticles: readonly NewsletterCurationStory[];
};

const URL_PATTERN = /^https:\/\/[^\s]+$/i;
const SOURCE_KINDS = new Set<NewsletterCurationSource>(["top_article", "related_behavior"]);

function text(value: unknown) {
  return String(value || "").trim();
}

function uniqueStories(stories: readonly NewsletterCurationStory[]) {
  const seen = new Set<string>();
  return stories.filter((story) => {
    const url = text(story.url);
    if (!url || seen.has(url)) return false;
    seen.add(url);
    return true;
  });
}

export function validateNewsletterCurationDraft(draft: NewsletterCurationDraft) {
  const issues: string[] = [];
  if (!text(draft.issueId) || text(draft.issueId).length > 200) issues.push("issue_id_required");
  if (!text(draft.issueTitle) || text(draft.issueTitle).length > 200) issues.push("issue_title_required");
  if (!text(draft.intro) || text(draft.intro).length > 2000) issues.push("intro_required");
  if (draft.stories.length < 3 || draft.stories.length > 5) issues.push("story_count_must_be_3_to_5");
  if (uniqueStories(draft.stories).length !== draft.stories.length) issues.push("duplicate_story_url");

  draft.stories.forEach((story, index) => {
    if (!SOURCE_KINDS.has(story.source)) issues.push(`story_${index}_source_invalid`);
    if (!text(story.sourceRef)) issues.push(`story_${index}_source_ref_required`);
    if (!text(story.title) || !text(story.excerpt)) issues.push(`story_${index}_copy_required`);
    if (!URL_PATTERN.test(text(story.url))) issues.push(`story_${index}_https_url_required`);
    if (story.commercialLabel && story.commercialLabel !== "ad" && story.commercialLabel !== "affiliate") {
      issues.push(`story_${index}_commercial_label_invalid`);
    }
  });

  if (!text(draft.topic.title) || !text(draft.topic.summary)) issues.push("topic_copy_required");
  if (!URL_PATTERN.test(text(draft.topic.url))) issues.push("topic_https_url_required");
  draft.claims.forEach((claim, index) => {
    if (!text(claim.text) || !text(claim.sourceRef) || !URL_PATTERN.test(text(claim.sourceUrl))) {
      issues.push(`claim_${index}_source_required`);
    }
    if (claim.verified !== true) issues.push(`claim_${index}_unverified`);
  });

  return { valid: issues.length === 0, issues };
}

export function buildNewsletterCurationDraft(input: NewsletterCurationInput) {
  const stories = uniqueStories([
    ...input.topArticles.map((story) => ({ ...story, source: "top_article" as const })),
    ...input.relatedBehaviorArticles.map((story) => ({ ...story, source: "related_behavior" as const })),
  ]).slice(0, 5);
  const draft: NewsletterCurationDraft = {
    issueId: text(input.issueId),
    issueTitle: text(input.issueTitle),
    intro: text(input.intro),
    stories,
    topic: {
      title: text(input.topic.title),
      summary: text(input.topic.summary),
      url: text(input.topic.url),
    },
    claims: input.claims.map((claim) => ({
      text: text(claim.text),
      sourceRef: text(claim.sourceRef),
      sourceUrl: text(claim.sourceUrl),
      verified: claim.verified === true,
    })),
  };
  return { draft, validation: validateNewsletterCurationDraft(draft) };
}

export function toNewsletterIssueData(draft: NewsletterCurationDraft): NewsletterIssueData {
  return {
    issueTitle: draft.issueTitle,
    intro: draft.intro,
    stories: draft.stories.map(({ source: _source, sourceRef: _sourceRef, ...story }) => story),
    topic: draft.topic,
    unsubscribeUrl: "",
  };
}
