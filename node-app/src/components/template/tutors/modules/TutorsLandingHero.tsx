"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { LoginDialog } from "components/module/auth";
import { PAGE_LAYOUT_CLASS } from "utils/theme";
import { listPublicTutorGallery } from "libs/api/tutors/personas";
import { logger } from "utils/log";
import type { PublicTutorGalleryItemType } from "types/ai";
import TutorsLandingHeroSection from "./landing/TutorsLandingHeroSection";
import TutorsLandingExperience from "./landing/TutorsLandingExperience";
import TutorsLandingActions from "./landing/TutorsLandingActions";

type Props = {
  /** 로그인 상태. true면 CTAs가 /tutors/manage로 이동하고 LoginDialog를 숨깁니다. */
  isLoggedIn?: boolean;
};

/**
 * Tutors 랜딩 shell.
 *
 * 내러티브: Hero(정체성) → 대화 경험(맥락) → 나만의 튜터(설명) → 프리셋 → 마감 CTA — 총 5섹션.
 * 비로그인: 모든 CTA는 로그인 다이얼로그 하나로 모인다(1축 1CTA).
 * 로그인: CTAs는 /tutors/manage로 페이지 이동한다.
 * 섹션 구현은 ./landing/* 로 분리하고 여기서는 조립과 로그인 상태만 소유한다.
 */
export default function TutorsLandingHero({ isLoggedIn = false }: Props) {
  const router = useRouter();
  const [isLoginOpen, setIsLoginOpen] = useState(false);
  const [galleryItems, setGalleryItems] = useState<PublicTutorGalleryItemType[]>([]);

  const handleStart = useCallback(() => {
    if (isLoggedIn) {
      router.push("/tutors/manage");
    } else {
      setIsLoginOpen(true);
    }
  }, [isLoggedIn, router]);

  useEffect(() => {
    let cancelled = false;
    listPublicTutorGallery(4)
      .then((items) => {
        if (!cancelled) setGalleryItems(items);
      })
      .catch((error) => logger.warn("[TutorsLandingHero] 공개 튜터 갤러리 조회 실패:", error));
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className={PAGE_LAYOUT_CLASS}>
      <TutorsLandingHeroSection galleryItems={galleryItems} onStart={handleStart} />
      <TutorsLandingExperience />
      <TutorsLandingActions onStart={handleStart} />

      {!isLoggedIn && <LoginDialog open={isLoginOpen} onOpenChange={setIsLoginOpen} />}
    </div>
  );
}
