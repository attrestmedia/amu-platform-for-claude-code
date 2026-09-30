import type { UnknownRecord } from "utils/common/typeUtils";

export type FormSizeType = "xs" | "sm" | "md" | "lg" | "xl";
export type FormScopeType = "select" | "text";
export type FormLayoutScopeType = "default" | "card";
export type CredentialFormStateType = {
  clientId: string;
  clientSecret: string;
  extras: UnknownRecord;
};
