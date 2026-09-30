export const SMARTSTORE_CREATE_ALLOWLIST_PRESETS = [
  {
    group: "stationery",
    label: { ko: "문구/오피스/팬시", en: "Stationery / Office / Fancy" },
    description: {
      ko: "노트, 플래너, 스티커, 엽서, 파일, 데스크 소품 등 문구류",
      en: "Stationery items such as notebooks, planners, stickers, postcards, files, and desk accessories.",
    },
  },
  {
    group: "printed_goods",
    label: { ko: "인쇄물/제작 굿즈", en: "Printed Goods / Merch" },
    description: {
      ko: "포스터, 카드, 캘린더, 아트 프린트, 종이 기반 굿즈 중심",
      en: "Printed posters, cards, calendars, art prints, and paper-based goods.",
    },
  },
  {
    group: "home_decor_non_electric",
    label: { ko: "홈데코/리빙 소품", en: "Home Decor" },
    description: {
      ko: "패브릭 포스터, 쿠션커버, 장식용 오브제 등 리빙 소품",
      en: "Home decor items such as fabric posters, cushion covers, and decorative objects.",
    },
  },
  {
    group: "fashion_clothing",
    label: { ko: "패션의류", en: "Fashion Clothing" },
    description: {
      ko: "상의, 하의, 아우터, 원피스, 셔츠 등 패션의류 상품군",
      en: "Fashion clothing categories such as tops, bottoms, outerwear, dresses, and shirts.",
    },
  },
  {
    group: "fashion_accessories",
    label: { ko: "패션잡화", en: "Fashion Accessories" },
    description: {
      ko: "가방, 지갑, 모자, 스카프, 벨트, 양말 등 패션잡화 상품군",
      en: "Fashion accessories such as bags, wallets, hats, scarves, belts, and socks.",
    },
  },
  {
    group: "fashion_accessory_non_certified",
    label: { ko: "패션소품", en: "Fashion Accessories" },
    description: {
      ko: "스카프, 파우치, 패브릭 액세서리 등 패션 소품",
      en: "Accessories such as scarves, pouches, and fabric fashion goods.",
    },
  },
  {
    group: "craft_diy_non_chemical",
    label: { ko: "공예·DIY 소품", en: "Craft / DIY" },
    description: {
      ko: "취미용 DIY 키트, 장식 소품 등",
      en: "Craft and DIY products.",
    },
  },
] as const;

export type SmartstoreCreateAllowlistGroup = (typeof SMARTSTORE_CREATE_ALLOWLIST_PRESETS)[number]["group"];

export const SMARTSTORE_CREATE_ALLOWLIST_GROUPS = SMARTSTORE_CREATE_ALLOWLIST_PRESETS.map(
  (item) => item.group,
) as SmartstoreCreateAllowlistGroup[];

export const SMARTSTORE_CREATE_EXCLUDE_GROUPS = [
  "food",
  "health_functional_food",
  "alcohol",
  "cosmetics",
  "medical",
  "children_certified",
  "electronics",
  "automotive_safety",
  "luxury_jewelry_watch",
  "rental_ticket_service",
] as const;

export const SMARTSTORE_DEFAULT_CREATE_STATUS = "WAIT" as const;

export type SmartstoreCreateExcludeGroup = (typeof SMARTSTORE_CREATE_EXCLUDE_GROUPS)[number];
