import type { ImageProviderType } from "types/ai";

// 과금 모델명 결정 정책: 실행 모델 기준으로 과금한다.
export function resolveImageBillingModelName(args: {
  provider: ImageProviderType;
  requestedModelName: string;
  executedModelName?: string;
  hasBaseImages?: boolean;
}) {
  const requested = String(args.requestedModelName || "").trim();
  const executed = String(args.executedModelName || "").trim();
  return executed || requested;
}
