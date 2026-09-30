import type {
  SchoolLunchDishRoleType,
  SchoolLunchDishType,
  SchoolLunchHotspotType,
  SchoolLunchRenderDishInputType,
} from "types/app";

export const SCHOOL_LUNCH_TRAY_TEMPLATE_KEY = "school-lunch-tray-foodmap-v1" as const;
export const SCHOOL_LUNCH_IMAGE_RATIO = "4:3" as const;
export const SCHOOL_LUNCH_TEMPLATE_VARIABLE_KEYS = [
  "school_name",
  "meal_date",
  "menu_summary",
] as const;

const SLOT_LAYOUT: Record<SchoolLunchDishRoleType, Omit<SchoolLunchHotspotType, "dishId" | "label">> = {
  rice: { x: 0.2, y: 0.54, w: 0.25, h: 0.22, shape: "rounded-rect" },
  soup: { x: 0.2, y: 0.24, w: 0.25, h: 0.22, shape: "rounded-rect" },
  main: { x: 0.63, y: 0.34, w: 0.24, h: 0.2, shape: "rounded-rect" },
  side_a: { x: 0.5, y: 0.2, w: 0.18, h: 0.16, shape: "rounded-rect" },
  side_b: { x: 0.5, y: 0.48, w: 0.18, h: 0.16, shape: "rounded-rect" },
  kimchi_or_pickles: { x: 0.79, y: 0.19, w: 0.15, h: 0.14, shape: "rounded-rect" },
  dessert_or_drink: { x: 0.79, y: 0.58, w: 0.15, h: 0.16, shape: "rounded-rect" },
  extra_1: { x: 0.5, y: 0.74, w: 0.18, h: 0.14, shape: "rounded-rect" },
  extra_2: { x: 0.79, y: 0.79, w: 0.15, h: 0.12, shape: "rounded-rect" },
};

const ROLE_ORDER: SchoolLunchDishRoleType[] = [
  "rice",
  "soup",
  "main",
  "side_a",
  "side_b",
  "kimchi_or_pickles",
  "dessert_or_drink",
  "extra_1",
  "extra_2",
];

const ROLE_FALLBACK_COPY: Record<
  SchoolLunchDishRoleType,
  { benefitTitle: string; benefitBody: string; whyEat: string; tasteNote: string }
> = {
  rice: {
    benefitTitle: "움직일 힘을 채우는 데 도움",
    benefitBody: "밥류는 활동 에너지를 채우는 탄수화물 공급원 역할을 할 수 있어요.",
    whyEat: "한 숟갈씩 천천히 먹으면 포만감을 주고 다른 반찬과도 잘 어울려요.",
    tasteNote: "담백하고 다른 반찬과 함께 먹기 좋아요.",
  },
  soup: {
    benefitTitle: "수분과 온기를 보충하는 데 도움",
    benefitBody: "국이나 탕은 식사 중 수분을 보충하고 따뜻하게 먹기 좋아요.",
    whyEat: "건더기와 국물을 함께 먹으면 식사를 더 편안하게 시작할 수 있어요.",
    tasteNote: "따뜻하고 부드럽게 넘어가는 편이에요.",
  },
  main: {
    benefitTitle: "몸을 만드는 데 도움",
    benefitBody: "메인 반찬은 단백질이나 주요 영양을 채우는 중심 메뉴인 경우가 많아요.",
    whyEat: "한 번에 많이보다 밥과 함께 나눠 먹으면 부담이 덜해요.",
    tasteNote: "맛이 또렷해서 식사 만족감을 높여주는 편이에요.",
  },
  side_a: {
    benefitTitle: "식단 균형을 맞추는 데 도움",
    benefitBody: "반찬은 여러 재료를 고르게 먹는 데 도움을 줄 수 있어요.",
    whyEat: "조금씩 맛보면 익숙하지 않은 재료도 천천히 친해질 수 있어요.",
    tasteNote: "메인 메뉴보다 가볍고 곁들이기 좋아요.",
  },
  side_b: {
    benefitTitle: "식단 균형을 맞추는 데 도움",
    benefitBody: "다양한 반찬은 여러 식감과 재료를 경험하는 데 도움을 줄 수 있어요.",
    whyEat: "메인 메뉴와 함께 먹으면 식사 구성이 더 균형 있게 느껴져요.",
    tasteNote: "조금씩 곁들여 먹기 좋은 편이에요.",
  },
  kimchi_or_pickles: {
    benefitTitle: "입맛을 돋우는 데 도움",
    benefitBody: "김치나 절임류는 식사에 변화를 주는 곁들임 메뉴로 자주 나와요.",
    whyEat: "매운맛이나 새콤한 맛이 강하면 아주 조금씩 먹어보는 것이 좋아요.",
    tasteNote: "짭짤하거나 새콤한 맛이 느껴질 수 있어요.",
  },
  dessert_or_drink: {
    benefitTitle: "식사 마무리에 즐거움을 더해줘요",
    benefitBody: "후식이나 음료는 식사 후 기분 좋은 마무리를 돕는 메뉴일 수 있어요.",
    whyEat: "단맛이 있는 메뉴는 천천히 맛보면서 먹는 습관이 좋아요.",
    tasteNote: "가볍고 산뜻하게 느껴질 수 있어요.",
  },
  extra_1: {
    benefitTitle: "추가 재료를 경험하는 데 도움",
    benefitBody: "기본 구성 외 추가 메뉴는 새로운 재료를 접하는 기회가 될 수 있어요.",
    whyEat: "익숙하지 않더라도 한 입 정도는 시도해보면 좋아요.",
    tasteNote: "메뉴마다 맛과 식감이 달라요.",
  },
  extra_2: {
    benefitTitle: "추가 재료를 경험하는 데 도움",
    benefitBody: "보조 메뉴는 식단 구성을 더 다채롭게 느끼게 해줄 수 있어요.",
    whyEat: "메인 메뉴와 섞어 먹으면 처음 먹는 재료도 부담이 줄 수 있어요.",
    tasteNote: "메뉴마다 맛과 식감이 달라요.",
  },
};

export const SCHOOL_LUNCH_ALLERGY_LABELS: Record<number, string> = {
  1: "난류",
  2: "우유",
  3: "메밀",
  4: "땅콩",
  5: "대두",
  6: "밀",
  7: "고등어",
  8: "게",
  9: "새우",
  10: "돼지고기",
  11: "복숭아",
  12: "토마토",
  13: "아황산류",
  14: "호두",
  15: "닭고기",
  16: "쇠고기",
  17: "오징어",
  18: "조개류",
  19: "잣",
};

function splitMealLines(raw: string) {
  return String(raw || "")
    .split(/<br\s*\/?>/i)
    .map((line) => line.replace(/&amp;/g, "&").trim())
    .filter(Boolean);
}

function extractAllergyCodes(raw: string) {
  const matches = Array.from(String(raw || "").matchAll(/\(([\d.]+)\)/g));
  const codes = matches.flatMap((match) =>
    String(match[1] || "")
      .split(".")
      .map((value) => Number(value))
      .filter((value) => Number.isInteger(value) && value > 0),
  );
  return Array.from(new Set(codes)).sort((a, b) => a - b);
}

function sanitizeMealLabel(raw: string) {
  return String(raw || "")
    .replace(/\(([\d.]+)\)/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function parseSchoolLunchMenu(raw: string) {
  const items = splitMealLines(raw).map((line) => ({
    raw: line,
    name: sanitizeMealLabel(line),
    allergyCodes: extractAllergyCodes(line),
  }));

  return items.filter((item) => Boolean(item.name));
}

function includesAny(text: string, keywords: string[]) {
  return keywords.some((keyword) => text.includes(keyword));
}

function pickRoleByName(name: string, usedRoles: Set<SchoolLunchDishRoleType>): SchoolLunchDishRoleType {
  const value = String(name || "");

  if (!usedRoles.has("rice") && includesAny(value, ["밥", "볶음밥", "비빔밥", "덮밥", "주먹밥"])) return "rice";
  if (!usedRoles.has("soup") && includesAny(value, ["국", "탕", "찌개", "스프", "죽"])) return "soup";
  if (
    !usedRoles.has("kimchi_or_pickles") &&
    includesAny(value, ["김치", "깍두기", "단무지", "피클", "장아찌", "무침"])
  ) {
    return "kimchi_or_pickles";
  }
  if (
    !usedRoles.has("dessert_or_drink") &&
    includesAny(value, ["주스", "우유", "요거트", "과일", "젤리", "푸딩", "쿠키", "빵", "아이스", "음료"])
  ) {
    return "dessert_or_drink";
  }
  if (
    !usedRoles.has("main") &&
    includesAny(value, ["치킨", "너겟", "돈까스", "불고기", "갈비", "떡볶이", "카레", "구이", "전", "생선", "함박"])
  ) {
    return "main";
  }

  const fallback = ROLE_ORDER.find((role) => !usedRoles.has(role));
  return fallback || "extra_2";
}

export function buildSchoolLunchDishes(rawMenu: string[]): SchoolLunchDishType[] {
  const usedRoles = new Set<SchoolLunchDishRoleType>();
  return rawMenu
    .map((item) => {
      const role = pickRoleByName(item, usedRoles);
      usedRoles.add(role);
      const fallbackCopy = ROLE_FALLBACK_COPY[role];
      const menu = parseSchoolLunchMenu(item)[0] || {
        name: sanitizeMealLabel(item),
        allergyCodes: extractAllergyCodes(item),
      };

      return {
        id: role,
        name: menu.name,
        role,
        benefitTitle: fallbackCopy.benefitTitle,
        benefitBody: fallbackCopy.benefitBody,
        whyEat: fallbackCopy.whyEat,
        tasteNote: fallbackCopy.tasteNote,
        allergyCodes: menu.allergyCodes,
      };
    })
    .filter((item) => Boolean(item.name));
}

export function buildSchoolLunchHotspots(dishes: SchoolLunchRenderDishInputType[]): SchoolLunchHotspotType[] {
  return dishes.map((dish) => {
    const slot = SLOT_LAYOUT[dish.role] || SLOT_LAYOUT.extra_2;
    return {
      dishId: dish.id,
      label: dish.name,
      ...slot,
    };
  });
}

export function buildSchoolLunchAllergyGuide(allergyCodes: number[]) {
  return Array.from(new Set((allergyCodes || []).filter((code) => SCHOOL_LUNCH_ALLERGY_LABELS[code])))
    .sort((a, b) => a - b)
    .map((code) => ({
      code,
      label: SCHOOL_LUNCH_ALLERGY_LABELS[code],
    }));
}

export function buildSchoolLunchTemplateVariables(args: {
  schoolName: string;
  mealDate: string;
  dishes: SchoolLunchRenderDishInputType[];
}) {
  const menuSummary = args.dishes.map((dish) => `${dish.role}:${dish.name}`).join(", ");

  return {
    school_name: String(args.schoolName || "").trim(),
    meal_date: String(args.mealDate || "").trim(),
    menu_summary: menuSummary,
  };
}

export function buildSchoolLunchRenderExtraPrompt(args: {
  schoolName: string;
  mealDate: string;
  dishes: SchoolLunchRenderDishInputType[];
  style?: string;
}) {
  const lines = [
    `학교명: ${String(args.schoolName || "").trim()}`,
    `급식일: ${String(args.mealDate || "").trim()}`,
    `스타일: ${String(args.style || "bright-illustration").trim()}`,
    "요청: 한국 학교 급식 식판 예시 이미지를 밝고 친근한 일러스트 스타일로 구성한다.",
    "규칙: 식판 칸이 구분된 상단 시점, 음식끼리 겹치지 않음, 어린이가 보기 쉬운 구성, 과장된 장식 최소화.",
    "음식 목록:",
    ...args.dishes.map((dish) => `- ${dish.role}: ${dish.name}`),
  ];

  return lines.join("\n");
}

export function resolveSchoolLunchTemplateKey(raw?: string | null) {
  const value = String(raw || "").trim();
  return value || SCHOOL_LUNCH_TRAY_TEMPLATE_KEY;
}
