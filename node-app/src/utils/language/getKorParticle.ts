/**
 * @docHint
 * @purpose getKorParticle 유틸 기능 제공
 * @process 입력 정규화  변환  보조 처리 제공
 * @domain language
 * @scope global
 */

// 조사 유형
type ParticleType = "을-를" | "이-가" | "은-는" | "과-와" | "으로-로" | "이랑-랑";

// 영어 모음 (단순 모음 및 이중 모음)
const VOWELS = ["a", "e", "i", "o", "u", "y", "w"];

// 영어 단어의 발음 규칙에 따른 받침 여부 판단
function hasEnglishFinalConsonantSound(word: string): boolean {
  if (!word) return false;

  // 소문자로 변환
  const lowerWord = word.toLowerCase();

  // 마지막 글자
  const lastChar = lowerWord[lowerWord.length - 1];

  // 숫자인 경우 처리
  if (/\d/.test(lastChar)) {
    // 0, 2, 3, 4, 5, 6, 8, 9는 자음으로 끝나는 발음
    if (["0", "2", "3", "4", "5", "6", "8", "9"].includes(lastChar)) return true;
    // 1, 7은 모음으로 끝나는 발음
    return false;
  }

  // 특수 케이스: 'e'로 끝나는 경우 (대부분 묵음)
  if (lastChar === "e" && lowerWord.length > 1) {
    // 'le'로 끝나는 경우 (apple, castle) - 받침 있음
    if (lowerWord.endsWith("le")) return true;

    // 일반적인 'e'로 끝나는 경우는 그 앞 글자를 고려
    const secondLastChar = lowerWord[lowerWord.length - 2];
    return !VOWELS.includes(secondLastChar);
  }

  // 특수 케이스: 'ion'으로 끝나는 경우 (action, nation) - 받침 있음
  if (lowerWord.endsWith("ion")) return true;

  // 일반 규칙: 모음으로 끝나면 받침 없음, 자음으로 끝나면 받침 있음
  return !VOWELS.includes(lastChar);
}

// 한글·영문·숫자에 따라 적절한 한국어 조사를 선택 (combine = false면 '조사'만 반환)
export function getKorParticle(rawWord: string, type: ParticleType = "이-가", combine: boolean = true): string {
  if (!rawWord || rawWord.trim() === "") {
    const defaultParticle = getDefaultParticle(type);
    return combine ? rawWord + defaultParticle : defaultParticle;
  }

  const trimmed = rawWord.trim();
  const lastChar = trimmed.slice(-1);
  let hasJongsung = checkJongsung(lastChar);

  // 영문은 유니코드 종성 판정이 불가하므로, 발음 규칙 기반으로 보정
  if (/[a-zA-Z]/.test(lastChar)) {
    hasJongsung = hasEnglishFinalConsonantSound(trimmed);
  }

  // 조사 선택
  const particle = selectParticle(type, hasJongsung);

  // combine 옵션에 따라 반환
  return combine ? rawWord + particle : particle;
}

// 문자에 종성(받침)이 있는지 확인
function checkJongsung(char: string): boolean {
  const charCode = char.charCodeAt(0);

  // 한글 범위 확인 (가-힣)
  if (charCode >= 0xac00 && charCode <= 0xd7a3) {
    // 한글 유니코드 계산: (초성 × 588) + (중성 × 28) + 종성 + 0xAC00
    // 종성이 0이 아니면 받침이 있음
    return (charCode - 0xac00) % 28 !== 0;
  }

  // 영문자는 받침 없음으로 처리
  if (/[a-zA-Z]/.test(char)) {
    return false;
  }

  // 숫자의 경우 발음에 따라 판단
  if (/[0-9]/.test(char)) {
    // 1, 7, 8, 0은 받침 있음, 나머지는 받침 없음
    return ["1", "7", "8", "0"].includes(char);
  }

  // 기타 문자는 받침 있음으로 처리 (보수적 접근)
  return true;
}

// 조사 타입과 종성 여부에 따라 적절한 조사 반환
function selectParticle(type: ParticleType, hasJongsung: boolean): string {
  const particleMap: Record<ParticleType, [string, string]> = {
    "을-를": ["을", "를"],
    "이-가": ["이", "가"],
    "은-는": ["은", "는"],
    "과-와": ["과", "와"],
    "으로-로": ["으로", "로"],
    "이랑-랑": ["이랑", "랑"],
  };

  const [withJongsung, withoutJongsung] = particleMap[type];
  return hasJongsung ? withJongsung : withoutJongsung;
}

// 기본 조사 반환 (단어가 비어있을 때)
function getDefaultParticle(type: ParticleType): string {
  const defaultMap: Record<ParticleType, string> = {
    "을-를": "을",
    "이-가": "이",
    "은-는": "은",
    "과-와": "과",
    "으로-로": "으로",
    "이랑-랑": "이랑",
  };

  return defaultMap[type];
}
