import type { InteractiveArticleResource } from "../../motion-story";

/**
 * 계약·런타임 검증용 샘플 리소스. **실제 기사 아님 · 공개 금지** (status: draft, 레지스트리 미등록).
 * 수치는 layout 검증용 예시값이며 사실 주장이 아니다.
 * 7개 layout 가운데 cover · statement · image_text · comparison · quote · outro 와
 * reveal(line · word · fade), 강조(underline · number-count), 카메라, 전환을 한 번씩 쓴다.
 */
export const SAMPLE_INTERACTIVE_ARTICLE: InteractiveArticleResource = {
  contractType: "amu-interactive-article",
  schemaVersion: "interactive-article.v1",
  articleId: "ia-sample-workflow",
  slug: "sample-workflow",
  status: "draft",
  revision: "r1",
  createdAt: "2026-09-30T09:00:00+09:00",
  updatedAt: "2026-09-30T09:00:00+09:00",
  source: { kind: "app_content", ref: "fixture:sample-article", title: "(샘플) 일하는 순서를 바꾸는 법" },
  title: "(샘플) 같은 일, 다른 비용",
  summary: "반복되는 일을 흐름으로 묶었을 때 무엇이 달라지는지 장면으로 따라가 보는 샘플 인터랙티브 아티클.",
  motionTokensVersion: "motion-tokens.v1",
  assets: [
    { assetId: "cover", src: "/images/interactive-articles/sample/cover.webp", alt: "책상 위에 놓인 작업 흐름 메모", width: 1080, height: 1920 },
    { assetId: "team", src: "/images/interactive-articles/sample/team.webp", alt: "회의실에서 화이트보드를 보는 팀", width: 1080, height: 1920 },
  ],
  beats: [
    { beatId: "b-hook", role: "hook", body: ["같은 일을 하는데", "비용은 왜 달라질까"], importance: 5, sourceRefs: ["fixture:title"] },
    {
      beatId: "b-problem",
      role: "problem",
      body: ["팀마다 AI 도구를 쓰는 방식이 제각각이다.", "누구는 매번 새로 묻고, 누구는 흐름을 만든다."],
      importance: 4,
      sourceRefs: ["fixture:block-1"],
    },
    { beatId: "b-context", role: "context", body: ["한 팀의 한 달을 따라가 봤다."], importance: 3, sourceRefs: ["fixture:block-2"] },
    { beatId: "b-evidence", role: "evidence", body: ["반복 작업을 흐름으로 묶은 뒤"], importance: 4, sourceRefs: ["fixture:block-3"] },
    { beatId: "b-turn", role: "turn", body: ["도구가 아니라 일하는 순서를 바꾼 것이다."], importance: 3, sourceRefs: ["fixture:block-4"] },
    { beatId: "b-takeaway", role: "takeaway", body: ["먼저 반복되는 일 하나를 골라", "그 순서를 적어 보자."], importance: 5, sourceRefs: ["fixture:block-5"] },
    { beatId: "b-cta", role: "cta", body: ["원문에서 전체 과정을 확인해 보세요."], importance: 2, sourceRefs: ["fixture:block-5"] },
  ],
  scenes: [
    {
      sceneId: "s-hook",
      beatIds: ["b-hook"],
      layout: "cover",
      visual: { assetId: "cover", camera: "camera.push" },
      text: { reveal: "line", enter: "enter.mask-reveal" },
      timing: { preRollMs: 360, durationMs: 2800, holdMs: 1200 },
      transitionOut: "trans.fade",
    },
    {
      sceneId: "s-problem",
      beatIds: ["b-problem"],
      layout: "statement",
      text: { reveal: "line", enter: "enter.fade-up" },
      timing: { preRollMs: 360, durationMs: 4400, holdMs: 1200 },
      transitionOut: "trans.fade",
    },
    {
      sceneId: "s-context",
      beatIds: ["b-context"],
      layout: "image_text",
      visual: { assetId: "team", camera: "camera.pan-left" },
      text: { reveal: "line", enter: "enter.fade-up" },
      timing: { preRollMs: 360, durationMs: 2400, holdMs: 1200 },
      transitionOut: "trans.wipe",
    },
    {
      sceneId: "s-evidence",
      beatIds: ["b-evidence"],
      layout: "comparison",
      data: {
        figures: [
          { label: "도입 전 1건 처리 시간 (예시)", value: 42, unit: "분", claimStatus: "measured", sourceRefs: ["fixture:block-3"] },
          { label: "도입 후 1건 처리 시간 (예시)", value: 18, unit: "분", claimStatus: "measured", sourceRefs: ["fixture:block-3"] },
        ],
      },
      text: { reveal: "fade", enter: "enter.fade", emphasis: "emph.number-count" },
      timing: { preRollMs: 360, durationMs: 3200, holdMs: 1400 },
      transitionOut: "trans.fade",
    },
    {
      sceneId: "s-turn",
      beatIds: ["b-turn"],
      layout: "quote",
      text: { reveal: "word", enter: "enter.fade" },
      timing: { preRollMs: 360, durationMs: 2600, holdMs: 1200 },
      transitionOut: "trans.zoom",
    },
    {
      sceneId: "s-takeaway",
      beatIds: ["b-takeaway"],
      layout: "statement",
      text: { reveal: "line", enter: "enter.scale-in", emphasis: "emph.underline" },
      timing: { preRollMs: 360, durationMs: 2850, holdMs: 1000 },
      transitionOut: "trans.fade",
    },
    {
      sceneId: "s-cta",
      beatIds: ["b-cta"],
      layout: "outro",
      text: { reveal: "fade", enter: "enter.fade" },
      timing: { preRollMs: 240, durationMs: 2400, holdMs: 0 },
      transitionOut: "trans.cut",
    },
  ],
  sceneOrder: ["s-hook", "s-problem", "s-context", "s-evidence", "s-turn", "s-takeaway", "s-cta"],
  surfaces: {
    story: { sceneIds: ["s-hook", "s-problem", "s-context", "s-evidence", "s-turn", "s-takeaway", "s-cta"] },
    hero: { sceneIds: ["s-hook", "s-context"] },
    homeCard: { sceneIds: ["s-hook", "s-takeaway"], tier: "motion" },
  },
};
