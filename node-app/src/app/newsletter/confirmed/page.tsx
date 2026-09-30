"use client";

import { useEffect, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { trackGaEvent } from "utils/analytics/ga4";

export default function NewsletterConfirmedPage() {
  const searchParams = useSearchParams();
  const sent = useRef(false);

  useEffect(() => {
    if (sent.current) return;
    sent.current = true;
    const sourceLocation = searchParams.get("source_location") || "newsletter_page";
    const postSlug = searchParams.get("post_slug") || "";
    const key = `amu:newsletter_subscribe:${sourceLocation}:${postSlug}`;
    try {
      if (window.sessionStorage.getItem(key)) return;
      window.sessionStorage.setItem(key, "1");
    } catch {
      // 저장소가 차단된 경우에도 현재 확인 완료 화면에서는 1회 발화한다.
    }
    trackGaEvent("newsletter_subscribe", {
      source_location: sourceLocation,
      post_slug: postSlug,
    });
  }, [searchParams]);

  return (
    <main className="mx-auto max-w-2xl px-6 py-20" aria-labelledby="newsletter-confirmed-title">
      <h1 id="newsletter-confirmed-title" className="text-2xl font-semibold text-primary-text">
        뉴스레터 수신이 확인되었습니다
      </h1>
      <p className="mt-4 leading-7 text-secondary-text">
        이제 확인된 이메일 주소로 All My Universe 뉴스레터를 받을 수 있습니다.
      </p>
    </main>
  );
}
