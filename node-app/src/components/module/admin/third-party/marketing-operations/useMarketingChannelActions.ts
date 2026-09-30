import type { Dispatch, SetStateAction } from "react";
import { dialog } from "@amu-labs/ui";
import { lang } from "components/module/i18n";
import fetchClient from "libs/api/fetchClient";
import { toast } from "sonner";
import { MARKETING_CONTENT_QUEUE_API } from "./MarketingOpsConstants";
import {
  INITIAL_PROOFREAD_DIALOG,
  type ProofreadDialogState,
} from "./MarketingProofreadDialog";
import type {
  ChannelEditorState,
  MarketingChannelSummary,
  MarketingJobDetail,
  MarketingJobListItem,
} from "./MarketingOpsTypes";
import {
  buildScopeParams,
  getInitialEditor,
  getMarketingJobSourceTitle,
  getMarketingOperatorErrorMessage,
  toSafeString,
  toScheduledAtPayload,
} from "./MarketingOpsUtils";
import {
  buildChannelDraftPayload,
  getEditorImageUrls,
  limitChannelImageUrls,
} from "./MarketingReviewDomain";

type UseMarketingChannelActionsArgs = {
  scopedUniverseId: string;
  selectedJobId: string;
  detail: MarketingJobDetail | null;
  editors: Record<string, ChannelEditorState>;
  jobs: MarketingJobListItem[];
  siteUrl: string;
  proofreadDialog: ProofreadDialogState;
  setProofreadDialog: Dispatch<SetStateAction<ProofreadDialogState>>;
  setBusyKey: (key: string) => void;
  scheduleScheduledOnlyWorkerPoll: (publishAt: string) => void;
  onRefresh: (jobId?: string) => Promise<void>;
};

export function useMarketingChannelActions({
  scopedUniverseId,
  selectedJobId,
  detail,
  editors,
  jobs,
  siteUrl,
  proofreadDialog,
  setProofreadDialog,
  setBusyKey,
  scheduleScheduledOnlyWorkerPoll,
  onRefresh,
}: UseMarketingChannelActionsArgs) {
  const connectLinkedInMemberProfile = () => {
    const targetUniverseId = scopedUniverseId || toSafeString(detail?.job?.universeId);
    if (!targetUniverseId) {
      toast.error(
        lang({
          ko: "LinkedIn을 연결할 유니버스를 먼저 선택해주세요.",
          en: "Select a universe before connecting LinkedIn.",
        }),
      );
      return;
    }

    window.location.href = `/api/marketing/linkedin/member-auth/start?universeId=${encodeURIComponent(targetUniverseId)}`;
  };

  const runChannelAction = async (
    channel: MarketingChannelSummary,
    action: "save_draft" | "complete" | "skip" | "publish_member" | "mark_published" | "cancel_scheduled_publish",
    publishAtInput = "",
    publishHourInput = "",
    publishMinuteInput = "",
  ) => {
    if (!selectedJobId) return;
    if (
      action === "cancel_scheduled_publish" &&
      !(await dialog.confirm({
        variant: "danger",
        message: lang({
          ko: "예약된 발행을 취소하고 검수 대기 상태로 되돌립니다. 계속할까요?",
          en: "Cancel the scheduled publish and return it to review. Continue?",
        }),
      }))
    ) {
      return;
    }

    const editor = editors[channel.channel] || getInitialEditor(channel);
    const imageUrls = limitChannelImageUrls(channel.channel, getEditorImageUrls(editor));
    const publishAt = toScheduledAtPayload(publishAtInput);
    if (publishAtInput && !publishAt) {
      toast.error(lang({ ko: "예약 발행 시각을 올바르게 입력해주세요.", en: "Enter a valid scheduled publish time." }));
      return;
    }
    const draftPayload = buildChannelDraftPayload({
      channel: channel.channel,
      editor,
      imageUrls,
      siteUrl: siteUrl,
      sourceTitle: detail ? getMarketingJobSourceTitle(detail.job) : "",
    });

    try {
      setBusyKey(`${channel.channel}:${action}`);

      const response = await fetchClient.post<{ data?: { scheduledPublishAt?: string } }>(
        `${MARKETING_CONTENT_QUEUE_API}/${selectedJobId}/channels/${channel.channel}`,
        {
          ...buildScopeParams(scopedUniverseId),
          action,
          draft: action === "cancel_scheduled_publish" ? undefined : draftPayload,
          ...(publishAt ? { publishAt } : {}),
          ...(publishHourInput
            ? {
                publishHour: Number(publishHourInput),
                ...(publishMinuteInput ? { publishMinute: Number(publishMinuteInput) } : {}),
                recommendationToken: jobs
                  .find((job) => job.jobId === selectedJobId)
                  ?.recommendedUploadSchedules?.find((item) => item.channel === channel.channel)?.recommendationToken,
              }
            : {}),
          publishedUrl: channel.channel === "naver_blog" ? editor.publishedUrl : "",
          note: editor.note,
        },
        {
          headers: { Accept: "application/json" },
          responseType: "json",
        },
      );
      const queuedPublishAt = toSafeString(response.data?.data?.scheduledPublishAt);

      toast.success(
        queuedPublishAt && (publishAt || publishHourInput)
          ? lang({ ko: "예약 발행을 등록했습니다.", en: "Scheduled publish registered." })
          : queuedPublishAt
            ? lang({ ko: "즉시 발행 요청을 등록했습니다.", en: "Publish request queued." })
            : action === "save_draft"
              ? lang({ ko: "draft 수정 내용을 저장했습니다.", en: "Draft saved." })
              : action === "cancel_scheduled_publish"
                ? lang({ ko: "예약 발행을 취소했습니다.", en: "Scheduled publish canceled." })
                : action === "publish_member"
                  ? lang({
                      ko: "LinkedIn 개인 프로필로 발행했습니다.",
                      en: "Published to the LinkedIn member profile.",
                    })
                  : action === "mark_published"
                    ? lang({ ko: "발행 완료 처리를 반영했습니다.", en: "Channel marked published." })
                    : action === "complete"
                      ? lang({ ko: "채널 완료 체크를 반영했습니다.", en: "Channel marked complete." })
                      : lang({ ko: "채널을 skip 처리했습니다.", en: "Channel skipped." }),
      );

      if (queuedPublishAt && channel.channel !== "instagram") {
        scheduleScheduledOnlyWorkerPoll(queuedPublishAt);
      }

      await onRefresh(selectedJobId);
    } catch (error) {
      toast.error(
        getMarketingOperatorErrorMessage(
          error,
          lang({ ko: "채널 작업에 실패했습니다.", en: "Channel action failed." }),
        ),
      );
      await onRefresh(selectedJobId).catch(() => undefined);
    } finally {
      setBusyKey("");
    }
  };

  const getProofreadDraftPayload = (channel: MarketingChannelSummary) => {
    const editor = editors[channel.channel] || getInitialEditor(channel);
    return buildChannelDraftPayload({
      channel: channel.channel,
      editor,
      imageUrls: limitChannelImageUrls(channel.channel, getEditorImageUrls(editor)),
      siteUrl: siteUrl,
      sourceTitle: detail ? getMarketingJobSourceTitle(detail.job) : "",
    });
  };

  const openChannelProofread = async (channel: MarketingChannelSummary) => {
    if (!selectedJobId) return;
    setProofreadDialog({ ...INITIAL_PROOFREAD_DIALOG, open: true, channel, loading: true });

    try {
      const response = await fetchClient.post(
        `${MARKETING_CONTENT_QUEUE_API}/${selectedJobId}/channels/${channel.channel}/proofread`,
        {
          ...buildScopeParams(scopedUniverseId),
          mode: "check",
          draft: getProofreadDraftPayload(channel),
        },
      );
      setProofreadDialog((prev) => ({
        ...prev,
        loading: false,
        findings: Array.isArray(response.data?.data?.report?.findings) ? response.data.data.report.findings : [],
      }));
    } catch (error) {
      setProofreadDialog((prev) => ({ ...prev, loading: false }));
      toast.error(
        getMarketingOperatorErrorMessage(error, lang({ ko: "오탈자 검사에 실패했습니다.", en: "Typo check failed." })),
      );
    }
  };

  const requestChannelProofreadCorrection = async () => {
    const channel = proofreadDialog.channel;
    if (!selectedJobId || !channel) return;

    try {
      setProofreadDialog((prev) => ({ ...prev, loading: true }));
      const response = await fetchClient.post(
        `${MARKETING_CONTENT_QUEUE_API}/${selectedJobId}/channels/${channel.channel}/proofread`,
        {
          ...buildScopeParams(scopedUniverseId),
          mode: "correct",
          draft: getProofreadDraftPayload(channel),
          manualInstruction: proofreadDialog.manualInstruction,
          modelProvider: proofreadDialog.modelProvider,
          modelName: proofreadDialog.modelName,
        },
      );
      const coins = Number(response.data?.data?.coins || 0);
      toast.success(
        lang({
          ko: `AI 오탈자 교정본을 등록했습니다.${coins > 0 ? ` ${coins}코인이 차감되었습니다.` : ""}`,
          en: `AI-corrected draft saved.${coins > 0 ? ` ${coins} coins were charged.` : ""}`,
        }),
      );
      setProofreadDialog(INITIAL_PROOFREAD_DIALOG);
      await onRefresh(selectedJobId);
    } catch (error) {
      setProofreadDialog((prev) => ({ ...prev, loading: false }));
      toast.error(
        getMarketingOperatorErrorMessage(
          error,
          lang({ ko: "AI 오탈자 교정에 실패했습니다.", en: "AI typo correction failed." }),
        ),
      );
    }
  };

  return {
    connectLinkedInMemberProfile,
    runChannelAction,
    openChannelProofread,
    requestChannelProofreadCorrection,
  };
}

