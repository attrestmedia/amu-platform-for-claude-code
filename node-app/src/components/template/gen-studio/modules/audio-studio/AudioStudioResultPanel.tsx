"use client";

import { AlertTriangle, CheckCircle2, Clock, Download, Loader2, RefreshCw, Trash2, XCircle } from "lucide-react";
import { Button } from "@amu-labs/ui";
import { Lang, lang } from "components/module/i18n";
import type { StudioAudioJobTransport } from "libs/api/lab";
import { formatAudioDuration, hasPlayableAudioMetadata, resolveAudioStatusView } from "./audioStudioStatus";

// 기존 Gen Studio 정본과 동일한 visible focus 패턴 (modules/PresetCard.tsx).
const FOCUS_RING_CLASS =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2";

type AudioStudioResultPanelProps = {
  job: StudioAudioJobTransport | null;
  loading: boolean;
  onRefresh: () => void;
  onDelete: (assetId: string) => void;
  onRetry: () => void;
  canRetry: boolean;
};

function StatusIcon({ tone }: { tone: ReturnType<typeof resolveAudioStatusView>["tone"] }) {
  if (tone === "success") return <CheckCircle2 className="h-4 w-4 text-primary" aria-hidden="true" />;
  if (tone === "danger") return <XCircle className="h-4 w-4 text-danger" aria-hidden="true" />;
  if (tone === "warning") return <AlertTriangle className="h-4 w-4 text-warning" aria-hidden="true" />;
  if (tone === "pending") return <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />;
  return <Clock className="h-4 w-4 text-secondary-text" aria-hidden="true" />;
}

export function AudioStudioResultPanel({
  job,
  loading,
  onRefresh,
  onDelete,
  onRetry,
  canRetry,
}: AudioStudioResultPanelProps) {
  if (!job && !loading) {
    return (
      <p className="px-3 py-4 text-sm text-secondary-text">
        <Lang text={{ ko: "아직 생성 결과가 없습니다.", en: "No generation result yet." }} />
      </p>
    );
  }

  const view = job ? resolveAudioStatusView(job.status) : resolveAudioStatusView("running");
  const segments = job?.playlist?.segments || [];

  return (
    <div className="flex flex-col gap-3 px-3 pb-4">
      <div
        role={view.tone === "danger" ? "alert" : "status"}
        aria-live={view.tone === "danger" ? "assertive" : "polite"}
        className="flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm"
      >
        <StatusIcon tone={view.tone} />
        <span className="font-medium">
          <Lang text={view.label} />
        </span>
        {job?.segmentCount ? (
          <span className="ml-auto text-xs text-secondary-text">
            {`${job.completedSegments?.length || 0} / ${job.segmentCount}`}
          </span>
        ) : null}
      </div>

      {view.isIndeterminate ? (
        <p className="text-xs leading-5 text-secondary-text">
          <Lang
            text={{
              ko: "provider 응답이 불확실한 상태입니다. 자동 재시도하지 않으며, 확인 전에는 다시 차감되지 않습니다.",
              en: "The provider outcome is uncertain. It is not retried automatically and is not charged again before review.",
            }}
          />
        </p>
      ) : null}

      {view.tone === "danger" ? (
        <p className="text-xs leading-5 text-secondary-text">
          <Lang
            text={{
              ko: "생성에 실패했습니다. 다시 시도하면 같은 요청으로 이어서 진행합니다.",
              en: "Generation failed. Retrying continues with the same request.",
            }}
          />
        </p>
      ) : null}

      {job?.playlist && segments.length > 0 ? (
        <div className="flex flex-col gap-3">
          <p className="text-xs text-secondary-text">
            {lang({
              ko: `전체 ${formatAudioDuration(job.playlist.totalDurationMs)} · ${segments.length}개 구간`,
              en: `Total ${formatAudioDuration(job.playlist.totalDurationMs)} · ${segments.length} segments`,
            })}
          </p>
          <ol className="flex flex-col gap-3">
            {segments.map((segment) => {
              const asset = job.assets?.find((item) => item.assetId === segment.assetId) || null;
              const playable = asset ? hasPlayableAudioMetadata(asset) : false;
              return (
                <li key={`${segment.assetId}-${segment.orderedIndex}`} className="flex flex-col gap-2 rounded-md border border-border p-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium">
                      {lang({ ko: `구간 ${segment.orderedIndex + 1}`, en: `Segment ${segment.orderedIndex + 1}` })}
                    </span>
                    <span className="text-xs text-secondary-text">{formatAudioDuration(segment.durationMs)}</span>
                  </div>

                  {playable && asset?.url ? (
                    <audio
                      controls
                      preload="none"
                      src={asset.url}
                      className="w-full"
                      aria-label={lang({ ko: `구간 ${segment.orderedIndex + 1} 재생`, en: `Play segment ${segment.orderedIndex + 1}` })}
                    />
                  ) : (
                    <p className="text-xs text-secondary-text" role="status" aria-live="polite">
                      <Lang
                        text={{
                          ko: "재생 URL이 만료되었거나 아직 준비되지 않았습니다.",
                          en: "The playback URL expired or is not ready yet.",
                        }}
                      />
                    </p>
                  )}

                  <div className="flex flex-wrap gap-2">
                    <Button variant="outline" size="sm" onClick={onRefresh} className={FOCUS_RING_CLASS}>
                      <RefreshCw className="h-4 w-4" aria-hidden="true" />
                      <Lang text={{ ko: "URL 새로 고침", en: "Refresh URL" }} />
                    </Button>
                    {asset?.url ? (
                      <Button variant="ghost" size="sm" asChild className={FOCUS_RING_CLASS}>
                        <a
                          href={asset.url}
                          download={`segment-${segment.orderedIndex + 1}.${asset.storage?.mimeType?.split("/")[1] || "mp3"}`}
                        >
                          <Download className="h-4 w-4" aria-hidden="true" />
                          <Lang text={{ ko: "다운로드", en: "Download" }} />
                        </a>
                      </Button>
                    ) : null}
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onDelete(segment.assetId)}
                      aria-label={lang({ ko: `구간 ${segment.orderedIndex + 1} 삭제`, en: `Delete segment ${segment.orderedIndex + 1}` })}
                      className={FOCUS_RING_CLASS}
                    >
                      <Trash2 className="h-4 w-4" aria-hidden="true" />
                      <Lang text={{ ko: "삭제", en: "Delete" }} />
                    </Button>
                  </div>
                </li>
              );
            })}
          </ol>
        </div>
      ) : null}

      {canRetry ? (
        <Button variant="outline" size="sm" onClick={onRetry} className={FOCUS_RING_CLASS}>
          <Lang text={{ ko: "다시 시도", en: "Retry" }} />
        </Button>
      ) : null}
    </div>
  );
}
