"use client";

import { useEffect, useState } from "react";
import { Button } from "@amu-labs/ui";
import { Lang, lang } from "components/module/i18n";
import { useUserData } from "hooks/auth";
import type { UiScopeType } from "types/ai";
import type { GenStudioManagementTabType } from "consts/app";
import ImagePromptManager from "./ImagePromptManager";
import ContentPromptManager from "./ContentPromptManager";
import ImagePromptBookmarkManager, { ContentPromptBookmarkManager } from "./ImagePromptBookmarkManager";
import ImageExtraPromptManager from "./ImageExtraPromptManager";

export type UserPromptManagerTab = GenStudioManagementTabType;

export function UserPromptManager({ initialTab = "image", onClose }: { initialTab?: UserPromptManagerTab; onClose?: () => void }) {
  const { isAdministrator } = useUserData();
  const scope: UiScopeType = isAdministrator ? "system" : "user";
  const [tab, setTab] = useState<UserPromptManagerTab>(initialTab);

  useEffect(function syncTabFromInitialProp() {
    // initialTab prop(외부 입력) 변경 시 현재 tab 동기화
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTab(initialTab);
  }, [initialTab]);

  return (
    <div className="flex flex-col h-full gap-3">
      <div className="flex flex-col gap-2 shrink-0">
        <div className="flex flex-wrap items-center gap-2">
          <Button variant={tab === "image" ? "primary" : "outline"} size="sm" onClick={() => setTab("image")}>
            <Lang text={{ ko: "이미지 프롬프트", en: "Image Prompts" }} />
          </Button>
          <Button variant={tab === "content" ? "primary" : "outline"} size="sm" onClick={() => setTab("content")}>
            <Lang text={{ ko: "콘텐츠 프롬프트", en: "Content Prompts" }} />
          </Button>
          <Button variant={tab === "bookmarks" ? "primary" : "outline"} size="sm" onClick={() => setTab("bookmarks")}>
            <Lang text={{ ko: "이미지 북마크", en: "Image Bookmarks" }} />
          </Button>
          <Button
            variant={tab === "content-bookmarks" ? "primary" : "outline"}
            size="sm"
            onClick={() => setTab("content-bookmarks")}
          >
            <Lang text={{ ko: "콘텐츠 북마크", en: "Content Bookmarks" }} />
          </Button>
          <Button
            variant={tab === "extra-prompts" ? "primary" : "outline"}
            size="sm"
            onClick={() => setTab("extra-prompts")}
          >
            <Lang text={{ ko: "사용 프롬프트", en: "Saved Prompts" }} />
          </Button>

          <div className="ml-auto text-xs text-muted-foreground">
            <Lang text={{ ko: "현재 스코프", en: "Scope" }} />:{" "}
            <b>
              {tab === "bookmarks"
                ? lang({ ko: "내 템플릿 북마크", en: "My template bookmarks" })
                : tab === "content-bookmarks"
                  ? lang({ ko: "내 콘텐츠 템플릿 북마크", en: "My content template bookmarks" })
                : tab === "extra-prompts"
                  ? lang({ ko: "내 사용 프롬프트", en: "My saved prompts" })
                : scope === "system"
                  ? lang({ ko: "관리자(공용)", en: "Admin (shared)" })
                  : lang({ ko: "내 프롬프트", en: "My prompts" })}
            </b>
          </div>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto">
        {tab === "image" ? (
          <ImagePromptManager key={`image-${scope}`} scope={scope} showSearchField />
        ) : tab === "content" ? (
          <ContentPromptManager key={`content-${scope}`} scope={scope} showSearchField />
        ) : tab === "bookmarks" ? (
          <ImagePromptBookmarkManager onClose={onClose} />
        ) : tab === "content-bookmarks" ? (
          <ContentPromptBookmarkManager onClose={onClose} />
        ) : (
          <ImageExtraPromptManager onClose={onClose} />
        )}
      </div>
    </div>
  );
}
