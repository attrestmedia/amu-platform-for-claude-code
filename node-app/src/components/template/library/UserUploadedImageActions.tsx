"use client";

import { useState } from "react";
import { Check, Copy, Globe, Lock, Pencil } from "lucide-react";
import { toast } from "sonner";
import { Lang, lang } from "components/module/i18n";
import { Button } from "@amu-labs/ui";
import type { ImagePromptMetaType, PromptVisibilityType } from "types/app";
import { writeTextToClipboard } from "utils/helper";

type Props = {
  item: ImagePromptMetaType;
  canEditImage: boolean;
  preparingEdit: boolean;
  onEdit: (item: ImagePromptMetaType) => Promise<void>;
  onVisibilityChange: (item: ImagePromptMetaType, next: PromptVisibilityType) => Promise<void>;
};

export function UserUploadedImageActions({ item, canEditImage, preparingEdit, onEdit, onVisibilityChange }: Props) {
  const [updating, setUpdating] = useState(false);
  const [copied, setCopied] = useState(false);
  const isPublic = item.visibility === "public";
  const publicUrlAvailable = isPublic && item.urlKind === "public" && /^https?:\/\//i.test(item.url);

  const changeVisibility = async () => {
    if (updating) return;
    setUpdating(true);
    try {
      await onVisibilityChange(item, isPublic ? "private" : "public");
    } finally {
      setUpdating(false);
    }
  };

  const copyPublicUrl = async () => {
    if (!publicUrlAvailable) return;
    try {
      await writeTextToClipboard(item.url);
      setCopied(true);
      toast.success(lang({ ko: "공개 URL을 복사했습니다.", en: "Public URL copied." }));
      window.setTimeout(() => setCopied(false), 1200);
    } catch {
      toast.error(lang({ ko: "공개 URL을 복사하지 못했습니다.", en: "Could not copy the public URL." }));
    }
  };

  return (
    <div className="grid w-full gap-2">
      {canEditImage ? (
        <Button
          size="sm"
          className="min-h-11 w-full gap-1.5 px-2 text-xs"
          loading={preparingEdit}
          loadingText={<Lang text={{ ko: "편집기 준비 중", en: "Opening editor" }} />}
          disabled={updating}
          onClick={() => void onEdit(item)}
        >
          <Pencil className="h-4 w-4" aria-hidden />
          <Lang text={{ ko: "이미지 편집", en: "Edit image" }} />
        </Button>
      ) : null}

      <Button
        variant="outline"
        size="sm"
        className="min-h-11 w-full gap-1.5 px-2 text-xs"
        loading={updating}
        loadingText={<Lang text={{ ko: "변경 중", en: "Updating" }} />}
        onClick={() => void changeVisibility()}
      >
        {isPublic ? <Lock className="h-4 w-4" aria-hidden /> : <Globe className="h-4 w-4" aria-hidden />}
        <Lang text={isPublic ? { ko: "비공개로 전환", en: "Make private" } : { ko: "공개로 전환", en: "Make public" }} />
      </Button>

      {publicUrlAvailable ? (
        <Button
          size="sm"
          className="min-h-11 w-full gap-1.5 px-2 text-xs"
          onClick={() => void copyPublicUrl()}
          aria-label={lang({ ko: "외부 공유용 공개 URL 복사", en: "Copy public URL for external sharing" })}
        >
          {copied ? <Check className="h-4 w-4" aria-hidden /> : <Copy className="h-4 w-4" aria-hidden />}
          <Lang text={copied ? { ko: "복사됨", en: "Copied" } : { ko: "공개 URL 복사", en: "Copy public URL" }} />
        </Button>
      ) : null}
    </div>
  );
}
