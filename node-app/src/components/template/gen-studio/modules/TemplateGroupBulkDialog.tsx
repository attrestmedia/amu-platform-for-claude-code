"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, Input, Label, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Switch, Textarea, NameConfirmDialog } from "@amu-labs/ui";
import { ImageBox } from "components/module/image";
import { Lang, lang } from "components/module/i18n";
import {
  deleteAdminGenStudioTemplateGroup,
  listAdminGenStudioTemplateGroups,
  listStudioImageTemplatePreviewMetas,
  writeAdminGenStudioTemplateGroup,
} from "libs/api/lab";
import { mergeStudioRecentMetaRows } from "utils/app";
import { MAX_GEN_STUDIO_TEMPLATE_GROUP_ITEMS } from "consts/app";
import { splitCsv } from "utils/data";
import { cn, toErrorMessage } from "utils/common";
import type { GenStudioTemplateGroupPromptType, GenStudioTemplateGroupType } from "types/app";
import { AlertTriangle, Image as ImageIcon, ListChecks, Lock, Star, Trash2 } from "lucide-react";

function sameStringList(left: string[], right: string[]) {
  return [...left].sort().join("\u0000") === [...right].sort().join("\u0000");
}

type DialogMode = "existing" | "new";
type MembershipAction = "add_templates" | "remove_templates";

type TemplateGroupBulkDialogProps = {
  open: boolean;
  selectedTemplateKeys: string[];
  templateMetaByKey?: Record<string, { title: string; thumb: string }>;
  promptType?: Exclude<GenStudioTemplateGroupPromptType, "audio">;
  initialGroupKey?: string;
  onOpenChange: (open: boolean) => void;
  onComplete: () => void;
};

export function TemplateGroupBulkDialog({
  open,
  selectedTemplateKeys,
  templateMetaByKey = {},
  promptType = "image",
  initialGroupKey = "",
  onOpenChange,
  onComplete,
}: TemplateGroupBulkDialogProps) {
  const [groups, setGroups] = useState<GenStudioTemplateGroupType[]>([]);
  const [mode, setMode] = useState<DialogMode>("existing");
  const [selectedGroupKey, setSelectedGroupKey] = useState("");
  const [key, setKey] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [visibility, setVisibility] = useState<"public" | "private">("private");
  const [serviceKeysCsv, setServiceKeysCsv] = useState("");
  const [recommendedKeys, setRecommendedKeys] = useState<string[]>([]);
  const [recommendedKo, setRecommendedKo] = useState("");
  const [recommendedEn, setRecommendedEn] = useState("");
  const [membershipAction, setMembershipAction] = useState<MembershipAction>("add_templates");
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [trackedOpen, setTrackedOpen] = useState(open);
  const [previewState, setPreviewState] = useState<{ groupKey: string; thumbs: Record<string, string> }>({
    groupKey: "",
    thumbs: {},
  });

  const applyGroup = useCallback((group: GenStudioTemplateGroupType | null) => {
    setSelectedGroupKey(group?.key || "");
    setKey(group?.key || "");
    setTitle(group?.title || "");
    setDescription(group?.description || "");
    setVisibility(group?.visibility || "private");
    setServiceKeysCsv((group?.serviceKeys || []).join(", "));
    setRecommendedKeys(group?.recommendedTemplateKeys || []);
    setRecommendedKo(group?.recommendedDescription?.ko || "");
    setRecommendedEn(group?.recommendedDescription?.en || "");
  }, []);

  const loadGroups = useCallback(async () => {
    setLoading(true);
    setErrorMessage("");
    try {
      const rows = (await listAdminGenStudioTemplateGroups()).filter((group) => group.promptType === promptType);
      const initialGroup = rows.find((group) => group.key === initialGroupKey) || rows[0] || null;
      setGroups(rows);
      setMode(rows.length ? "existing" : "new");
      applyGroup(initialGroup);
    } catch (error) {
      setErrorMessage(toErrorMessage(error, "그룹 목록을 불러오지 못했습니다."));
    } finally {
      setLoading(false);
    }
  }, [applyGroup, initialGroupKey, promptType]);

  if (trackedOpen !== open) {
    setTrackedOpen(open);
    if (open) {
      void loadGroups();
      setMembershipAction("add_templates");
    } else {
      setErrorMessage("");
      setDeleteOpen(false);
    }
  }

  const selectedGroup = useMemo(
    () => groups.find((group) => group.key === selectedGroupKey) || null,
    [groups, selectedGroupKey],
  );
  const selectedKeySet = useMemo(() => new Set(selectedTemplateKeys), [selectedTemplateKeys]);
  const selectedGroupKeyForPreview = selectedGroup?.key || "";
  const selectedGroupTemplateKeysSig = (selectedGroup?.templateKeys || []).join(",");
  // 조회 완료된 그룹과 현재 선택 그룹이 일치할 때만 썸네일 노출(전환 중 stale 노출 방지)
  const previewThumbByKey = previewState.groupKey === selectedGroupKeyForPreview ? previewState.thumbs : {};
  const previewLoading =
    promptType === "image" &&
    Boolean(selectedGroupKeyForPreview) &&
    Boolean(selectedGroupTemplateKeysSig) &&
    previewState.groupKey !== selectedGroupKeyForPreview;

  // 선택 그룹의 실제 생성 이미지(대표 썸네일)를 templateKeys 기준으로 직접 조회
  useEffect(
    function loadGroupTemplatePreviews() {
      if (
        promptType !== "image" ||
        !open ||
        mode !== "existing" ||
        !selectedGroupKeyForPreview ||
        !selectedGroupTemplateKeysSig
      ) {
        return;
      }
      const keys = selectedGroupTemplateKeysSig.split(",");
      let cancelled = false;
      listStudioImageTemplatePreviewMetas({ templateKeys: keys, perTemplate: 1 })
        .then((groupedRows) => {
          if (cancelled) return;
          const nextThumbs: Record<string, string> = {};
          keys.forEach((templateKey) => {
            const rows = Array.isArray(groupedRows[templateKey]) ? groupedRows[templateKey] : [];
            const { images } = mergeStudioRecentMetaRows({ publicRows: rows });
            if (images[0]) nextThumbs[templateKey] = images[0];
          });
          setPreviewState({ groupKey: selectedGroupKeyForPreview, thumbs: nextThumbs });
        })
        .catch(() => {
          if (!cancelled) setPreviewState({ groupKey: selectedGroupKeyForPreview, thumbs: {} });
        });

      return () => {
        cancelled = true;
      };
    },
    [open, mode, promptType, selectedGroupKeyForPreview, selectedGroupTemplateKeysSig],
  );
  const metadataLocked = mode === "existing" && Boolean(selectedGroup?.serviceKeys.length);
  const projectedTemplateCount = useMemo(() => {
    if (mode === "new") return new Set(selectedTemplateKeys).size;
    const currentKeys = selectedGroup?.templateKeys || [];
    if (membershipAction === "remove_templates") {
      const removeKeys = new Set(selectedTemplateKeys);
      return currentKeys.filter((templateKey) => !removeKeys.has(templateKey)).length;
    }
    return new Set([...currentKeys, ...selectedTemplateKeys]).size;
  }, [membershipAction, mode, selectedGroup?.templateKeys, selectedTemplateKeys]);
  const overLimit = projectedTemplateCount > MAX_GEN_STUDIO_TEMPLATE_GROUP_ITEMS;
  const canSave = Boolean(key.trim() && title.trim()) && !loading && !overLimit;

  const handleModeChange = (nextMode: DialogMode) => {
    setMode(nextMode);
    setErrorMessage("");
    if (nextMode === "existing") {
      applyGroup(groups[0] || null);
      return;
    }
    applyGroup(null);
  };

  const handleGroupChange = (groupKey: string) => {
    applyGroup(groups.find((group) => group.key === groupKey) || null);
    setErrorMessage("");
  };

  const handleSave = async () => {
    if (!canSave) return;
    setLoading(true);
    setErrorMessage("");
    try {
      if (mode === "new") {
        await writeAdminGenStudioTemplateGroup({
          action: "create",
          key: key.trim(),
          promptType,
          title: title.trim(),
          description: description.trim(),
          visibility,
          serviceKeys: splitCsv(serviceKeysCsv),
          templateKeys: selectedTemplateKeys,
        });
      } else {
        if (!selectedGroup) throw new Error("group_not_found");
        if (!metadataLocked) {
          await writeAdminGenStudioTemplateGroup({
            action: "update",
            key: selectedGroup.key,
            title: title.trim(),
            description: description.trim(),
            visibility,
            serviceKeys: splitCsv(serviceKeysCsv),
          });
        }
        if (selectedTemplateKeys.length > 0) {
          await writeAdminGenStudioTemplateGroup({
            action: membershipAction,
            key: selectedGroup.key,
            templateKeys: selectedTemplateKeys,
          });
        }
        // 추천 큐레이션 저장 — 멤버십 변경 결과 기준으로 부분집합만 전송 (서버에서도 재검증)
        const projectedKeys =
          selectedTemplateKeys.length > 0
            ? membershipAction === "remove_templates"
              ? selectedGroup.templateKeys.filter((templateKey) => !selectedKeySet.has(templateKey))
              : Array.from(new Set([...selectedGroup.templateKeys, ...selectedTemplateKeys]))
            : selectedGroup.templateKeys;
        const nextRecommendedKeys = recommendedKeys.filter((templateKey) => projectedKeys.includes(templateKey));
        const recommendedChanged =
          !sameStringList(nextRecommendedKeys, selectedGroup.recommendedTemplateKeys || []) ||
          recommendedKo.trim() !== (selectedGroup.recommendedDescription?.ko || "") ||
          recommendedEn.trim() !== (selectedGroup.recommendedDescription?.en || "");
        if (recommendedChanged) {
          await writeAdminGenStudioTemplateGroup({
            action: "set_recommended",
            key: selectedGroup.key,
            recommendedTemplateKeys: nextRecommendedKeys,
            recommendedDescription: { ko: recommendedKo.trim(), en: recommendedEn.trim() },
          });
        }
      }
      onComplete();
      onOpenChange(false);
    } catch (error) {
      setErrorMessage(toErrorMessage(error, "그룹 설정을 저장하지 못했습니다."));
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!selectedGroup) return false;
    setLoading(true);
    setErrorMessage("");
    try {
      await deleteAdminGenStudioTemplateGroup(selectedGroup.key, selectedGroup.key);
      setDeleteOpen(false);
      await loadGroups();
      onComplete();
      return true;
    } catch (error) {
      setErrorMessage(toErrorMessage(error, "그룹을 삭제하지 못했습니다."));
      return false;
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={(nextOpen) => !loading && onOpenChange(nextOpen)}>
        <DialogContent className="w-[calc(100vw-1.5rem)] max-w-2xl" innerWrapClassName="rounded-xl p-5 sm:p-6">
          <DialogHeader>
            <DialogTitle>
              <Lang text={{ ko: "템플릿 그룹 설정", en: "Template group settings" }} />
            </DialogTitle>
            <DialogDescription>
              <Lang
                text={{
                  ko: `선택한 ${promptType === "image" ? "이미지" : "콘텐츠"} 템플릿을 서비스 또는 공개 테마 그룹에 일괄 적용합니다.`,
                  en: `Apply selected ${promptType} templates to a service or public theme group.`,
                }}
              />
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-5 py-4 max-h-[calc(100vh-16rem)] overflow-y-auto scrollbar-ghost">
            <div className="grid grid-cols-2 gap-2">
              <Button
                variant={mode === "existing" ? "primary" : "outline"}
                onClick={() => handleModeChange("existing")}
              >
                <Lang text={{ ko: "기존 그룹 선택", en: "Existing group" }} />
              </Button>
              <Button variant={mode === "new" ? "primary" : "outline"} onClick={() => handleModeChange("new")}>
                <Lang text={{ ko: "새 그룹 생성", en: "New group" }} />
              </Button>
            </div>

            {mode === "existing" ? (
              <div className="space-y-2">
                <Label>
                  <Lang text={{ ko: "기존 그룹", en: "Existing group" }} />
                </Label>
                <Select value={selectedGroupKey} onValueChange={(value) => handleGroupChange(String(value))}>
                  <SelectTrigger disabled={!groups.length || loading}>
                    <SelectValue placeholder={lang({ ko: "그룹을 선택하세요.", en: "Select a group." })} />
                  </SelectTrigger>
                  <SelectContent>
                    {groups.map((group) => (
                      <SelectItem key={group.key} value={group.key}>
                        {group.title} ({group.key})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : null}

            {mode === "existing" && selectedGroup ? (
              <div className="space-y-2">
                <Label>
                  <span className="flex items-center gap-1.5">
                    <ListChecks className="h-4 w-4" />
                    <Lang
                      text={{
                        ko: `현재 등록된 템플릿 (${selectedGroup.templateKeys.length}개)`,
                        en: `Registered templates (${selectedGroup.templateKeys.length})`,
                      }}
                    />
                  </span>
                </Label>
                <div className="rounded-lg border border-border bg-muted/40 p-2">
                  {selectedGroup.templateKeys.length === 0 ? (
                    <p className="p-1 text-xs text-secondary-text">
                      <Lang text={{ ko: "아직 등록된 템플릿이 없습니다.", en: "No templates registered yet." }} />
                    </p>
                  ) : (
                    <ul className="max-h-56 space-y-1 overflow-y-auto scrollbar-ghost">
                      {selectedGroup.templateKeys.map((templateKey) => {
                        const willRemove =
                          membershipAction === "remove_templates" && selectedKeySet.has(templateKey);
                        const isRecommended = recommendedKeys.includes(templateKey);
                        const meta = templateMetaByKey[templateKey];
                        const title = meta?.title || templateKey;
                        const thumb = previewThumbByKey[templateKey] || meta?.thumb || "";
                        return (
                          <li
                            key={templateKey}
                            className={cn(
                              "flex items-center gap-2.5 rounded-md p-1.5",
                              willRemove && "bg-danger/10",
                            )}
                          >
                            <div className="relative h-11 w-11 shrink-0 overflow-hidden rounded-md border border-border/60 bg-background">
                              {thumb ? (
                                <ImageBox
                                  src={thumb}
                                  alt={title}
                                  width={44}
                                  height={44}
                                  objectFit="object-cover"
                                  className="h-full w-full"
                                />
                              ) : previewLoading ? (
                                <span className="block h-full w-full animate-pulse bg-muted-foreground/10" />
                              ) : (
                                <span className="flex h-full w-full items-center justify-center text-secondary-text/40">
                                  <ImageIcon className="h-4 w-4" />
                                </span>
                              )}
                            </div>
                            <div className="flex min-w-0 flex-1 flex-col">
                              <span
                                className={cn(
                                  "truncate text-xs font-medium text-primary-text",
                                  willRemove && "text-danger line-through",
                                )}
                              >
                                {title}
                              </span>
                              <span
                                className={cn(
                                  "truncate font-mono text-[11px] text-secondary-text/70",
                                  willRemove && "text-danger/70 line-through",
                                )}
                              >
                                {templateKey}
                              </span>
                            </div>
                            {willRemove ? (
                              <span className="shrink-0 rounded-full bg-danger/15 px-2 py-0.5 text-[10px] font-medium text-danger">
                                <Lang text={{ ko: "제거 예정", en: "Will remove" }} />
                              </span>
                            ) : null}
                            <button
                              type="button"
                              className={cn(
                                "shrink-0 rounded-md p-1.5 transition hover:bg-muted",
                                isRecommended ? "text-amber-500" : "text-secondary-text/40",
                              )}
                              aria-label={lang(
                                isRecommended
                                  ? { ko: "추천 템플릿에서 제외", en: "Remove from recommended" }
                                  : { ko: "추천 템플릿으로 지정", en: "Mark as recommended" },
                              )}
                              aria-pressed={isRecommended}
                              title={lang({ ko: "추천 템플릿 토글", en: "Toggle recommended" })}
                              disabled={loading}
                              onClick={() =>
                                setRecommendedKeys((prev) =>
                                  prev.includes(templateKey)
                                    ? prev.filter((item) => item !== templateKey)
                                    : [...prev, templateKey],
                                )
                              }
                            >
                              <Star className={cn("h-4 w-4", isRecommended && "fill-current")} />
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
                <p className="text-xs leading-5 text-secondary-text">
                  <Lang
                    text={{
                      ko: `별표(★)로 지정한 템플릿은 연결 서비스의 추천 섹션 상단에 노출됩니다. (현재 ${recommendedKeys.length}개)`,
                      en: `Starred templates appear in the recommended section of linked services. (${recommendedKeys.length} selected)`,
                    }}
                  />
                </p>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label label={lang({ ko: "추천 설명 (한국어)", en: "Recommended description (KO)" })}>
                      <Input
                        id="template-group-recommended-ko"
                        value={recommendedKo}
                        onChange={(event) => setRecommendedKo(event.target.value)}
                        placeholder={lang({
                          ko: "예: 스마트스토어 상품 이미지 생성에 최적화된 템플릿입니다.",
                          en: "e.g. Templates optimized for Smart Store product images.",
                        })}
                        disabled={loading}
                        maxLength={200}
                      />
                    </Label>
                  </div>
                  <div className="space-y-2">
                    <Label label={lang({ ko: "추천 설명 (English)", en: "Recommended description (EN)" })}>
                      <Input
                        id="template-group-recommended-en"
                        value={recommendedEn}
                        onChange={(event) => setRecommendedEn(event.target.value)}
                        placeholder="e.g. Templates optimized for Smart Store product images."
                        disabled={loading}
                        maxLength={200}
                      />
                    </Label>
                  </div>
                </div>
              </div>
            ) : null}

            {metadataLocked && selectedGroup ? (
              <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs leading-5 text-amber-800 dark:text-amber-200">
                <div className="flex items-center gap-2 font-semibold">
                  <Lock className="h-4 w-4" />
                  <Lang text={{ ko: "서비스 연결 그룹 메타데이터 잠금", en: "Service-linked metadata locked" }} />
                </div>
                <p className="mt-1">
                  <Lang
                    text={{
                      ko: `연결 서비스: ${selectedGroup.serviceKeys.join(", ")}. 템플릿 추가·제거만 가능합니다.`,
                      en: `Connected services: ${selectedGroup.serviceKeys.join(", ")}. Only template membership can change.`,
                    }}
                  />
                </p>
              </div>
            ) : null}

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label label={lang({ ko: "그룹 key", en: "Group key" })}>
                  <Input
                    id="template-group-key"
                    value={key}
                    onChange={(event) => setKey(event.target.value)}
                    placeholder="tutors-profile-human"
                    disabled={mode === "existing" || loading}
                  />
                </Label>
              </div>
              <div className="space-y-2">
                <Label label={lang({ ko: "제목", en: "Title" })}>
                  <Input
                    id="template-group-title"
                    value={title}
                    onChange={(event) => setTitle(event.target.value)}
                    disabled={metadataLocked || loading}
                    maxLength={80}
                  />
                </Label>
              </div>
            </div>

            <div className="space-y-2">
              <Label label={lang({ ko: "설명", en: "Description" })}>
                <Textarea
                  id="template-group-description"
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  disabled={metadataLocked || loading}
                  maxLength={300}
                  rows={3}
                />
              </Label>
            </div>

            <div className="flex flex-col gap-2">
              <div className="space-y-2">
                <div className="flex min-h-10 items-center justify-between gap-2">
                  <Label
                    htmlFor="template-group-visibility"
                    label={lang({ ko: "공개 설정", en: "Public visibility" })}
                    className="shrink-0"
                    labelClassName="mb-0 px-0"
                  />
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="truncate text-sm text-secondary-text">
                      <Lang
                        text={
                          visibility === "public"
                            ? { ko: "Gen Studio 메인에 공개", en: "Visible on Gen Studio home" }
                            : { ko: "key 기반 서비스 전용", en: "Service-only by key" }
                        }
                      />
                    </span>
                    <Switch
                      id="template-group-visibility"
                      checked={visibility === "public"}
                      onCheckedChange={(checked) => setVisibility(checked ? "public" : "private")}
                      disabled={metadataLocked || loading}
                    />
                  </div>
                </div>
              </div>
              <div className="space-y-2">
                <Label label={lang({ ko: "서비스 key CSV", en: "Service key CSV" })}>
                  <Input
                    id="template-group-services"
                    value={serviceKeysCsv}
                    onChange={(event) => setServiceKeysCsv(event.target.value)}
                    placeholder="tutors, smartstore"
                    disabled={metadataLocked || loading}
                  />
                </Label>
              </div>
            </div>

            {mode === "existing" ? (
              <div className="space-y-2">
                <Label label={lang({ ko: "선택 템플릿 적용", en: "Selected template action" })}>
                  <div className="grid grid-cols-2 gap-2">
                    <Button
                      variant={membershipAction === "add_templates" ? "primary" : "outline"}
                      onClick={() => setMembershipAction("add_templates")}
                    >
                      <Lang text={{ ko: "그룹에 추가", en: "Add to group" }} />
                    </Button>
                    <Button
                      variant={membershipAction === "remove_templates" ? "primary" : "outline"}
                      onClick={() => setMembershipAction("remove_templates")}
                    >
                      <Lang text={{ ko: "그룹에서 제거", en: "Remove from group" }} />
                    </Button>
                  </div>
                </Label>
              </div>
            ) : null}

            <div
              className={`rounded-lg border p-3 text-xs leading-5 ${
                overLimit
                  ? "border-danger/40 bg-danger/10 text-danger"
                  : "border-border bg-muted/40 text-secondary-text"
              }`}
            >
              <div className="flex items-start gap-2">
                {overLimit ? <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> : null}
                <Lang
                  text={{
                    ko: `그룹당 최대 ${MAX_GEN_STUDIO_TEMPLATE_GROUP_ITEMS}개 템플릿까지 설정할 수 있습니다. 적용 후 ${projectedTemplateCount}개가 됩니다.`,
                    en: `Each group supports up to ${MAX_GEN_STUDIO_TEMPLATE_GROUP_ITEMS} templates. This action results in ${projectedTemplateCount}.`,
                  }}
                />
              </div>
            </div>

            {errorMessage ? <p className="text-sm text-danger">{errorMessage}</p> : null}
          </div>

          <DialogFooter className="flex itmes-center justify-between">
            <div>
              {mode === "existing" && selectedGroup ? (
                <Button variant="destructive" onClick={() => setDeleteOpen(true)} disabled={loading}>
                  <Trash2 className="h-4 w-4" />
                  <Lang text={{ ko: "그룹 삭제", en: "Delete group" }} />
                </Button>
              ) : null}
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
                <Lang text={{ ko: "취소", en: "Cancel" }} />
              </Button>
              <Button onClick={handleSave} disabled={!canSave} loading={loading}>
                <Lang text={{ ko: "적용", en: "Apply" }} />
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {selectedGroup ? (
        <NameConfirmDialog
          open={deleteOpen}
          onOpenChange={setDeleteOpen}
          expectedName={selectedGroup.key}
          onConfirm={handleDelete}
          loading={loading}
          title={lang({ ko: "템플릿 그룹 삭제", en: "Delete template group" })}
          description={
            <Lang
              text={{
                ko: (
                  <>
                    연결 서비스 <strong>{selectedGroup.serviceKeys.join(", ") || "없음"}</strong>을 확인했습니다.
                    삭제하려면 그룹 key <strong>{selectedGroup.key}</strong>를 정확히 입력하세요.
                  </>
                ),
                en: (
                  <>
                    Connected services: <strong>{selectedGroup.serviceKeys.join(", ") || "none"}</strong>. Enter the
                    exact group key <strong>{selectedGroup.key}</strong> to delete it.
                  </>
                ),
              }}
            />
          }
          inputLabel={lang({ ko: "그룹 key", en: "Group key" })}
          confirmVariant="destructive"
        />
      ) : null}
    </>
  );
}
