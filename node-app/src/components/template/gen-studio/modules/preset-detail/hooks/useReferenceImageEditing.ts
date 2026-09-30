"use client";

import { useCallback, useRef, useState } from "react";
import { toast } from "sonner";
import type { PersonaArtifactContextType } from "types/app";
import { dialog } from "@amu-labs/ui";
import { lang } from "components/module/i18n";
import { uploadPersonaImageLibraryAsset } from "libs/api/persona/imageLibrary";
import { prepareEditableImageFileFromUrl } from "utils/app/imageFile";
import type { ReferenceStrengthType } from "utils/lab";
import { logger } from "utils/log";

export type EditableReferenceTargetType = "reference";

type EditableImageType = {
  target: EditableReferenceTargetType;
  index: number;
  src: string;
  name?: string;
};

type AttachedImageGroupType = {
  count: number;
  previews: string[];
  names: string[];
  appendFile: (file: File | null) => Promise<boolean>;
  replaceAt: (index: number, file: File | null, options?: { apply?: boolean }) => Promise<boolean>;
};

type ArtifactContextType = {
  persona?: PersonaArtifactContextType;
  templateKey: string;
  templateTitle: string;
  referenceStrength: ReferenceStrengthType;
};

export function useReferenceImageEditing({
  referenceImages,
  maxRefImages,
  artifact,
  onCloseSettingDialog,
}: {
  referenceImages: AttachedImageGroupType;
  maxRefImages: number;
  artifact: ArtifactContextType;
  onCloseSettingDialog: () => void;
}) {
  const [editingImage, setEditingImage] = useState<EditableImageType | null>(null);
  const pendingArtifactAssetIdsRef = useRef(new Set<string>());

  const openAttachedImageEditor = useCallback(
    (index: number) => {
      if (index < 0 || index >= referenceImages.previews.length) return;
      const src = referenceImages.previews[index];
      if (!src) return;

      onCloseSettingDialog();
      window.setTimeout(() => {
        setEditingImage({ target: "reference", index, src, name: referenceImages.names[index] });
      }, 0);
    },
    [onCloseSettingDialog, referenceImages],
  );

  const handleEditBaseImage = useCallback(
    (index: number) => openAttachedImageEditor(index),
    [openAttachedImageEditor],
  );

  const handleEditRecentImage = useCallback(
    async ({ url }: { url: string }) => {
      const normalizedUrl = String(url || "").trim();
      if (!normalizedUrl) return;

      if (referenceImages.count >= maxRefImages) {
        void dialog.alert(
          lang({
            ko: `참고 이미지는 최대 ${maxRefImages}장까지 가능합니다.`,
            en: `Up to ${maxRefImages} reference images allowed.`,
          }),
        );
        return;
      }

      try {
        const nextIndex = referenceImages.previews.length;
        const editable = await prepareEditableImageFileFromUrl(
          normalizedUrl,
          `recent-reference-${nextIndex + 1}`,
        );
        const appended = await referenceImages.appendFile(editable.file);
        if (!appended) return;

        onCloseSettingDialog();
        window.setTimeout(() => {
          setEditingImage({ target: "reference", index: nextIndex, src: editable.preview, name: editable.name });
        }, 0);
      } catch (error) {
        logger.warn("[useReferenceImageEditing] recent image edit prepare failed", error);
        toast.error(
          lang({
            ko: "최근 생성 이미지를 편집 도구로 불러오지 못했습니다.",
            en: "Failed to open the recent image in the editor.",
          }),
        );
      }
    },
    [maxRefImages, onCloseSettingDialog, referenceImages],
  );

  const handleApplyEditedImage = useCallback(
    async (file: File, options: { saveArtifact: boolean; artifactName: string }) => {
      if (!editingImage) return;

      const applied = await referenceImages.replaceAt(editingImage.index, file, { apply: true });
      if (!applied) {
        toast.error(
          lang({
            ko: "합성 이미지를 참고 이미지에 반영하지 못했습니다.",
            en: "Failed to apply the composited reference image.",
          }),
        );
        return;
      }

      if (options.saveArtifact && artifact.persona) {
        try {
          const persona = artifact.persona;
          const asset = await uploadPersonaImageLibraryAsset({
            file,
            universeId: persona.universeId,
            personaId: persona.personaId,
            source: "uploaded_reference",
            generation: { templateKey: artifact.templateKey },
            reference: {
              kind: "profile_reference_sketch",
              sourceTemplateKey: artifact.templateKey,
              sourceTemplateTitle: artifact.templateTitle,
              sourceReferenceRole: "reference",
              referenceStrength: artifact.referenceStrength,
              linkedPersonaPid: persona.personaId,
              note:
                options.artifactName ||
                lang({
                  ko: `${persona.personaName || "캐릭터"} 스케치`,
                  en: `${persona.personaName || "Character"} sketch`,
                }),
            },
            tags: ["persona-artifact", "profile-reference-sketch"],
          });
          pendingArtifactAssetIdsRef.current.add(asset.assetId);
          toast.success(
            lang({
              ko: "스케치를 캐릭터 프로필 artifact로 저장했습니다.",
              en: "Saved the sketch as a character profile artifact.",
            }),
          );
        } catch (error) {
          logger.warn("[useReferenceImageEditing] artifact save failed", error);
          toast.warning(
            lang({
              ko: "이미지는 적용했지만 artifact 저장에는 실패했습니다.",
              en: "The image was applied, but the artifact could not be saved.",
            }),
          );
        }
      }

      toast.success(
        lang({
          ko: "드로잉이 합성된 이미지를 적용했습니다.",
          en: "Applied the composited drawing image.",
        }),
      );
    },
    [artifact, editingImage, referenceImages],
  );

  const closeEditor = useCallback(() => setEditingImage(null), []);

  return {
    editingImage,
    pendingArtifactAssetIdsRef,
    handleEditBaseImage,
    handleEditRecentImage,
    handleApplyEditedImage,
    closeEditor,
  };
}
