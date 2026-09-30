"use client";

import { useState } from "react";
import { Download, Heart, Share2, Sparkles, Star } from "lucide-react";
import { toast } from "sonner";
import { Button, Dialog, DialogContent, DialogHeader, DialogTitle } from "@amu-labs/ui";
import { Lang, lang } from "components/module/i18n";
import type { NpcConversationResult } from "types/game/npc-conversation-result";
import { shareNpcConversationResult } from "utils/game/npcConversationResult";

/**
 * @docHint
 * @purpose Play NPC 최초 서버 정산 성공의 친밀도·XP 변화와 개인정보 없는 공유 PNG CTA 표시
 * @process applied result 렌더  canvas share/download 실행  완료 후 chat 종료
 * @domain game.npc-conversation-result
 * @scope client-ui
 */

const LEVEL_LABELS: Record<NpcConversationResult["intimacyLevel"], { ko: string; en: string }> = {
  stranger: { ko: "낯선 사이", en: "Stranger" },
  familiar_face: { ko: "익숙한 얼굴", en: "Familiar" },
  acquaintance: { ko: "지인", en: "Acquaintance" },
  friend: { ko: "친구", en: "Friend" },
  close_friend: { ko: "가까운 친구", en: "Close friend" },
  best_friend: { ko: "절친", en: "Best friend" },
  soulmate: { ko: "소울메이트", en: "Soulmate" },
};

export function NpcConversationResultDialog({
  open,
  result,
  onOpenChange,
}: {
  open: boolean;
  result: NpcConversationResult | null;
  onOpenChange: (open: boolean) => void;
}) {
  const [isExporting, setIsExporting] = useState(false);
  if (!result) return null;

  const handleShare = async () => {
    if (isExporting) return;
    setIsExporting(true);
    try {
      const outcome = await shareNpcConversationResult(result);
      if (outcome === "downloaded") {
        toast.success(lang({ ko: "공유 카드를 PNG로 저장했어요.", en: "Saved the share card as a PNG." }));
      } else if (outcome === "shared") {
        toast.success(lang({ ko: "공유 카드를 열었어요.", en: "Opened the share sheet." }));
      }
    } catch {
      toast.error(lang({ ko: "공유 카드를 만들지 못했어요.", en: "Could not create the share card." }));
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="z-[160]"
        overlayClassName="z-[150]"
        innerWrapClassName="w-[calc(100vw-1rem)] max-w-md max-h-[calc(100dvh-1rem)] overflow-y-auto p-4 sm:p-6 [&>button]:h-11 [&>button]:w-11"
        data-testid="npc-conversation-result-dialog"
      >
        <DialogHeader className="pr-10 text-left">
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-pink-500" />
            <Lang text={{ ko: "대화의 기억", en: "Conversation memory" }} />
          </DialogTitle>
        </DialogHeader>

        <section
          className="overflow-hidden rounded-3xl bg-gradient-to-br from-slate-950 via-blue-950 to-purple-950 p-5 text-white shadow-xl"
          data-testid="npc-conversation-result-card"
        >
          <div className="text-center">
            <p className="text-[11px] font-semibold tracking-[0.24em] text-blue-200">AMU PLAY</p>
            <h3 className="mt-3 truncate text-xl font-bold">{result.npcName}</h3>
            <p className="mt-1 text-xs text-slate-300">
              <Lang text={{ ko: "새로운 대화가 관계에 남았어요", en: "Your conversation shaped this bond" }} />
            </p>
          </div>

          <div className="mt-5 rounded-2xl bg-white/10 p-4">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-2 text-sm text-pink-100">
                <Heart className="h-4 w-4 fill-pink-400 text-pink-400" />
                <Lang text={{ ko: "친밀도", en: "Intimacy" }} />
              </span>
              <strong className="text-2xl text-pink-300" data-testid="npc-result-intimacy-gain">
                +{result.intimacyGain}
              </strong>
            </div>
            <div className="mt-3 flex items-center justify-between text-sm">
              <span className="text-slate-300">
                {result.intimacyBefore} → {result.intimacyAfter} / 999
              </span>
              <span className="rounded-full bg-blue-400/15 px-2.5 py-1 text-xs font-semibold text-blue-200">
                <Lang text={LEVEL_LABELS[result.intimacyLevel]} />
              </span>
            </div>
          </div>

          <div className="mt-3 flex items-center justify-between rounded-2xl border border-white/10 bg-white/5 p-4">
            <span className="flex items-center gap-2 text-sm text-amber-100">
              <Star className="h-4 w-4 text-amber-300" />
              XP
            </span>
            <div className="text-right">
              <strong className="text-lg" data-testid="npc-result-xp-gain">+{result.xpGain}</strong>
              <p className="text-[10px] text-slate-400">
                <Lang text={{ ko: "이번 서버 정산 지급 없음", en: "No server XP this time" }} />
              </p>
            </div>
          </div>
        </section>

        <p className="text-center text-xs leading-5 text-secondary-text">
          <Lang
            text={{
              ko: "공유 카드에는 대화 내용과 계정 정보가 포함되지 않아요.",
              en: "The share card never includes chat or account details.",
            }}
          />
        </p>

        <div className="grid grid-cols-2 gap-2">
          <Button
            variant="outline"
            className="min-h-11"
            onClick={() => onOpenChange(false)}
            data-testid="npc-result-close"
          >
            <Lang text={{ ko: "완료", en: "Done" }} />
          </Button>
          <Button
            className="min-h-11"
            onClick={handleShare}
            disabled={isExporting}
            data-testid="npc-result-share"
          >
            {isExporting ? <Download className="mr-2 h-4 w-4 animate-pulse" /> : <Share2 className="mr-2 h-4 w-4" />}
            <Lang text={{ ko: "공유 카드", en: "Share card" }} />
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default NpcConversationResultDialog;

