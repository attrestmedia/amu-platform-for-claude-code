import {
  AI_MARKETING_PROOFREAD_DEFAULT_MODEL,
  AI_MARKETING_PROOFREAD_MODEL_BY_PROVIDER,
  type AI_TEXT_MODEL_MAP,
} from "../ai/generated/modelCatalog.generated";
import type { AssertAssignable } from "../ai/catalogShapeAssertion";


export type MarketingProofreadCanonicalShape = [
  AssertAssignable<typeof AI_MARKETING_PROOFREAD_MODEL_BY_PROVIDER,
    Record<keyof typeof AI_TEXT_MODEL_MAP, string>
  >,
];

export const MARKETING_PROOFREAD_DEFAULT_MODEL = AI_MARKETING_PROOFREAD_DEFAULT_MODEL;
