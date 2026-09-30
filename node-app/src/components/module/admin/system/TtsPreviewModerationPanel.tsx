"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Check, ListChecks, RefreshCw, X } from "lucide-react";
import { Button, Input } from "@amu-labs/ui";
import { Lang, lang } from "components/module/i18n";
import {
  listTtsPreviewModerationAssets,
  moderateTtsPreview,
  type TtsPreviewModerationAsset,
  type TtsPreviewModerationStatus,
} from "libs/api/admin/ttsPreviewModeration";
import { cn } from "utils/common";
import { logger } from "utils/log";

const FILTERS: Array<{ value: TtsPreviewModerationStatus; label: { ko: string; en: string } }> = [
  { value: "pending", label: { ko: "대기", en: "Pending" } },
  { value: "approved", label: { ko: "승인", en: "Approved" } },
  { value: "rejected", label: { ko: "반려", en: "Rejected" } },
];

function readableDate(value: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "-" : date.toLocaleString();
}

export function TtsPreviewModerationPanel() {
  const [status, setStatus] = useState<TtsPreviewModerationStatus>("pending");
  const [assets, setAssets] = useState<TtsPreviewModerationAsset[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [savingId, setSavingId] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const requestIdRef = useRef(0);

  const load = useCallback(async (targetStatus: TtsPreviewModerationStatus, cursor?: string | null) => {
    const requestId = ++requestIdRef.current;
    const append = Boolean(cursor);
    if (append) setLoadingMore(true);
    else setLoading(true);
    setError("");
    try {
      const page = await listTtsPreviewModerationAssets({ status: targetStatus, cursor });
      if (requestId !== requestIdRef.current) return;
      setAssets((current) => (append ? [...current, ...page.items] : page.items));
      setNextCursor(page.nextCursor);
    } catch (loadError) {
      if (requestId !== requestIdRef.current) return;
      logger.error("[TtsPreviewModerationPanel] 검수 목록 조회 실패", loadError);
      setError(lang({ ko: "TTS 미리듣기 검수 목록을 불러오지 못했습니다.", en: "Failed to load TTS preview reviews." }));
    } finally {
      if (requestId === requestIdRef.current) {
        setLoading(false);
        setLoadingMore(false);
      }
    }
  }, []);

  useEffect(() => {
    // 상태 필터 변경 시 서버 목록과 loading/error 상태를 한 번에 동기화한다.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load(status);
  }, [load, status]);

  const decide = async (asset: TtsPreviewModerationAsset, decision: "approved" | "rejected") => {
    if (decision === "rejected" && !reason.trim()) {
      setError(lang({ ko: "반려 사유를 먼저 입력해 주세요.", en: "Enter a rejection reason first." }));
      return;
    }
    setSavingId(asset.assetId);
    setError("");
    setNotice("");
    try {
      await moderateTtsPreview({ assetId: asset.assetId, decision, reason: reason.trim() });
      setAssets((current) => current.filter((item) => item.assetId !== asset.assetId));
      setNotice(
        decision === "approved"
          ? lang({ ko: "미리듣기를 승인해 공개했습니다.", en: "The preview was approved and published." })
          : lang({ ko: "미리듣기를 반려해 비공개 저장소에 유지했습니다.", en: "The preview was rejected and kept private." }),
      );
    } catch (decisionError) {
      logger.error("[TtsPreviewModerationPanel] 검수 상태 저장 실패", decisionError);
      setError(lang({ ko: "검수 결과를 저장하지 못했습니다.", en: "Failed to save the review decision." }));
    } finally {
      setSavingId("");
    }
  };

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-4">
      <section className="rounded-xl border border-border bg-surface p-4">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <ListChecks className="h-5 w-5" aria-hidden />
          </span>
          <div>
            <h2 className="font-semibold">
              <Lang text={{ ko: "TTS 미리듣기 공개 검수", en: "TTS preview moderation" }} />
            </h2>
            <p className="mt-1 text-xs leading-5 text-secondary-text">
              <Lang
                text={{
                  ko: "사용자 지정 공개 문장은 승인 전까지 private R2에 보관되며 작성자와 관리자만 재생할 수 있습니다.",
                  en: "Custom public previews remain in private R2 and are playable only by their author and administrators until approval.",
                }}
              />
            </p>
          </div>
        </div>

        <label className="mt-4 block text-sm font-medium" htmlFor="tts-preview-moderation-reason">
          <Lang text={{ ko: "검수 메모 · 반려 사유", en: "Review note or rejection reason" }} />
        </label>
        <Input
          id="tts-preview-moderation-reason"
          className="mt-2"
          maxLength={240}
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          placeholder={lang({ ko: "반려할 때는 사유를 반드시 입력하세요.", en: "A reason is required when rejecting." })}
        />
      </section>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex gap-1" role="group" aria-label={lang({ ko: "검수 상태 필터", en: "Moderation status filter" })}>
          {FILTERS.map((filter) => (
            <Button
              key={filter.value}
              variant={status === filter.value ? "primary" : "outline"}
              size="sm"
              aria-pressed={status === filter.value}
              onClick={() => {
                setAssets([]);
                setNextCursor(null);
                setNotice("");
                setStatus(filter.value);
              }}
            >
              <Lang text={filter.label} />
            </Button>
          ))}
        </div>
        <Button variant="ghost" size="sm" loading={loading} onClick={() => void load(status)}>
          <RefreshCw className="h-4 w-4" aria-hidden />
          <Lang text={{ ko: "새로고침", en: "Refresh" }} />
        </Button>
      </div>

      {error ? <div role="alert" className="rounded-lg border border-danger/30 bg-danger/5 px-4 py-3 text-sm text-danger">{error}</div> : null}
      {notice ? <div role="status" className="rounded-lg border border-primary/30 bg-primary/5 px-4 py-3 text-sm text-primary">{notice}</div> : null}

      {!loading && assets.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border px-4 py-8 text-center text-sm text-secondary-text">
          <Lang text={{ ko: "해당 상태의 미리듣기가 없습니다.", en: "No previews have this status." }} />
        </p>
      ) : null}

      <div className="grid gap-3 md:grid-cols-2">
        {assets.map((asset) => {
          const saving = savingId === asset.assetId;
          return (
            <article key={asset.assetId} className="min-w-0 rounded-xl border border-border bg-surface p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2 text-xs text-secondary-text">
                  <span className="font-semibold text-primary-text">{asset.voiceId}</span>
                  <span>{asset.locale}</span>
                  <span>{asset.speed}x</span>
                </div>
                <span className="rounded-full bg-muted px-2 py-1 text-xxs font-semibold text-secondary-text">
                  {asset.moderationStatus}
                </span>
              </div>
              <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-6 text-primary-text">{asset.text}</p>
              <audio className="mt-3 h-10 w-full" controls preload="none" src={asset.audioUrl}>
                <Lang text={{ ko: "오디오 재생을 지원하지 않는 브라우저입니다.", en: "Your browser does not support audio playback." }} />
              </audio>
              <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-2 gap-y-1 text-xxs text-secondary-text">
                <dt><Lang text={{ ko: "작성자", en: "Owner" }} /></dt>
                <dd className="truncate">{asset.ownerUid}</dd>
                <dt><Lang text={{ ko: "생성", en: "Created" }} /></dt>
                <dd>{readableDate(asset.createdAt)}</dd>
                {asset.moderationReason ? (
                  <>
                    <dt><Lang text={{ ko: "사유", en: "Reason" }} /></dt>
                    <dd className="break-words">{asset.moderationReason}</dd>
                  </>
                ) : null}
              </dl>
              {status === "pending" ? (
                <div className="mt-4 grid grid-cols-2 gap-2">
                  <Button loading={saving} disabled={Boolean(savingId)} onClick={() => void decide(asset, "approved")}>
                    <Check className="h-4 w-4" aria-hidden />
                    <Lang text={{ ko: "승인", en: "Approve" }} />
                  </Button>
                  <Button
                    variant="destructive"
                    loading={saving}
                    disabled={Boolean(savingId) || !reason.trim()}
                    className={cn(!reason.trim() && "cursor-not-allowed")}
                    onClick={() => void decide(asset, "rejected")}
                  >
                    <X className="h-4 w-4" aria-hidden />
                    <Lang text={{ ko: "반려", en: "Reject" }} />
                  </Button>
                </div>
              ) : null}
            </article>
          );
        })}
      </div>
      {nextCursor ? (
        <Button
          variant="outline"
          className="mx-auto min-h-11 min-w-32"
          loading={loadingMore}
          disabled={loading || loadingMore || Boolean(savingId)}
          onClick={() => void load(status, nextCursor)}
        >
          <Lang text={{ ko: "더 보기", en: "Load more" }} />
        </Button>
      ) : null}
    </div>
  );
}
