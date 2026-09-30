"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Globe, Lock, Pause, Play, Trash2 } from "lucide-react";
import { Button, Input, Switch, Textarea, dialog } from "@amu-labs/ui";
import { lang } from "components/module/i18n";
import {
  deleteVoicePreview,
  generateVoicePreview,
  listVoicePreviews,
  setVoicePreviewVisibility,
  type VoicePreviewAsset,
} from "libs/api/ai";
import { cn } from "utils/common";
import { logger } from "utils/log";

type PreviewStatus = "idle" | "loading" | "playing" | "failed";

type VoicePreviewButtonProps = {
  voiceId: string;
  modelName: string;
  universeId: string;
  locale?: string;
  className?: string;
};

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error || "VOICE_PREVIEW_REQUEST_FAILED");
}

export default function VoicePreviewButton({
  voiceId,
  modelName,
  universeId,
  locale = "ko",
  className,
}: VoicePreviewButtonProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [assets, setAssets] = useState<VoicePreviewAsset[]>([]);
  const [selectedAssetId, setSelectedAssetId] = useState("");
  const [status, setStatus] = useState<PreviewStatus>("idle");
  const [requesting, setRequesting] = useState(false);
  const [customText, setCustomText] = useState("");
  const [customLocale, setCustomLocale] = useState(locale || "ko");
  const [customPublic, setCustomPublic] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    void listVoicePreviews({ voiceId, modelName, locale: locale || "ko" })
      .then((rows) => {
        if (cancelled) return;
        setAssets(rows);
        setSelectedAssetId(rows.find((asset) => asset.source === "default")?.assetId || rows[0]?.assetId || "");
      })
      .catch((loadError) => {
        if (!cancelled) logger.error("[VoicePreviewButton] 미리듣기 목록 조회 실패", loadError);
      });

    return () => {
      cancelled = true;
    };
  }, [locale, modelName, voiceId]);

  const selectedAsset = useMemo(
    () => assets.find((asset) => asset.assetId === selectedAssetId) || assets[0],
    [assets, selectedAssetId],
  );
  const activeAudioUrl = selectedAsset?.audioUrl;

  useEffect(() => {
    if (!activeAudioUrl) {
      audioRef.current = null;
      return;
    }

    const audio = new Audio(activeAudioUrl);
    audio.setAttribute("preload", "none");
    audioRef.current = audio;

    const handlePlaying = () => setStatus("playing");
    const handleEnded = () => setStatus("idle");
    const handleError = () => {
      setStatus("failed");
      logger.error("[VoicePreviewButton] 음성 샘플 재생 실패", { voiceId, activeAudioUrl });
    };

    audio.addEventListener("playing", handlePlaying);
    audio.addEventListener("ended", handleEnded);
    audio.addEventListener("error", handleError);

    return () => {
      audio.pause();
      audio.removeEventListener("playing", handlePlaying);
      audio.removeEventListener("ended", handleEnded);
      audio.removeEventListener("error", handleError);
      audio.removeAttribute("src");
      audio.load();
      audioRef.current = null;
    };
  }, [activeAudioUrl, voiceId]);

  const upsertAsset = (asset: VoicePreviewAsset) => {
    setAssets((current) => [asset, ...current.filter((item) => item.assetId !== asset.assetId)]);
    setSelectedAssetId(asset.assetId);
    setStatus("idle");
  };

  const generate = async (source: "default" | "custom") => {
    if (!universeId || (source === "custom" && !customText.trim())) return;
    setRequesting(true);
    setError("");
    try {
      const result = await generateVoicePreview({
        universeId,
        voiceId,
        modelName,
        locale: source === "default" ? locale || "ko" : customLocale || "ko",
        text: source === "custom" ? customText.trim() : undefined,
        visibility: source === "default" || customPublic ? "public" : "private",
        source,
      });
      upsertAsset(result.asset);
    } catch (generationError) {
      setError(errorMessage(generationError));
    } finally {
      setRequesting(false);
    }
  };

  const togglePreview = async () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (status === "playing") {
      audio.pause();
      audio.currentTime = 0;
      setStatus("idle");
      return;
    }
    try {
      setStatus("loading");
      audio.currentTime = 0;
      await audio.play();
    } catch (playError) {
      setStatus("failed");
      setError(errorMessage(playError));
    }
  };

  const changeVisibility = async (asset: VoicePreviewAsset) => {
    setRequesting(true);
    setError("");
    try {
      upsertAsset(await setVoicePreviewVisibility(asset.assetId, asset.visibility === "public" ? "private" : "public"));
    } catch (visibilityError) {
      setError(errorMessage(visibilityError));
    } finally {
      setRequesting(false);
    }
  };

  const removeAsset = async (asset: VoicePreviewAsset) => {
    if (!(await dialog.confirm({ variant: "danger", message: lang({ ko: "이 미리듣기 음성을 삭제할까요?", en: "Delete this voice preview?" }) }))) return;
    setRequesting(true);
    setError("");
    try {
      await deleteVoicePreview(asset.assetId, asset.isOwner ? "user_delete" : "admin_moderation");
      setAssets((current) => current.filter((item) => item.assetId !== asset.assetId));
      setSelectedAssetId("");
      setStatus("idle");
    } catch (deleteError) {
      setError(errorMessage(deleteError));
    } finally {
      setRequesting(false);
    }
  };

  const isPlaying = status === "playing";
  const hasPlayableAudio = Boolean(activeAudioUrl);

  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex flex-wrap items-center gap-2">
        {hasPlayableAudio ? (
          <Button
            variant="outline"
            size="sm"
            loading={status === "loading"}
            disabled={requesting}
            onClick={() => void togglePreview()}
          >
            {isPlaying ? <Pause size={14} aria-hidden="true" /> : <Play size={14} aria-hidden="true" />}
            {lang({ ko: isPlaying ? "정지" : "미리듣기", en: isPlaying ? "Stop" : "Preview" })}
          </Button>
        ) : (
          <Button
            variant="outline"
            size="sm"
            loading={requesting}
            disabled={!universeId}
            onClick={() => void generate("default")}
          >
            <Play size={14} aria-hidden="true" />
            {lang({ ko: "기본 미리듣기 생성", en: "Generate preview" })}
          </Button>
        )}
        <span className="text-xxs text-secondary-text">
          {lang({ ko: "생성 시 TTS 사용량이 과금되며 이후 저장본을 재사용합니다.", en: "Generation uses TTS credits; the saved audio is reused." })}
        </span>
      </div>

      {assets.length > 0 ? (
        <div className="space-y-1 rounded-lg border border-border/60 p-2">
          {assets.slice(0, 8).map((asset) => (
            <div key={asset.assetId} className="flex items-center gap-2 text-xxs">
              <button
                type="button"
                className="min-w-0 flex-1 truncate text-left text-primary-text hover:underline"
                onClick={() => {
                  setSelectedAssetId(asset.assetId);
                  setStatus("idle");
                }}
              >
                {asset.source === "default" ? lang({ ko: "기본 예시", en: "Default sample" }) : asset.text}
              </button>
              <span className="inline-flex items-center gap-1 text-secondary-text">
                {asset.visibility === "public" ? <Globe size={12} aria-hidden="true" /> : <Lock size={12} aria-hidden="true" />}
                {asset.locale}
                <span>{asset.speed}x</span>
                {asset.visibility === "public" && asset.moderationStatus !== "approved" ? (
                  <span className={asset.moderationStatus === "rejected" ? "text-danger" : "text-primary"}>
                    {asset.moderationStatus === "rejected"
                      ? lang({ ko: "반려", en: "Rejected" })
                      : lang({ ko: "검수 대기", en: "Pending review" })}
                  </span>
                ) : null}
              </span>
              {asset.canEdit ? (
                <Button variant="ghost" size="xs" disabled={requesting} onClick={() => void changeVisibility(asset)}>
                  {asset.visibility === "public"
                    ? lang({ ko: "비공개", en: "Make private" })
                    : lang({ ko: "공개", en: "Request public review" })}
                </Button>
              ) : null}
              {asset.canDelete ? (
                <Button
                  variant="ghost"
                  size="xs"
                  disabled={requesting}
                  aria-label={lang({ ko: "미리듣기 삭제", en: "Delete voice preview" })}
                  onClick={() => void removeAsset(asset)}
                >
                  <Trash2 size={12} aria-hidden="true" />
                </Button>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}

      <details className="rounded-lg border border-border/60 p-2">
        <summary className="cursor-pointer text-xs text-secondary-text">
          {lang({ ko: "다른 문장·언어로 생성", en: "Generate another text or language" })}
        </summary>
        <div className="mt-2 space-y-2">
          <Textarea
            rows={2}
            maxLength={240}
            value={customText}
            onChange={(event) => setCustomText(event.target.value)}
            placeholder={lang({ ko: "미리듣기 문장 (최대 240자)", en: "Preview text (up to 240 characters)" })}
          />
          <div className="flex flex-wrap items-center gap-2">
            <Input
              className="w-28"
              maxLength={16}
              value={customLocale}
              onChange={(event) => setCustomLocale(event.target.value)}
              placeholder="ko / en / ja"
            />
            <label className="inline-flex items-center gap-2 text-xs text-secondary-text">
              <Switch
                checked={customPublic}
                onCheckedChange={setCustomPublic}
                size="xs"
                aria-label={lang({ ko: "공개 검수 요청", en: "Request public review" })}
              />
              {lang({ ko: "공개 검수 요청", en: "Request public review" })}
            </label>
            <Button
              variant="outline"
              size="sm"
              loading={requesting}
              disabled={!universeId || !customText.trim()}
              onClick={() => void generate("custom")}
            >
              {lang({ ko: "생성 후 듣기", en: "Generate and play" })}
            </Button>
          </div>
          {customPublic ? (
            <p className="text-xxs text-secondary-text">
              {lang({
                ko: "사용자 지정 문장은 관리자 승인 전까지 작성자에게만 공개됩니다.",
                en: "Custom text remains visible only to you until an administrator approves it.",
              })}
            </p>
          ) : null}
          <p className="text-xxs text-secondary-text">
            {lang({
              ko: "사용자 지정 문장은 이 유니버스의 기본 말하기 속도로 생성됩니다.",
              en: "Custom text uses this universe's default speech speed.",
            })}
          </p>
        </div>
      </details>
      {error ? <p role="alert" className="text-xxs text-danger">{error}</p> : null}
    </div>
  );
}
