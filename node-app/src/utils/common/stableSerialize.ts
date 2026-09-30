/**
 * Object key order를 고정해 멱등성 fingerprint에 사용할 문자열을 만든다.
 *
 * 이 함수는 commerce provider request id에 사용되므로 동작을 변경하지 않고
 * 기존 라우트의 동일 구현을 공용화한다.
 */
export function stableSerialize(value: unknown): string {
  if (value === null || value === undefined) return "null";
  if (Array.isArray(value)) return `[${value.map(stableSerialize).join(",")}]`;
  if (typeof value !== "object") return JSON.stringify(value);
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableSerialize(record[key])}`)
    .join(",")}}`;
}
