"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion, useInView, useReducedMotion } from "framer-motion";
import { AmuLogo, AmuSimbol } from "@amu-labs/ui/icons/brand/amu";
import { Button, Preloader } from "@amu-labs/ui";
import { Lang, lang } from "components/module/i18n";
import { ImageBox } from "components/module/image";
import { SiteFooter, TopBar } from "components/module/layout";
import { useAuthStore } from "store/auth";
import { useUserData } from "hooks/auth";
import { getPosts } from "libs/api/wp/wp";
import type { IWpPost } from "types/thirdparty";
import { ArrowRight, Bookmark } from "lucide-react";
import { decodeHtmlEntities, isDev, sanitizeDescription } from "utils/common";
import { PAGE_LAYOUT_CLASS } from "utils/theme";

/* ================================================================
   RevealSection — 스크롤 진입 시 fade-up 애니메이션
   ================================================================ */
function RevealSection({
  children,
  className,
  delay = 0,
  id,
}: {
  children: React.ReactNode;
  className?: string;
  delay?: number;
  id?: string;
}) {
  const ref = useRef<HTMLElement>(null);
  const isInView = useInView(ref, { once: true, margin: "-60px" });
  const shouldReduceMotion = useReducedMotion();

  return (
    <motion.section
      ref={ref}
      id={id}
      initial={shouldReduceMotion ? false : { opacity: 0, y: 28 }}
      animate={shouldReduceMotion ? undefined : isInView ? { opacity: 1, y: 0 } : {}}
      transition={shouldReduceMotion ? { duration: 0 } : { duration: 0.7, ease: [0.22, 1, 0.36, 1], delay }}
      className={className}
    >
      {children}
    </motion.section>
  );
}

// 루트 홈은 소셜 OAuth를 수행하지 않는다. 운영에서는 기존 app 서브도메인으로 딥링크해
// Google·Kakao·Naver callback/redirect_uri 계약을 유지하고, 개발에서는 현재 앱의 로그인 화면을 사용한다.
const APP_LOGIN_URL = isDev ? "/login" : "https://app.allmyuniverse.com/login";

function getWpPostThumbnail(post: IWpPost) {
  const media = post._embedded?.["wp:featuredmedia"]?.[0];
  const sizes = media?.media_details?.sizes || {};

  return (
    post.featured_media_url ||
    sizes.large?.source_url ||
    sizes.medium_large?.source_url ||
    sizes.medium?.source_url ||
    sizes.thumbnail?.source_url ||
    media?.source_url ||
    ""
  );
}

function formatModifiedDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  return new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(date);
}

/* ================================================================
   HomePageClient
   ================================================================ */
export default function HomePageClient() {
  const router = useRouter();
  const isLoggedIn = useAuthStore((s) => s.isLogged());
  const { userData, isAdministrator } = useUserData();
  const [pendingHref, setPendingHref] = useState<string | null>(null);
  const [posts, setPosts] = useState<IWpPost[]>([]);
  const [isPostsLoading, setIsPostsLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    const loadMagazinePosts = async () => {
      try {
        const response = await getPosts({ perPage: 5, orderby: "date", order: "desc", includeMedia: true });
        if (mounted) setPosts(response.data || []);
      } catch {
        // 홈이 비어도 헤더·매거진 진입은 유지한다.
      } finally {
        if (mounted) setIsPostsLoading(false);
      }
    };

    void loadMagazinePosts();

    return () => {
      mounted = false;
    };
  }, []);

  const articleCards = useMemo(
    () =>
      posts.map((post) => ({
        id: post.id,
        title: decodeHtmlEntities(post.title?.rendered || ""),
        excerpt: sanitizeDescription(post.excerpt?.rendered || ""),
        href: post.link,
        thumbnail: getWpPostThumbnail(post),
        thumbnailAlt: decodeHtmlEntities(post.featured_media_alt || post.title?.rendered || ""),
        modified: formatModifiedDate(post.modified),
      })),
    [posts],
  );
  const leadStory = articleCards[0];
  const supportingStories = articleCards.slice(1);

  const handleNavigate = (href: string) => {
    if (pendingHref) return;
    setPendingHref(href);
    if (/^https?:\/\//.test(href)) {
      window.location.assign(href);
      return;
    }
    router.push(href);
  };

  return (
    <div className={PAGE_LAYOUT_CLASS}>
      <TopBar
        isLoggedIn={isLoggedIn}
        userName={userData?.userInfo?.name}
        canShowAdminButton={isLoggedIn && Boolean(isAdministrator)}
        onAdminClick={() => handleNavigate("/admin")}
        onLoginClick={() => window.location.assign(APP_LOGIN_URL)}
        onLoginSuccess={() => router.refresh()}
        logoutRedirectPage="/"
      >
        <div className="flex items-center gap-2 sm:gap-3">
          <AmuSimbol width={32} height={32} color="var(--text-primary)" className="sm:h-9 sm:w-9" />
          <AmuLogo width={108} color="var(--text-primary)" className="relative top-[2px] hidden sm:block" />
        </div>
      </TopBar>

      {pendingHref && (
        <Preloader
          container
          fullScreen
          size="lg"
          text={<Lang text={{ ko: "이동 중입니다...", en: "Opening..." }} />}
          containerClassName="bg-background/85 backdrop-blur-sm"
          textClassName="font-medium text-primary-text"
        />
      )}

      <header className="border-b border-border bg-background">
        <div className="mx-auto grid max-w-[80rem] gap-10 px-5 py-14 sm:px-8 sm:py-20 lg:grid-cols-[minmax(0,1.2fr)_minmax(16rem,0.8fr)] lg:items-end lg:gap-24 lg:py-28">
          <div className="max-w-[44rem]">
            <div className="mb-6 flex items-center gap-3 text-xs font-semibold uppercase tracking-[0.2em] text-secondary-text">
              <span className="flex h-10 w-10 items-center justify-center rounded-full border border-border">
                <AmuSimbol width={24} height={24} color="var(--text-primary)" />
              </span>
              <span>All My Universe Magazine</span>
            </div>
            <h1 className="max-w-[13ch] text-4xl font-bold leading-[1.08] tracking-[-0.04em] text-primary-text sm:text-6xl">
              <Lang
                text={{
                  ko: "읽고 끝나지 않는 콘텐츠.",
                  en: "Content that does not end when you finish reading.",
                }}
              />
            </h1>
            <p className="mt-6 max-w-[36rem] text-base leading-8 text-secondary-text sm:text-lg">
              <Lang
                text={{
                  ko: "AI 시대의 일과 성장, 창작과 놀이를 다룹니다. 오늘 읽은 관심이 질문과 배움, 만들기와 다음 이야기로 이어지도록.",
                  en: "Stories about work, growth, creativity, and play in the age of AI—so today's curiosity can lead to questions, learning, making, and the next story.",
                }}
              />
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Button
                variant="primary"
                size="lg"
                rounded="full"
                loading={pendingHref === "/magazine/"}
                disabled={Boolean(pendingHref)}
                onClick={() => handleNavigate("/magazine/")}
              >
                <Lang text={{ ko: "콘텐츠 둘러보기", en: "Explore content" }} />
                <ArrowRight className="ml-2 h-4 w-4" aria-hidden="true" />
              </Button>
              <a
                href="#latest-stories"
                className="inline-flex min-h-[44px] items-center gap-2 rounded-full px-4 text-sm font-medium text-secondary-text underline-offset-4 transition-colors hover:text-primary-text hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                <Lang text={{ ko: "최근 글 보기", en: "Read latest stories" }} />
              </a>
            </div>
            <p className="mt-6 flex items-start gap-2 text-sm leading-6 text-secondary-text">
              <Bookmark className="mt-1 h-4 w-4 flex-shrink-0 text-primary" aria-hidden="true" />
              <Lang
                text={
                  isLoggedIn
                    ? {
                        ko: "저장한 글과 관심 주제, 읽던 기록은 내 매거진에서 이어집니다.",
                        en: "Your saved stories, followed topics, and reading history continue in My Magazine.",
                      }
                    : {
                        ko: "로그인하면 저장·팔로우·이어 읽기로 관심을 계속 이어갈 수 있어요.",
                        en: "Sign in to keep your interests through saves, follows, and continue reading.",
                      }
                }
              />
            </p>
          </div>

          <div className="border-l-2 border-primary pl-5 sm:pl-6">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-secondary-text">Read / Question / Make / Play</p>
            <p className="mt-4 text-xl font-semibold leading-8 text-primary-text sm:text-2xl">
              <Lang
                text={{
                  ko: "하나의 이야기를 더 깊게 읽고, 필요할 때 다음 경험으로 확장하세요.",
                  en: "Read one story more deeply, then expand into the next experience when it helps.",
                }}
              />
            </p>
          </div>
        </div>
      </header>

      <main>
        <RevealSection id="latest-stories" className="py-16 sm:py-24">
          <div className="mx-auto max-w-[80rem] px-5 sm:px-8">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-secondary-text">Magazine desk</p>
                <h2 className="mt-3 text-3xl font-bold tracking-[-0.03em] text-primary-text sm:text-4xl">
                  <Lang text={{ ko: "오늘 읽을 콘텐츠", en: "Read today" }} />
                </h2>
                <p className="mt-3 max-w-[36rem] text-sm leading-7 text-secondary-text sm:text-base">
                  <Lang
                    text={{
                      ko: "가장 최근의 이야기에서 하나를 고르고, 관련된 생각을 천천히 따라가 보세요.",
                      en: "Choose a recent story and take your time following the ideas around it.",
                    }}
                  />
                </p>
              </div>
              <Link
                href="/magazine/"
                className="inline-flex min-h-[44px] items-center gap-2 text-sm font-semibold text-primary underline-offset-4 transition-colors hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                <Lang text={{ ko: "매거진 전체 보기", en: "View all Magazine" }} />
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
            </div>

            {isPostsLoading ? (
              <div className="mt-10 grid gap-5 lg:grid-cols-[minmax(0,1.25fr)_minmax(18rem,0.75fr)]" aria-busy="true">
                <div className="aspect-[16/10] animate-pulse rounded-2xl bg-muted" />
                <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-1">
                  <div className="min-h-40 animate-pulse rounded-2xl bg-muted" />
                  <div className="min-h-40 animate-pulse rounded-2xl bg-muted" />
                </div>
              </div>
            ) : leadStory ? (
              <div className="mt-10 grid gap-5 lg:grid-cols-[minmax(0,1.25fr)_minmax(18rem,0.75fr)]">
                <article className="group overflow-hidden rounded-2xl border border-border bg-surface">
                  <a
                    href={leadStory.href}
                    className="block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary"
                    aria-label={lang({ ko: `주요 기사 읽기: ${leadStory.title}`, en: `Read featured story: ${leadStory.title}` })}
                  >
                    <div className="relative aspect-[16/10] overflow-hidden bg-muted">
                      {leadStory.thumbnail ? (
                        <ImageBox
                          src={leadStory.thumbnail}
                          alt={leadStory.thumbnailAlt}
                          width="100%"
                          height="100%"
                          objectFit="object-cover"
                          sizes="(max-width: 1024px) 100vw, 62vw"
                          className="h-full w-full"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-secondary-text" aria-hidden="true">
                          <AmuSimbol width={48} height={48} color="currentColor" />
                        </div>
                      )}
                    </div>
                    <div className="p-5 sm:p-7">
                      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-secondary-text">
                        <Lang text={{ ko: "에디터 픽", en: "Editor's pick" }} />
                      </p>
                      <h3 className="mt-3 text-2xl font-bold leading-tight tracking-[-0.03em] text-primary-text sm:text-3xl">
                        {leadStory.title}
                      </h3>
                      <p className="mt-3 line-clamp-3 text-sm leading-7 text-secondary-text sm:text-base">{leadStory.excerpt}</p>
                      <span className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-primary">
                        <Lang text={{ ko: "기사 읽기", en: "Read story" }} />
                        <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-1" aria-hidden="true" />
                      </span>
                      {leadStory.modified && <p className="mt-4 text-xs text-secondary-text">{leadStory.modified}</p>}
                    </div>
                  </a>
                </article>

                <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-1">
                  {supportingStories.map((story) => (
                    <article key={story.id} className="group overflow-hidden rounded-2xl border border-border bg-surface transition-colors hover:bg-muted/5">
                      <a
                        href={story.href}
                        className="block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                        aria-label={lang({ ko: `기사 읽기: ${story.title}`, en: `Read story: ${story.title}` })}
                      >
                        <div className="relative aspect-[16/10] overflow-hidden bg-muted">
                          {story.thumbnail ? (
                            <ImageBox
                              src={story.thumbnail}
                              alt={story.thumbnailAlt}
                              width="100%"
                              height="100%"
                              objectFit="object-cover"
                              sizes="(max-width: 640px) 46vw, 360px"
                              className="h-full w-full"
                            />
                          ) : (
                            <div className="flex h-full w-full items-center justify-center text-secondary-text" aria-hidden="true">
                              <AmuSimbol width={36} height={36} color="currentColor" />
                            </div>
                          )}
                        </div>
                        <div className="p-5 sm:p-6">
                          <h3 className="line-clamp-3 text-base font-semibold leading-6 text-primary-text">{story.title}</h3>
                          <p className="mt-3 line-clamp-2 text-sm leading-6 text-secondary-text">{story.excerpt}</p>
                          {story.modified && <p className="mt-3 text-xs text-secondary-text">{story.modified}</p>}
                        </div>
                      </a>
                    </article>
                  ))}
                </div>
              </div>
            ) : (
              <div className="mt-10 rounded-2xl border border-border p-6">
                <p className="text-sm leading-7 text-secondary-text">
                  <Lang
                    text={{
                      ko: "새로운 이야기를 준비하고 있어요. 매거진에서 이전 콘텐츠를 먼저 둘러보세요.",
                      en: "New stories are on the way. Explore previous content in Magazine.",
                    }}
                  />
                </p>
              </div>
            )}
          </div>
        </RevealSection>

        <RevealSection className="border-t border-border py-16 sm:py-24">
          <div className="mx-auto max-w-[80rem] px-5 sm:px-8">
            <div className="grid gap-8 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] lg:items-start">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-secondary-text">Keep the thread</p>
                <h2 className="mt-3 text-2xl font-bold tracking-[-0.03em] text-primary-text sm:text-3xl">
                  <Lang text={{ ko: "읽은 뒤의 관심도 이어집니다.", en: "Keep what caught your interest." }} />
                </h2>
              </div>
              <div className="max-w-[42rem]">
                <p className="text-base leading-8 text-secondary-text">
                  <Lang
                    text={{
                      ko: "콘텐츠는 무료로 읽고, AMU ID로 저장·팔로우·이어 읽기 기록을 남길 수 있습니다. 기사에서 생긴 질문과 아이디어는 필요할 때 학습과 창작 경험으로 확장됩니다.",
                      en: "Read every story for free, then use your AMU ID to save, follow, and continue reading. Questions and ideas from an article can expand into learning and making when useful.",
                    }}
                  />
                </p>
                <a
                  href={isLoggedIn ? "/my-account/" : APP_LOGIN_URL}
                  className="mt-5 inline-flex min-h-[44px] items-center gap-2 text-sm font-semibold text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                >
                  <Lang
                    text={
                      isLoggedIn
                        ? { ko: "내 매거진 열기", en: "Open My Magazine" }
                        : { ko: "로그인하고 기록 이어가기", en: "Sign in to keep your thread" }
                    }
                  />
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </a>
              </div>
            </div>
          </div>
        </RevealSection>
      </main>

      <SiteFooter layout="wide" />
    </div>
  );
}
