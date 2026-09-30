"use client";
import { useCallback } from "react";
import PromptManagerBase from "./PromptManagerBase";
import { listContentPrompts, upsertContentPrompt, deleteContentPrompt } from "libs/api/lab";
import { DEFAULT_CONTENT_OUTPUT_FORMAT } from "consts/app";
import type { UiScopeType } from "types/ai";
import type { PromptItemType, PromptItemOptionType } from "types/app";

const CONTENT_TEMPLATE_TEXT_PLACEHOLDER = `주제, 대상, 톤, 구조(hook → value → CTA), CTA 등을 명확하게 포함하도록 프롬프트 템플릿을 만드세요.
아래와 같은 형식의 템플릿 변수를 사용할 수 있습니다.

{필드::placeholder}
{필드::옵션1|옵션2}
{필드*::필수옵션1|필수옵션2}`;

export default function ContentPromptManager({
  scope = "system",
  showSearchField = false,
}: {
  scope?: UiScopeType;
  showSearchField?: boolean;
}) {
  const listFn = useCallback((params?: { q?: string; category?: string; enabled?: boolean }) => {
    return listContentPrompts({
      ...params,
      scope,
      ...(scope === "system" ? { view: "admin" } : {}),
    });
  }, [scope]);

  const upsertFn = useCallback((payload: PromptItemType, opts?: PromptItemOptionType) => {
    return upsertContentPrompt(payload, { ...opts, scope });
  }, [scope]);

  const deleteFn = useCallback((key: string) => {
    return deleteContentPrompt(key, { scope });
  }, [scope]);

  return (
    <PromptManagerBase
      title="콘텐츠 프롬프트"
      dialogTitle="프롬프트 편집"
      listFn={listFn}
      upsertFn={upsertFn}
      deleteFn={deleteFn}
      syncKind="content"
      showSearchField={showSearchField}
      showAdminOnlyFilter={scope === "system"}
      allowAccessLevel={scope === "system"}
      defaultParamsMode="content-structured"
      defaultEditing={() => ({
        key: "",
        title: "",
        categories: [],
        enabled: true,
        accessLevel: "public",
        defaultParams: {
          platform: "instagram",
          language: "ko",
          length: "instagram: 3-5문장 + 해시태그",
          outputFormat: DEFAULT_CONTENT_OUTPUT_FORMAT,
        },
        templateText: "",
        tags: [],
      })}
      defaultTemplateText={CONTENT_TEMPLATE_TEXT_PLACEHOLDER}
    />
  );
}
