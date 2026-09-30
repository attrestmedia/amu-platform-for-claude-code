import type { Metadata } from "next";
import { notFound } from "next/navigation";

import AppMagazineArticleSurface from "components/module/magazine/AppMagazineArticleSurface";
import { Lang } from "components/module/i18n";
import { getAppMagazineContentBySlug } from "libs/server-utils/magazine/appContentRepo";
import { isAppContentSlug } from "libs/server-utils/magazine/appContentValidate";
import { resolveMagazineNarrationPlayback } from "libs/server-utils/magazine/magazineNarrationService";

/**
 * @docHint
 * @purpose App 고도화 콘텐츠 /magazine/{slug} SSR 표면
 * @process 저장된 seo 계약(QA-2 확정 규칙)으로 canonical·robots를 렌더한다 — 페이지가 판정을 만들지 않는다.
 * @domain magazine-content-experience
 * @scope article-page
 */

export const dynamic = "force-dynamic";

type PageProps = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  if (!isAppContentSlug(slug)) {
    return { title: "콘텐츠를 찾을 수 없습니다 | All My Universe", robots: { index: false, follow: false } };
  }
  const result = await getAppMagazineContentBySlug(slug);
  if (!result.ok) {
    return { title: "콘텐츠를 찾을 수 없습니다 | All My Universe", robots: { index: false, follow: false } };
  }
  const { content } = result.data;
  return {
    title: `${content.seoTitle} | All My Universe`,
    description: content.excerpt,
    alternates: { canonical: content.seo.canonicalUrl },
    robots: { index: content.seo.indexable, follow: true },
    openGraph: {
      title: content.seoTitle,
      description: content.excerpt,
      type: "article",
      url: content.seo.canonicalUrl,
      siteName: "All My Universe",
      locale: "ko_KR",
    },
    twitter: {
      card: "summary_large_image",
      title: content.seoTitle,
      description: content.excerpt,
    },
  };
}

export default async function AppMagazineContentPage({ params }: PageProps) {
  const { slug } = await params;
  if (!isAppContentSlug(slug)) notFound();
  const result = await getAppMagazineContentBySlug(slug);
  if (!result.ok) notFound();
  const { content, updatedAt } = result.data;
  const narration = await resolveMagazineNarrationPlayback({ content: result.data });

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: content.title,
    alternativeHeadline: content.heroLine,
    description: content.excerpt,
    dateModified: updatedAt,
    mainEntityOfPage: content.seo.canonicalUrl,
    inLanguage: "ko",
  };

  return (
    <>
      <a
        href="#magazine-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-full focus:bg-background focus:px-4 focus:py-3 focus:text-sm focus:font-semibold focus:text-primary-text focus:ring-2 focus:ring-primary"
      >
        <Lang text={{ ko: "본문으로 바로가기", en: "Skip to article" }} />
      </a>
      <main id="magazine-content" tabIndex={-1}>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <AppMagazineArticleSurface content={content} contentRevision={result.data.revision} updatedAt={updatedAt} narration={narration} />
      </main>
    </>
  );
}
