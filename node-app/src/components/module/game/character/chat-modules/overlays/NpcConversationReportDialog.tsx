"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, Flag, Loader2, Shield } from "lucide-react";
import { toast } from "sonner";
import { Button, Dialog, DialogContent, DialogHeader, DialogTitle } from "@amu-labs/ui";
import { Lang, lang } from "components/module/i18n";
import { reportNpcConversation } from "libs/api/game/npcConversationReportClient";
import type { NpcConversationReportReasonType } from "types/game/npc-conversation-report";
import { cn } from "utils/common";

/**
 * @docHint
 * @purpose 로그인 Play 사용자가 현재 owner NPC conversation을 미성년 안전 사유 포함 신고
 * @process allowlist 사유 선택  선택 note 제출  서버 owner 검증  성공 후 chat 종료
 * @domain game.npc-conversation-report
 * @scope client-ui
 */

const REPORT_REASONS: Array<{
  value: NpcConversationReportReasonType;
  ko: string;
  en: string;
  critical?: boolean;
}> = [
  { value: "minor_safety", ko: "미성년자 안전", en: "Minor safety", critical: true },
  { value: "sexual", ko: "성적·부적절한 내용", en: "Sexual content", critical: true },
  { value: "harassment", ko: "괴롭힘·혐오", en: "Harassment or hate" },
  { value: "violence", ko: "폭력적 내용", en: "Violence" },
  { value: "self_harm", ko: "자해·위기 내용", en: "Self-harm or crisis", critical: true },
  { value: "misinformation", ko: "위험한 허위 정보", en: "Harmful misinformation" },
  { value: "inappropriate", ko: "기타 부적절한 응답", en: "Other inappropriate response" },
  { value: "other", ko: "기타", en: "Other" },
];

export function NpcConversationReportDialog({
  open,
  onOpenChange,
  universeId,
  npcId,
  npcName,
  userPersonaId,
  conversationSessionId,
  onReported,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  universeId: string;
  npcId: string;
  npcName: string;
  userPersonaId: string;
  conversationSessionId: string;
  onReported: () => void;
}) {
  const [reason, setReason] = useState<NpcConversationReportReasonType | null>(null);
  const [note, setNote] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    // 새 신고를 열 때 이전 선택이 남지 않도록 form을 초기화한다.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setReason(null);
    setNote("");
  }, [open]);

  const handleSubmit = async () => {
    if (!reason || isSubmitting) return;
    setIsSubmitting(true);
    try {
      const response = await reportNpcConversation({
        universeId,
        npcId,
        userPersonaId,
        conversationSessionId,
        reason,
        note,
      });
      if (!response.ok) throw new Error("npc_report_failed");
      toast.success(
        response.duplicate
          ? lang({ ko: "이미 접수된 신고를 확인했어요.", en: "This report was already received." })
          : lang({ ko: "신고를 안전팀에 접수했어요.", en: "Your report was sent to the safety team." }),
      );
      onOpenChange(false);
      onReported();
    } catch {
      toast.error(
        lang({
          ko: "신고를 접수하지 못했어요. 잠시 후 다시 시도해 주세요.",
          en: "Could not submit the report. Please try again.",
        }),
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="z-[170]"
        overlayClassName="z-[160]"
        innerWrapClassName="w-[calc(100vw-1rem)] max-w-lg max-h-[calc(100dvh-1rem)] overflow-y-auto p-4 sm:p-6 [&>button]:h-11 [&>button]:w-11"
        data-testid="npc-report-dialog"
      >
        <DialogHeader className="pr-10 text-left">
          <DialogTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-destructive" />
            <Lang text={{ ko: "NPC 대화 신고", en: "Report NPC conversation" }} />
          </DialogTitle>
        </DialogHeader>

        <div className="rounded-xl border border-amber-500/25 bg-amber-500/10 p-3 text-xs leading-5 text-primary-text">
          <div className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-300" />
            <p>
              <Lang
                text={{
                  ko: `${npcName}와의 현재 대화 세션을 신고합니다. 대화 원문은 복제하지 않고 안전팀이 서버 기록을 확인해요.`,
                  en: `Report the current session with ${npcName}. The report references server records without copying the chat.`,
                }}
              />
            </p>
          </div>
        </div>

        <fieldset>
          <legend className="mb-2 text-sm font-semibold text-primary-text">
            <Lang text={{ ko: "신고 사유", en: "Reason" }} />
          </legend>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {REPORT_REASONS.map((item) => (
              <Button
                key={item.value}
                type="button"
                variant="outline"
                className={cn(
                  "min-h-11 h-auto justify-start whitespace-normal px-3 py-2 text-left",
                  reason === item.value && "border-primary bg-primary/10 text-primary",
                  item.critical && reason !== item.value && "border-amber-500/30",
                )}
                aria-pressed={reason === item.value}
                onClick={() => setReason(item.value)}
                data-testid={`npc-report-reason-${item.value}`}
              >
                <Lang text={{ ko: item.ko, en: item.en }} />
              </Button>
            ))}
          </div>
        </fieldset>

        <label className="block text-sm font-semibold text-primary-text">
          <Lang text={{ ko: "추가 설명 (선택)", en: "Additional details (optional)" }} />
          <textarea
            value={note}
            onChange={(event) => setNote(event.target.value.slice(0, 500))}
            maxLength={500}
            rows={3}
            className="mt-2 min-h-24 w-full resize-y rounded-xl border border-border bg-background p-3 text-sm font-normal outline-none focus:border-primary"
            placeholder={lang({
              ko: "문제가 된 응답이나 상황을 짧게 알려주세요.",
              en: "Briefly describe the problematic response or situation.",
            })}
            data-testid="npc-report-note"
          />
          <span className="mt-1 block text-right text-xs font-normal text-secondary-text">{note.length} / 500</span>
        </label>

        <p className="text-xs leading-5 text-secondary-text">
          <Lang
            text={{
              ko: "신고 후 이 세션의 미정산 친밀도 보상은 지급되지 않으며, 단일 신고만으로 NPC가 자동 삭제되지는 않아요.",
              en: "Unsettled intimacy is not awarded after a report, and one report does not automatically remove the NPC.",
            }}
          />
        </p>

        <div className="grid grid-cols-2 gap-2">
          <Button variant="outline" className="min-h-11" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
            <Lang text={{ ko: "취소", en: "Cancel" }} />
          </Button>
          <Button
            variant="destructive"
            className="min-h-11"
            onClick={handleSubmit}
            disabled={!reason || isSubmitting}
            data-testid="npc-report-submit"
          >
            {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Flag className="mr-2 h-4 w-4" />}
            <Lang text={{ ko: "신고 접수", en: "Submit report" }} />
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default NpcConversationReportDialog;
