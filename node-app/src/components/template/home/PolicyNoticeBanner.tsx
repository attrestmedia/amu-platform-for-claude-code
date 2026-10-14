/**
 * @docHint
 * @purpose app 홈에 공고 중이거나 최근 시행된 정책 변경을 알린다.
 * @process 공개 공지 API 조회  release별 닫힘 상태 반영  정책 링크 표시
 * @domain legal-policy
 * @scope home-policy-notice
 */

"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { Lang, lang } from "components/module/i18n";

type PolicyNotice = {
  policyId: "terms" | "privacy" | "refund";
  releaseId: string;
  version: string;
  kind: "upcoming" | "recently_effective";
  noticeAt: string;
  effectiveAt: string;
  href: string;
};

type PolicyNoticeResponse = { ok?: boolean; items?: unknown };

const POLICY_NOTICE_DISMISSED_PREFIX = "amu:policy-notice-dismissed:";
const POLICY_LINKS: Record<PolicyNotice["policyId"], string> = {
  terms: "https://allmyuniverse.com/terms-conditions/",
  privacy: "https://allmyuniverse.com/privacy-policy/",
  refund: "https://allmyuniverse.com/refund-policy/",
};

function isPolicyNotice(value: unknown): value is PolicyNotice {
  if (typeof value !== "object" || value === null) return false;
  const notice = value as Partial<PolicyNotice>;
  return (notice.policyId === "terms" || notice.policyId === "privacy" || notice.policyId === "refund") &&
    typeof notice.releaseId === "string" &&
    typeof notice.version === "string" &&
    (notice.kind === "upcoming" || notice.kind === "recently_effective") &&
    typeof notice.noticeAt === "string" &&
    typeof notice.effectiveAt === "string" &&
    notice.href === POLICY_LINKS[notice.policyId];
}

function policyName(policyId: PolicyNotice["policyId"]) {
  if (policyId === "terms") return lang({ ko: "이용약관", en: "Terms" });
  if (policyId === "privacy") return lang({ ko: "개인정보처리방침", en: "Privacy Policy" });
  return lang({ ko: "환불 및 반품 정책", en: "Refund and Return Policy" });
}

function notDismissed(notice: PolicyNotice) {
  try {
    return window.localStorage.getItem(`${POLICY_NOTICE_DISMISSED_PREFIX}${notice.releaseId}`) !== "1";
  } catch {
    return true;
  }
}

export default function PolicyNoticeBanner() {
  const [items, setItems] = useState<PolicyNotice[] | null>(null);

  useEffect(() => {
    let cancelled = false;

    void fetch("/api/legal/policy-releases/notices", {
      cache: "no-store",
      credentials: "omit",
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("policy notices unavailable");
        const data = (await response.json()) as PolicyNoticeResponse;
        const notices = data.ok === true && Array.isArray(data.items) ? data.items.filter(isPolicyNotice) : [];
        if (!cancelled) setItems(notices.filter(notDismissed));
      })
      .catch(() => {
        if (!cancelled) setItems([]);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const dismiss = (releaseId: string) => {
    try {
      window.localStorage.setItem(`${POLICY_NOTICE_DISMISSED_PREFIX}${releaseId}`, "1");
    } catch {
      // Storage may be disabled; the notice still closes for this page view.
    }
    setItems((current) => current?.filter((notice) => notice.releaseId !== releaseId) ?? []);
  };

  if (!items?.length) return null;

  return (
    <section
      aria-label={lang({ ko: "정책 변경 안내", en: "Policy change notices" })}
      className="border-b border-border bg-background"
    >
      <div className="mx-auto max-w-[80rem] divide-y divide-border px-5 sm:px-8">
        {items.map((notice) => {
          const name = policyName(notice.policyId);
          const kindLabel = notice.kind === "upcoming"
            ? lang({ ko: "개정 예정", en: "Upcoming change" })
            : lang({ ko: "개정 시행 안내", en: "Policy change in effect" });

          return (
            <article key={notice.releaseId} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:gap-4">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold leading-6 text-primary-text">
                  {kindLabel}: {name} v{notice.version}
                </p>
                <p className="text-xs leading-5 text-secondary-text">
                  {lang({ ko: "시행일", en: "Effective" })}: {notice.effectiveAt.slice(0, 10)}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <a
                  href={notice.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex min-h-11 items-center rounded-md px-3 text-sm font-medium text-primary underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                >
                  <Lang text={{ ko: "정책 보기", en: "Read policy" }} />
                </a>
                <button
                  type="button"
                  onClick={() => dismiss(notice.releaseId)}
                  className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-md text-secondary-text hover:text-primary-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                  aria-label={lang({ ko: `${name} v${notice.version} 안내 닫기`, en: `Dismiss ${name} v${notice.version} notice` })}
                >
                  <X className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
