"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { TUTOR_PROFILE_IMAGE_PUBLIC_SAMPLE_LIMIT } from "consts/tutors";
import { resolveGenStudioTemplateLabel } from "consts/app";
import { Lang, lang } from "components/module/i18n";
import { BottomSheetDialog, Button, SegmentedControl } from "@amu-labs/ui";
import { ImageBox } from "components/module/image";
import { usePublicStudioImageMetas } from "hooks/app/usePublicStudioImageMetas";
import { listImagePrompts, listStudioImageMetas, listStudioImageTemplatePreviewMetas } from "libs/api/lab";
import { Check, ChevronsUpDown, Images, Sparkles } from "lucide-react";
import type { PromptItemType, PromptVisibilityType } from "types/app";
import { cn } from "utils/common";
import { toTimestamp } from "utils/common/typeUtils";

type TutorPublicReferencePickerProps = {
  disabled?: boolean;
  selectedUrl?: string;
  selectedTemplateKey?: string;
  onSelect: (selection: { url: string; templateKey: string; templateTitle: string }) => void;
  source?: "public-samples" | "user-public";
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  triggerMode?: "button" | "none";
  buttonText?: { ko: string; en: string };
};

type UserStudioImageChoice = {
  url: string;
  templateKey: string;
  templateTitle: string;
  visibility: PromptVisibilityType;
  createdAt: number;
};

type UserStudioSortMode = "latest" | "oldest" | "template";

const USER_STUDIO_IMAGE_PICKER_LIMIT = 200;

const USER_STUDIO_SORT_OPTIONS: { value: UserStudioSortMode; label: { ko: string; en: string } }[] = [
  { value: "latest", label: { ko: "최신순", en: "Latest" } },
  { value: "oldest", label: { ko: "오래된순", en: "Oldest" } },
  { value: "template", label: { ko: "템플릿순", en: "By template" } },
];

function getTemplatePreviewUrl(template: PromptItemType, previewMap: Record<string, string>) {
  return String(previewMap[template.key] || template.defaultParams?.previewImage || "").trim();
}

function getTemplateTitleMap(items: PromptItemType[]) {
  return items.reduce<Record<string, string>>((acc, item) => {
    const key = String(item?.key || "").trim();
    if (!key) return acc;
    acc[key] = String(item?.title || key).trim();
    return acc;
  }, {});
}

function toSafeTemplateText(value: unknown) {
  return String(value || "").trim();
}

export default function TutorPublicReferencePicker({
  disabled = false,
  selectedUrl,
  selectedTemplateKey,
  onSelect,
  source = "public-samples",
  open: controlledOpen,
  onOpenChange,
  triggerMode = "button",
  buttonText = { ko: "Gen Studio에서 선택", en: "Choose from Gen Studio" },
}: TutorPublicReferencePickerProps) {
  const [templates, setTemplates] = useState<PromptItemType[]>([]);
  const [previewMap, setPreviewMap] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const [activeTemplate, setActiveTemplate] = useState<PromptItemType | null>(null);
  const [userTemplateDraft, setUserTemplateDraft] = useState("");
  const [userTemplateSearchDraft, setUserTemplateSearchDraft] = useState("");
  const [userTemplateSearchDirty, setUserTemplateSearchDirty] = useState(false);
  const [userTemplatePickerOpen, setUserTemplatePickerOpen] = useState(false);
  const [userTemplateItems, setUserTemplateItems] = useState<PromptItemType[]>([]);
  const [userStudioImages, setUserStudioImages] = useState<UserStudioImageChoice[]>([]);
  const [userSortMode, setUserSortMode] = useState<UserStudioSortMode>("latest");
  const userTemplatePickerRef = useRef<HTMLDivElement | null>(null);
  const open = controlledOpen ?? uncontrolledOpen;
  const setOpen = (nextOpen: boolean) => {
    if (!nextOpen) {
      setUserTemplatePickerOpen(false);
      setUserTemplateSearchDraft("");
      setUserTemplateSearchDirty(false);
      setUserSortMode("latest");
    }
    onOpenChange?.(nextOpen);
    if (controlledOpen == null) setUncontrolledOpen(nextOpen);
  };

  useEffect(() => {
    let mounted = true;

    void (async () => {
      try {
        setLoading(true);
        setError("");
        if (source === "user-public") {
          const [rows, promptItems] = await Promise.all([
            listStudioImageMetas({
              scope: "user",
              limit: USER_STUDIO_IMAGE_PICKER_LIMIT,
            }),
            listImagePrompts({ enabled: true }),
          ]);

          if (!mounted) return;

          const titleMap = getTemplateTitleMap(((promptItems || []) as PromptItemType[]).filter((item) => item?.key));
          setUserTemplateItems(((promptItems || []) as PromptItemType[]).filter((item) => item?.key));
          setUserStudioImages(
            rows
              .map<UserStudioImageChoice>((row) => ({
                url: String(row?.url || "").trim(),
                templateKey: String(row?.templateKey || "").trim(),
                templateTitle:
                  resolveGenStudioTemplateLabel(
                    String(row?.templateKey || "").trim(),
                    titleMap[String(row?.templateKey || "").trim()],
                  ) || "Gen Studio",
                visibility: row?.visibility === "public" ? "public" : "private",
                createdAt: toTimestamp(row?.createdAt),
              }))
              .filter((row) => Boolean(row.url)),
          );
          setUserTemplateDraft("");
          setUserTemplateSearchDraft("");
          setUserTemplateSearchDirty(false);
          setUserTemplatePickerOpen(false);
          setTemplates([]);
          setPreviewMap({});
          return;
        }

        setUserStudioImages([]);
        setUserTemplateItems([]);
        setUserTemplateDraft("");
        setUserTemplateSearchDraft("");
        setUserTemplateSearchDirty(false);
        setUserTemplatePickerOpen(false);
        const promptItems = (((await listImagePrompts({ enabled: true })) || []) as PromptItemType[]).filter((item) =>
          Boolean(item?.key),
        );
        const previewRows = await listStudioImageTemplatePreviewMetas({
          templateKeys: promptItems.map((item) => item.key),
          perTemplate: 1,
        });

        if (!mounted) return;

        const nextPreviewMap = promptItems.reduce<Record<string, string>>((acc, item) => {
          const publicPreview = String(previewRows?.[item.key]?.[0]?.url || "").trim();
          const fallbackPreview = String(item.defaultParams?.previewImage || "").trim();
          const resolved = publicPreview || fallbackPreview;
          if (resolved) acc[item.key] = resolved;
          return acc;
        }, {});

        setTemplates(promptItems.filter((item) => Boolean(getTemplatePreviewUrl(item, nextPreviewMap))));
        setPreviewMap(nextPreviewMap);
      } catch {
        if (!mounted) return;
        setTemplates([]);
        setPreviewMap({});
        setError(
          lang({ ko: "공개 템플릿 이미지를 불러오지 못했습니다.", en: "Failed to load public template images." }),
        );
      } finally {
        if (mounted) setLoading(false);
      }
    })();

    return () => {
      mounted = false;
    };
  }, [source]);

  useEffect(() => {
    if (!userTemplatePickerOpen) return;

    const handlePointerDown = (event: MouseEvent | TouchEvent) => {
      const node = userTemplatePickerRef.current;
      if (!node || node.contains(event.target as Node)) return;
      setUserTemplatePickerOpen(false);
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("touchstart", handlePointerDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("touchstart", handlePointerDown);
    };
  }, [userTemplatePickerOpen]);

  const userTemplateItemByKey = useMemo(() => {
    return userTemplateItems.reduce<Record<string, PromptItemType>>((acc, item) => {
      const key = String(item?.key || "").trim();
      if (key) acc[key] = item;
      return acc;
    }, {});
  }, [userTemplateItems]);

  const userTemplateOptions = useMemo(() => {
    const map = new Map<string, string>();
    userStudioImages.forEach((item) => {
      const key = toSafeTemplateText(item.templateKey);
      if (!key || map.has(key)) return;
      map.set(key, item.templateTitle || key);
    });

    return Array.from(map.entries())
      .sort((a, b) => a[1].localeCompare(b[1]))
      .map(([key, title]) => ({
        key,
        title,
      }));
  }, [userStudioImages]);

  const normalizedUserTemplateDraft = toSafeTemplateText(userTemplateDraft);
  const normalizedUserTemplateSearchDraft = toSafeTemplateText(userTemplateSearchDraft).toLowerCase();
  const userTemplateInputValue = userTemplateSearchDirty ? userTemplateSearchDraft : userTemplateDraft;

  const filteredUserTemplateOptions = useMemo(() => {
    if (!userTemplateSearchDirty || !normalizedUserTemplateSearchDraft) return userTemplateOptions;

    return userTemplateOptions.filter((option) => {
      const key = option.key.toLowerCase();
      const title = option.title.toLowerCase();
      return key.includes(normalizedUserTemplateSearchDraft) || title.includes(normalizedUserTemplateSearchDraft);
    });
  }, [normalizedUserTemplateSearchDraft, userTemplateOptions, userTemplateSearchDirty]);

  const filteredUserStudioImages = useMemo(() => {
    const query = toSafeTemplateText(
      userTemplateSearchDirty ? userTemplateSearchDraft : userTemplateDraft,
    ).toLowerCase();
    if (!query) return userStudioImages;

    return userStudioImages.filter((item) => {
      const template = userTemplateItemByKey[item.templateKey];
      const key = toSafeTemplateText(template?.key || item.templateKey).toLowerCase();
      const title = toSafeTemplateText(template?.title || item.templateTitle).toLowerCase();
      return key.includes(query) || title.includes(query);
    });
  }, [userStudioImages, userTemplateDraft, userTemplateItemByKey, userTemplateSearchDirty, userTemplateSearchDraft]);

  const sortedUserStudioImages = useMemo(() => {
    const items = [...filteredUserStudioImages];
    if (userSortMode === "oldest") {
      items.sort((a, b) => a.createdAt - b.createdAt);
    } else if (userSortMode === "template") {
      items.sort((a, b) => {
        const titleCompare = (a.templateTitle || a.templateKey).localeCompare(b.templateTitle || b.templateKey);
        if (titleCompare !== 0) return titleCompare;
        return b.createdAt - a.createdAt;
      });
    } else {
      items.sort((a, b) => b.createdAt - a.createdAt);
    }
    return items;
  }, [filteredUserStudioImages, userSortMode]);

  const handleSelectUserTemplateFilter = (templateKey: string) => {
    setUserTemplateDraft(templateKey);
    setUserTemplateSearchDraft("");
    setUserTemplateSearchDirty(false);
    setUserTemplatePickerOpen(false);
  };

  const templatesKey = useMemo(() => templates.map((template) => template.key).join("|"), [templates]);

  // templates/selectedTemplateKey 변화에 따라 활성 템플릿을 동기화 — adjusting state during render 패턴
  const [trackedTemplateKey, setTrackedTemplateKey] = useState<{ key: string; templatesKey: string }>({
    key: selectedTemplateKey ?? "",
    templatesKey,
  });
  if (trackedTemplateKey.key !== (selectedTemplateKey ?? "") || trackedTemplateKey.templatesKey !== templatesKey) {
    setTrackedTemplateKey({ key: selectedTemplateKey ?? "", templatesKey });
    if (templates.length === 0) {
      setActiveTemplate(null);
    } else {
      setActiveTemplate((prev) => {
        const selected = templates.find((template) => template.key === selectedTemplateKey);
        if (selected) return selected;
        if (prev && templates.some((template) => template.key === prev.key)) return prev;
        return templates[0] || null;
      });
    }
  }

  const activePreviewUrl = activeTemplate ? getTemplatePreviewUrl(activeTemplate, previewMap) : "";
  const { images: sampleImages, isLoading: sampleLoading } = usePublicStudioImageMetas({
    limit: TUTOR_PROFILE_IMAGE_PUBLIC_SAMPLE_LIMIT,
    templateKey: activeTemplate?.key,
    generationMode: "template",
  });

  const sampleUrls = useMemo(() => {
    const urls = Array.from(new Set(sampleImages.map((item) => String(item?.url || "").trim()).filter(Boolean)));

    if (activePreviewUrl && !urls.includes(activePreviewUrl)) {
      return [activePreviewUrl, ...urls].slice(0, TUTOR_PROFILE_IMAGE_PUBLIC_SAMPLE_LIMIT);
    }

    return urls.slice(0, TUTOR_PROFILE_IMAGE_PUBLIC_SAMPLE_LIMIT);
  }, [activePreviewUrl, sampleImages]);

  return (
    <>
      {triggerMode === "button" ? (
        <Button
          variant="outline"
          className="min-h-9 rounded-xl border-border/60 bg-background/70 px-3 text-xs sm:min-h-10 sm:px-4 sm:text-sm"
          onClick={() => setOpen(true)}
          disabled={disabled}
        >
          <Sparkles size={13} />
          <Lang text={buttonText} />
        </Button>
      ) : null}

      <BottomSheetDialog
        open={open}
        onClose={() => setOpen(false)}
        title={lang(
          source === "user-public"
            ? { ko: "내 Gen Studio 이미지 선택", en: "Select my Gen Studio image" }
            : { ko: "Gen Studio 공개 이미지 선택", en: "Select a public Gen Studio image" },
        )}
      >
        <div className="space-y-4 px-4 py-4 sm:px-5">
          {source === "user-public" ? (
            <>
              {error ? <p className="text-xs text-danger">{error}</p> : null}
              {loading ? (
                <div className="rounded-2xl border border-dashed border-border/60 px-4 py-6 text-center text-xs text-secondary-text">
                  <Lang
                    text={{ ko: "내 Gen Studio 이미지를 불러오는 중입니다.", en: "Loading my Gen Studio images." }}
                  />
                </div>
              ) : userStudioImages.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-border/60 px-4 py-6 text-center text-xs text-secondary-text">
                  <Lang
                    text={{
                      ko: "Gen Studio에서 생성한 이미지가 아직 없습니다.",
                      en: "No Gen Studio images generated by you yet.",
                    }}
                  />
                </div>
              ) : (
                <>
                  <div className="space-y-2">
                    <div className="text-sm font-semibold text-primary-text sr-only">
                      <Lang text={{ ko: "템플릿 필터", en: "Template filter" }} />
                    </div>
                    <div ref={userTemplatePickerRef} className="relative">
                      <div
                        className={cn(
                          "flex items-center rounded-xl border border-input bg-surface pl-3 pr-1 focus-within:ring-2 focus-within:ring-primary/20",
                          userTemplatePickerOpen && "border-primary/60",
                        )}
                      >
                        <input
                          value={userTemplateInputValue}
                          onChange={(event) => {
                            const nextValue = event.target.value;
                            setUserTemplateDraft(nextValue);
                            setUserTemplateSearchDraft(nextValue);
                            setUserTemplateSearchDirty(true);
                            setUserTemplatePickerOpen(true);
                          }}
                          onFocus={() => {
                            setUserTemplatePickerOpen(true);
                            setUserTemplateSearchDraft("");
                            setUserTemplateSearchDirty(false);
                          }}
                          onKeyDown={(event) => {
                            if (event.key === "Escape") setUserTemplatePickerOpen(false);
                          }}
                          placeholder={lang({
                            ko: "템플릿 키 검색 또는 직접 입력",
                            en: "Search template key or type directly",
                          })}
                          aria-label={lang({ ko: "템플릿 키 필터", en: "Template key filter" })}
                          className="h-10 w-full bg-transparent text-sm text-primary-text outline-none placeholder:text-secondary-text/50"
                        />
                        <Button
                          variant="blank"
                          rounded="full"
                          size="icon-xs"
                          onClick={() => {
                            setUserTemplatePickerOpen((prev) => {
                              const nextOpen = !prev;
                              if (nextOpen) {
                                setUserTemplateSearchDraft("");
                                setUserTemplateSearchDirty(false);
                              }
                              return nextOpen;
                            });
                          }}
                          className="text-secondary-text hover:text-primary-text"
                        >
                          <ChevronsUpDown className="h-4 w-4" />
                        </Button>
                      </div>

                      {userTemplatePickerOpen ? (
                        <div className="absolute left-0 right-0 top-[calc(100%+0.375rem)] z-[80] overflow-hidden rounded-xl border border-border/70 bg-black/95 text-white shadow-2xl">
                          <div className="max-h-64 overflow-y-auto py-1">
                            <button
                              type="button"
                              onClick={() => handleSelectUserTemplateFilter("")}
                              className={cn(
                                "flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm text-white/85 transition hover:bg-white/8",
                                !normalizedUserTemplateDraft && "bg-white/10 text-white",
                              )}
                            >
                              <span>
                                <Lang text={{ ko: "전체 템플릿", en: "All templates" }} />
                              </span>
                              {!normalizedUserTemplateDraft ? <Check className="h-3.5 w-3.5" /> : null}
                            </button>

                            {filteredUserTemplateOptions.length > 0 ? (
                              filteredUserTemplateOptions.map((option) => {
                                const isSelected = normalizedUserTemplateDraft === option.key;
                                return (
                                  <button
                                    key={option.key}
                                    type="button"
                                    onClick={() => handleSelectUserTemplateFilter(option.key)}
                                    className={cn(
                                      "flex w-full items-center justify-between gap-3 px-3 py-2 text-left transition hover:bg-white/8",
                                      isSelected && "bg-white/10",
                                    )}
                                  >
                                    <div className="min-w-0">
                                      <p className={cn("truncate text-sm text-white/90", isSelected && "text-white")}>
                                        {option.title}
                                      </p>
                                      <p className="truncate text-xxs text-white/50">{option.key}</p>
                                    </div>
                                    {isSelected ? <Check className="h-3.5 w-3.5 shrink-0 text-white" /> : null}
                                  </button>
                                );
                              })
                            ) : (
                              <div className="px-3 py-3 text-xxs text-white/60">
                                <Lang
                                  text={{
                                    ko: "일치하는 템플릿이 없습니다. 현재 입력값으로 이미지를 필터링합니다.",
                                    en: "No matching templates. Images are filtered by the current input.",
                                  }}
                                />
                              </div>
                            )}
                          </div>
                        </div>
                      ) : null}
                    </div>

                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xxs font-medium text-secondary-text">
                        <Lang text={{ ko: "정렬", en: "Sort" }} />
                      </span>
                      <SegmentedControl
                        size="xs"
                        value={userSortMode}
                        onValueChange={setUserSortMode}
                        options={USER_STUDIO_SORT_OPTIONS.map((option) => ({
                          value: option.value,
                          label: <Lang text={option.label} />,
                          ariaLabel: lang(option.label),
                        }))}
                        ariaLabel={lang({ ko: "이미지 정렬", en: "Sort images" })}
                      />
                    </div>
                  </div>

                  {sortedUserStudioImages.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-border/60 px-4 py-6 text-center text-xs text-secondary-text">
                      <Lang
                        text={{
                          ko: "선택한 템플릿으로 생성한 이미지가 없습니다.",
                          en: "No images were generated with the selected template.",
                        }}
                      />
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3">
                      {sortedUserStudioImages.map((item) => {
                        const active = selectedUrl === item.url;

                        return (
                          <Button
                            key={item.url}
                            variant="blank"
                            onClick={() => {
                              onSelect(item);
                              setOpen(false);
                            }}
                            className={cn(
                              "overflow-hidden border border-border/50 bg-background text-left transition-colors",
                              active && "border-sky-400 ring-1 ring-sky-300",
                            )}
                            noWrap={false}
                          >
                            <div className="aspect-[2/3] overflow-hidden bg-muted/30 rounded-lg">
                              <ImageBox
                                src={item.url}
                                alt={item.templateTitle || "my-gen-studio-image"}
                                className="h-full w-full"
                                width="100%"
                                height="100%"
                                objectFit="object-cover"
                              />
                            </div>
                            <div className="flex min-h-[4.5rem] flex-col py-3 text-xs font-medium">
                              <div className="flex gap-1 line-clamp-2 text-primary-text">
                                <span>
                                  <span
                                    className={cn(
                                      "rounded-full px-2 py-0.5 text-xxs font-semibold",
                                      item.visibility === "public"
                                        ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-200"
                                        : "bg-muted text-secondary-text",
                                    )}
                                  >
                                    <Lang
                                      text={
                                        item.visibility === "public"
                                          ? { ko: "공개", en: "Public" }
                                          : { ko: "비공개", en: "Private" }
                                      }
                                    />
                                  </span>
                                </span>
                                <span className="flex-1">{item.templateTitle}</span>
                              </div>
                            </div>
                          </Button>
                        );
                      })}
                    </div>
                  )}
                </>
              )}
            </>
          ) : (
            <>
              <div className="rounded-2xl border border-amber-200/70 bg-amber-50/80 px-4 py-3 text-xs leading-5 text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-100">
                <Lang
                  text={{
                    ko: "Gen Studio의 이미지는 튜터 생성을 위한 참고 이미지로만 제공됩니다. 직접 튜터 이미지로 저장되지는 않습니다.",
                    en: "Gen Studio images are provided only as tutor-generation references and are not saved directly as tutor images.",
                  }}
                />
              </div>

              {error ? <p className="text-xs text-danger">{error}</p> : null}

              {loading ? (
                <div className="rounded-2xl border border-dashed border-border/60 px-4 py-6 text-center text-xs text-secondary-text">
                  <Lang
                    text={{ ko: "공개 템플릿 이미지를 불러오는 중입니다.", en: "Loading public template images." }}
                  />
                </div>
              ) : templates.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-border/60 px-4 py-6 text-center text-xs text-secondary-text">
                  <Lang
                    text={{
                      ko: "선택 가능한 공개 템플릿 이미지가 아직 없습니다.",
                      en: "No public template images are available yet.",
                    }}
                  />
                </div>
              ) : (
                <>
                  <div className="space-y-2">
                    <div className="text-sm font-semibold text-primary-text">
                      <Lang text={{ ko: "템플릿 선택", en: "Choose a template" }} />
                    </div>
                    <div className="grid grid-cols-2 gap-2 sm:gap-3">
                      {templates.map((template) => {
                        const previewUrl = getTemplatePreviewUrl(template, previewMap);
                        const isSelected = activeTemplate?.key === template.key;

                        return (
                          <button
                            key={template.key}
                            type="button"
                            onClick={() => setActiveTemplate(template)}
                            className={cn(
                              "overflow-hidden rounded-[22px] border border-border/50 bg-background text-left transition-colors",
                              isSelected && "border-sky-400 ring-1 ring-sky-300",
                            )}
                          >
                            <div className="border-b border-border/40 bg-muted/20 p-1.5 sm:p-2">
                              <div className="overflow-hidden rounded-xl sm:rounded-[16px]">
                                <ImageBox
                                  src={previewUrl}
                                  alt={template.title}
                                  className="h-auto w-full"
                                  width="100%"
                                  height="auto"
                                  objectFit="object-cover"
                                />
                              </div>
                            </div>
                            <div className="space-y-0.5 px-2 py-2 sm:space-y-1 sm:px-3 sm:py-3">
                              <div className="line-clamp-1 text-xs font-semibold text-primary-text sm:text-sm">
                                {template.title}
                              </div>
                              <p className="line-clamp-2 text-xxs leading-4 text-secondary-text sm:text-xs sm:leading-5">
                                {String(template.usageTip || template.categories?.join(", ") || template.key || "")}
                              </p>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="text-sm font-semibold text-primary-text">
                      {activeTemplate?.title || lang({ ko: "공개 샘플 이미지", en: "Public sample images" })}
                    </div>
                    <p className="text-xs leading-5 text-secondary-text">
                      {activeTemplate?.usageTip ||
                        lang({
                          ko: "아래 샘플 중 1장을 선택하면 Tutors 프로필 이미지 생성 시 reference로 사용합니다.",
                          en: "Pick one sample below to use as the Tutors profile image reference.",
                        })}
                    </p>
                    {sampleLoading ? (
                      <div className="rounded-2xl border border-dashed border-border/60 px-4 py-8 text-center text-sm text-secondary-text">
                        <Lang text={{ ko: "샘플 이미지를 불러오는 중입니다.", en: "Loading sample images." }} />
                      </div>
                    ) : sampleUrls.length === 0 ? (
                      <div className="rounded-2xl border border-dashed border-border/60 px-4 py-8 text-center text-sm text-secondary-text">
                        <Lang
                          text={{
                            ko: "이 템플릿에 연결된 공개 샘플 이미지가 없습니다.",
                            en: "No public sample images are available for this template.",
                          }}
                        />
                      </div>
                    ) : (
                      <div className="grid grid-cols-2 gap-2 sm:gap-3">
                        {sampleUrls.map((url) => {
                          const active = selectedTemplateKey === activeTemplate?.key && selectedUrl === url;
                          return (
                            <button
                              key={url}
                              type="button"
                              onClick={() => {
                                if (!activeTemplate) return;
                                onSelect({ url, templateKey: activeTemplate.key, templateTitle: activeTemplate.title });
                                setOpen(false);
                              }}
                              className={cn(
                                "overflow-hidden rounded-[20px] border border-border/50 bg-background text-left transition-colors",
                                active && "border-sky-400 ring-1 ring-sky-300",
                              )}
                            >
                              <ImageBox
                                src={url}
                                alt={activeTemplate?.title || "public-reference"}
                                className="h-auto w-full"
                                width="100%"
                                height="auto"
                                objectFit="object-cover"
                              />
                              <div className="flex items-center justify-between gap-2 px-3 py-3">
                                <div className="flex items-center gap-2 text-xs text-secondary-text">
                                  <Images className="h-3.5 w-3.5" />
                                  <span className="line-clamp-1">
                                    <Lang
                                      text={{ ko: "이 이미지를 reference로 사용", en: "Use this as the reference" }}
                                    />
                                  </span>
                                </div>
                                {active ? (
                                  <span className="rounded-full bg-sky-50 px-2 py-1 text-xxs font-medium text-sky-700 dark:bg-sky-950/30 dark:text-sky-200">
                                    <Lang text={{ ko: "선택됨", en: "Selected" }} />
                                  </span>
                                ) : null}
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </>
              )}
            </>
          )}
        </div>
      </BottomSheetDialog>
    </>
  );
}
