"use client";

import React, { type ReactNode } from "react";
import type { JSX } from "react";
import { useGlobalStore } from "store/global";
import type { LanguageType } from "types/language";

/**
 * 1. 컴포넌트로 사용하기
 * <Lang text={{ ko: "보내기", en: "Send" }} />
 *
 * 2. 정적 함수로 사용하기
 * <input ... placeholder={lang({ ko: "메시지를 입력하세요...", en: "Enter your message..." })} />
 */

// 다국어 텍스트 객체 타입
export type TextObject = {
  [key in LanguageType]?: string;
};

// 다국어 노드 객체 타입 - Lang 컴포넌트용
export type TextNodeObject = {
  [key in LanguageType]?: ReactNode;
};

// 컴포넌트 내에서 사용할 수 있는 훅
export function useLocalize() {
  const language = useGlobalStore((state) => state.language);

  // 문자열 전용 localize
  const localize = (text: TextObject): string => {
    return text[language] || text.en || text.ko || "";
  };

  // ReactNode 허용 localizeNode
  const localizeNode = (text: TextNodeObject): ReactNode => {
    return text[language] ?? text.en ?? text.ko ?? null;
  };

  return { localize, localizeNode, language };
}

// 현재 언어에 맞는 텍스트를 반환
export function lang(text: TextObject): string {
  const language = useGlobalStore.getState().language;
  return text[language] || text.en || text.ko || "";
}

// 컴포넌트 프롭스 타입 정의
type LangProps = {
  text: TextObject | TextNodeObject;
  className?: string;
  style?: React.CSSProperties;
  as?: keyof JSX.IntrinsicElements | null; // "span", "div", ...
};

// 컴포넌트 형태
function Lang({ text, className, style, as = null }: LangProps) {
  const { localizeNode } = useLocalize();
  const content = localizeNode(text);

  // as가 null이고 className/style이 없으면 content만 반환
  if (as === null && !className && !style) {
    return <>{content}</>;
  } else {
    return React.createElement(as ? as : "span", { className, style }, content);
  }
}

export default Lang;
