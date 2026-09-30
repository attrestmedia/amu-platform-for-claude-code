import "server-only";

import type { AppMagazineContent } from "./appContentContract";
import { MAGAZINE_DYNAMIC_MODULES, type MagazineArticleDeclaration, type MagazineArticleSlot } from "./magazineEmbedContract";

/**
 * @docHint
 * @purpose App 고도화 콘텐츠(/magazine/{slug})로부터 Magazine Embed declaration을 파생
 * @process E3 동적 모듈이 있으면 contentRef=app_content 선언으로 일반화(AIR-400 §4.6, article-experience.v2)
 *          동적 모듈이 없는 E1/E2는 declaration을 만들지 않는다(embed 실행 대상 아님).
 * @domain magazine-content-experience
 * @scope server-contract
 */

/**
 * App 콘텐츠가 E3(동적 모듈)를 갖는 경우 Embed resolver가 쓸 declaration을 파생한다.
 * - contentRef = { kind: "app_content", contentId, slug } — WP post_id와 다른 namespace.
 * - slots는 콘텐츠 slots 그대로(슬롯 계약 article-experience.v2).
 * - returnSectionId는 primary 상호작용 슬롯의 sectionId로 서비스 복귀 지점을 잡는다.
 */
export function buildAppMagazineContentDeclaration(content: AppMagazineContent): MagazineArticleDeclaration | null {
  const slots = (content.slots ?? []) as MagazineArticleSlot[];
  const dynamicSlots = slots.filter((slot) => (MAGAZINE_DYNAMIC_MODULES as readonly string[]).includes(slot.moduleType as string));
  if (dynamicSlots.length === 0) return null;
  const primary = dynamicSlots.find((slot) => slot.interactionRole === "primary") || dynamicSlots[0];
  return {
    contractType: "article-experience-declaration",
    schemaVersion: "article-experience.v2",
    contentRef: { kind: "app_content", contentId: content.contentId, slug: content.slug },
    contentRole: content.contentRole,
    primaryArchetype: content.primaryArchetype,
    ...(content.supportingArchetype ? { supportingArchetype: content.supportingArchetype } : {}),
    experienceLevel: content.experienceLevel,
    primaryQuestion: content.primaryQuestion,
    slots,
    returnSectionId: primary.sectionId,
  } as unknown as MagazineArticleDeclaration;
}
