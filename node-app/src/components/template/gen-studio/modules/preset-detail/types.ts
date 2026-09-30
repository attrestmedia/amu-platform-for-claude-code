import type { FormScopeType } from "types/ui";
import type { PromptVisibilityType, ImagePromptMetaType } from "types/app";
import type { UserScopeType } from "types/ai";
import type { PromptItemType } from "types/app";

export type VarSpec = {
  key: string;
  kind: FormScopeType;
  options?: string[];
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
};
export type SettingDialogType =
  | "aspect"
  | "resolution"
  | "model"
  | "count"
  | "reference"
  | "modelImage"
  | "advanced"
  | null;

export type AppliedRefItemType = {
  id: string;
  mimeType: string;
  data: string;
  preview: string;
  name: string;
  origin: "attached" | "recent";
  attachedId?: string;
  recentUrl?: string;
};

export type RecentOwnerFilterType = "all" | "mine";
export type RecentVisibilityFilterType = PromptVisibilityType;

export type RecentImagesStateType = {
  recentImages: string[];
  recentMetaBySrc: Record<string, ImagePromptMetaType>;
  recentOwnerFilter: RecentOwnerFilterType;
  recentVisibilityFilter: RecentVisibilityFilterType;
};

export type RecentHookArgsType = {
  mode: UserScopeType;
  universeId?: string;
  detail: PromptItemType | null;
  isLoggedIn: boolean;
};
