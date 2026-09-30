import "server-only";

/**
 * @docHint
 * @purpose Personal Canon 데이터 lifecycle 계약의 순수 상수·필터 (OOC-070)
 * @process 삭제·export allowlist  seed/secret 성 필드 제외
 * @domain narrative-privacy
 * @scope server
 */

/** Personal Canon 삭제·export가 함께 다루는 16개 collection — NARRATIVE_LIFECYCLE_POLICY와 account deletion allowlist가 일치해야 한다. */
export const NARRATIVE_DELETION_COLLECTIONS = [
  "narrative_privacy_preferences",
  "user_story_states",
  "story_arcs",
  "story_beats",
  "narrative_events",
  "character_relations",
  "personal_universes",
  "personal_universe_canon_revisions",
  "personal_universe_public_snapshots",
  "personal_universe_public_snapshot_reports",
  "tutor_play_projection_ledger",
  "tutor_play_projection_daily_usage",
  "cross_universe_share_preferences",
  "cross_universe_bridge_events",
  "cross_universe_user_blocks",
  "cross_universe_reports",
] as const;

/**
 * export 응답에서 raw seed·secret 성 필드를 제외한다.
 * 개인 식별이 아닌 서버 내부 시드/자격증명 성 키가 사용자에게 노출되지 않도록 한다.
 */
export function stripNarrativeSensitiveKeys(doc: Record<string, unknown>) {
  return Object.fromEntries(Object.entries(doc).filter(([docKey]) => !/seed|secret/i.test(docKey)));
}
