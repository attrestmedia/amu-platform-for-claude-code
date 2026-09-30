"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

/**
 * @docHint
 * @purpose useBodyClassManager 훅 클라이언트 로직 캡슐화
 * @process 상태/이펙트/구독 구성  API 호출/스토어 연동  재사용 동작 제공
 * @domain ui-global
 * @scope client
 */

export function useBodyClassManager() {
  const pathname = usePathname();
  const previousClassRef = useRef<string | null>(null);

  useEffect(() => {
    // 이전에 추가한 클래스 제거
    if (previousClassRef.current) {
      document.body.classList.remove(previousClassRef.current);
    }

    let currentClass: string;

    // 경로별 클래스 추가
    if (pathname === "/") {
      // 홈페이지인 경우 "home" 클래스 추가
      currentClass = "home";
    } else {
      // "/" 로 시작하는 경우 "/" 제거
      const className = pathname.startsWith("/") ? pathname.slice(1) : pathname;

      // 중간에 "/" 가 있는 경우 "-" 로 교체
      currentClass = className.replace(/\//g, "-");
    }

    // 새로운 클래스 추가
    if (currentClass) {
      document.body.classList.add(currentClass);
      previousClassRef.current = currentClass;
    }
  }, [pathname]);
}
