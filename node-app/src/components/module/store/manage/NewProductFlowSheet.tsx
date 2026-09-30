"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { Camera, Download, Plus, Upload, X } from "lucide-react";
import { SMARTSTORE_CREATE_ALLOWLIST_PRESETS } from "consts/commerce/smartstore";
import { Button, Input, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@amu-labs/ui";
import { Lang, lang } from "components/module/i18n";

/**
 * @docHint
 * @purpose P1 D8 — Quick Start 시트. "새 상품 만들기"의 시작 방법만 선택하고 실제 등록 작업은
 *          create shell(view=create Stepper)에 위임한다(설계 제안 §4.1).
 *          선택 즉시 draft가 생성되는 draft-backed 계약(D2)이므로 여기서 긴 폼을 받지 않는다.
 *          "기존 상품 불러오기"는 운영 시트의 네이버 가져오기 흐름으로 연결한다.
 * @domain commerce.naver
 * @scope client
 */

export type NewProductFlowSubmitParams = {
  mode: "photos" | "blank";
  title: string;
  categoryPolicyGroup: string;
  photos: File[];
};

type NewProductFlowSheetProps = {
  open: boolean;
  submitting: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (params: NewProductFlowSubmitParams) => void;
  onOpenImport: () => void;
};

type QuickStartMode = "choice" | "photos" | "blank";

const MAX_FLOW_PHOTOS = 8;

export function NewProductFlowSheet({
  open,
  submitting,
  onOpenChange,
  onSubmit,
  onOpenImport,
}: NewProductFlowSheetProps) {
  const [mode, setMode] = useState<QuickStartMode>("choice");
  const [title, setTitle] = useState("");
  const [categoryPolicyGroup, setCategoryPolicyGroup] = useState("");
  const [photos, setPhotos] = useState<File[]>([]);
  const photoInputRef = useRef<HTMLInputElement | null>(null);

  const photoPreviews = useMemo(() => photos.map((file) => URL.createObjectURL(file)), [photos]);

  const selectedPreset = SMARTSTORE_CREATE_ALLOWLIST_PRESETS.find((item) => item.group === categoryPolicyGroup);

  const addPhotos = useCallback((files: FileList | null) => {
    if (!files?.length) return;
    setPhotos((prev) => [...prev, ...Array.from(files)].slice(0, MAX_FLOW_PHOTOS));
  }, []);

  const removePhoto = useCallback((index: number) => {
    setPhotos((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const choiceOptions: Array<{
    key: QuickStartMode | "import";
    icon: typeof Camera;
    title: { ko: string; en: string };
    description: { ko: string; en: string };
  }> = [
    {
      key: "photos",
      icon: Camera,
      title: { ko: "상품 사진으로 시작", en: "Start with product photos" },
      description: {
        ko: "제품 사진을 올리고 카테고리만 고르면 등록 Stepper가 이어집니다.",
        en: "Upload product photos, pick a category, and continue in the registration stepper.",
      },
    },
    {
      key: "import",
      icon: Download,
      title: { ko: "기존 상품 불러오기", en: "Import an existing product" },
      description: {
        ko: "네이버 스마트스토어 상품번호로 기존 상품을 가져옵니다.",
        en: "Import an existing product by its Smart Store product number.",
      },
    },
    {
      key: "blank",
      icon: Plus,
      title: { ko: "빈 상품으로 시작", en: "Start from scratch" },
      description: {
        ko: "카테고리만 고르고 빈 초안을 만듭니다. 내용은 Stepper에서 채워요.",
        en: "Pick a category and create an empty draft. Fill it in the stepper.",
      },
    },
  ];

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="flex max-h-[calc(100dvh-1rem)] flex-col overflow-hidden rounded-t-[1.25rem] bg-surface p-0 sm:mx-auto sm:max-w-[34rem]"
      >
        <SheetHeader className="shrink-0 border-b border-border px-5 py-4 pr-14 text-left">
          <SheetTitle>
            <Lang text={{ ko: "새 상품 만들기", en: "New Product" }} />
          </SheetTitle>
          <SheetDescription>
            <Lang
              text={
                mode === "choice"
                  ? { ko: "어떻게 시작할까요?", en: "How would you like to start?" }
                  : mode === "photos"
                    ? {
                        ko: "제품 사진과 카테고리를 고르면 등록이 이어집니다.",
                        en: "Pick product photos and a category to continue.",
                      }
                    : {
                        ko: "판매 카테고리를 선택하면 빈 초안을 만들어 드려요.",
                        en: "Pick a category and we will create an empty draft.",
                      }
              }
            />
          </SheetDescription>
        </SheetHeader>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4">
          {mode === "choice" ? (
            <div className="space-y-2" role="radiogroup" aria-label={lang({ ko: "시작 방법", en: "Start method" })}>
              {choiceOptions.map((option) => {
                const Icon = option.icon;
                return (
                  <button
                    key={option.key}
                    type="button"
                    className="flex w-full items-start gap-3 rounded-[1rem] border border-border bg-background/70 px-4 py-3.5 text-left transition hover:border-primary/50"
                    disabled={option.key === "import"}
                    onClick={() => {
                      if (option.key === "import") {
                        onOpenImport();
                        return;
                      }
                      setMode(option.key as QuickStartMode);
                    }}
                  >
                    <Icon className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold text-primary-text">
                        <Lang text={option.title} />
                      </span>
                      <span className="mt-0.5 block text-xs leading-5 text-secondary-text">
                        <Lang text={option.description} />
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          ) : null}

          {mode !== "choice" ? (
            <div className="space-y-2">
              <label className="text-xs font-semibold uppercase tracking-[0.18em] text-secondary-text">
                <Lang text={{ ko: "카테고리 유형", en: "Category Type" }} />
              </label>
              <Select
                value={categoryPolicyGroup}
                onValueChange={(value) => setCategoryPolicyGroup(String(value || ""))}
              >
                <SelectTrigger>
                  <SelectValue placeholder={lang({ ko: "판매할 카테고리 선택", en: "Select a category group" })} />
                </SelectTrigger>
                <SelectContent>
                  {SMARTSTORE_CREATE_ALLOWLIST_PRESETS.map((preset) => (
                    <SelectItem key={preset.group} value={preset.group}>
                      {lang(preset.label)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectedPreset ? (
                <p className="text-xxs leading-5 text-secondary-text">{lang(selectedPreset.description)}</p>
              ) : null}
            </div>
          ) : null}

          {mode === "photos" ? (
            <div className="space-y-2">
              <label className="text-xs font-semibold uppercase tracking-[0.18em] text-secondary-text">
                <Lang text={{ ko: "제품 사진", en: "Product Photos" }} />
              </label>
              <div className="grid grid-cols-4 gap-2">
                {photoPreviews.map((preview, index) => (
                  <div
                    key={`flow-photo-${index}`}
                    className="relative aspect-square overflow-hidden rounded-[0.8rem] border border-border bg-background"
                  >
                    <Image src={preview} alt="" fill unoptimized sizes="120px" className="object-cover" />
                    <button
                      type="button"
                      className="absolute right-1 top-1 inline-flex h-6 w-6 items-center justify-center rounded-full bg-background/90 text-secondary-text shadow-sm hover:text-danger"
                      aria-label={lang({ ko: "사진 제거", en: "Remove photo" })}
                      onClick={() => removePhoto(index)}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
                {photos.length < MAX_FLOW_PHOTOS ? (
                  <button
                    type="button"
                    className="flex aspect-square flex-col items-center justify-center gap-1 rounded-[0.8rem] border border-dashed border-border text-secondary-text transition hover:border-primary hover:text-primary"
                    onClick={() => photoInputRef.current?.click()}
                  >
                    <Upload className="h-4 w-4" />
                    <span className="text-xxs font-semibold">
                      <Lang text={{ ko: "추가", en: "Add" }} />
                    </span>
                  </button>
                ) : null}
              </div>
              <input
                ref={photoInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                multiple
                className="hidden"
                onChange={(event) => {
                  addPhotos(event.target.files);
                  event.target.value = "";
                }}
              />
              <div className="space-y-2">
                <label className="text-xs font-semibold uppercase tracking-[0.18em] text-secondary-text">
                  <Lang text={{ ko: "상품 이름 (선택)", en: "Product Title (optional)" }} />
                </label>
                <Input
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  placeholder={lang({ ko: "예: 여름 린넨 오버핏 셔츠", en: "e.g. Summer linen overfit shirt" })}
                />
              </div>
              <p className="rounded-[0.9rem] border border-border bg-background/70 px-3 py-2.5 text-xxs leading-5 text-secondary-text">
                <Lang
                  text={{
                    ko: "사진은 나중에 Stepper의 이미지 단계에서 추가·수정할 수 있어요.",
                    en: "Photos can be added or changed later in the stepper's image step.",
                  }}
                />
              </p>
            </div>
          ) : null}
        </div>

        <div className="shrink-0 border-t border-border bg-surface px-5 py-3">
          {mode !== "choice" ? (
            <Button
              className="w-full"
              disabled={!categoryPolicyGroup}
              loading={submitting}
              onClick={() =>
                onSubmit({
                  mode: mode === "photos" ? "photos" : "blank",
                  title: title.trim(),
                  categoryPolicyGroup,
                  photos,
                })
              }
            >
              {mode === "photos" ? (
                <Lang text={{ ko: "사진 올리고 등록 시작", en: "Upload & start registration" }} />
              ) : (
                <Lang text={{ ko: "빈 초안 만들기", en: "Create empty draft" }} />
              )}
            </Button>
          ) : null}
        </div>
      </SheetContent>
    </Sheet>
  );
}
