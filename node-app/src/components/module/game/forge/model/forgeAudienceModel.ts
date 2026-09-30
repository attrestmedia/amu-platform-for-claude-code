export type ForgeAudience = "play-user" | "operator";

export type ForgeOperatorCapability =
  | "assets.draft"
  | "assets.template"
  | "assets.pipeline"
  | "assets.inventory"
  | "assets.runtime"
  | "assets.publish"
  | "assets.stageAttach";

export type ForgeAudienceContext = {
  audience: ForgeAudience;
  capabilities: readonly ForgeOperatorCapability[];
};

const OPERATOR_CAPABILITIES: readonly ForgeOperatorCapability[] = [
  "assets.draft",
  "assets.template",
  "assets.pipeline",
  "assets.inventory",
  "assets.runtime",
  "assets.publish",
  "assets.stageAttach",
];

export const PLAY_USER_AUDIENCE: ForgeAudienceContext = {
  audience: "play-user",
  capabilities: [],
};

const OPERATOR_AUDIENCE: ForgeAudienceContext = {
  audience: "operator",
  capabilities: OPERATOR_CAPABILITIES,
};

export function resolveForgeAudience(input: { isAdministrator: boolean }): ForgeAudienceContext {
  return input.isAdministrator ? OPERATOR_AUDIENCE : PLAY_USER_AUDIENCE;
}

export function hasForgeCapability(ctx: ForgeAudienceContext, cap: ForgeOperatorCapability): boolean {
  return ctx.capabilities.includes(cap);
}
