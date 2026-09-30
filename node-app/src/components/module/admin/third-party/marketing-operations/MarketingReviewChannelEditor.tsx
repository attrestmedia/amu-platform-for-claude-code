import type { Dispatch, SetStateAction } from "react";
import Image from "next/image";
import { Button, Input, Textarea } from "@amu-labs/ui";
import { lang } from "components/module/i18n";
import { AlertTriangle, Check, Save, X } from "lucide-react";
import { cn } from "utils/common";
import { getCardNewsPublishGateError } from "libs/card-news/draftMapping";
import type { CardNewsDeck } from "types/card-news";
import {
  REVIEW_PANEL_LABEL_CLASS,
  REVIEW_PANEL_WARNING_CLASS,
} from "./MarketingOpsConstants";
import {
  MarketingBodyComposer,
  MarketingImagePreviewStrip,
} from "./MarketingOpsComponents";
import type {
  ChannelEditorState,
  MarketingChannelSummary,
  MarketingImagePreview,
  MarketingJobListItem,
} from "./MarketingOpsTypes";
import { toSafeString, type NaverBlogCtaMode } from "./MarketingOpsUtils";
import type { PublishScheduleState } from "./MarketingReviewDomain";
import {
  MarketingChannelCopyActions,
  MarketingChannelImageUrlsEditor,
  MarketingPublishScheduleAction,
  MarketingRecommendedUploadSchedule,
} from "./MarketingReviewChannelControls";
import { CardNewsDeckPicker } from "./CardNewsDeckPicker";

const REVIEW_CHANNEL_ACTIONS_CLASS =
  "grid grid-cols-2 gap-2 border-t border-border pt-3 sm:flex sm:flex-wrap sm:justify-end";
const REVIEW_CHANNEL_ACTION_BUTTON_CLASS = "min-h-11 w-full sm:min-h-0 sm:w-auto";

type ChannelAction =
  | "save_draft"
  | "complete"
  | "skip"
  | "publish_member"
  | "mark_published"
  | "cancel_scheduled_publish";

type MarketingReviewChannelEditorProps = {
  channel: MarketingChannelSummary;
  editor: ChannelEditorState;
  validationIssueMessages: string[];
  busyKey: string;
  siteUrl: string;
  sourceTitle: string;
  naverCopyCtaMode: NaverBlogCtaMode;
  setNaverCopyCtaMode: (mode: NaverBlogCtaMode) => void;
  connectLinkedInMemberProfile: () => void;
  jobs: MarketingJobListItem[];
  selectedJobId: string;
  publishSchedules: Record<string, PublishScheduleState>;
  setPublishSchedules: Dispatch<SetStateAction<Record<string, PublishScheduleState>>>;
  applyRandomizedPublishTime: (channel: string, hour: string, preferredDate?: string) => void;
  applyChannelImages: (channel: MarketingChannelSummary, images: Array<{ url?: string }>) => void;
  removeChannelImages: (channel: MarketingChannelSummary, images: MarketingImagePreview[]) => Promise<void>;
  cardNewsDecks: CardNewsDeck[];
  cardNewsDecksLoaded: boolean;
  cardNewsDecksLoading: boolean;
  loadCardNewsDecks: () => Promise<void>;
  attachCardNewsDeck: (deckId: string) => Promise<void>;
  setEditorField: (channel: string, key: keyof ChannelEditorState, value: string) => void;
  runChannelAction: (
    channel: MarketingChannelSummary,
    action: ChannelAction,
    publishAtInput?: string,
    publishHourInput?: string,
    publishMinuteInput?: string,
  ) => Promise<void>;
};

export function MarketingReviewChannelEditor({
  channel,
  editor,
  validationIssueMessages,
  busyKey,
  siteUrl,
  sourceTitle,
  naverCopyCtaMode,
  setNaverCopyCtaMode,
  connectLinkedInMemberProfile,
  jobs,
  selectedJobId,
  publishSchedules,
  setPublishSchedules,
  applyRandomizedPublishTime,
  applyChannelImages,
  removeChannelImages,
  cardNewsDecks,
  cardNewsDecksLoaded,
  cardNewsDecksLoading,
  loadCardNewsDecks,
  attachCardNewsDeck,
  setEditorField,
  runChannelAction,
}: MarketingReviewChannelEditorProps) {
  const draft = channel.draftAsset?.content || {};
  const cardNews = draft.cardNews && typeof draft.cardNews === "object" && !Array.isArray(draft.cardNews)
    ? draft.cardNews as Record<string, unknown>
    : null;
  const cardNewsAssetIds = Array.isArray(draft.imageAssetIds)
    ? draft.imageAssetIds.map(toSafeString).filter(Boolean)
    : [];
  const cardNewsAltTexts = Array.isArray(cardNews?.altTexts)
    ? cardNews.altTexts.map(toSafeString)
    : [];
  const cardNewsPreviews = cardNewsAssetIds.map((assetId, index) => ({
    assetId,
    alt: cardNewsAltTexts[index] || lang({ ko: `카드 ${index + 1}`, en: `Card ${index + 1}` }),
    preview: channel.imagePreviews?.find((image) => toSafeString(image.assetId) === assetId),
  }));
  const cardNewsGateError = cardNews
    ? getCardNewsPublishGateError(draft as unknown as Record<string, unknown>)
    : "";

  return (
    <>
      {validationIssueMessages.length > 0 ? (
        <div className={cn(REVIEW_PANEL_WARNING_CLASS, "mt-3")}>
          {validationIssueMessages.join(" / ")}
        </div>
      ) : null}

      <MarketingImagePreviewStrip
        images={channel.imagePreviews}
        onApply={(image) => {
          applyChannelImages(channel, [image]);
        }}
        onApplyMany={(images) => applyChannelImages(channel, images)}
        onRemove={(image) => {
          const source = toSafeString(image.source);
          if (source !== "channel_draft" && source !== "channel_image") return;
          void removeChannelImages(channel, [image]);
        }}
        onRemoveMany={(images) => void removeChannelImages(channel, images)}
      />

      {channel.channel === "instagram" ? (
        <div className="mb-4 space-y-3">
          <CardNewsDeckPicker
            decks={cardNewsDecks}
            loaded={cardNewsDecksLoaded}
            loading={cardNewsDecksLoading}
            disabled={!!busyKey}
            onLoad={loadCardNewsDecks}
            onSelect={attachCardNewsDeck}
          />
          {cardNews ? (
            <div className="rounded-lg border border-border bg-surface-2/40 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-medium text-primary-text">
                  {lang({ ko: "카드뉴스 미리보기", en: "Card news preview" })}
                </p>
                <span className="text-xs text-muted-text">
                  {cardNewsAssetIds.length} {lang({ ko: "장 · 순서 고정", en: "cards · ordered" })}
                </span>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
                {cardNewsPreviews.map((item, index) => (
                  <div key={`${item.assetId}-${index}`} className="overflow-hidden rounded-md border border-border bg-surface">
                    <div className="relative aspect-[4/5] bg-muted/30">
                      {item.preview?.url ? (
                        <Image
                          src={item.preview.url}
                          alt={item.alt}
                          fill
                          sizes="(min-width: 1024px) 12rem, 33vw"
                          className="object-cover"
                          unoptimized
                        />
                      ) : (
                        <span className="flex h-full items-center justify-center px-2 text-center text-xs text-muted-text">
                          {lang({ ko: "공개 URL 없음", en: "No public URL" })}
                        </span>
                      )}
                    </div>
                    <p className="line-clamp-2 min-h-10 px-2 py-2 text-xs leading-5 text-secondary-text">
                      {item.alt || lang({ ko: "대체텍스트 없음", en: "No alt text" })}
                    </p>
                  </div>
                ))}
              </div>
              {cardNewsGateError ? (
                <p className="mt-3 flex items-start gap-1.5 text-xs leading-5 text-danger" role="alert">
                  <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
                  {cardNewsGateError === "card_news_visual_evidence_required"
                    ? lang({
                        ko: "시각적 증거가 없는 텍스트 전용 덱은 Instagram 발행을 진행할 수 없습니다.",
                        en: "An Instagram post cannot use a text-only deck without visual evidence.",
                      })
                    : lang({
                        ko: "발행 정책 버전을 확인할 수 없어 발행이 잠겼습니다. 검수 목록을 새로고침해 주세요.",
                        en: "Publishing is locked because the upload policy version is unavailable. Refresh the review list.",
                      })}
                </p>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}

      {channel.channel === "threads" || channel.channel === "instagram" ? (
        <div className="space-y-3">
          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <label className={REVIEW_PANEL_LABEL_CLASS}>
                {lang({ ko: "제목", en: "Title" })}
              </label>
              <Input
                value={editor.title}
                onChange={(event) => setEditorField(channel.channel, "title", event.target.value)}
                placeholder={
                  channel.channel === "instagram"
                    ? lang({
                        ko: "Instagram 내부 검수 제목",
                        en: "Instagram review title",
                      })
                    : lang({ ko: "Threads 내부 검수 제목", en: "Threads review title" })
                }
              />
            </div>
            <div>
              <label className={REVIEW_PANEL_LABEL_CLASS}>
                {lang({ ko: "해시태그", en: "Hashtags" })}
              </label>
              <Input
                value={editor.hashtags}
                onChange={(event) =>
                  setEditorField(channel.channel, "hashtags", event.target.value)
                }
                placeholder={lang({ ko: "쉼표로 구분", en: "Comma separated" })}
              />
            </div>
          </div>
          <div>
            <label className={REVIEW_PANEL_LABEL_CLASS}>{lang({ ko: "본문", en: "Body" })}</label>
            <MarketingBodyComposer
              value={editor.body}
              onChange={(value) => setEditorField(channel.channel, "body", value)}
              rows={6}
              placeholder={
                channel.channel === "instagram"
                  ? lang({
                      ko: "Instagram 캡션 초안을 수정하세요.",
                      en: "Edit Instagram caption.",
                    })
                  : lang({
                      ko: "Threads 초안을 수정하세요.",
                      en: "Edit Threads draft.",
                    })
              }
            />
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <label className={REVIEW_PANEL_LABEL_CLASS}>{lang({ ko: "CTA", en: "CTA" })}</label>
              <Input
                value={editor.cta}
                onChange={(event) => setEditorField(channel.channel, "cta", event.target.value)}
                placeholder={lang({
                  ko: "링크가 비어 있으면 발행 본문에서 제외",
                  en: "Excluded from publish text when link is empty",
                })}
              />
            </div>
            <MarketingChannelImageUrlsEditor channel={channel} editor={editor} setEditorField={setEditorField} />
            <div>
              <label className={REVIEW_PANEL_LABEL_CLASS}>
                {lang({ ko: "링크 URL", en: "Link URL" })}
              </label>
              <Input
                value={editor.commentLink}
                onChange={(event) =>
                  setEditorField(channel.channel, "commentLink", event.target.value)
                }
                placeholder="https://allmyuniverse.com/..."
              />
            </div>
            <div>
              <label className={REVIEW_PANEL_LABEL_CLASS}>
                {lang({ ko: "운영 메모", en: "Operator note" })}
              </label>
              <Input
                value={editor.note}
                onChange={(event) => setEditorField(channel.channel, "note", event.target.value)}
                placeholder={lang({ ko: "검수/발행 메모", en: "Review/publish note" })}
              />
            </div>
          </div>
          <MarketingChannelCopyActions
            channel={channel}
            editor={editor}
            siteUrl={siteUrl}
            sourceTitle={sourceTitle}
            naverCopyCtaMode={naverCopyCtaMode}
            setNaverCopyCtaMode={setNaverCopyCtaMode}
            connectLinkedInMemberProfile={connectLinkedInMemberProfile}
          />
          <MarketingRecommendedUploadSchedule
            channel={channel}
            canSchedule
            jobs={jobs}
            selectedJobId={selectedJobId}
            publishSchedules={publishSchedules}
            applyRandomizedPublishTime={applyRandomizedPublishTime}
          />

          <div className={REVIEW_CHANNEL_ACTIONS_CLASS}>
            <MarketingPublishScheduleAction
              channel={channel}
              action="complete"
              labels={{
                now: lang({ ko: "즉시 발행", en: "Publish now" }),
                scheduled: lang({ ko: "예약 발행", en: "Schedule publish" }),
              }}
              busyKey={busyKey}
              publishSchedules={publishSchedules}
              setPublishSchedules={setPublishSchedules}
              applyRandomizedPublishTime={applyRandomizedPublishTime}
              runChannelAction={runChannelAction}
            />
            <Button
              variant="outline"
              className={REVIEW_CHANNEL_ACTION_BUTTON_CLASS}
              onClick={() => void runChannelAction(channel, "save_draft")}
              disabled={busyKey === `${channel.channel}:save_draft`}
            >
              <Save className="icon-xxs" />
              <span>{lang({ ko: "수정 저장", en: "Save edits" })}</span>
            </Button>
            <Button
              className={REVIEW_CHANNEL_ACTION_BUTTON_CLASS}
              onClick={() => void runChannelAction(channel, "mark_published")}
              disabled={busyKey === `${channel.channel}:mark_published`}
            >
              <Check className="icon-xxs" />
              <span>{lang({ ko: "발행 완료 처리", en: "Mark published" })}</span>
            </Button>
            <Button
              variant="outline"
              className={cn("col-span-2", REVIEW_CHANNEL_ACTION_BUTTON_CLASS)}
              onClick={() => void runChannelAction(channel, "skip")}
              disabled={busyKey === `${channel.channel}:skip`}
            >
              <X className="icon-xxs" />
              <span>{lang({ ko: "건너뛰기", en: "Skip" })}</span>
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <label className={REVIEW_PANEL_LABEL_CLASS}>
                {channel.channel === "linkedin"
                  ? lang({ ko: "헤드라인", en: "Headline" })
                  : lang({ ko: "제목", en: "Title" })}
              </label>
              <Input
                value={channel.channel === "linkedin" ? editor.headline : editor.title}
                onChange={(event) =>
                  setEditorField(
                    channel.channel,
                    channel.channel === "linkedin" ? "headline" : "title",
                    event.target.value,
                  )
                }
                placeholder={
                  channel.channel === "linkedin"
                    ? lang({ ko: "LinkedIn 헤드라인", en: "LinkedIn headline" })
                    : lang({ ko: "네이버 블로그 제목", en: "Naver Blog title" })
                }
              />
            </div>

            <div>
              <label className={REVIEW_PANEL_LABEL_CLASS}>
                {channel.channel === "linkedin"
                  ? lang({ ko: "댓글 링크", en: "Comment link" })
                  : lang({ ko: "발행 URL", en: "Published URL" })}
              </label>
              <Input
                value={channel.channel === "linkedin" ? editor.commentLink : editor.publishedUrl}
                onChange={(event) =>
                  setEditorField(
                    channel.channel,
                    channel.channel === "linkedin" ? "commentLink" : "publishedUrl",
                    event.target.value,
                  )
                }
                placeholder={
                  channel.channel === "linkedin"
                    ? "https://www.linkedin.com/feed/"
                    : "https://blog.naver.com/..."
                }
              />
            </div>
          </div>

          {channel.channel === "naver_blog" ? (
            <>
              <div>
                <label className={REVIEW_PANEL_LABEL_CLASS}>
                  {lang({ ko: "링크 URL", en: "Link URL" })}
                </label>
                <Input
                  inputMode="url"
                  value={editor.commentLink}
                  onChange={(event) =>
                    setEditorField(channel.channel, "commentLink", event.target.value)
                  }
                  placeholder="https://allmyuniverse.com/..."
                />
                <p className="mt-1 text-xs leading-5 text-muted-text">
                  {lang({
                    ko: "원본 기사가 있으면 기본 입력되며, 서식 복사 CTA에 사용됩니다. 하이퍼링크 삽입 여부는 복사 시 CTA 방식(문구만/링크 포함/없음)을 따릅니다.",
                    en: "Defaults to the source article and is used in the copied format CTA. Whether a hyperlink is inserted follows the CTA mode (text only / with link / none).",
                  })}
                </p>
              </div>
              <div>
                <label className={REVIEW_PANEL_LABEL_CLASS}>
                  {lang({ ko: "요약", en: "Summary" })}
                </label>
                <Textarea
                  value={editor.summary}
                  onChange={(event) =>
                    setEditorField(channel.channel, "summary", event.target.value)
                  }
                  rows={3}
                  placeholder={lang({
                    ko: "네이버 블로그 요약",
                    en: "Naver Blog summary",
                  })}
                />
              </div>
            </>
          ) : null}

          {channel.channel === "linkedin" || channel.channel === "naver_blog" ? (
            <MarketingChannelImageUrlsEditor channel={channel} editor={editor} setEditorField={setEditorField} />
          ) : null}

          <div>
            <label className={REVIEW_PANEL_LABEL_CLASS}>{lang({ ko: "본문", en: "Body" })}</label>
            <MarketingBodyComposer
              value={editor.body}
              onChange={(value) => setEditorField(channel.channel, "body", value)}
              rows={10}
              placeholder={lang({
                ko: "채널 초안을 수정하세요.",
                en: "Edit channel draft.",
              })}
              htmlVariant={channel.channel === "naver_blog" ? "naver" : "default"}
            />
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <label className={REVIEW_PANEL_LABEL_CLASS}>
                {channel.channel === "linkedin"
                  ? lang({ ko: "해시태그", en: "Hashtags" })
                  : lang({ ko: "태그", en: "Tags" })}
              </label>
              <Input
                value={channel.channel === "linkedin" ? editor.hashtags : editor.tags}
                onChange={(event) =>
                  setEditorField(
                    channel.channel,
                    channel.channel === "linkedin" ? "hashtags" : "tags",
                    event.target.value,
                  )
                }
                placeholder={
                  channel.channel === "linkedin"
                    ? lang({ ko: "쉼표로 구분", en: "Comma separated" })
                    : "#워런버핏, #장기브랜드자산"
                }
              />
            </div>

            <div>
              <label className={REVIEW_PANEL_LABEL_CLASS}>
                {lang({ ko: "운영 메모", en: "Operator note" })}
              </label>
              <Input
                value={editor.note}
                onChange={(event) => setEditorField(channel.channel, "note", event.target.value)}
                placeholder={lang({ ko: "수정/완료 사유 메모", en: "Operator note" })}
              />
            </div>
          </div>

          <MarketingChannelCopyActions
            channel={channel}
            editor={editor}
            siteUrl={siteUrl}
            sourceTitle={sourceTitle}
            naverCopyCtaMode={naverCopyCtaMode}
            setNaverCopyCtaMode={setNaverCopyCtaMode}
            connectLinkedInMemberProfile={connectLinkedInMemberProfile}
          />
          <MarketingRecommendedUploadSchedule
            channel={channel}
            canSchedule={channel.channel === "linkedin" || channel.channel === "naver_blog"}
            jobs={jobs}
            selectedJobId={selectedJobId}
            publishSchedules={publishSchedules}
            applyRandomizedPublishTime={applyRandomizedPublishTime}
          />

          <div className={REVIEW_CHANNEL_ACTIONS_CLASS}>
            {channel.channel === "linkedin" ? (
              <MarketingPublishScheduleAction
                channel={channel}
                action="publish_member"
                labels={{
                  now: lang({ ko: "즉시 발행", en: "Publish now" }),
                  scheduled: lang({ ko: "예약 발행", en: "Schedule publish" }),
                }}
                busyKey={busyKey}
                publishSchedules={publishSchedules}
                setPublishSchedules={setPublishSchedules}
                applyRandomizedPublishTime={applyRandomizedPublishTime}
                runChannelAction={runChannelAction}
              />
            ) : null}
            {channel.channel === "naver_blog" ? (
              <MarketingPublishScheduleAction
                channel={channel}
                action="complete"
                labels={{
                  now: lang({ ko: "발행 완료", en: "Mark published" }),
                  scheduled: lang({ ko: "예약 발행 완료", en: "Schedule publish" }),
                }}
                busyKey={busyKey}
                publishSchedules={publishSchedules}
                setPublishSchedules={setPublishSchedules}
                applyRandomizedPublishTime={applyRandomizedPublishTime}
                runChannelAction={runChannelAction}
              />
            ) : null}
            <Button
              variant="outline"
              className={REVIEW_CHANNEL_ACTION_BUTTON_CLASS}
              onClick={() => void runChannelAction(channel, "save_draft")}
              disabled={busyKey === `${channel.channel}:save_draft`}
            >
              <Save className="icon-xxs" />
              <span>{lang({ ko: "수정 저장", en: "Save edits" })}</span>
            </Button>
            {channel.channel === "naver_blog" ? null : (
              <Button
                className={REVIEW_CHANNEL_ACTION_BUTTON_CLASS}
                onClick={() => void runChannelAction(channel, "complete")}
                disabled={busyKey === `${channel.channel}:complete`}
              >
                <Check className="icon-xxs" />
                <span>{lang({ ko: "발행 완료 처리", en: "Mark published" })}</span>
              </Button>
            )}
            <Button
              variant="outline"
              className={cn("col-span-2", REVIEW_CHANNEL_ACTION_BUTTON_CLASS)}
              onClick={() => void runChannelAction(channel, "skip")}
              disabled={busyKey === `${channel.channel}:skip`}
            >
              <X className="icon-xxs" />
              <span>{lang({ ko: "건너뛰기", en: "Skip" })}</span>
            </Button>
          </div>
        </div>
      )}
    </>
  );
}
