import { Send } from "lucide-react";
import { Button, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@amu-labs/ui";
import { Lang, lang } from "components/module/i18n";
import type { MarketingGenerationConfirmState } from "./MarketingOpsTypes";

export function MarketingGenerationConfirmDialog({
  state,
  onClose,
  onConfirm,
}: {
  state: MarketingGenerationConfirmState;
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <Dialog open={state.open} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="min-w-[20rem] sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            <Lang
              text={
                state.mode === "current_list"
                  ? { ko: "현재 목록 전체 콘텐츠를 생성할까요?", en: "Generate content for the current list?" }
                  : { ko: "기존 생성 콘텐츠가 있습니다.", en: "Generated content already exists." }
              }
            />
          </DialogTitle>
          <DialogDescription className="text-left text-sm leading-6 text-slate-600">
            {state.mode === "current_list"
              ? lang({
                  ko: `${state.jobIds.length}개 job에 콘텐츠 생성을 요청합니다. 목록 전체 생성은 기존 생성물 여부를 개별 조회하지 않고 진행하므로, 이미 만든 draft나 이미지가 있으면 새 결과가 추가되거나 최신 결과로 보일 수 있습니다. 계속 진행할까요?`,
                  en: `Content generation will be requested for ${state.jobIds.length} job(s). The current-list action does not inspect each job detail first, so existing drafts or images may be followed by new results. Continue?`,
                })
              : lang({
                  ko: `${state.warningCount}개 채널에 기존 초안/검수 결과가 있습니다. 생성 이미지 ${state.imageCount}개도 새 생성 결과에 의해 바뀔 수 있습니다. 계속 진행할까요?`,
                  en: `${state.warningCount} channel(s) already have drafts or review results. ${state.imageCount} generated image(s) may be replaced by new results. Continue?`,
                })}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2">
          <Button variant="outline" size="xs" onClick={onClose}>
            <Lang text={{ ko: "취소", en: "Cancel" }} />
          </Button>
          <Button onClick={onConfirm}>
            <Send className="icon-xxs" />
            <span>{lang({ ko: "그래도 생성", en: "Generate anyway" })}</span>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
