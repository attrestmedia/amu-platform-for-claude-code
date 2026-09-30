"use client";

import type { ReactNode } from "react";
import { useLangDetection } from "hooks/i18n/useLangDetection";

export function LanguageProvider({ children }: { children: ReactNode }) {
  // 언어 감지 훅 사용
  useLangDetection();

  return <>{children}</>;
}
