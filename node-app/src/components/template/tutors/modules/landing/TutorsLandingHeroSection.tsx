import { Lang } from "components/module/i18n";
import { Button } from "@amu-labs/ui";
import { ArrowRight } from "lucide-react";
import type { PublicTutorGalleryItemType } from "types/ai";
import TutorsPublicGallery from "./TutorsPublicGallery";
import { TUTORS_HERO_COPY } from "./tutorsLandingContent";
import { useAuthStore } from "store/auth";

type Props = {
  galleryItems: PublicTutorGalleryItemType[];
  onStart: () => void;
};

/**
 * 히어로 — 첫 뷰포트 One composition.
 * 브랜드 + 헤드라인 1 + 보조문장 1 + CTA 1 + 풀블리드 비주얼만 둔다.
 * 미디어 위에 배지/칩/라벨을 올리지 않고, 카드도 쓰지 않는다.
 */
export default function TutorsLandingHeroSection({ galleryItems, onStart }: Props) {
  const isLoggedIn = useAuthStore((s) => s.isLogged());
  return (
    <section className="relative isolate overflow-hidden border-b border-border/60">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 opacity-80"
        style={{
          backgroundImage:
            "radial-gradient(55% 50% at 78% 36%, hsl(var(--primary) / 0.12), transparent 72%), radial-gradient(45% 40% at 18% 72%, hsl(var(--secondary) / 0.10), transparent 74%)",
        }}
      />
      <div className="mx-auto grid w-full max-w-[75rem] items-center gap-8 px-5 py-12 sm:min-h-[40rem] sm:grid-cols-[minmax(0,0.95fr)_minmax(20rem,1.05fr)] sm:px-8 sm:py-16 lg:gap-12">
        <div className="animate-in fade-in slide-in-from-bottom-4 max-w-[34rem] duration-700 ease-out motion-reduce:animate-none">
          {/* 브랜드 시그널 — nav 텍스트가 아니라 히어로 수준으로 */}
          <div className="flex items-baseline gap-3">
            <p className="text-3xl font-extrabold tracking-tight text-primary sm:text-4xl">{TUTORS_HERO_COPY.brand}</p>
            <span className="text-xs font-bold tracking-[0.12em] text-secondary-text">
              <Lang text={TUTORS_HERO_COPY.status} />
            </span>
          </div>

          <h1 className="mt-6 whitespace-pre-line text-4xl font-extrabold leading-[1.16] tracking-tight [word-break:keep-all] sm:text-6xl">
            <Lang text={TUTORS_HERO_COPY.headline} />
          </h1>

          <p className="mt-6 max-w-[28rem] text-base leading-relaxed text-secondary-text [word-break:keep-all] sm:text-lg">
            <Lang text={TUTORS_HERO_COPY.lead} />
          </p>

          <div className="mt-10">
            <Button size="xl" rounded="full" onClick={onStart}>
              <Lang text={isLoggedIn ? TUTORS_HERO_COPY.cta.loggedIn : TUTORS_HERO_COPY.cta.loggedOut} />
              <ArrowRight className="h-5 w-5" />
            </Button>
          </div>
        </div>

        <div className="relative min-h-[20rem] sm:min-h-[30rem]">
          <TutorsPublicGallery items={galleryItems} onSelect={onStart} />
        </div>
      </div>
    </section>
  );
}
