"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Copy, Search, Trash2 } from "lucide-react";
import { Lang, lang } from "components/module/i18n";
import { Badge, Button, Input, dialog } from "@amu-labs/ui";
import { toast } from "sonner";
import { useImageExtraPromptBookmarks } from "hooks/app/useImageExtraPromptBookmarks";
import { useAuthStore } from "store/auth";
import type { PromptItemType } from "types/app";
import { loadStudioImagePromptItems } from "utils/app";
import { buildGenStudioTemplatePath } from "utils/app/genStudioRouteContract";
import { cn } from "utils/common";
import { logger } from "utils/log";

type ImageExtraPromptManagerProps = {
  onClose?: () => void;
};

function formatSavedDate(value: string) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  return date.toLocaleDateString();
}

export default function ImageExtraPromptManager({ onClose }: ImageExtraPromptManagerProps) {
  const router = useRouter();
  const isLoggedIn = useAuthStore((s) => s.isLogged());
  const [q, setQ] = useState("");
  const [templates, setTemplates] = useState<PromptItemType[]>([]);
  const { items, itemsByTemplate, pendingRemoveIds, isClearing, handleRemovePrompt, handleClearPrompts } =
    useImageExtraPromptBookmarks({ isLoggedIn });

  useEffect(function fetchExtraPromptTemplates() {
    let cancelled = false;

    if (!isLoggedIn) {
      // 비로그인 상태에서 외부 데이터 비움
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setTemplates([]);
      return;
    }

    loadStudioImagePromptItems({ enabled: true, isLoggedIn })
      .then((nextItems) => {
        if (!cancelled) setTemplates(nextItems);
      })
      .catch((error) => {
        logger.warn("[ImageExtraPromptManager] 이미지 프롬프트 로드 실패", error);
        if (!cancelled) setTemplates([]);
      });

    return () => {
      cancelled = true;
    };
  }, [isLoggedIn]);

  const titleByTemplateKey = useMemo(() => {
    return new Map(templates.map((item) => [item.key, item.title] as const));
  }, [templates]);

  const groups = useMemo(() => {
    const query = q.trim().toLowerCase();
    return Object.entries(itemsByTemplate)
      .map(([templateKey, groupItems]) => ({
        templateKey,
        title: titleByTemplateKey.get(templateKey) || templateKey,
        items: groupItems,
      }))
      .filter((group) => {
        if (!query) return true;
        return [group.templateKey, group.title, ...group.items.map((item) => item.text)].some((value) =>
          String(value || "")
            .toLowerCase()
            .includes(query),
        );
      })
      .sort((a, b) => String(a.title || a.templateKey).localeCompare(String(b.title || b.templateKey)));
  }, [itemsByTemplate, q, titleByTemplateKey]);

  const handleOpenTemplate = useCallback(
    (templateKey: string) => {
      onClose?.();
      const href = buildGenStudioTemplatePath("image", templateKey);
      if (href) router.push(href);
    },
    [onClose, router],
  );

  const handleCopy = useCallback(async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(lang({ ko: "이미지 설명을 복사했습니다.", en: "Image description copied." }));
    } catch {
      void dialog.alert({ variant: "danger", message: lang({ ko: "복사에 실패했습니다.", en: "Failed to copy." }) });
    }
  }, []);

  if (!isLoggedIn) {
    return (
      <div className="rounded-lg border border-dashed px-4 py-10 text-center text-sm text-muted-foreground">
        <Lang
          text={{
            ko: "저장한 이미지 설명 관리는 로그인 후 이용할 수 있습니다.",
            en: "Log in to manage saved image descriptions.",
          }}
        />
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <div className="flex shrink-0 flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(event) => setQ(event.target.value)}
            placeholder={lang({ ko: "저장한 이미지 설명 검색", en: "Search saved image descriptions" })}
            className="pl-9"
          />
        </div>

        <div className="flex shrink-0 gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => void handleClearPrompts()}
            disabled={items.length === 0 || isClearing}
          >
            <Trash2 className="h-4 w-4" />
            <Lang text={{ ko: "전체 삭제", en: "Clear all" }} />
          </Button>
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
        </div>
      </div>

      <div className="flex items-center justify-between rounded-lg border bg-background px-3 py-2 text-xs text-muted-foreground">
        <span>
          <Lang text={{ ko: "저장한 이미지 설명", en: "Saved image descriptions" }} />
        </span>
        <Badge variant="outline" size="xs" className="font-mono">
          {items.length}
        </Badge>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {groups.length === 0 ? (
          <div className="rounded-lg border border-dashed px-4 py-10 text-center text-sm text-muted-foreground">
            <Lang
              text={{
                ko:
                  items.length === 0 ? "아직 저장한 이미지 설명이 없습니다." : "검색 조건에 맞는 저장 항목이 없습니다.",
                en:
                  items.length === 0
                    ? "You have not saved any image descriptions yet."
                    : "No saved image descriptions match your search.",
              }}
            />
          </div>
        ) : (
          <div className="space-y-3">
            {groups.map((group) => (
              <section key={group.templateKey} className="rounded-lg border bg-background">
                <div className="flex items-start justify-between gap-3 border-b px-3 py-3">
                  <div className="min-w-0">
                    <h3 className="truncate text-sm font-semibold text-foreground">{group.title}</h3>
                    <p className="mt-0.5 truncate font-mono text-xxs text-muted-foreground">{group.templateKey}</p>
                  </div>
                  <div className="flex shrink-0 gap-1.5">
                    <Button variant="outline" size="xs" onClick={() => handleOpenTemplate(group.templateKey)}>
                      <Lang text={{ ko: "열기", en: "Open" }} />
                    </Button>
                    <Button
                      variant="outline"
                      size="xs"
                      onClick={() => void handleClearPrompts(group.templateKey)}
                      disabled={isClearing}
                    >
                      <Lang text={{ ko: "그룹 삭제", en: "Clear group" }} />
                    </Button>
                  </div>
                </div>

                <div className="divide-y">
                  {group.items.map((item) => (
                    <div key={item.id} className="flex items-start gap-2 px-3 py-3">
                      <div className="min-w-0 flex-1">
                        <p className="line-clamp-3 text-sm leading-relaxed text-foreground">{item.text}</p>
                        <p className="mt-1 text-xxs text-muted-foreground">
                          {formatSavedDate(item.updatedAt) || item.updatedAt}
                        </p>
                      </div>
                      <div className={cn("flex shrink-0 gap-1", pendingRemoveIds[item.id] && "opacity-50")}>
                        <Button
                          variant="blank"
                          size="icon-xs"
                          onClick={() => void handleCopy(item.text)}
                          aria-label={lang({ ko: "이미지 설명 복사", en: "Copy image description" })}
                        >
                          <Copy className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="blank"
                          size="icon-xs"
                          onClick={() => void handleRemovePrompt(item.id)}
                          disabled={Boolean(pendingRemoveIds[item.id])}
                          aria-label={lang({ ko: "저장한 이미지 설명 삭제", en: "Remove saved image description" })}
                          className="text-muted-foreground hover:text-destructive"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
