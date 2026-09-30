export const CHARACTER_SPECIES_IDS = ["human", "monster"] as const;
export type CharacterSpeciesId = (typeof CHARACTER_SPECIES_IDS)[number];

export const CHARACTER_SPECIES_OPTIONS: Array<{
  id: CharacterSpeciesId;
  label: { ko: string; en: string };
  description: { ko: string; en: string };
}> = [
  {
    id: "human",
    label: { ko: "인간형", en: "Human" },
    description: { ko: "사람의 모습과 관점으로 시작합니다.", en: "Begin with a human form and perspective." },
  },
  {
    id: "monster",
    label: { ko: "몬스터형", en: "Monster" },
    description: { ko: "몬스터의 모습과 생태를 유지합니다.", en: "Keep a monster form and ecology." },
  },
];

export const CHARACTER_GENESIS_ATTRIBUTE_OPTIONS = [
  { id: "vitality", label: { ko: "활력", en: "Vitality" } },
  { id: "focus", label: { ko: "집중", en: "Focus" } },
  { id: "insight", label: { ko: "통찰", en: "Insight" } },
  { id: "empathy", label: { ko: "공감", en: "Empathy" } },
  { id: "adaptability", label: { ko: "적응", en: "Adaptability" } },
  { id: "fortune", label: { ko: "행운", en: "Fortune" } },
] as const;

/** 확률 안내용 공유 정책. 실제 roll은 서버의 CSPRNG와 동일한 표를 사용한다. */
export const CHARACTER_GENESIS_RARITY_DISCLOSURE = [
  { tier: "common", weight: 700_000, probability: 0.7 },
  { tier: "uncommon", weight: 200_000, probability: 0.2 },
  { tier: "rare", weight: 88_900, probability: 0.0889 },
  { tier: "epic", weight: 10_000, probability: 0.01 },
  { tier: "legendary", weight: 1_000, probability: 0.001 },
  { tier: "mythic", weight: 90, probability: 0.00009 },
  { tier: "celestial", weight: 10, probability: 0.00001 },
] as const;
