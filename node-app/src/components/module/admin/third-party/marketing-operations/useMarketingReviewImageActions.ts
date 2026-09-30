import { useState, type Dispatch, type SetStateAction } from "react";
import { lang } from "components/module/i18n";
import fetchClient from "libs/api/fetchClient";
import { getCardNewsDeck, listCardNewsDecks } from "libs/api/lab";
import { mapCardNewsDeckToInstagramDraft } from "libs/card-news/draftMapping";
import { toast } from "sonner";
import { decodeHtmlEntities } from "utils/common";
import type { ImageStudioDoneMetaType } from "types/app";
import type { CardNewsDeck } from "types/card-news";
import { MARKETING_CONTENT_QUEUE_API } from "./MarketingOpsConstants";
import type { MarketingImageAttachmentController } from "./useMarketingImageAttachment";
import type {
  ChannelEditorState,
  MarketingChannelSummary,
  MarketingImagePreview,
  MarketingImageStudioTarget,
  MarketingJobDetail,
  MarketingJobListItem,
} from "./MarketingOpsTypes";
import {
  buildScopeParams,
  getChannelLabel,
  getInitialEditor,
  getMarketingOperatorErrorMessage,
  isHttpUrl,
  toImageUrlValues,
  toSafeString,
} from "./MarketingOpsUtils";
import {
  getChannelPreviewUrls,
  getEditorImageUrls,
  limitChannelImageUrls,
  mergeChannelImageUrls,
  type MarketingUploadResponse,
} from "./MarketingReviewDomain";

type UseMarketingReviewImageActionsArgs = {
  scopedUniverseId: string;
  selectedJobId: string;
  detail: MarketingJobDetail | null;
  jobs: MarketingJobListItem[];
  editors: Record<string, ChannelEditorState>;
  setEditors: Dispatch<SetStateAction<Record<string, ChannelEditorState>>>;
  setEditorField: (channel: string, key: keyof ChannelEditorState, value: string) => void;
  imageAttachment: MarketingImageAttachmentController;
  setBusyKey: (key: string) => void;
  onRefresh: (jobId?: string) => Promise<void>;
};

export function useMarketingReviewImageActions({
  scopedUniverseId,
  selectedJobId,
  detail,
  jobs,
  editors,
  setEditors,
  setEditorField,
  imageAttachment,
  setBusyKey,
  onRefresh,
}: UseMarketingReviewImageActionsArgs) {
  const [imageStudioTarget, setImageStudioTarget] = useState<MarketingImageStudioTarget | null>(null);
  const [cardNewsDecks, setCardNewsDecks] = useState<CardNewsDeck[]>([]);
  const [cardNewsDecksLoaded, setCardNewsDecksLoaded] = useState(false);
  const [cardNewsDecksLoading, setCardNewsDecksLoading] = useState(false);

  const refreshSourceImages = async () => {
    if (!selectedJobId) return;

    try {
      setBusyKey("job:refresh_source_images");
      await fetchClient.patch(`${MARKETING_CONTENT_QUEUE_API}/${selectedJobId}`, {
        ...buildScopeParams(scopedUniverseId),
        action: "refresh_source_images",
        reason: "operator_refresh_source_images",
      });
      toast.success(lang({ ko: "포스트 이미지 정보를 새로 불러왔습니다.", en: "Post image data refreshed." }));
      await onRefresh(selectedJobId);
    } catch (error) {
      toast.error(
        getMarketingOperatorErrorMessage(
          error,
          lang({ ko: "포스트 이미지 새로고침에 실패했습니다.", en: "Failed to refresh post images." }),
        ),
      );
    } finally {
      setBusyKey("");
    }
  };

  const attachGeneratedImages = async (images: string[], meta?: ImageStudioDoneMetaType) => {
    if (!selectedJobId || !detail) return;
    const imageUrls = Array.from(new Set((images || []).map(toSafeString).filter(Boolean)));
    if (!imageUrls.length) return;

    const targetChannels = imageStudioTarget?.channel
      ? [imageStudioTarget.channel]
      : (detail.channels || []).map((channel) => toSafeString(channel.channel)).filter(Boolean);
    if (!targetChannels.length) return;

    try {
      setBusyKey("studio:attach_image");
      for (const channel of targetChannels) {
        const channelImageUrls = limitChannelImageUrls(channel, imageUrls);
        await fetchClient.post(`${MARKETING_CONTENT_QUEUE_API}/${selectedJobId}/channels/${channel}`, {
          ...buildScopeParams(scopedUniverseId),
          action: "attach_image",
          draft: {
            imageUrl: channelImageUrls[0],
            imageUrls: channelImageUrls,
            templateKey: toSafeString(meta?.templateKey),
            generationMode: toSafeString(meta?.generationMode),
          },
          note: "gen_studio_image_attach",
        });
      }

      setEditors((prev) => {
        const next = { ...prev };
        targetChannels.forEach((channel) => {
          next[channel] = {
            ...(next[channel] ||
              getInitialEditor(detail.channels.find((item) => item.channel === channel) || { channel })),
            imageUrl: limitChannelImageUrls(channel, imageUrls)[0] || "",
            imageUrls: limitChannelImageUrls(channel, imageUrls).join("\n"),
          };
        });
        return next;
      });
      toast.success(
        lang({
          ko: `${targetChannels.length}개 채널 draft에 이미지를 연결했습니다.`,
          en: "Generated image attached to channel drafts.",
        }),
      );
      setImageStudioTarget(null);
      await onRefresh(selectedJobId);
    } catch (error) {
      toast.error(
        getMarketingOperatorErrorMessage(
          error,
          lang({ ko: "생성 이미지 연결에 실패했습니다.", en: "Failed to attach generated images." }),
        ),
      );
    } finally {
      setBusyKey("");
    }
  };

  const uploadMarketingImageFile = async (file: File) => {
    const targetUniverseId = scopedUniverseId || toSafeString(detail?.job?.universeId);
    if (!targetUniverseId) {
      throw new Error(
        lang({ ko: "이미지를 업로드할 유니버스 정보가 없습니다.", en: "No universe is available for upload." }),
      );
    }

    const form = new FormData();
    form.append("file", file);
    form.append("universeId", targetUniverseId);
    form.append("jobId", selectedJobId);
    form.append("retain", "false");

    const response = await fetchClient.post<MarketingUploadResponse>("/marketing/content-images", form, { timeout: 60000 });
    const asset = response.data?.data?.asset;
    if (!asset || !toSafeString(asset.assetId) || !toSafeString(asset.url)) {
      throw new Error(lang({ ko: "업로드 URL을 확인하지 못했습니다.", en: "Upload URL is missing." }));
    }
    return asset;
  };

  const attachManualImage = async () => {
    const attachTarget = imageAttachment.target;
    if (!selectedJobId || !detail || !attachTarget) return;

    const urlInputs = toImageUrlValues(imageAttachment.urls);
    const selectedStudioImages = imageAttachment.studioImages.filter((item) =>
      imageAttachment.selectedStudioImageIds.includes(toSafeString(item.assetId)),
    );
    const studioImageUrls = selectedStudioImages.map((item) => toSafeString(item.url)).filter(Boolean);
    const selectedUploadedImages = imageAttachment.uploadedImages.filter((item) =>
      imageAttachment.selectedUploadedImageIds.includes(toSafeString(item.assetId)),
    );
    const selectedUploadedImageUrls = selectedUploadedImages.map((item) => toSafeString(item.url)).filter(Boolean);
    if (!imageAttachment.files.length && !urlInputs.length && !studioImageUrls.length && !selectedUploadedImageUrls.length) {
      toast.error(
        lang({
          ko: "파일, 기존 업로드, 이미지 URL, Gen Studio 이미지 중 하나 이상을 선택해주세요.",
          en: "Select a file, uploaded image, image URL, or Gen Studio image.",
        }),
      );
      return;
    }
    const invalidUrl = urlInputs.find((url) => !isHttpUrl(url) && !url.startsWith("/"));
    if (invalidUrl) {
      toast.error(
        lang({ ko: "이미지 URL은 http(s) 또는 /로 시작해야 합니다.", en: "Image URL must start with http(s) or /." }),
      );
      return;
    }

    const targetChannels = attachTarget.channel
      ? [attachTarget.channel]
      : (detail.channels || []).map((channel) => toSafeString(channel.channel)).filter(Boolean);
    if (!targetChannels.length) {
      toast.error(
        lang({ ko: "이미지를 연결할 채널이 없습니다.", en: "No channel is available for image attachment." }),
      );
      return;
    }

    try {
      setBusyKey("image:attach_manual");
      const uploadedImages = [];
      for (const file of imageAttachment.files) {
        uploadedImages.push(await uploadMarketingImageFile(file));
      }
      const marketingUploadedImages = [...uploadedImages, ...selectedUploadedImages];
      const uploadedImageUrls = marketingUploadedImages.map((item) => toSafeString(item.url)).filter(Boolean);
      const imageUrls = Array.from(
        new Set([...uploadedImageUrls, ...urlInputs, ...studioImageUrls].map(toSafeString).filter(Boolean)),
      );
      const studioImageAssetIdByUrl = new Map(
        selectedStudioImages
          .map((item) => [toSafeString(item.url), toSafeString(item.assetId)] as const)
          .filter(([url, assetId]) => url && assetId),
      );
      const marketingUploadAssetIdByUrl = new Map(
        marketingUploadedImages
          .map((item) => [toSafeString(item.url), toSafeString(item.assetId)] as const)
          .filter(([url, assetId]) => url && assetId),
      );
      const imageSource = imageAttachment.files.length || selectedUploadedImages.length
        ? "operator_upload"
        : studioImageUrls.length
          ? "gen_studio_asset"
          : "operator_url";
      const imageAlt = decodeHtmlEntities(
        toSafeString(imageAttachment.alt || detail.job.sourceRef?.title || detail.job.sourceRef?.slug),
      );
      const attachedChannels: string[] = [];
      const mergedUrlsByChannel = new Map<string, string[]>();

      for (const channel of targetChannels) {
        const channelSummary = detail.channels.find((item) => item.channel === channel);
        const editor = editors[channel] || getInitialEditor(channelSummary || { channel });
        const existingUrls = mergeChannelImageUrls(
          channel,
          getEditorImageUrls(editor),
          getChannelPreviewUrls(channelSummary),
        );
        const existingSet = new Set(existingUrls);
        const newImageUrls = imageUrls.filter((url) => !existingSet.has(url));
        const channelImageUrls = mergeChannelImageUrls(channel, existingUrls, newImageUrls);
        const acceptedNewImageUrls = channelImageUrls.filter((url) => !existingSet.has(url));
        const newStudioImageAssetIds = channelImageUrls
          .map((url) => studioImageAssetIdByUrl.get(url) || "")
          .filter(Boolean);
        const marketingUploadAssetIds = channelImageUrls
          .map((url) => marketingUploadAssetIdByUrl.get(url) || "")
          .filter(Boolean);
        if (!acceptedNewImageUrls.length && !marketingUploadAssetIds.length) continue;
        await fetchClient.post(`${MARKETING_CONTENT_QUEUE_API}/${selectedJobId}/channels/${channel}`, {
          ...buildScopeParams(scopedUniverseId),
          action: "attach_image",
          draft: {
            imageUrl: channelImageUrls[0],
            imageUrls: channelImageUrls,
            imageAlt,
            imageSource,
            imageAssetIds: newStudioImageAssetIds,
            marketingUploadAssetIds,
          },
          note: imageSource,
        });
        attachedChannels.push(channel);
        mergedUrlsByChannel.set(channel, channelImageUrls);
      }

      if (!attachedChannels.length) {
        toast.info(
          lang({
            ko: "선택한 이미지는 이미 활용 이미지 목록에 등록되어 있습니다.",
            en: "Selected images are already registered in the available image list.",
          }),
        );
        return;
      }

      setEditors((prev) => {
        const next = { ...prev };
        attachedChannels.forEach((channel) => {
          const channelSummary = detail.channels.find((item) => item.channel === channel);
          const channelImageUrls = mergedUrlsByChannel.get(channel) || [];
          next[channel] = {
            ...(next[channel] || getInitialEditor(channelSummary || { channel })),
            imageUrl: channelImageUrls[0] || "",
            imageUrls: channelImageUrls.join("\n"),
          };
        });
        return next;
      });
      toast.success(
        lang({
          ko: `${attachedChannels.length}개 채널 draft에 신규 이미지를 등록했습니다.`,
          en: "Image attached to channel drafts.",
        }),
      );
      imageAttachment.close();
      await onRefresh(selectedJobId);
    } catch (error) {
      toast.error(
        getMarketingOperatorErrorMessage(
          error,
          lang({ ko: "이미지 등록에 실패했습니다.", en: "Failed to attach image." }),
        ),
      );
    } finally {
      setBusyKey("");
    }
  };

  const applyChannelImages = (channel: MarketingChannelSummary, images: Array<{ url?: string }>) => {
    const urls = images.map((image) => toSafeString(image.url)).filter(Boolean);
    if (!urls.length) return;

    const editor = editors[channel.channel] || getInitialEditor(channel);
    const currentUrls = getEditorImageUrls(editor);
    const newUrls = urls.filter((url) => !currentUrls.includes(url));
    if (!newUrls.length) {
      toast.info(
        lang({
          ko: "선택한 이미지는 이미 이미지 URL 목록에 있습니다.",
          en: "Selected images are already in the image URL list.",
        }),
      );
      return;
    }

    const nextUrls = mergeChannelImageUrls(channel.channel, currentUrls, newUrls);
    setEditorField(channel.channel, "imageUrl", nextUrls[0] || "");
    setEditorField(channel.channel, "imageUrls", nextUrls.join("\n"));
    toast.success(
      lang({
        ko: `${getChannelLabel(channel.channel)} 이미지 URL 목록에 ${newUrls.length}개를 추가했습니다.`,
        en: "Selected image URLs added to the channel draft.",
      }),
    );
  };

  const removeChannelImages = async (channel: MarketingChannelSummary, images: MarketingImagePreview[]) => {
    if (!selectedJobId || !detail) return;
    const imageUrls = Array.from(new Set(images.map((image) => toSafeString(image.url)).filter(Boolean)));
    const imageAssetIds = Array.from(new Set(images.map((image) => toSafeString(image.assetId)).filter(Boolean)));
    const marketingUploadAssetIds = Array.from(
      new Set(images.map((image) => toSafeString(image.marketingUploadAssetId)).filter(Boolean)),
    );
    if (!imageUrls.length && !imageAssetIds.length && !marketingUploadAssetIds.length) return;

    try {
      setBusyKey(`image:remove:${channel.channel}`);
      await fetchClient.post(`${MARKETING_CONTENT_QUEUE_API}/${selectedJobId}/channels/${channel.channel}`, {
        ...buildScopeParams(scopedUniverseId),
        action: "remove_image",
        draft: {
          imageUrl: imageUrls[0] || "",
          imageUrls,
          imageAssetIds,
          marketingUploadAssetIds,
        },
        note: "operator_remove_image",
      });

      setEditors((prev) => {
        const current = prev[channel.channel] || getInitialEditor(channel);
        const removeSet = new Set(imageUrls);
        const nextUrls = toImageUrlValues(current.imageUrls, current.imageUrl).filter((url) => !removeSet.has(url));
        return {
          ...prev,
          [channel.channel]: {
            ...current,
            imageUrl: nextUrls[0] || "",
            imageUrls: nextUrls.join("\n"),
          },
        };
      });

      toast.success(
        lang({
          ko: `${imageUrls.length}개 이미지를 활용 이미지에서 제거했습니다.`,
          en: "Images removed from available images.",
        }),
      );
      await onRefresh(selectedJobId);
    } catch (error) {
      toast.error(
        getMarketingOperatorErrorMessage(
          error,
          lang({ ko: "활용 이미지 제거에 실패했습니다.", en: "Failed to remove image." }),
        ),
      );
    } finally {
      setBusyKey("");
    }
  };

  const loadCardNewsDecks = async () => {
    if (cardNewsDecksLoading) return;
    try {
      setCardNewsDecksLoading(true);
      const result = await listCardNewsDecks({ limit: 50 });
      setCardNewsDecks(result.items);
      setCardNewsDecksLoaded(true);
    } catch (error) {
      toast.error(
        getMarketingOperatorErrorMessage(
          error,
          lang({ ko: "카드뉴스 덱을 불러오지 못했습니다.", en: "Failed to load card news decks." }),
        ),
      );
    } finally {
      setCardNewsDecksLoading(false);
    }
  };

  const attachCardNewsDeck = async (deckId: string) => {
    if (!selectedJobId || !detail || !deckId) return;
    try {
      setBusyKey("card-news:attach");
      const deck = cardNewsDecks.find((item) => item.deckId === deckId) || await getCardNewsDeck(deckId);
      const orderedCards = [...deck.cards].sort((left, right) => left.order - right.order);
      const missingAssetCard = orderedCards.find((card) => !toSafeString(card.exportedAssetId));
      if (missingAssetCard) {
        throw new Error(
          lang({
            ko: `카드 ${missingAssetCard.order + 1}의 검수용 자산이 없습니다. Gen Studio에서 먼저 업로드해 주세요.`,
            en: `Card ${missingAssetCard.order + 1} has no review asset. Upload it from Gen Studio first.`,
          }),
        );
      }

      const renderedCards = orderedCards.map((card) => ({
        cardId: card.cardId,
        imageAssetId: toSafeString(card.exportedAssetId),
      }));
      const mapped = mapCardNewsDeckToInstagramDraft({ deck: { ...deck, cards: orderedCards }, renderedCards });
      const policyVersion = Number(
        jobs
          .find((job) => job.jobId === selectedJobId)
          ?.recommendedUploadSchedules
          ?.find((schedule) => schedule.channel === "instagram")
          ?.policyVersion,
      );
      if (!Number.isInteger(policyVersion) || policyVersion < 1) {
        throw new Error(
          lang({
            ko: "현재 Instagram 발행 정책 버전을 확인하지 못해 연결을 중단했습니다. 검수 목록을 새로고침해 주세요.",
            en: "The current Instagram upload policy version is unavailable. Refresh the review list and try again.",
          }),
        );
      }

      await fetchClient.post(`${MARKETING_CONTENT_QUEUE_API}/${selectedJobId}/channels/instagram`, {
        ...buildScopeParams(scopedUniverseId),
        action: "attach_image",
        draft: {
          title: mapped.title,
          imageAssetIds: mapped.imageAssetIds,
          imageAlt: mapped.imageAlt,
          cardNews: {
            ...mapped.cardNews,
            uploadPolicyVersion: policyVersion,
          },
        },
        note: "card_news_deck_attach",
      });
      toast.success(
        lang({
          ko: `${orderedCards.length}장 카드뉴스를 Instagram 검수 draft에 순서대로 연결했습니다.`,
          en: `Attached ${orderedCards.length} card news images to the Instagram review draft in order.`,
        }),
      );
      await onRefresh(selectedJobId);
    } catch (error) {
      toast.error(
        getMarketingOperatorErrorMessage(
          error,
          lang({ ko: "카드뉴스 덱 연결에 실패했습니다.", en: "Failed to attach the card news deck." }),
        ),
      );
    } finally {
      setBusyKey("");
    }
  };

  return {
    imageStudioTarget,
    setImageStudioTarget,
    refreshSourceImages,
    attachGeneratedImages,
    attachManualImage,
    applyChannelImages,
    removeChannelImages,
    cardNewsDecks,
    cardNewsDecksLoaded,
    cardNewsDecksLoading,
    loadCardNewsDecks,
    attachCardNewsDeck,
  };
}
