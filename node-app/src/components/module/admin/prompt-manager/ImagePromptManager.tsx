"use client";

import { useCallback } from "react";
import PromptManagerBase from "./PromptManagerBase";
import { listImagePrompts, upsertImagePrompt, deleteImagePrompt } from "libs/api/lab";
import { DEFAULT_IMAGE_SIZE, IMAGE_REF_LIMIT_BY_PROVIDER } from "consts/ai";
import type { UiScopeType } from "types/ai";
import type { PromptItemType, PromptItemOptionType } from "types/app";

export default function ImagePromptManager({
  scope = "system",
  showSearchField = false,
}: {
  scope?: UiScopeType;
  showSearchField?: boolean;
}) {
  const listFn = useCallback(
    (params?: { q?: string; category?: string; enabled?: boolean }) => {
      return listImagePrompts({
        ...params,
        scope,
        ...(scope === "system" ? { view: "admin" } : {}),
      });
    },
    [scope],
  );

  const upsertFn = useCallback(
    (payload: PromptItemType, opts?: PromptItemOptionType) => {
      return upsertImagePrompt(payload, { ...opts, scope });
    },
    [scope],
  );

  const deleteFn = useCallback(
    (key: string) => {
      return deleteImagePrompt(key, { scope });
    },
    [scope],
  );

  return (
    <PromptManagerBase
      title="이미지 프롬프트"
      dialogTitle="프롬프트 편집"
      listFn={listFn}
      upsertFn={upsertFn}
      deleteFn={deleteFn}
      syncKind="image"
      showSearchField={showSearchField}
      showAdminOnlyFilter={scope === "system"}
      showUsageTip
      allowAccessLevel={scope === "system"}
      defaultParamsMode="image-structured"
      defaultTemplateText="생성하고 싶은 피사체와 동작, 배경 등에 대한 설명을 입력하세요."
      showImageDescriptionTemplateText
      defaultEditing={() => ({
        key: "",
        title: "",
        categories: [],
        enabled: true,
        accessLevel: "public",
        defaultParams: {
          aspectRatio: "9:16",
          size: DEFAULT_IMAGE_SIZE,
        },
        inputPolicy: {
          referenceImage: {
            required: false,
            minCount: 0,
            maxCount: IMAGE_REF_LIMIT_BY_PROVIDER.google,
            enforceInCustomMode: true,
          },
        },
        templateText: "",
        sceneTemplate: "",
        usageTip: "",
        tags: [],
      })}
    />
  );
}
