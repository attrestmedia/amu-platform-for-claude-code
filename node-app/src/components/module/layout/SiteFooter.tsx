"use client";
import Image from "next/image";
import { cn } from "utils/common";

type Props = { className?: string; layout?: "normal" | "wide" };

export function SiteFooter({ className = "", layout = "normal" }: Props) {
  const thisYear = new Date().getFullYear();

  return (
    <footer id="footer" role="contentinfo" className={cn("p-layout w-full bg-surface border-t", className)}>
      <div className={cn("mx-auto pt-2 px-2", layout === "normal" && "max-w-[60rem]")}>
        {/* 회사 정보 */}
        <div className="mb-6">
          <h3 className="text-sm font-semibold mb-4 flex items-center gap-2">
            <span>앳트레스트 미디어랩</span>
          </h3>

          {/* key-value: 모바일 1열, md 이상 2열 */}
          <ul className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm text-primary-text">
            <li className="flex flex-wrap items-start gap-2 md:col-span-2">
              <span className="font-medium text-secondary-text min-w-[100px]">대표</span>
              <span>조신영</span>
            </li>
            <li className="flex items-start gap-2 md:col-span-2">
              <span className="font-medium text-secondary-text min-w-[100px]">사업자등록번호</span>
              <span>755-10-01321</span>
            </li>
            <li className="flex items-start gap-2 md:col-span-2">
              <span className="font-medium text-secondary-text min-w-[100px]">통신판매업신고</span>
              <span>2025-서울도봉-0057</span>
            </li>
            <li className="flex items-start gap-2 md:col-span-2">
              <span className="font-medium text-secondary-text min-w-[100px]">주소</span>
              <address className="not-italic">서울특별시 도봉구 우이천로 367, 101동 1204호</address>
            </li>
            <li className="flex items-start gap-2 md:col-span-2">
              <span className="font-medium text-secondary-text min-w-[100px]">고객센터</span>
              <div className="flex gap-1 flex-col sm:flex-row">
                <span className="inline-flex items-center gap-1">
                  <span>050-6862-4540</span>
                  <span>/</span>
                </span>
                <a href="mailto:attrestmedia@gmail.com" className="text-primary hover:underline">
                  amu@allmyuniverse.com
                </a>
              </div>
            </li>
          </ul>
        </div>

        {/* 정책/약관 링크 */}
        <nav aria-label="정책 링크" className="flex flex-wrap items-center gap-4 mb-6 text-sm">
          <a
            href="https://allmyuniverse.com/privacy-policy"
            target="_blank"
            rel="noopener noreferrer"
            className="text-gray-600 hover:text-primary transition-colors"
          >
            개인정보처리방침
          </a>
          <span className="text-border">|</span>
          <a
            href="https://allmyuniverse.com/terms-conditions"
            target="_blank"
            rel="noopener noreferrer"
            className="text-gray-600 hover:text-primary transition-colors"
          >
            이용약관
          </a>
        </nav>

        {/* 저작권 */}
        <div className="text-sm text-gray-500 pt-4 border-t">© {thisYear} All My Universe</div>

        <div className="py-2 inline-flex items-center gap-1">
          <span className="relative top-[1px]">With</span>
          <a href="https://elevenlabs.io/startup-grants" target="_blank" rel="noopener noreferrer">
            <Image
              src="https://eleven-public-cdn.elevenlabs.io/payloadcms/pwsc4vchsqt-ElevenLabsGrants.webp"
              alt="ElevenLabs"
              width={160}
              height={42}
              className="h-auto w-[160px]"
            />
          </a>
        </div>
      </div>
    </footer>
  );
}
