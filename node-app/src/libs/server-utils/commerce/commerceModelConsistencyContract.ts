import {
  getCommerceImageVariantSpec,
  normalizeCommerceImageVariant,
  type CommerceImageVariantType,
} from "./commerceImageVariantContract";

/**
 * 모델 일관성 수동 검수 계약 (SSM-203).
 *
 * 생성 모델은 같은 kit 스펙을 줘도 컷마다 다른 결과를 낸다. SSM-202 실측에서
 * 같은 모델 스펙으로 만든 컷의 **스커트 기장이 미디 → 미니로 바뀌었고**, 다른 컷에는
 * 배경에 조명 장비가 들어왔다. 두 결함 모두 자동 검사로는 잡히지 않고 사람 눈에만 보인다.
 *
 * 그래서 "본 사람이 무엇을 확인했는가"를 자산 단위로 남기고,
 * **스토어 payload로 올라가는 variant(대표·추가)는 차단 항목을 다 확인해야 적용된다.**
 * 내부 자산(모델컷·썸네일)은 기록만 하고 막지 않는다 — 아직 고객에게 보이지 않기 때문이다.
 *
 * DB·env에 의존하지 않는 순수 계약이다.
 */

export type CommerceModelConsistencySeverityType = "blocking" | "advisory";

export type CommerceModelConsistencyCheckItemType = {
  id: string;
  severity: CommerceModelConsistencySeverityType;
  /** 모델 참조를 쓴 생성에만 해당하는 항목. 상품 단독 컷에는 묻지 않는다. */
  modelOnly: boolean;
};

/** 항목의 화면 문구는 UI(`smartstoreImageVariants.ts`)에 둔다. 여기에는 판정에 필요한 값만 둔다. */
export const COMMERCE_MODEL_CONSISTENCY_CHECK_ITEMS: readonly CommerceModelConsistencyCheckItemType[] = [
  // 실측 결함 ① 같은 kit인데 컷마다 인물이 달라 보이는 경우
  { id: "same_person", severity: "blocking", modelOnly: true },
  { id: "outfit_items_match", severity: "blocking", modelOnly: false },
  // 실측 결함 ② 착장 기장이 스펙과 달라진 경우 (미디 → 미니)
  { id: "garment_length_match", severity: "blocking", modelOnly: false },
  { id: "color_material_match", severity: "blocking", modelOnly: false },
  // 실측 결함 ③ 배경에 소프트박스·스탠드가 들어온 경우
  { id: "no_equipment_intrusion", severity: "blocking", modelOnly: false },
  { id: "anatomy_ok", severity: "blocking", modelOnly: true },
  { id: "framing_ok", severity: "advisory", modelOnly: false },
];

export const COMMERCE_MODEL_CONSISTENCY_CHECK_ITEM_IDS: readonly string[] =
  COMMERCE_MODEL_CONSISTENCY_CHECK_ITEMS.map((item) => item.id);

function isKnownCheckItemId(value: unknown): value is string {
  return COMMERCE_MODEL_CONSISTENCY_CHECK_ITEM_IDS.includes(String(value || "").trim());
}

export function normalizeCommerceModelConsistencyCheckedIds(values: unknown): string[] {
  if (!Array.isArray(values)) return [];
  const seen = new Set<string>();
  for (const raw of values) {
    const id = String(raw || "").trim();
    // 모르는 id를 통과시키면 화면이 임의 문자열을 보내 게이트를 우회할 수 있다.
    if (!isKnownCheckItemId(id) || seen.has(id)) continue;
    seen.add(id);
  }
  return COMMERCE_MODEL_CONSISTENCY_CHECK_ITEM_IDS.filter((id) => seen.has(id));
}

/** 이 variant·이 생성 조건에서 실제로 물어야 하는 항목. */
export function getCommerceModelConsistencyItems(args: {
  variant: unknown;
  usedModelReference: boolean;
}): CommerceModelConsistencyCheckItemType[] {
  return COMMERCE_MODEL_CONSISTENCY_CHECK_ITEMS.filter(
    (item) => !item.modelOnly || args.usedModelReference === true,
  );
}

/**
 * 적용을 막을지 판정한다.
 *
 * `gateRequired`는 **Smartstore payload role이 있는 variant**에만 true다.
 * 모델컷·썸네일은 아직 스토어에 나가지 않으므로 기록만 남기고 통과시킨다.
 */
export type CommerceModelConsistencyVerdictType = {
  variant: CommerceImageVariantType;
  gateRequired: boolean;
  requiredItemIds: string[];
  checkedItemIds: string[];
  missingItemIds: string[];
  /** 차단 항목이 모두 확인됐는가. advisory 항목은 여기에 영향을 주지 않는다. */
  passed: boolean;
};

export function evaluateCommerceModelConsistency(args: {
  variant: unknown;
  usedModelReference: boolean;
  checkedItemIds?: unknown;
}): CommerceModelConsistencyVerdictType {
  const variant = normalizeCommerceImageVariant(args.variant);
  const spec = getCommerceImageVariantSpec(variant);
  const applicable = getCommerceModelConsistencyItems({ variant, usedModelReference: args.usedModelReference });
  const requiredItemIds = applicable.filter((item) => item.severity === "blocking").map((item) => item.id);
  const checkedItemIds = normalizeCommerceModelConsistencyCheckedIds(args.checkedItemIds);
  const checkedSet = new Set(checkedItemIds);
  const missingItemIds = requiredItemIds.filter((id) => !checkedSet.has(id));

  return {
    variant,
    gateRequired: spec.payloadRole !== null,
    requiredItemIds,
    checkedItemIds,
    missingItemIds,
    passed: missingItemIds.length === 0,
  };
}

export type CommerceModelConsistencyRecordType = {
  variant: CommerceImageVariantType;
  checkedItemIds: string[];
  usedModelReference: boolean;
  checkedAt: string;
  checkedBy: string;
};

/** draft에 남길 검수 기록. 누가 언제 무엇을 확인했는지가 남아야 검수가 증거가 된다. */
export function buildCommerceModelConsistencyRecord(args: {
  verdict: CommerceModelConsistencyVerdictType;
  usedModelReference: boolean;
  actor: string;
  now?: Date;
}): CommerceModelConsistencyRecordType {
  return {
    variant: args.verdict.variant,
    checkedItemIds: args.verdict.checkedItemIds,
    usedModelReference: args.usedModelReference === true,
    checkedAt: (args.now || new Date()).toISOString(),
    checkedBy: String(args.actor || "").trim(),
  };
}
