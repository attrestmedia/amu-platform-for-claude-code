"use client";

import { Button, Dialog, DialogContent, DialogHeader, DialogTitle, Textarea } from "@amu-labs/ui";
import { toast } from "sonner";
import { Lang, lang } from "components/module/i18n";
import { Copy } from "lucide-react";
import { writeTextToClipboard } from "utils/helper";

export function PromptPreviewDebugDialog({
  open,
  onOpenChange,
  prompt,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  prompt: string;
}) {
  const handleCopy = async () => {
    const text = String(prompt || "").trim();
    if (!text) return;
    await writeTextToClipboard(text);
    toast.success(lang({ ko: "전체 프롬프트를 복사했습니다.", en: "Copied the full prompt." }));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[88vh] min-w-[20rem] overflow-hidden sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>
            <Lang text={{ ko: "어드민 전송 프롬프트", en: "Admin Transfer Prompt" }} />
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-2 overflow-y-auto pr-1">
          <p className="text-xs leading-5 text-secondary-text">
            <Lang
              text={{
                ko: "생성 요청에 내부적으로 병합되어 전달되는 전체 프롬프트입니다. 일반 사용자의 미리보기에는 노출되지 않습니다.",
                en: "This is the full prompt internally merged for generation. It is hidden from the regular preview.",
              }}
            />
          </p>
          <div className="flex justify-end">
            <Button size="sm" onClick={handleCopy}>
              <Copy className="mr-1.5 h-3.5 w-3.5" />
              <Lang text={{ ko: "전체 복사", en: "Copy full" }} />
            </Button>
          </div>
          <Textarea rows={16} value={prompt || ""} readOnly />
        </div>
      </DialogContent>
    </Dialog>
  );
}
