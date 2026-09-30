import type { Dispatch, SetStateAction } from "react";
import { Button, Input, SegmentedControl, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Textarea } from "@amu-labs/ui";
import { lang } from "components/module/i18n";
import { Calendar, Clock, Copy, ExternalLink, Send, X } from "lucide-react";
import { cn } from "utils/common";
import { REVIEW_PANEL_LABEL_CLASS, REVIEW_PANEL_SUBTLE_CLASS } from "./MarketingOpsConstants";
import type { ChannelEditorState, MarketingChannelSummary, MarketingJobListItem } from "./MarketingOpsTypes";
import {
  buildNaverBlogClipboardHtml,
  copyHtml,
  copyText,
  formatDate,
  getChannelLabel,
  toImageUrlValues,
  toSingleSelectValue,
  type NaverBlogCtaMode,
} from "./MarketingOpsUtils";
import {
  DEFAULT_PUBLISH_SCHEDULE_STATE,
  getChannelImageLimit,
  getChannelScheduledPublishAt,
  limitChannelImageUrls,
  NAVER_CTA_MODE_OPTIONS,
  PUBLISH_HOUR_OPTIONS,
  PUBLISH_SCHEDULE_MODE_OPTIONS,
  REVIEW_CHANNEL_ACTION_BUTTON_CLASS,
  type PublishScheduleState,
} from "./MarketingReviewDomain";

type ChannelAction =
  | "save_draft"
  | "complete"
  | "skip"
  | "publish_member"
  | "mark_published"
  | "cancel_scheduled_publish";

type SetEditorField = (channel: string, key: keyof ChannelEditorState, value: string) => void;

export function MarketingChannelImageUrlsEditor({
  channel,
  editor,
  setEditorField,
}: {
  channel: MarketingChannelSummary;
  editor: ChannelEditorState;
  setEditorField: SetEditorField;
}) {
  const imageLimit = getChannelImageLimit(channel.channel);
  return (
    <div>
      <label className={REVIEW_PANEL_LABEL_CLASS}>
        {imageLimit > 1
          ? lang({ ko: "이미지 URL 목록", en: "Image URLs" })
          : lang({ ko: "이미지 URL", en: "Image URL" })}
      </label>
      <Textarea
        value={editor.imageUrls || editor.imageUrl}
        onChange={(event) => {
          const nextUrls = limitChannelImageUrls(channel.channel, toImageUrlValues(event.target.value));
          setEditorField(channel.channel, "imageUrls", event.target.value);
          setEditorField(channel.channel, "imageUrl", nextUrls[0] || "");
        }}
        rows={imageLimit > 1 ? 4 : 2}
        placeholder={
          imageLimit > 1
            ? lang({
                ko: "줄바꿈 또는 쉼표로 구분, 최대 지원 개수만 저장",
                en: "Line or comma separated; saved up to the channel limit",
              })
            : "https://... 또는 /wp-resource/..."
        }
      />
      <p className="mt-1 text-xs text-muted-text">
        {lang({
          ko: `이 채널은 최대 ${imageLimit}장까지 저장됩니다.`,
          en: `This channel stores up to ${imageLimit} image(s).`,
        })}
      </p>
    </div>
  );
}

function getChannelDraftCopyText(channel: string, editor: ChannelEditorState) {
  if (channel === "linkedin") return [editor.headline, editor.body, editor.hashtags].filter(Boolean).join("\n\n");
  if (channel === "naver_blog") return [editor.body, editor.tags].filter(Boolean).join("\n\n");
  return [editor.body, editor.hashtags].filter(Boolean).join("\n\n");
}

export function MarketingChannelCopyActions({
  channel,
  editor,
  siteUrl,
  sourceTitle,
  naverCopyCtaMode,
  setNaverCopyCtaMode,
  connectLinkedInMemberProfile,
}: {
  channel: MarketingChannelSummary;
  editor: ChannelEditorState;
  siteUrl: string;
  sourceTitle: string;
  naverCopyCtaMode: NaverBlogCtaMode;
  setNaverCopyCtaMode: (mode: NaverBlogCtaMode) => void;
  connectLinkedInMemberProfile: () => void;
}) {
  const channelName = getChannelLabel(channel.channel);
  const draftCopyText = getChannelDraftCopyText(channel.channel, editor);
  const tagCopyText = channel.channel === "naver_blog" ? editor.tags : editor.hashtags;
  return (
    <div className="flex flex-wrap gap-2">
      <Button
        variant="outline"
        size="xs"
        onClick={() =>
          void copyText(draftCopyText, lang({ ko: `${channelName} 초안을 복사했습니다.`, en: `${channelName} draft copied.` }))
        }
        disabled={!draftCopyText}
      >
        <Copy className="icon-xxs" />
        <span>{lang({ ko: "초안 복사", en: "Copy draft" })}</span>
      </Button>
      <Button
        variant="outline"
        size="xs"
        onClick={() =>
          void copyText(tagCopyText, lang({ ko: `${channelName} 태그를 복사했습니다.`, en: `${channelName} tags copied.` }))
        }
        disabled={!tagCopyText}
      >
        <Copy className="icon-xxs" />
        <span>{lang({ ko: "태그 복사", en: "Copy tags" })}</span>
      </Button>
      {channel.channel === "naver_blog" ? (
        <>
          <Button
            variant="outline"
            size="xs"
            onClick={() => void copyText(editor.title, lang({ ko: "Naver Blog 제목을 복사했습니다.", en: "Naver Blog title copied." }))}
            disabled={!editor.title}
          >
            <Copy className="icon-xxs" />
            <span>{lang({ ko: "제목 복사", en: "Copy title" })}</span>
          </Button>
          <Button
            variant="outline"
            size="xs"
            onClick={() =>
              void copyHtml(
                buildNaverBlogClipboardHtml(
                  editor.summary,
                  editor.body,
                  editor.tags,
                  siteUrl,
                  sourceTitle,
                  editor.commentLink,
                  naverCopyCtaMode,
                ),
                lang({ ko: "Naver Blog 서식을 복사했습니다.", en: "Naver Blog format copied." }),
              )
            }
            disabled={!editor.body}
          >
            <Copy className="icon-xxs" />
            <span>{lang({ ko: "서식 복사", en: "Copy format" })}</span>
          </Button>
          <SegmentedControl
            value={naverCopyCtaMode}
            options={NAVER_CTA_MODE_OPTIONS.map((option) => ({ value: option.value, label: lang(option.label) }))}
            onValueChange={setNaverCopyCtaMode}
            size="xs"
            appearance="solid"
            ariaLabel={lang({ ko: "서식 복사 CTA 방식", en: "Copy format CTA mode" })}
          />
        </>
      ) : null}
      {channel.channel === "linkedin" ? (
        <Button variant="outline" size="xs" onClick={connectLinkedInMemberProfile}>
          <ExternalLink className="icon-xxs" />
          <span>{lang({ ko: "개인 프로필 연결", en: "Connect profile" })}</span>
        </Button>
      ) : null}
    </div>
  );
}

type PublishControlProps = {
  channel: MarketingChannelSummary;
  busyKey: string;
  publishSchedules: Record<string, PublishScheduleState>;
  setPublishSchedules: Dispatch<SetStateAction<Record<string, PublishScheduleState>>>;
  applyRandomizedPublishTime: (channel: string, hour: string, preferredDate?: string) => void;
  runChannelAction: (
    channel: MarketingChannelSummary,
    action: ChannelAction,
    publishAtInput?: string,
    publishHourInput?: string,
    publishMinuteInput?: string,
  ) => Promise<void>;
};

export function MarketingPublishScheduleAction({
  channel,
  action,
  labels,
  busyKey,
  publishSchedules,
  setPublishSchedules,
  applyRandomizedPublishTime,
  runChannelAction,
}: PublishControlProps & { action: "complete" | "publish_member"; labels: { now: string; scheduled: string } }) {
  const schedule = publishSchedules[channel.channel] || DEFAULT_PUBLISH_SCHEDULE_STATE;
  const scheduledPublishAt = getChannelScheduledPublishAt(channel);
  const isScheduledMode = schedule.mode === "scheduled";
  const actionToRun = channel.channel === "naver_blog" && !isScheduledMode ? "mark_published" : action;
  const publishAtInput = isScheduledMode && !schedule.publishHour ? schedule.publishAt : "";
  const publishHourInput = isScheduledMode ? schedule.publishHour : "";
  const publishMinuteInput = publishHourInput ? schedule.publishAt.slice(14, 16) : "";
  return (
    <div className="col-span-2 grid min-w-0 grid-cols-2 gap-2 sm:flex sm:flex-1 sm:flex-wrap sm:items-center">
      <SegmentedControl
        value={schedule.mode}
        options={PUBLISH_SCHEDULE_MODE_OPTIONS.map((option) => ({ value: option.value, label: lang(option.label) }))}
        onValueChange={(mode) =>
          setPublishSchedules((prev) => ({
            ...prev,
            [channel.channel]: { ...(prev[channel.channel] || DEFAULT_PUBLISH_SCHEDULE_STATE), mode },
          }))
        }
        appearance="solid"
        className="col-span-2 w-full sm:w-auto"
        buttonClassName="min-h-11 flex-1 sm:min-h-0 sm:flex-none"
        ariaLabel={lang({ ko: "발행 방식", en: "Publish mode" })}
      />
      {isScheduledMode ? (
        <div className="col-span-2 inline-flex min-w-0 items-center gap-1 sm:w-auto sm:min-w-[15rem]">
          <label className="sr-only">{lang({ ko: "발행 시각", en: "Publish time" })}</label>
          <Input
            type="datetime-local"
            className="min-h-11 sm:min-h-0"
            value={schedule.publishAt}
            onChange={(event) =>
              setPublishSchedules((prev) => ({
                ...prev,
                [channel.channel]: {
                  ...(prev[channel.channel] || DEFAULT_PUBLISH_SCHEDULE_STATE),
                  publishAt: event.target.value,
                  publishHour: "",
                },
              }))
            }
          />
        </div>
      ) : null}
      {isScheduledMode ? (
        <Select
          value={schedule.publishAt.slice(11, 13) || undefined}
          onValueChange={(hour) => applyRandomizedPublishTime(channel.channel, toSingleSelectValue(hour))}
        >
          <SelectTrigger
            className="min-h-11 w-full sm:min-h-0 sm:w-[7.25rem]"
            title={lang({ ko: "분은 10~30분 사이에서 자동 선택됩니다.", en: "Minutes are picked from 10 to 30." })}
          >
            <SelectValue placeholder={lang({ ko: "시간 랜덤", en: "Random time" })} />
          </SelectTrigger>
          <SelectContent>
            {PUBLISH_HOUR_OPTIONS.map((hour) => (
              <SelectItem key={hour} value={hour}>{lang({ ko: `${Number(hour)}시`, en: `${hour}:00` })}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : null}
      <Button
        className={REVIEW_CHANNEL_ACTION_BUTTON_CLASS}
        onClick={() => void runChannelAction(channel, actionToRun, publishAtInput, publishHourInput, publishMinuteInput)}
        disabled={busyKey === `${channel.channel}:${actionToRun}` || (isScheduledMode && !schedule.publishAt && !schedule.publishHour)}
      >
        {isScheduledMode ? <Clock className="icon-xxs" /> : <Send className="icon-xxs" />}
        <span>{isScheduledMode ? labels.scheduled : labels.now}</span>
      </Button>
      {scheduledPublishAt ? (
        <div className="col-span-2 flex flex-wrap items-center gap-2 sm:basis-full">
          <p className="text-xs text-secondary-text">{lang({ ko: "예약됨", en: "Scheduled" })}: {formatDate(scheduledPublishAt)}</p>
          <Button
            size="xs"
            variant="outline"
            className="text-danger ring-danger/70"
            onClick={() => void runChannelAction(channel, "cancel_scheduled_publish")}
            disabled={busyKey === `${channel.channel}:cancel_scheduled_publish`}
          >
            <X className="icon-xxs" />
            <span>{lang({ ko: "예약 취소", en: "Cancel schedule" })}</span>
          </Button>
        </div>
      ) : null}
    </div>
  );
}

export function MarketingRecommendedUploadSchedule({
  channel,
  canSchedule,
  jobs,
  selectedJobId,
  publishSchedules,
  applyRandomizedPublishTime,
}: Pick<PublishControlProps, "channel" | "publishSchedules" | "applyRandomizedPublishTime"> & {
  canSchedule: boolean;
  jobs: MarketingJobListItem[];
  selectedJobId: string;
}) {
  const recommendation = jobs
    .find((job) => job.jobId === selectedJobId)
    ?.recommendedUploadSchedules?.find((item) => item.channel === channel.channel);
  if (!recommendation) return null;
  const selectedPublishHour = publishSchedules[channel.channel]?.publishHour || "";
  return (
    <div className={cn(REVIEW_PANEL_SUBTLE_CLASS, "flex flex-col gap-2 md:flex-row md:items-center md:justify-between")}>
      <div className="min-w-0">
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-primary-text">
          <span className="inline-flex items-center gap-1 font-medium"><Calendar className="icon-xxs" />{lang({ ko: "추천 업로드", en: "Recommended upload" })}</span>
          <span>{recommendation.date}</span>
          <span>{lang({ ko: `권장 ${recommendation.recommendedHour}시`, en: `Preferred ${String(recommendation.recommendedHour).padStart(2, "0")}:00` })}</span>
        </p>
        <p className="mt-1 text-xs text-muted-text">
          {lang({
            ko: `예약 가능 시간: ${recommendation.allowedHours.map((hour) => `${hour}시`).join(", ")}`,
            en: `Available hours: ${recommendation.allowedHours.map((hour) => `${String(hour).padStart(2, "0")}:00`).join(", ")}`,
          })}
        </p>
      </div>
      {canSchedule ? (
        <Select
          value={selectedPublishHour || undefined}
          onValueChange={(hour) => applyRandomizedPublishTime(channel.channel, toSingleSelectValue(hour), recommendation.date)}
        >
          <SelectTrigger
            className="w-[9.5rem]"
            title={lang({
              ko: "추천 날짜에 10~30분 사이가 자동 선택되며 서버가 추천 슬롯을 검증합니다.",
              en: "Picks 10 to 30 minutes on the recommended date and verifies the slot on the server.",
            })}
          >
            <SelectValue placeholder={lang({ ko: "추천 시간 선택", en: "Choose hour" })} />
          </SelectTrigger>
          <SelectContent>
            {recommendation.allowedHours.map((hour) => {
              const value = String(hour);
              return <SelectItem key={value} value={value}>{lang({ ko: `${hour}시${hour === recommendation.recommendedHour ? " (권장)" : ""}`, en: `${String(hour).padStart(2, "0")}:00${hour === recommendation.recommendedHour ? " (preferred)" : ""}` })}</SelectItem>;
            })}
          </SelectContent>
        </Select>
      ) : (
        <p className="shrink-0 text-xs text-muted-text">{lang({ ko: "채널에서 직접 예약할 때 참고하세요.", en: "Use this when scheduling on the channel." })}</p>
      )}
    </div>
  );
}
