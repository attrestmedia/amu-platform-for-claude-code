/**
 * @docHint
 * @purpose Narrative Runtime의 기본 비활성 feature flag
 * @process 명시적 true만 활성화  production flag 오작동 시 fail-closed
 * @domain narrative-runtime
 * @scope server
 */

export function isNarrativeRuntimeEnabled() {
  return process.env.NARRATIVE_RUNTIME_ENABLED === "true";
}
