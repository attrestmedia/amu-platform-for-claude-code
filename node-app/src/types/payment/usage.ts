export type CoinUsageActivity =
  | "image_generation"
  | "content_generation"
  | "conversation"
  | "audio"
  | "ai_task"
  | "coin_charge"
  | "subscription_grant";

export type CoinUsagePurpose =
  | "content.generate"
  | "image.generate_or_edit"
  | "image.remove_background"
  | "conversation.chat"
  | "audio.synthesize"
  | "audio.transcribe"
  | "audio.analyze"
  | "marketing.proofread"
  | "marketing.independent_proofread"
  | "marketing.strategy_fit"
  | "tutors.persona_generate"
  | "tutors.profile_image_generate"
  | "mini_app.assist"
  | "ai.other"
  | "coin.charge"
  | "coin.subscription_grant";

export type CoinUsageSource =
  | "user_action"
  | "local_agent"
  | "agent_api"
  | "server_worker"
  | "system"
  | "legacy_unknown";

export type CoinUsageAttribution = {
  activity: CoinUsageActivity;
  purpose: CoinUsagePurpose;
  source: CoinUsageSource;
  attributionVersion: 1;
};

export type CoinUsagePublicContext = {
  channel?: string;
};

export type CoinUsageLedgerKind =
  | "deduction"
  | "refund"
  | "compensation"
  | "charge"
  | "subscription_grant";
export type CoinUsageEntryType = "deduction" | "refund" | "compensation" | "zero";
export type CoinUsageRecordState =
  | "prepared"
  | "applied"
  | "failed"
  | "compensated"
  | "reconciliation_required"
  /**
   * EL-203 — provider 처리 여부를 알 수 없는 종료(timeout·worker kill·연결 종단).
   * 실패(failed)와 다르다. 실패는 재시도 가능하지만 이 상태는 **자동 재시도·자동 재청구를 금지**하고
   * provider 청구와 대조한 뒤 사람이 정리한다(ADR-EL-001 D6).
   */
  | "unknown_outcome";

export type CoinUsageLedgerItem = {
  id: string;
  activity: CoinUsageActivity;
  purpose: CoinUsagePurpose;
  source: CoinUsageSource;
  context?: CoinUsagePublicContext;
  kind: CoinUsageLedgerKind;
  amount: number;
  createdAt: string;
};
