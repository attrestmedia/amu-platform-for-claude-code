"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Lang } from "components/module/i18n";
import { Button } from "@amu-labs/ui";
import { ImagePromptBookmarkManagerPanel } from "components/template/gen-studio/modules/ImagePromptBookmarkManagerSheet";
import { usePromptBookmarks } from "hooks/app/useImagePromptBookmarks";
import { useAuthStore } from "store/auth";
import type { PromptItemType } from "types/app";
import { loadStudioContentPromptItems, loadStudioImagePromptItems } from "utils/app";
import { buildGenStudioTemplatePath } from "utils/app/genStudioRouteContract";
import { logger } from "utils/log";

export default function ImagePromptBookmarkManager({
  onClose,
  showBackButton = true,
}: {
  onClose?: () => void;
  showBackButton?: boolean;
}) {
  return <PromptBookmarkManager promptType="image" onClose={onClose} showBackButton={showBackButton} />;
}

export function ContentPromptBookmarkManager({
  onClose,
  showBackButton = true,
}: {
  onClose?: () => void;
  showBackButton?: boolean;
}) {
  return <PromptBookmarkManager promptType="content" onClose={onClose} showBackButton={showBackButton} />;
}

function PromptBookmarkManager({
  promptType,
  onClose,
  showBackButton,
}: {
  promptType: "image" | "content";
  onClose?: () => void;
  showBackButton: boolean;
}) {
  const router = useRouter();
  const isLoggedIn = useAuthStore((s) => s.isLogged());
  const [items, setItems] = useState<PromptItemType[]>([]);

  const {
    bookmarkedKeys,
    bookmarkPendingKeys,
    handleToggleBookmark,
    handleClearAllBookmarks,
  } = usePromptBookmarks({ kind: promptType, isLoggedIn });

  useEffect(function fetchBookmarkPromptItems() {
    let cancelled = false;

    if (!isLoggedIn) {
      // 비로그인 상태에서 외부 데이터 비움
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setItems([]);
      return;
    }

    const loadItems = promptType === "content" ? loadStudioContentPromptItems : loadStudioImagePromptItems;
    loadItems({ enabled: true, isLoggedIn })
      .then((nextItems) => {
        if (!cancelled) setItems(nextItems);
      })
      .catch((error) => {
        logger.warn(`[PromptBookmarkManager:${promptType}] 템플릿 로드 실패`, error);
        if (!cancelled) setItems([]);
      });

    return () => {
      cancelled = true;
    };
  }, [isLoggedIn, promptType]);

  const bookmarkedItems = useMemo(() => {
    const itemMap = new Map(items.map((item) => [item.key, item] as const));
    return bookmarkedKeys.map((key) => itemMap.get(key)).filter(Boolean) as PromptItemType[];
  }, [bookmarkedKeys, items]);

  const handleOpenTemplate = useCallback(
    (item: PromptItemType) => {
      onClose?.();
      const href = buildGenStudioTemplatePath(promptType, item.key);
      if (href) router.push(href);
    },
    [onClose, promptType, router],
  );

  if (!isLoggedIn) {
    return (
      <div className="rounded-xl border border-dashed px-4 py-10 text-center text-sm text-muted-foreground">
        <Lang
          text={{
            ko: "템플릿 북마크 관리는 로그인 후 이용할 수 있습니다.",
            en: "Log in to manage template bookmarks.",
          }}
        />
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      {showBackButton ? <div className="flex shrink-0 justify-end">
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            onClose?.();
            router.push("/gen-studio");
          }}
        >
          <Lang text={{ ko: "Gen Studio로 돌아가기", en: "Back to Gen Studio" }} />
        </Button>
      </div> : null}
      <div className="min-h-0 flex-1 overflow-hidden rounded-xl border border-border bg-background">
        <ImagePromptBookmarkManagerPanel
          promptType={promptType}
          items={bookmarkedItems}
          pendingByKey={bookmarkPendingKeys}
          onOpenTemplate={handleOpenTemplate}
          onToggleBookmark={handleToggleBookmark}
          onClearAll={handleClearAllBookmarks}
        />
      </div>
    </div>
  );
}
