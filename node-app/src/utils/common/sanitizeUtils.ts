import DOMPurify, { type Config as DompurifyConfig } from "dompurify";

/**
 * @docHint
 * @purpose sanitizeUtils 유틸 기능 제공
 * @process 입력 정규화  변환  보조 처리 제공  템플릿 치환/라벨 정규화 포함
 * @domain security
 * @scope shared
 */

// 공통 헬퍼
const isBrowser = () => typeof window !== "undefined";
const stripTags = (s: string) => s.replace(/<[^>]*>/g, "");

// 공통 프리셋 (중앙화)
const SANITIZE_PRESET = {
  BASE: {
    ALLOWED_TAGS: ["p", "br", "strong", "em", "b", "i", "u", "span", "div", "h1", "h2", "h3", "h4", "h5", "h6"],
    ALLOWED_ATTR: ["class", "style"],
    ALLOWED_URL_REGEXP: /^(?:(?:https?|mailto|tel):|[^a-z]|[a-z+.-]+(?:[^a-z+.-:]|$))/i,
    FORBID_ATTR: ["onclick", "onload", "onerror", "onmouseover"],
    FORBID_TAGS: ["script", "object", "embed", "form", "input", "textarea"],
  } as DompurifyConfig,

  DESCRIPTION: {
    ALLOWED_TAGS: ["strong", "em", "b", "i", "br", "span"],
    ALLOWED_ATTR: ["class"],
    FORBID_ATTR: ["style", "onclick", "onload", "onerror"],
    FORBID_TAGS: ["script", "object", "embed", "form", "input"],
  } as DompurifyConfig,

  PRODUCT_SUMMARY: {
    ALLOWED_TAGS: [
      "p",
      "br",
      "b",
      "strong",
      "i",
      "em",
      "u",
      "small",
      "sub",
      "sup",
      "ul",
      "ol",
      "li",
      "span",
      "a",
      "h2",
      "h3",
      "h4",
      "h5",
    ],
    ALLOWED_ATTR: ["href", "target", "rel"], // 스타일/클래스 금지
    ALLOWED_URL_REGEXP: /^(?:(?:https?):|\/(?!\/))/i, // http/https/루트상대경로
    FORBID_ATTR: ["style"], // on*는 DOMPurify가 기본 제거
    FORBID_TAGS: ["script", "object", "embed", "form", "input", "textarea", "button"],
  } as DompurifyConfig,
} as const;

// 텍스트 전용으로 HTML 태그를 완전 제거하는 함수
export const stripHtml = (htmlString: string): string => {
  if (!isBrowser()) return stripTags(htmlString);
  return DOMPurify.sanitize(htmlString, { ALLOWED_TAGS: [] });
};

// 기본적인 포맷팅 태그만 허용 (설명문용)
export const sanitizeDescription = (htmlString: string): string => {
  if (!isBrowser()) return stripTags(htmlString);
  return DOMPurify.sanitize(htmlString, { ...SANITIZE_PRESET.DESCRIPTION });
};

// 상품 요약에 특화된 보안 렌더링용
export const sanitizeProductSummary = (htmlString: string): string => {
  if (!isBrowser()) return stripTags(htmlString);

  // 공통 프리셋 사용
  const sanitized = DOMPurify.sanitize(htmlString, { ...SANITIZE_PRESET.PRODUCT_SUMMARY });

  // a 태그 보안 속성 강제
  const wrapper = document.createElement("div");
  wrapper.innerHTML = sanitized;
  wrapper.querySelectorAll("a").forEach((a) => {
    const href = a.getAttribute("href") || "";
    const isHttp = /^https?:\/\//i.test(href);
    const isRootRel = href.startsWith("/");
    if (!isHttp && !isRootRel) {
      a.removeAttribute("href"); // 허용되지 않는 프로토콜 제거
    }
    if (!a.getAttribute("rel")) a.setAttribute("rel", "noopener noreferrer");
    if (!a.getAttribute("target")) a.setAttribute("target", "_blank");
  });

  return wrapper.innerHTML;
};

// 문자열에서 불필요한 줄바꿈과 공백을 제거하는 함수
export function cleanString(prompt: string): string {
  return (
    prompt
      // 연속된 줄바꿈을 하나로 통합
      .replace(/\n\s*\n\s*\n/g, "\n\n")
      // 탭 문자 제거
      .replace(/\t/g, "")
      // 전체 문자열의 시작과 끝 공백 제거
      .trim()
  );
}

// HTML 형식의 문자열에서 HTML 태그를 제거하고 순수한 텍스트만 추출
export const convertHtmlToString = (string: string) => {
  return new DOMParser().parseFromString(string, "text/html").body.textContent?.trim();
};

// 인용부호/괄호 상태 추적 유틸
const OPEN_SMART_QUOTES = new Set(["“", "‘", "「", "『"]);
const CLOSE_SMART_QUOTES = new Set(["”", "’", "」", "』"]);
const CLOSE_FOLLOWERS = /[.!?…\s"'\)\]\}」』”’>〉》»›]+/; // 문장부호 뒤에 따라붙을 수 있는 닫힘 문자들
const LIST_MARKER_RE = /^\s*((\d+|[A-Za-z]|[IVXLCDM]+)[\.\)]\s+|[-*+•]\s+)/;

function isEscaped(text: string, i: number) {
  // 백슬래시가 홀수개면 이스케이프 처리로 간주
  let bs = 0;
  for (let k = i - 1; k >= 0 && text[k] === "\\"; k--) bs++;
  return bs % 2 === 1;
}

function isApostrophe(text: string, i: number) {
  // 영문 약어/소유격의 ' 는 인용부호로 보지 않음
  const prev = text[i - 1] || "";
  const next = text[i + 1] || "";
  return /[A-Za-z0-9]/.test(prev) && /[A-Za-z0-9]/.test(next);
}

// 주요 문장 부호로 분할 (.!?…) - 인용부호 내부는 분할 제외
const splitByMajorPunctuation = (text: string): string[] => {
  const sentences: string[] = [];
  let currentSentence = "";

  // ASCII 따옴표(",'), 스마트 따옴표(“ ”, ‘ ’, 「 」, 『 』)
  let inDoubleQuote = false;
  let inSingleQuote = false;
  let smartQuoteDepth = 0; // 스마트 따옴표는 중첩 고려

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const nextChar = text[i + 1];

    // 인용부호 상태 업데이트 (스마트 따옴표 열림/닫힘)
    if (OPEN_SMART_QUOTES.has(char)) smartQuoteDepth++;
    else if (CLOSE_SMART_QUOTES.has(char) && smartQuoteDepth > 0) smartQuoteDepth--;

    // ASCII 더블쿼트
    if (char === '"' && !isEscaped(text, i)) {
      inDoubleQuote = !inDoubleQuote;
    }
    // ASCII 싱글쿼트 (영문 약어의 아포스트로피는 제외)
    else if (char === "'" && !isEscaped(text, i) && !isApostrophe(text, i)) {
      inSingleQuote = !inSingleQuote;
    }

    currentSentence += char;

    // 인용부호 내부에서는 분할 금지
    const insideAnyQuote = inDoubleQuote || inSingleQuote || smartQuoteDepth > 0;

    // 문장부호를 만났을 때 (따옴표 밖에서만 분할)
    if (/[.!?…]/.test(char) && !insideAnyQuote) {
      // 문장부호 뒤에 연속해서 붙을 수 있는 닫힘 문자들(”, ’, ", ', ), ], 공백 등)을 한꺼번에 포함
      let j = i + 1;
      while (j < text.length && CLOSE_FOLLOWERS.test(text[j])) {
        // 닫힘 따옴표를 포함하면서 상태를 깨뜨리지 않도록 가벼운 처리
        currentSentence += text[j];
        j++;
      }

      if (currentSentence.trim()) {
        sentences.push(currentSentence.trim());
      }
      currentSentence = "";
      i = j - 1; // 인덱스 건너뛰기
      continue;
    }

    // 대시(양쪽 공백)로 문장을 느슨히 나누는 기존 규칙 유지
    if (char === "-" && /\s/.test(text[i - 1] || "") && /\s/.test(nextChar || "")) {
      if (currentSentence.trim()) sentences.push(currentSentence.trim());
      currentSentence = "";
    }
  }

  // 남은 텍스트 처리
  if (currentSentence.trim()) sentences.push(currentSentence.trim());

  return sentences;
};

// 접속사 기준 분할
const splitByConjunctions = (sentence: string, isKorean: boolean): string[] => {
  const conjunctions = isKorean
    ? ["그리고", "하지만", "그런데", "또한", "그래서", "그러나", "그러면", "그럼", "그렇지만", "따라서", "또는", "혹은"]
    : [
        "However",
        "Therefore",
        "Moreover",
        "Furthermore",
        "Meanwhile",
        "Consequently",
        "Thus",
        "Nevertheless",
        "Additionally",
        "Similarly",
        "Finally",
      ];

  for (const conjunction of conjunctions) {
    const pattern = isKorean
      ? new RegExp(`([.!?…]\\s*)(${conjunction}\\s+)`, "g")
      : new RegExp(`([.!?…]\\s*)(${conjunction}\\s*,?\\s*)`, "gi");

    const parts = sentence.split(pattern).filter((part) => part.trim());

    if (parts.length > 2) {
      // 실제로 분할이 일어났다면
      const result: string[] = [];
      let currentPart = "";

      for (let i = 0; i < parts.length; i++) {
        const part = parts[i];

        if (/[.!?…]\s*$/.test(part)) {
          // 문장 부호로 끝나는 부분
          currentPart += part;
          if (currentPart.trim()) {
            result.push(currentPart.trim());
          }
          currentPart = "";
        } else if (conjunctions.some((conj) => part.toLowerCase().includes(conj.toLowerCase()))) {
          // 접속사 부분 - 다음 문장의 시작으로 사용
          currentPart = part;
        } else {
          // 일반 텍스트 부분
          currentPart += part;
        }
      }

      if (currentPart.trim()) {
        result.push(currentPart.trim());
      }

      return result;
    }
  }

  return [sentence];
};

// 쉼표 기준으로 분할
const splitByCommas = (sentence: string, isKorean: boolean): string[] => {
  const commaPattern = /([,，])\s*/g;
  const parts = sentence.split(commaPattern);

  if (parts.length <= 2) {
    return [sentence]; // 분할할 게 없음
  }

  const result: string[] = [];
  let currentSentence = "";

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];

    if (/[,，]/.test(part)) {
      // 쉼표 자체
      currentSentence += part + " ";
    } else if (part.trim()) {
      // 실제 텍스트 부분
      currentSentence += part;

      // 다음 부분이 쉼표가 아니고, 현재 문장이 충분히 길다면 분할
      const nextPart = parts[i + 1];
      const hasCommaNext = nextPart && /[,，]/.test(nextPart);

      if (!hasCommaNext && currentSentence.trim().length > (isKorean ? 15 : 25)) {
        result.push(currentSentence.trim());
        currentSentence = "";
      }
    }
  }

  // 남은 부분 처리
  if (currentSentence.trim()) {
    if (result.length > 0) {
      result.push(currentSentence.trim());
    } else {
      return [sentence]; // 분할이 의미 없었음
    }
  }

  return result;
};

// 너무 짧은 문장들을 병합
const mergeShortSentences = (sentences: string[], minLength: number): string[] => {
  const result: string[] = [];

  for (let i = 0; i < sentences.length; i++) {
    const sentence = sentences[i];

    if (sentence.length < minLength && result.length > 0) {
      // 이전 문장과 병합
      result[result.length - 1] += " " + sentence;
    } else {
      result.push(sentence);
    }
  }

  return result;
};

// 목록(숫자/불릿) 블록을 먼저 분리하는 함수
// - 연속된 목록 라인은 각 항목을 "한 문장"으로 취급하여 번호/불릿을 제거하고 반환
// - 목록 전/후 텍스트는 그대로 반환하여 이후 문장 분할 로직에 태움
const splitByListBlocks = (text: string): string[] | null => {
  const lines = text.split(/\r?\n/);
  const result: string[] = [];

  const isListStartLine = (line: string) => LIST_MARKER_RE.test(line);

  let i = 0;

  // 1) 목록 시작 전 문단 수집
  const preface: string[] = [];
  while (i < lines.length && !isListStartLine(lines[i].trim())) {
    preface.push(lines[i]);
    i++;
  }
  if (preface.join("").trim()) result.push(preface.join("\n").trim());

  // 2) 목록 블록 수집 (빈 줄 허용, 마커 유지)
  const listItems: string[] = [];
  let currentItem: string | null = null;
  let inList = false;

  while (i < lines.length) {
    const line = lines[i];

    if (isListStartLine(line)) {
      inList = true;
      // 직전 항목 확정
      if (currentItem && currentItem.trim()) listItems.push(currentItem.trim());
      // 새 항목 시작 (마커 포함 유지)
      currentItem = line.trim();
      i++;
      continue;
    }

    if (!inList) break; // 리스트 시작 전/후 구간

    // inList 상태에서 비목록 라인 처리
    const trimmed = line.trim();

    if (trimmed === "") {
      // 빈 줄: 다음 줄이 목록 시작이면 항목 사이 구분으로 보고 스킵
      const next = lines[i + 1];
      if (next && isListStartLine(next)) {
        i++;
        continue;
      } else {
        // 빈 줄 다음이 비목록이면 리스트 종료 시그널
        if (currentItem && currentItem.trim()) listItems.push(currentItem.trim());
        currentItem = null;
        inList = false;

        // 연속 빈 줄 소거
        while (i < lines.length && lines[i].trim() === "") i++;
        break;
      }
    } else {
      // 항목의 설명/이어쓰기 라인 → 현재 항목에 붙이기
      if (!currentItem) currentItem = trimmed;
      else currentItem += (/\s$/.test(currentItem) ? "" : " ") + trimmed;
      i++;
    }
  }

  // 파일 끝에서 리스트가 열린 채 종료된 경우
  if (inList) {
    if (currentItem && currentItem.trim()) listItems.push(currentItem.trim());
  }

  if (listItems.length >= 2) {
    result.push(...listItems);
  } else if (listItems.length === 1) {
    // 단일 항목은 리스트로 간주하지 않고 일반 텍스트로
    result.push(listItems[0]);
  }

  // 3) 나머지 꼬리 텍스트
  const tail = lines.slice(i).join("\n").trim();
  if (tail) result.push(tail);

  return listItems.length > 0 ? result.filter(Boolean) : null;
};

const stripMarkdownForChat = (text: string): string => {
  return (
    text
      // 코드 블록/인라인 코드 제거
      .replace(/```[\s\S]*?```/g, "")
      .replace(/`([^`]+)`/g, "$1")
      // 이미지/링크 → 표시 텍스트만 남김
      .replace(/!\[([^\]]*)\]\([^)]+\)/g, "$1")
      .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
      // 강조/기울임 제거 (**__~~ 등)
      .replace(/\*\*(.*?)\*\*/g, "$1")
      .replace(/__(.*?)__/g, "$1")
      .replace(/\*(.*?)\*/g, "$1")
      .replace(/_(.*?)_/g, "$1")
      // 헤딩/인용 구문 제거
      .replace(/^#{1,6}\s*/gm, "")
      .replace(/^\s*>\s?/gm, "")
      // 불필요한 캐리지리턴 제거
      .replace(/\r/g, "")
      .trim()
  );
};

// 문장 분할 함수
export const splitIntoSentences = (text: string): string[] => {
  // 0) JS 문자열 연결 흔적/리터럴 줄바꿈 정리 (로그에서 온 텍스트 대응)
  const normalized0 = stripMarkdownForChat(text)
    .replace(/['"]\s*\+\s*['"]\s*\n?/g, " ") // ' + \n ' → 공백
    .replace(/\\n/g, "\n"); // 리터럴 \n → 실제 개행

  // 1) 목록 블록 우선 처리
  const listAware = splitByListBlocks(normalized0);
  if (listAware) {
    const sentences: string[] = [];

    for (const chunk of listAware) {
      const trimmed = chunk.trim();

      // (A) 리스트 항목: 마커로 시작하면 그대로 보존
      if (LIST_MARKER_RE.test(trimmed)) {
        sentences.push(trimmed);
        continue;
      }

      // (B) 일반 문단: 기존 규칙 적용
      const isKoreanChunk = /[가-힣]/.test(trimmed);
      let parts = splitByMajorPunctuation(trimmed);

      parts = parts.flatMap((s) => (s.length > (isKoreanChunk ? 80 : 120) ? splitByCommas(s, isKoreanChunk) : [s]));
      parts = parts.flatMap((s) =>
        s.length > (isKoreanChunk ? 80 : 120) ? splitByConjunctions(s, isKoreanChunk) : [s],
      );
      parts = mergeShortSentences(parts, isKoreanChunk ? 8 : 12);

      sentences.push(...parts.map((s) => s.trim()).filter(Boolean));
    }

    return sentences;
  }

  // 2) 목록이 아닌 경우: 기존 로직 유지
  const normalized = normalized0;
  const isKorean = /[가-힣]/.test(normalized);
  const maxLength = isKorean ? 50 : 80;
  const minLength = isKorean ? 8 : 12;

  let sentences: string[] = splitByMajorPunctuation(normalized);
  sentences = sentences.flatMap((s) => (s.length > maxLength ? splitByCommas(s, isKorean) : [s]));
  sentences = sentences.flatMap((s) => (s.length > maxLength ? splitByConjunctions(s, isKorean) : [s]));
  sentences = mergeShortSentences(sentences, minLength);

  return sentences.map((s) => s.trim()).filter(Boolean) || [normalized];
};

export function truncateToString(v: unknown, max = 120) {
  const s = String(v ?? "").trim();
  return s.length > max ? s.slice(0, max) + "…" : s;
}
