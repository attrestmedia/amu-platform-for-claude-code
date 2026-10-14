/**
 * @docHint
 * @purpose Narrative Runtime의 기본 비활성 feature flag
 * @process 명시적 true만 활성화  production flag 오작동 시 fail-closed
 * @domain narrative-runtime
 * @scope server
 */

export const NARRATIVE_DIRECTOR_CONSUMERS = ["chat", "relationship_proposal"] as const;

export type NarrativeDirectorConsumer = (typeof NARRATIVE_DIRECTOR_CONSUMERS)[number];

const CONSUMER_KILL_SWITCH_ENV: Record<NarrativeDirectorConsumer, string> = {
  chat: "NARRATIVE_DIRECTOR_CHAT_ENABLED",
  relationship_proposal: "NARRATIVE_DIRECTOR_RELATIONSHIP_PROPOSAL_ENABLED",
};

export function isNarrativeRuntimeEnabled(env: Record<string, string | undefined> = process.env) {
  return env.NARRATIVE_RUNTIME_ENABLED === "true";
}

export function isNarrativeDirectorConsumerEnabled(
  consumer: NarrativeDirectorConsumer,
  env: Record<string, string | undefined> = process.env,
) {
  return isNarrativeRuntimeEnabled(env) && env[CONSUMER_KILL_SWITCH_ENV[consumer]] !== "false";
}
