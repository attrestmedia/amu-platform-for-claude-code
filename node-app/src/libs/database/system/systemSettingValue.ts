export type SystemSettingRead =
  | { status: "missing" }
  | { status: "ok"; value: Record<string, unknown> }
  | { status: "invalid"; valueType: string };

/** prototype이 Object.prototype 또는 null인 객체만 plain object로 본다. */
export function isPlainSettingObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

/** 값 원문을 노출하지 않고 종류만 설명한다. */
export function describeSystemSettingValueType(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";

  const valueType = typeof value;
  if (valueType !== "object") return valueType;

  return Object.prototype.toString.call(value).slice(8, -1);
}

/** 문서 부재와 문서 안의 손상된 값을 분리한다. */
export function classifySystemSettingDocument(
  doc: { value?: unknown } | null | undefined,
): SystemSettingRead {
  if (doc === null || doc === undefined) return { status: "missing" };

  if (isPlainSettingObject(doc.value)) {
    return { status: "ok", value: doc.value };
  }

  return { status: "invalid", valueType: describeSystemSettingValueType(doc.value) };
}
