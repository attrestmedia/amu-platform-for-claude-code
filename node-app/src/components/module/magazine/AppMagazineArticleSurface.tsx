import { headers } from "next/headers";
import type { AppContentBlock, AppMagazineContent } from "libs/server-utils/magazine/appContentContract";
import type { MagazineNarrationPlayback } from "libs/server-utils/magazine/magazineNarrationContract";
import type { MagazineArticleSlot } from "libs/server-utils/magazine/magazineEmbedContract";
import { MAGAZINE_DYNAMIC_MODULES } from "libs/server-utils/magazine/magazineEmbedContract";
import { resolveMagazineEmbedRequest } from "libs/server-utils/magazine/magazineEmbedResolver";
import { buildAppMagazineContentDeclaration } from "libs/server-utils/magazine/appContentDeclaration";
import { buildEditorialStoryManifest } from "libs/server-utils/magazine/editorialStory";
import AppMagazineRelationshipBar from "./AppMagazineRelationshipBar";
import AppMagazineReadingUtilityBar from "./AppMagazineReadingUtilityBar";
import AppMagazineInteractiveSlot from "./AppMagazineInteractiveSlot";
import AppMagazineAnalyticsContext from "./AppMagazineAnalyticsContext";
import AppMagazineStoryMode from "./AppMagazineStoryMode";
import { AppMagazineMotionCover } from "./AppMagazineMotionCover";
import AppMagazineNarrationPlayer from "./AppMagazineNarrationPlayer";

/**
 * @docHint
 * @purpose /magazine/{slug} SSR 정적 완결 표면 + E3 동적 모듈 인터랙티브 embed
 * @process prose는 저장 시점 살균본을 그대로 렌더하고, 동적 slot은 resolver로 판정해
 *          enabled면 전용 embed(iframe·복귀)를, disabled면 staticFallback으로 정적 완결을 보장한다(E3 실패 시에도 본문 완결 계약).
 * @domain magazine-content-experience
 * @scope article-surface
 */

/** 요청 Host 기반으로 사이트 오리진을 파생한다 — 로컬 dev(IP/localhost, http)와 prod(allmyuniverse.com, https)를 모두 정합. */
async function requestOrigin(): Promise<string> {
  const h = await headers();
  const host = h.get("host") || "allmyuniverse.com";
  const proto = h.get("x-forwarded-proto")?.split(",")[0]?.trim()
    || (host.startsWith("localhost") || /^\d{1,3}(?:\.\d{1,3}){3}/.test(host) ? "http" : "https");
  return `${proto}://${host}`;
}

type AppMagazineArticleSurfaceProps = {
  content: AppMagazineContent;
  contentRevision: string;
  updatedAt: string;
  narration?: MagazineNarrationPlayback | null;
};

interface SectionGroup {
  sectionId: string;
  blocks: { block: AppContentBlock; slot?: MagazineArticleSlot }[];
}

function groupBySection(content: AppMagazineContent): SectionGroup[] {
  const slotById = new Map((content.slots ?? []).map((slot) => [slot.slotId, slot]));
  const groups: SectionGroup[] = [];
  for (const block of content.body) {
    const slot = block.kind === "module" ? slotById.get(block.slotId) : undefined;
    const last = groups[groups.length - 1];
    if (last && last.sectionId === block.sectionId) {
      last.blocks.push({ block, slot });
    } else {
      groups.push({ sectionId: block.sectionId, blocks: [{ block, slot }] });
    }
  }
  return groups;
}

function getTopicRefs(content: AppMagazineContent) {
  return (content.topicRefs ?? []).map((topic) => ({
    topicId: topic.topicId,
    topicKey: topic.topicKey,
    label: { ko: topic.label },
  }));
}

async function resolveDynamicSlot(content: AppMagazineContent, slot: MagazineArticleSlot, origin: string): Promise<{ enabled: boolean }> {
  const declaration = buildAppMagazineContentDeclaration(content);
  if (!declaration) return { enabled: false };
  // iframe 없이 직접 렌더하므로 launch token은 발급하지 않는다(issuLaunchToken:false) — magazine-side 게이트(registry·allowlist·env)만 판정.
  const response = await resolveMagazineEmbedRequest({
    body: {
      contractType: "magazine-embed-resolve-request",
      schemaVersion: "article-experience.v2",
      declaration,
      slot,
      context: {
        contentRef: declaration.contentRef,
        sectionId: slot.sectionId,
        experienceId: slot.slotId,
        experienceLevel: content.experienceLevel,
        returnSectionId: declaration.returnSectionId,
        parentOrigin: origin,
        issueLaunchToken: false,
      },
    },
    site: origin,
  });
  return { enabled: response.ok && response.data.enabled };
}

export default async function AppMagazineArticleSurface({ content, contentRevision, updatedAt, narration }: AppMagazineArticleSurfaceProps) {
  const sourceUrl = content.sourceArticle
    ? `https://allmyuniverse.com/${content.sourceArticle.wpPostSlug}/`
    : null;

  const contextAction = content.sourceArticle
    ? {
        href: sourceUrl as string,
        label: content.sourceArticle.relationship === "upgrade"
          ? { ko: "원문 기사 보기", en: "Read the original article" }
          : { ko: "관련 원문 보기", en: "Read the related article" },
      }
    : undefined;
  const storyManifest = buildEditorialStoryManifest(content, contentRevision);
  const isInteractiveContent = content.experienceLevel === "interactive";

  // 동적 module slot은 서버에서 일괄 resolve한 뒤 JSX를 동기 렌더한다(서버 컴포넌트에서 await 금지).
  const resolvedSlots = new Map<string, { enabled: boolean }>();
  const groups = groupBySection(content);
  const origin = await requestOrigin();
  for (const group of groups) {
    for (const { slot } of group.blocks) {
      if (slot && (MAGAZINE_DYNAMIC_MODULES as readonly string[]).includes(slot.moduleType)) {
        resolvedSlots.set(slot.slotId, await resolveDynamicSlot(content, slot, origin));
      }
    }
  }

  // AIR-403 — 기사당 Primary 서비스 1개 계약(AIR-402)에 따라 첫 동적 slot의 serviceKey를 표면 서비스로 쓴다.
  const primaryService = (content.slots ?? []).find(
    (slot) => (MAGAZINE_DYNAMIC_MODULES as readonly string[]).includes(slot.moduleType) && slot.serviceKey,
  )?.serviceKey;

  return (
    <>
      <AppMagazineAnalyticsContext
        contentId={content.contentId}
        contentSlug={content.slug}
        experienceLevel={content.experienceLevel}
        primaryService={primaryService === "gen-studio" ? "gen_studio" : primaryService}
        sourcePostId={content.sourceArticle ? String(content.sourceArticle.wpPostId ?? "") : undefined}
        sourceRelationship={content.sourceArticle?.relationship}
      />
      <AppMagazineReadingUtilityBar title={content.title} />
      <article
      data-surface="magazine_app"
      data-content-id={content.contentId}
      data-experience-level={content.experienceLevel}
      className={`mx-auto w-full max-w-3xl px-4 py-10 ${contextAction ? "pb-28" : ""}`}
      >
      <header className="mb-8">
        <h1 className="text-3xl font-bold leading-tight text-primary-text">{content.title}</h1>
        <p className="mt-3 text-lg leading-relaxed text-secondary-text">{content.heroLine}</p>
        {isInteractiveContent ? (
          <div className="mt-6" data-app-content-motion-cover="interactive">
            <AppMagazineMotionCover
              title={content.title}
              description={content.heroLine}
              imageAlt={content.cover.coverArtDirection.scene || content.title}
              tier="signature"
              sizes="(max-width: 768px) 100vw, 720px"
              fallbackContent={<span className="text-2xl font-semibold tracking-[0.18em]">AMU / INTERACTIVE</span>}
            />
          </div>
        ) : null}
        <div className="mt-5">
          <AppMagazineStoryMode manifest={storyManifest} archetype={content.primaryArchetype} />
        </div>
        <AppMagazineRelationshipBar
          slug={content.slug}
          contentRevision={contentRevision}
          blockIds={content.body.map((block) => block.blockId)}
          topics={getTopicRefs(content)}
          contextAction={contextAction}
        />
        {narration ? <AppMagazineNarrationPlayer narration={narration} /> : null}
      </header>

      <section aria-label="도입" className="mb-10 rounded-2xl border border-border bg-surface p-6">
        <p className="leading-7 text-secondary-text">{content.coldOpen.problem}</p>
        <p className="mt-3 leading-7 text-secondary-text">{content.coldOpen.scene}</p>
        <p className="mt-3 font-medium leading-7 text-primary-text">{content.coldOpen.tension}</p>
      </section>

      <div className="space-y-10">
        {groups.map((group) => (
          <section key={group.sectionId} id={group.sectionId} className="scroll-mt-24">
            {group.blocks.map(({ block, slot }) => {
              if (block.kind === "prose") {
                return (
                  <div
                    key={block.blockId}
                    id={block.blockId}
                    tabIndex={-1}
                    className="space-y-4 leading-7 text-secondary-text [&_a]:underline [&_h2]:mt-8 [&_h2]:text-2xl [&_h2]:font-bold [&_h2]:text-primary-text [&_h3]:mt-6 [&_h3]:text-lg [&_h3]:font-semibold [&_h3]:text-primary-text [&_li]:ml-5 [&_li]:list-disc [&_p]:my-3"
                    dangerouslySetInnerHTML={{ __html: block.html }}
                  />
                );
              }
              if (slot && (MAGAZINE_DYNAMIC_MODULES as readonly string[]).includes(slot.moduleType)) {
                const resolved = resolvedSlots.get(slot.slotId) || { enabled: false };
                return (
                  <aside
                    key={block.blockId}
                    id={block.blockId}
                    tabIndex={-1}
                    aria-label="읽기 모듈"
                    className="rounded-2xl border border-border bg-surface p-6"
                  >
                    <AppMagazineInteractiveSlot
                      content={{ title: content.title, primaryQuestion: content.primaryQuestion }}
                      slot={{
                        slotId: slot.slotId,
                        sectionId: slot.sectionId,
                        intent: slot.intent,
                        moduleType: slot.moduleType,
                        serviceKey: slot.serviceKey,
                        templateKey: slot.templateKey,
                        contextKey: slot.contextKey,
                        allowedProps: slot.allowedProps,
                        staticFallback: slot.staticFallback,
                      }}
                      enabled={resolved.enabled}
                    />
                  </aside>
                );
              }
              return (
                <aside
                  key={block.blockId}
                  id={block.blockId}
                  tabIndex={-1}
                  aria-label="읽기 모듈"
                  className="rounded-2xl border border-border bg-surface p-6"
                >
                  <p className="whitespace-pre-wrap leading-7 text-secondary-text">{slot?.staticFallback ?? ""}</p>
                </aside>
              );
            })}
          </section>
        ))}
      </div>

      <footer className="mt-12 border-t border-border pt-6 text-sm text-secondary-text">
        {sourceUrl ? (
          <p>
            원문 기사:{" "}
            <a href={sourceUrl} className="underline underline-offset-2">
              {sourceUrl}
            </a>
          </p>
        ) : null}
        <p className="mt-2">최종 수정: {updatedAt.slice(0, 10)}</p>
      </footer>
      </article>
    </>
  );
}
