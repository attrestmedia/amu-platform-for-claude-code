"use client";

import { useCallback, useMemo, useRef, useState, type ChangeEvent } from "react";
import Image from "next/image";
import { Lang, lang } from "components/module/i18n";
import { ImageStudioEditor } from "components/template/gen-studio/ImageStudioEditor";
import { FixedImageViewer } from "components/template/gen-studio/modules/FixedImageViewer";
import FixedAspectImageCropDialog from "components/module/image/FixedAspectImageCropDialog";
import TutorPublicReferencePicker from "components/module/persona/TutorPublicReferencePicker";
import { Button, BottomSheetDialog, Dropdown, Textarea, dialog } from "@amu-labs/ui";
import { editTutorProfileImage } from "libs/api/tutors/profileImage";
import { uploadPersonaImageLibraryAsset } from "libs/api/persona/imageLibrary";
import { Eraser, Eye, ImagePlus, Sparkles, Wand2, X } from "lucide-react";
import type { PersonaFormValuesType } from "types/ai";
import {
  DEFAULT_WORLD_UNIVERSE,
  TUTORS_HUMAN_PROFILE_TEMPLATE_GROUP_KEY,
  TUTORS_MONSTER_PROFILE_TEMPLATE_GROUP_KEY,
} from "consts/app";
import { fileToDataUrl, isImageFileLike } from "utils/app/imageFile";
import {
  buildTutorProfileImageTemplateVariables,
  getTutorProfileImageForDisplay,
  setPrimaryProfileImage,
  TUTOR_PROFILE_ARTIFACT_DRAFT_PERSONA_ID_FIELD,
  TUTOR_PROFILE_IMAGE_REQUIRED_TEMPLATE_VARIABLE_KEYS,
} from "utils/app/tutorProfileImage";
import { cn } from "utils/common";
import { toErrorMessage } from "utils/common/typeUtils";
import { persistCoinUpdated } from "utils/payment";

type TutorProfileImageDraftValue = PersonaFormValuesType & {
  [TUTOR_PROFILE_ARTIFACT_DRAFT_PERSONA_ID_FIELD]?: string;
};

type TutorProfileImageSectionProps = {
  value: PersonaFormValuesType;
  onChange: (next: PersonaFormValuesType) => void;
  disabled?: boolean;
  className?: string;
  canViewProfileUsageNote?: boolean;
  layoutVariant?: "card" | "embedded";
  imageActionMode?: "create" | "edit";
  generationPresentation?: "sheet" | "embedded";
};

async function uploadProfileImageFile(args: { universeId: string; pid: string; file: File }) {
  const asset = await uploadPersonaImageLibraryAsset({
    file: args.file,
    universeId: args.universeId,
    personaId: args.pid,
    source: "uploaded_reference",
    tags: ["persona-upload"],
  });
  return String(asset.storage?.optimizedUrl || "").trim();
}

function newTutorProfileImageRequestId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return `tutor-profile-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export default function TutorProfileImageSection({
  value,
  onChange,
  disabled = false,
  className,
  canViewProfileUsageNote: _canViewProfileUsageNote = false,
  layoutVariant = "card",
  imageActionMode = "edit",
  generationPresentation = "sheet",
}: TutorProfileImageSectionProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const aiEditClientRequestIdRef = useRef<string | null>(null);
  // draft pid는 컴포넌트 수명 동안 안정적으로 유지 — useState lazy 초기화로 render 중 ref/impure 위반 회피
  const [draftPid] = useState(() => `draft_${globalThis.crypto?.randomUUID?.() || Date.now().toString(36)}`);

  const currentImageUrl = getTutorProfileImageForDisplay(value);
  const effectivePid = String(value.pid || "").trim() || draftPid;
  const effectiveUniverseId = String(value.universeId || "").trim() || DEFAULT_WORLD_UNIVERSE;

  const [errorMessage, setErrorMessage] = useState("");
  const [resultMessage, setResultMessage] = useState("");
  const [cropSource, setCropSource] = useState("");
  const [cropOpen, setCropOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [generationSheetOpen, setGenerationSheetOpen] = useState(false);
  const [generationIdempotencySeed, setGenerationIdempotencySeed] = useState("");
  const [aiEditSheetOpen, setAiEditSheetOpen] = useState(false);
  const [aiEditInstruction, setAiEditInstruction] = useState("");
  const [aiEditing, setAiEditing] = useState(false);
  const [userImagePickerOpen, setUserImagePickerOpen] = useState(false);
  const [profileViewerSrc, setProfileViewerSrc] = useState<string | null>(null);

  const isBusy = disabled || uploading || aiEditing;
  const canEditImage = !disabled;
  const hasPreviewImage = Boolean(currentImageUrl);
  const isCreateMode = imageActionMode === "create";
  const initialTemplateVariables = useMemo(
    () => buildTutorProfileImageTemplateVariables(value.personaType),
    [value.personaType],
  );
  const templateGroupKey =
    value.personaType === "monster"
      ? TUTORS_MONSTER_PROFILE_TEMPLATE_GROUP_KEY
      : TUTORS_HUMAN_PROFILE_TEMPLATE_GROUP_KEY;

  const resetMessages = useCallback(() => {
    setErrorMessage("");
    setResultMessage("");
  }, []);

  const patchPrimaryImage = useCallback(
    (nextUrl: string) => {
      onChange({
        ...value,
        [TUTOR_PROFILE_ARTIFACT_DRAFT_PERSONA_ID_FIELD]: effectivePid,
        profiles: setPrimaryProfileImage(value.profiles, nextUrl),
      } as TutorProfileImageDraftValue);
    },
    [effectivePid, onChange, value],
  );

  const processSelectedImageFile = useCallback(
    async (file: File | null) => {
      resetMessages();
      if (!file) return;

      if (!isImageFileLike(file)) {
        setErrorMessage(lang({ ko: "이미지 파일만 업로드할 수 있습니다.", en: "Only image files can be uploaded." }));
        return;
      }

      try {
        const preview = await fileToDataUrl(file);
        setCropSource(preview);
        setCropOpen(true);
      } catch {
        setErrorMessage(lang({ ko: "이미지를 불러오지 못했습니다.", en: "Failed to load the image." }));
      }
    },
    [resetMessages],
  );

  const handleFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] || null;
    event.target.value = "";
    await processSelectedImageFile(file);
  };

  const handleCropConfirm = async (result: { blob: Blob; previewUrl: string }) => {
    resetMessages();
    setUploading(true);

    try {
      const file = new File([result.blob], `${effectivePid}-profile.png`, { type: "image/png" });
      const uploadedUrl = await uploadProfileImageFile({
        universeId: effectiveUniverseId,
        pid: effectivePid,
        file,
      });

      patchPrimaryImage(uploadedUrl);
      setResultMessage(lang({ ko: "2:3 비율 프로필 이미지를 적용했습니다.", en: "Applied the 2:3 profile image." }));
    } catch (error: unknown) {
      setErrorMessage(
        toErrorMessage(
          error,
          lang({ ko: "프로필 이미지 업로드에 실패했습니다.", en: "Failed to upload the profile image." }),
        ),
      );
      throw error;
    } finally {
      setUploading(false);
    }
  };

  const handleReEditCurrentImage = () => {
    if (!currentImageUrl) return;
    resetMessages();
    setCropSource(currentImageUrl);
    setCropOpen(true);
  };

  const handleRemoveCurrentImage = () => {
    resetMessages();
    setProfileViewerSrc(null);
    patchPrimaryImage("");
    setResultMessage(lang({ ko: "현재 이미지 슬롯을 비웠습니다.", en: "Cleared the current image slot." }));
  };

  const handleOpenProfileViewer = () => {
    if (!currentImageUrl) return;
    setProfileViewerSrc(currentImageUrl);
  };

  const handleSelectUserStudioImage = (selection: { url: string; templateKey: string; templateTitle: string }) => {
    const nextUrl = String(selection.url || "").trim();
    if (!nextUrl) return;

    resetMessages();
    patchPrimaryImage(nextUrl);
    setResultMessage(
      lang({
        ko: "내 Gen Studio 공개 이미지를 대표 프로필로 적용했습니다.",
        en: "Applied my public Gen Studio image as the profile.",
      }),
    );
  };

  const handleStudioProfileImageDone = (images: string[]) => {
    const nextUrl = String(images?.[0] || "").trim();
    if (!nextUrl) return;

    resetMessages();
    patchPrimaryImage(nextUrl);
    setGenerationSheetOpen(false);
    setResultMessage(
      lang({
        ko: "Gen Studio에서 생성한 이미지를 대표 프로필로 적용했습니다.",
        en: "Applied the Gen Studio image as the primary profile.",
      }),
    );
  };

  const handleAiEditCurrentImage = async () => {
    const instruction = aiEditInstruction.trim();
    if (!currentImageUrl) return;
    if (!instruction) {
      setErrorMessage(lang({ ko: "수정 지시를 입력해 주세요.", en: "Enter an edit instruction." }));
      return;
    }

    const confirmed = await dialog.confirm({
      message: lang({
        ko: "AI 이미지 수정에는 코인이 사용됩니다. 계속할까요?",
        en: "AI image editing uses coins. Continue?",
      }),
    });
    if (!confirmed) return;

    resetMessages();
    setAiEditing(true);
    try {
      const clientRequestId = aiEditClientRequestIdRef.current || newTutorProfileImageRequestId();
      aiEditClientRequestIdRef.current = clientRequestId;
      const edited = await editTutorProfileImage({
        persona: {
          ...value,
          pid: effectivePid,
          universeId: effectiveUniverseId,
        },
        referenceImageUrl: currentImageUrl,
        instruction,
        clientRequestId,
      });

      patchPrimaryImage(edited.imageUrl);
      if (edited.billingCoins > 0) {
        persistCoinUpdated({ scope: "user", amount: -edited.billingCoins });
      }
      setAiEditInstruction("");
      setAiEditSheetOpen(false);
      aiEditClientRequestIdRef.current = null;
      setResultMessage(
        lang({
          ko: `수정 지시를 반영한 새 프로필 이미지를 적용했습니다. ${edited.billingCoins}코인이 사용되었습니다.`,
          en: `Applied a new profile image from the edit instruction. ${edited.billingCoins} coins were used.`,
        }),
      );
    } catch (error: unknown) {
      setErrorMessage(
        toErrorMessage(
          error,
          lang({
            ko: "프로필 이미지 수정에 실패했습니다. 이미지 접근 권한이나 파일 형식을 확인해 주세요.",
            en: "Failed to edit the profile image. Check image access or file format.",
          }),
        ),
      );
    } finally {
      setAiEditing(false);
    }
  };

  const handleImageRegisterAction = (action: string) => {
    if (action === "upload") {
      fileInputRef.current?.click();
      return;
    }
    if (action === "mine") setUserImagePickerOpen(true);
  };

  const renderHiddenInputs = () => (
    <>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleFileChange}
        disabled={isBusy}
      />
    </>
  );

  const renderThumbnail = (placeholderMinHeightClass = "min-h-[180px] sm:min-h-[280px]") => (
    <div
      className="relative overflow-hidden rounded-2xl border border-border/50 bg-gradient-to-br from-slate-100 via-sky-50 to-background sm:rounded-[28px] dark:from-slate-950/90 dark:via-sky-950/30 dark:to-background"
      style={{ aspectRatio: "2 / 3" }}
    >
      {hasPreviewImage ? (
        <div className="absolute right-2 bottom-2 z-10 flex gap-1.5">
          <Button
            variant="blank"
            size="icon-sm"
            className="rounded-full bg-background/85 text-primary-text shadow-sm ring-1 ring-border/60 backdrop-blur hover:bg-background"
            onClick={handleOpenProfileViewer}
            aria-label={lang({ ko: "프로필 이미지 크게 보기", en: "View larger profile image" })}
          >
            <Eye size={14} />
          </Button>
          {canEditImage ? (
            <>
              <Button
                variant="blank"
                size="icon-sm"
                className="rounded-full bg-background/85 text-primary-text shadow-sm ring-1 ring-border/60 backdrop-blur hover:bg-background"
                onClick={handleReEditCurrentImage}
                disabled={uploading}
                aria-label={lang({ ko: "프로필 이미지 재편집", en: "Re-edit profile image" })}
              >
                <Wand2 size={14} />
              </Button>
              <Button
                variant="blank"
                size="icon-sm"
                className="rounded-full bg-background/85 text-danger shadow-sm ring-1 ring-border/60 backdrop-blur hover:bg-background"
                onClick={handleRemoveCurrentImage}
                disabled={uploading}
                aria-label={lang({ ko: "프로필 이미지 제거", en: "Remove profile image" })}
              >
                <Eraser size={14} />
              </Button>
            </>
          ) : null}
        </div>
      ) : null}

      {currentImageUrl ? (
        <Image
          src={currentImageUrl}
          alt="tutor-profile"
          width={720}
          height={1080}
          className="h-full w-full object-cover"
          unoptimized
        />
      ) : (
        <div
          className={cn(
            "flex h-full flex-col items-center justify-center gap-2 px-3 text-center text-secondary-text sm:gap-3 sm:px-5",
            placeholderMinHeightClass,
          )}
        >
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-background/90 shadow-sm ring-1 ring-border/50 sm:h-14 sm:w-14 sm:rounded-2xl dark:bg-background/70">
            <ImagePlus className="h-5 w-5 sm:h-7 sm:w-7" />
          </div>
          <p className="text-xxs font-semibold text-primary-text sm:text-sm">
            <Lang text={{ ko: "아직 프로필 이미지가 없습니다.", en: "No profile image yet." }} />
          </p>
        </div>
      )}
    </div>
  );

  const renderActions = () => (
    <div className="grid gap-2">
      {renderHiddenInputs()}
      <Dropdown
        options={[
          { label: "upload", value: "upload" },
          { label: "mine", value: "mine" },
        ]}
        selected={null}
        onSelect={handleImageRegisterAction}
        type="button"
        placeholder={lang(
          isCreateMode
            ? { ko: "내 이미지로 만들기", en: "Create with my image" }
            : { ko: "내 이미지로 바꾸기", en: "Replace with my image" },
        )}
        disabled={isBusy}
        variant="secondary"
        size="sm"
        openSide="bottom"
        contentAlign="start"
        className="min-h-9 justify-center rounded-xl px-3 text-xs font-semibold sm:min-h-10 sm:px-4 sm:text-sm"
        dropdownClassName="w-48 rounded-2xl"
        itemClassName={() => "flex items-center gap-2 text-sm"}
        renderOption={(option) => (
          <>
            {option.value === "upload" ? <ImagePlus size={14} /> : null}
            {option.value === "mine" ? <Sparkles size={14} /> : null}
            {option.value === "upload" ? (
              <Lang text={{ ko: "내 컴퓨터에서 업로드", en: "Upload from my computer" }} />
            ) : null}
            {option.value === "mine" ? (
              <Lang text={{ ko: "Gen Studio 이미지 선택", en: "Choose Gen Studio image" }} />
            ) : null}
          </>
        )}
      />
      {isCreateMode ? (
        <Button
          className="min-h-9 w-full rounded-xl px-3 text-xs font-semibold sm:min-h-10 sm:px-4 sm:text-sm"
          onClick={() => {
            setGenerationIdempotencySeed(newTutorProfileImageRequestId());
            setGenerationSheetOpen(true);
          }}
          disabled={isBusy}
        >
          <Sparkles size={13} />
          <Lang text={{ ko: "AI로 이미지 생성하기", en: "Generate image with AI" }} />
        </Button>
      ) : currentImageUrl ? (
        <Button
          variant="outline"
          className="min-h-9 w-full rounded-xl px-3 text-xs font-semibold sm:min-h-10 sm:px-4 sm:text-sm"
          onClick={() => {
            resetMessages();
            setAiEditSheetOpen(true);
          }}
          disabled={isBusy}
        >
          <Wand2 size={13} />
          <Lang text={{ ko: "AI로 이미지 수정하기", en: "Edit image with AI" }} />
        </Button>
      ) : null}
      <TutorPublicReferencePicker
        disabled={isBusy}
        selectedUrl={currentImageUrl}
        onSelect={handleSelectUserStudioImage}
        source="user-public"
        triggerMode="none"
        open={userImagePickerOpen}
        onOpenChange={setUserImagePickerOpen}
      />
    </div>
  );

  const renderStatus = () => (
    <>
      {errorMessage ? <p className="text-xs text-danger">{errorMessage}</p> : null}
      {resultMessage ? <p className="text-xs text-emerald-700 dark:text-emerald-300">{resultMessage}</p> : null}
    </>
  );

  const studioEditor = (
    <div data-service-theme="gen-studio" className="p-4">
      <ImageStudioEditor
        mode="user"
        surface="embedded"
        detailPresentation="embedded"
        templateGroupKey={templateGroupKey}
        initialTemplateVariables={initialTemplateVariables}
        requiredTemplateVariableKeys={TUTOR_PROFILE_IMAGE_REQUIRED_TEMPLATE_VARIABLE_KEYS}
        lockedTemplateVariableKeys={TUTOR_PROFILE_IMAGE_REQUIRED_TEMPLATE_VARIABLE_KEYS}
        personaArtifactContext={{
          universeId: effectiveUniverseId,
          personaId: effectivePid,
          personaName: value.name,
        }}
        generationIdempotencySeed={generationIdempotencySeed}
        onDone={handleStudioProfileImageDone}
      />
    </div>
  );

  const renderGenerationSheet = () => {
    if (generationPresentation === "embedded") {
      if (!generationSheetOpen) return null;

      return (
        <section className="mt-4 overflow-hidden rounded-2xl border border-border bg-background/70">
          <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
            <h3 className="text-sm font-semibold text-primary-text">
              {lang({ ko: "AI 프로필 이미지 생성", en: "AI profile image generation" })}
            </h3>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => setGenerationSheetOpen(false)}
              aria-label={lang({ ko: "이미지 생성 닫기", en: "Close image generation" })}
            >
              <X className="icon-sm" />
            </Button>
          </div>
          {studioEditor}
        </section>
      );
    }

    return (
      <BottomSheetDialog
        open={generationSheetOpen}
        onClose={() => setGenerationSheetOpen(false)}
        title={lang({ ko: "AI 프로필 이미지 생성", en: "AI profile image generation" })}
        panelClassName="max-w-6xl"
      >
        {studioEditor}
      </BottomSheetDialog>
    );
  };

  const renderAiEditSheet = () => (
    <BottomSheetDialog
      open={aiEditSheetOpen}
      onClose={() => {
        if (!aiEditing) setAiEditSheetOpen(false);
      }}
      title={lang({ ko: "AI로 프로필 이미지 수정", en: "Edit profile image with AI" })}
      panelClassName="max-w-3xl"
    >
      <div className="grid gap-4 sm:grid-cols-[12rem_1fr]">
        <div className="mx-auto w-full max-w-[12rem] overflow-hidden rounded-2xl border border-border/50 bg-surface">
          {currentImageUrl ? (
            <Image
              src={currentImageUrl}
              alt="tutor-profile-edit-reference"
              width={480}
              height={720}
              className="aspect-[2/3] h-auto w-full object-cover"
              unoptimized
            />
          ) : null}
        </div>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-primary-text">
              <Lang text={{ ko: "수정 지시", en: "Edit instruction" }} />
            </label>
            <Textarea
              rows={5}
              value={aiEditInstruction}
              disabled={aiEditing}
              onChange={(event) => setAiEditInstruction(event.target.value.slice(0, 500))}
              placeholder={lang({
                ko: "예) 얼굴과 포즈는 유지하고, 더 밝은 스튜디오 조명과 선명한 배경으로 바꿔줘.",
                en: "Example: Keep the face and pose, but change to brighter studio lighting and a cleaner background.",
              })}
              className="resize-none"
            />
            <div className="flex justify-end text-xxs tabular-nums text-secondary-text/70">
              {aiEditInstruction.length}/500
            </div>
          </div>
          <p className="text-xs leading-relaxed text-secondary-text">
            <Lang
              text={{
                ko: "현재 대표 이미지를 레퍼런스로 사용하며, 생성 시 이미지 모델 사용량에 따라 코인이 차감됩니다.",
                en: "The current primary image is used as a reference, and coins are charged by image model usage.",
              }}
            />
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => setAiEditSheetOpen(false)} disabled={aiEditing}>
              <Lang text={{ ko: "취소", en: "Cancel" }} />
            </Button>
            <Button
              size="sm"
              onClick={() => void handleAiEditCurrentImage()}
              disabled={aiEditing || !aiEditInstruction.trim()}
              loading={aiEditing}
            >
              <Sparkles size={13} />
              <Lang text={{ ko: "수정 이미지 생성", en: "Generate edit" }} />
            </Button>
          </div>
        </div>
      </div>
    </BottomSheetDialog>
  );

  const renderCropDialog = () => (
    <FixedAspectImageCropDialog
      open={cropOpen}
      imageSrc={cropSource}
      onOpenChange={setCropOpen}
      onConfirm={handleCropConfirm}
      disabled={isBusy}
    />
  );

  return (
    <div
      className={cn(
        layoutVariant === "card" && "overflow-hidden rounded-2xl border border-border/60 bg-card shadow-sm",
        layoutVariant === "embedded" && "min-w-0",
        className,
      )}
    >
      {layoutVariant === "card" ? (
        <div className="px-4 pt-4">
          <div className="flex flex-wrap items-center gap-2">
            <div className="text-sm font-semibold text-primary-text">
              <Lang text={{ ko: "Tutor 포토 프로필 이미지 만들기", en: "Create tutor photo profile image" }} />
            </div>
            <span className="rounded-full bg-rose-100 px-2.5 py-1 text-xxs font-semibold text-rose-700 dark:bg-rose-950/40 dark:text-rose-200">
              <Lang text={{ ko: "필수", en: "Required" }} />
            </span>
          </div>
        </div>
      ) : null}

      <div
        className={cn(
          "flex flex-col items-center gap-3 sm:flex-row sm:items-start sm:gap-4",
          layoutVariant === "card" ? "p-3 sm:p-4" : "p-0 lg:flex-col lg:items-stretch lg:gap-3",
        )}
      >
        <div className={cn("min-w-0", layoutVariant === "card" ? "max-w-[12rem]" : "w-full max-w-[13rem] mx-auto")}>
          {renderThumbnail("min-h-[12rem] sm:min-h-[15rem]")}
        </div>
        <div
          className={cn(
            "min-w-0 space-y-3",
            layoutVariant === "embedded" && "w-full text-center sm:flex-1 lg:flex-none",
          )}
        >
          {!resultMessage ? renderActions() : null}
          {renderStatus()}
        </div>
      </div>

      {renderGenerationSheet()}
      {renderAiEditSheet()}
      <FixedImageViewer
        open={Boolean(profileViewerSrc)}
        src={profileViewerSrc}
        images={currentImageUrl ? [currentImageUrl] : []}
        initialIndex={0}
        onOpenChange={(open) => {
          if (!open) setProfileViewerSrc(null);
        }}
        alt="tutor-profile"
      />
      {renderCropDialog()}
    </div>
  );
}
