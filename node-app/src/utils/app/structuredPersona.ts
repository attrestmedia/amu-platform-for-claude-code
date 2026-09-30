export type StructuredPersonaGuide = {
  name: string;
  nationality: string;
  gender: string;
  language: string;
  job: string;
  background: string;
  personality: string;
  appearance: string;
  hobby: string;
  style: string;
  values: string;
  tutorIntro: string;
};

function clampText(value: string | undefined, limit: number) {
  return String(value || "").trim().slice(0, limit);
}

function joinNonEmpty(parts: Array<string | undefined>, separator = "\n") {
  return parts
    .map((part) => clampText(part, 800))
    .filter(Boolean)
    .join(separator)
    .trim();
}

export function createEmptyStructuredPersonaGuide(seed?: Partial<StructuredPersonaGuide>): StructuredPersonaGuide {
  return {
    name: clampText(seed?.name, 80),
    nationality: clampText(seed?.nationality, 80),
    gender: clampText(seed?.gender, 32),
    language: clampText(seed?.language, 80),
    job: clampText(seed?.job, 120),
    background: clampText(seed?.background, 400),
    personality: clampText(seed?.personality, 240),
    appearance: clampText(seed?.appearance, 240),
    hobby: clampText(seed?.hobby, 160),
    style: clampText(seed?.style, 160),
    values: clampText(seed?.values, 240),
    tutorIntro: clampText(seed?.tutorIntro, 240),
  };
}

export function mergeStructuredGuideText(base: string, appendix: string, limit: number) {
  return joinNonEmpty([base, appendix]).slice(0, limit);
}

export function buildStructuredPersonaGuidePayload(args: {
  guide: StructuredPersonaGuide;
  fallbackName?: string;
  fallbackLanguage?: string;
  fallbackJob?: string;
}) {
  const name = clampText(args.guide.name || args.fallbackName, 80);
  const nationality = clampText(args.guide.nationality, 80);
  const gender = clampText(args.guide.gender, 32);
  const language = clampText(args.guide.language || args.fallbackLanguage, 80);
  const job = clampText(args.guide.job || args.fallbackJob, 120);
  const background = clampText(args.guide.background, 600);
  const appearance = joinNonEmpty(
    [
      clampText(args.guide.appearance, 240),
      args.guide.style ? `스타일 무드: ${clampText(args.guide.style, 160)}` : "",
    ],
    " / ",
  ).slice(0, 300);
  const personality = joinNonEmpty(
    [
      clampText(args.guide.personality, 240),
      args.guide.style ? `표현 스타일: ${clampText(args.guide.style, 160)}` : "",
    ],
    " / ",
  ).slice(0, 300);
  const values = clampText(args.guide.values, 240);
  const preferences = joinNonEmpty(
    [
      args.guide.hobby ? `취미: ${clampText(args.guide.hobby, 160)}` : "",
      args.guide.style ? `선호 스타일: ${clampText(args.guide.style, 160)}` : "",
    ],
    " / ",
  ).slice(0, 240);
  const tutorIntro = clampText(args.guide.tutorIntro, 240);
  const summary = joinNonEmpty([job, clampText(args.guide.personality || args.guide.style, 160)], " · ").slice(0, 300);
  const promptBrief = joinNonEmpty([
    name ? `이름: ${name}` : "",
    job ? `역할: ${job}` : "",
    nationality ? `국적/문화권: ${nationality}` : "",
    gender ? `성별 표현: ${gender}` : "",
    language ? `사용 언어: ${language}` : "",
    appearance ? `외모: ${appearance}` : "",
    personality ? `성격: ${personality}` : "",
    background ? `배경: ${background}` : "",
    values ? `가치관: ${values}` : "",
    preferences ? `취향: ${preferences}` : "",
    tutorIntro ? `소개: ${tutorIntro}` : "",
  ]).slice(0, 1600);

  return {
    name,
    nationality,
    gender,
    language,
    job,
    background,
    appearance,
    personality,
    values,
    preferences,
    tutorIntro,
    summary,
    promptBrief,
  };
}
