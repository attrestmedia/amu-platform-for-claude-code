"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, Trash2 } from "lucide-react";
import { Button, Input, Textarea, Select, SelectTrigger, SelectValue, SelectContent, SelectItem, Switch, dialog } from "@amu-labs/ui";
import { Lang, lang } from "components/module/i18n";
import { SEARCH_FIELD_OPTIONS } from "consts/app";
import type {
  PromptAccessLevelType,
  PromptItemExtendedType,
  PromptItemOptionType,
  PromptItemType,
  PromptSearchFieldType,
} from "types/app";
import { splitCsv, joinCsv, parseJson, jsonPretty } from "utils/data";
import { cn, toUnknownRecord } from "utils/common";
import { logger } from "utils/log";
import {
  notifyPromptListChanged,
  getPromptFieldText,
  PROMPT_ACCESS_LEVEL_OPTIONS,
  normalizePromptAccessLevel,
} from "utils/app";
import {
  hasLegacyImagePromptNegativeSection,
  normalizeImagePromptNegative,
  stripLegacyImagePromptNegativeSection,
} from "utils/lab";
import {
  buildImagePromptDefaultParams,
  buildImagePromptInputPolicyFromState,
  createImagePromptExtraDefaultParamsText,
  createImagePromptStructuredState,
  ImagePromptStructuredFields,
  type ImagePromptStructuredState,
} from "./ImagePromptStructuredFields";
import {
  buildContentPromptDefaultParams,
  ContentPromptStructuredFields,
  createContentPromptExtraDefaultParamsText,
  createContentPromptStructuredState,
  type ContentPromptStructuredState,
} from "./ContentPromptStructuredFields";

export type EditingState = Partial<PromptItemExtendedType> & { __isNew?: boolean; __originalKey?: string };

type JsonObject = Record<string, unknown>;
type PromptMutationResult = Partial<PromptItemExtendedType> | PromptItemType | null | undefined;
type ListFn = (p?: { q?: string; category?: string; enabled?: boolean }) => Promise<PromptItemExtendedType[]>;
type UpsertFn = (payload: PromptItemType, opts?: PromptItemOptionType) => Promise<PromptMutationResult>;
type DeleteFn = (key: string) => Promise<unknown>;

const isJsonObject = (value: unknown): value is JsonObject => {
  return !!value && typeof value === "object" && !Array.isArray(value);
};

const getErrorMessage = (error: unknown) => {
  const message = toUnknownRecord(error).message;
  return typeof message === "string" ? message : "";
};

const getPromptAccessLevel = (value: unknown) => {
  return normalizePromptAccessLevel(toUnknownRecord(value).accessLevel as PromptAccessLevelType | undefined);
};

type Props = {
  title: string;
  dialogTitle: string;
  listFn: ListFn;
  upsertFn: UpsertFn;
  deleteFn: DeleteFn;
  syncKind?: "image" | "content";
  defaultEditing: () => EditingState;
  defaultTemplateText?: string;
  showSearchField?: boolean;
  showUsageTip?: boolean;
  showImageDescriptionTemplateText?: boolean;
  allowAccessLevel?: boolean;
  showAdminOnlyFilter?: boolean;
  defaultParamsMode?: "json" | "image-structured" | "content-structured";
};

export default function PromptManagerBase({
  title,
  dialogTitle,
  listFn,
  upsertFn,
  deleteFn,
  syncKind,
  defaultEditing,
  defaultTemplateText,
  showSearchField,
  showUsageTip,
  showImageDescriptionTemplateText,
  allowAccessLevel,
  showAdminOnlyFilter,
  defaultParamsMode = "json",
}: Props) {
  const [rows, setRows] = useState<PromptItemExtendedType[]>([]);
  const [q, setQ] = useState("");
  const [searchField, setSearchField] = useState<PromptSearchFieldType>("all");
  const [adminOnlyFilter, setAdminOnlyFilter] = useState(false);
  const [editing, setEditing] = useState<EditingState | null>(null);
  const [templateText, setTemplateText] = useState<string>("");
  const [sceneTemplate, setImageDescriptionTemplateText] = useState("");
  const [categoriesText, setCategoriesText] = useState("");
  const [tagsText, setTagsText] = useState("");
  const [defaultParamsText, setDefaultParamsText] = useState("");
  const [imagePromptStructuredState, setImagePromptStructuredState] = useState<ImagePromptStructuredState>(
    createImagePromptStructuredState(),
  );
  const [imagePromptExtraDefaultParamsText, setImagePromptExtraDefaultParamsText] = useState("");
  const [contentPromptStructuredState, setContentPromptStructuredState] = useState<ContentPromptStructuredState>(
    createContentPromptStructuredState(),
  );
  const [contentPromptExtraDefaultParamsText, setContentPromptExtraDefaultParamsText] = useState("");
  const isImageStructuredDefaultParams = defaultParamsMode === "image-structured";
  const isContentStructuredDefaultParams = defaultParamsMode === "content-structured";

  const load = useCallback(async () => {
    const data = await listFn({ enabled: undefined });
    setRows(data);
  }, [listFn]);

  useEffect(() => {
    let isActive = true;

    void listFn({ enabled: undefined })
      .then((data) => {
        if (isActive) setRows(data);
      })
      .catch(logger.warn);

    return () => {
      isActive = false;
    };
  }, [listFn]);

  const filtered = useMemo(() => {
    const qq = q.trim().toLowerCase();
    return rows.filter((row) => {
      if (showAdminOnlyFilter && allowAccessLevel && adminOnlyFilter && getPromptAccessLevel(row) !== "admin") {
        return false;
      }
      if (!qq) return true;
      return getPromptFieldText(row, searchField).toLowerCase().includes(qq);
    });
  }, [rows, q, searchField, showAdminOnlyFilter, allowAccessLevel, adminOnlyFilter]);

  const usageTipLength = useMemo(() => Array.from(String(editing?.usageTip || "")).length, [editing?.usageTip]);

  const setEditorState = (next: EditingState) => {
    setEditing(next);
    setTemplateText(String(next.templateText || ""));
    setImageDescriptionTemplateText(String(next.sceneTemplate || ""));
    setCategoriesText(joinCsv(next.categories));
    setTagsText(joinCsv(next.tags));
    if (isImageStructuredDefaultParams) {
      setDefaultParamsText("");
      setImagePromptStructuredState(createImagePromptStructuredState(next));
      setImagePromptExtraDefaultParamsText(createImagePromptExtraDefaultParamsText(next.defaultParams));
      return;
    }
    if (isContentStructuredDefaultParams) {
      setDefaultParamsText("");
      setContentPromptStructuredState(createContentPromptStructuredState(next));
      setContentPromptExtraDefaultParamsText(
        createContentPromptExtraDefaultParamsText(
          next.defaultParams as Parameters<typeof createContentPromptExtraDefaultParamsText>[0],
        ),
      );
      return;
    }
    setDefaultParamsText(jsonPretty(next.defaultParams));
  };

  const onNew = () => {
    const base = defaultEditing();
    setEditorState({ ...base, __isNew: true, __originalKey: undefined });
  };

  const onEdit = (row: PromptItemExtendedType) => {
    setEditorState({ ...row, __isNew: false, __originalKey: row.key });
  };

  const closeEditor = () => {
    setEditing(null);
    setTemplateText("");
    setImageDescriptionTemplateText("");
    setCategoriesText("");
    setTagsText("");
    setDefaultParamsText("");
    setImagePromptStructuredState(createImagePromptStructuredState());
    setImagePromptExtraDefaultParamsText("");
    setContentPromptStructuredState(createContentPromptStructuredState());
    setContentPromptExtraDefaultParamsText("");
  };

  const onSave = async () => {
    if (!editing) return;

    const nextKey = String(editing.key || "").trim();
    const nextTitle = String(editing.title || "").trim();
    let nextTemplateText = String(templateText || "").trim();
    if (!nextKey || !nextTitle || !nextTemplateText) {
      void dialog.alert(
        lang({ ko: "key/title/templateText는 필수입니다.", en: "Key/Title/templateText are required." }),
      );
      return;
    }

    const categories = splitCsv(categoriesText);
    const tags = splitCsv(tagsText);
    let defaultParams: PromptItemType["defaultParams"] | undefined;
    try {
      defaultParams = parseJson(defaultParamsText, "defaultParams");
    } catch (error: unknown) {
      void dialog.alert({
        variant: "danger",
        message:
          getErrorMessage(error) ||
          lang({ ko: "defaultParams JSON 파싱에 실패했습니다.", en: "Failed to parse defaultParams JSON." }),
      });
      return;
    }
    let inputPolicy = editing.inputPolicy;
    const usageTip = String(editing.usageTip || "")
      .replace(/\s+/g, " ")
      .trim();
    if (showUsageTip && usageTipLength > 140) {
      void dialog.alert(
        lang({ ko: "활용 팁은 140자 이내로 입력해 주세요.", en: "Usage tip must be 140 characters or less." }),
      );
      return;
    }

    if (isImageStructuredDefaultParams) {
      let parsedExtraDefaultParams: JsonObject | undefined;
      try {
        const parsed = parseJson(imagePromptExtraDefaultParamsText, "고급 defaultParams");
        if (parsed !== undefined && !isJsonObject(parsed)) {
          void dialog.alert(
            lang({
              ko: "고급 defaultParams는 JSON 객체 형태여야 합니다.",
              en: "Advanced defaultParams must be a JSON object.",
            }),
          );
          return;
        }
        parsedExtraDefaultParams = parsed;
      } catch (error: unknown) {
        void dialog.alert({
          variant: "danger",
          message:
            getErrorMessage(error) ||
            lang({
              ko: "고급 defaultParams JSON 파싱에 실패했습니다.",
              en: "Failed to parse advanced defaultParams JSON.",
            }),
        });
        return;
      }

      const hasLegacyNegative = hasLegacyImagePromptNegativeSection(templateText);
      const normalizedNegative = normalizeImagePromptNegative(imagePromptStructuredState.negative);

      if (hasLegacyNegative && !normalizedNegative) {
        void dialog.alert(
          lang({
            ko: "템플릿 본문에 남아 있는 레거시 금지 표현을 `금지 표현` 필드로 옮긴 뒤 저장해 주세요.",
            en: "Move the legacy forbidden section into the negative field before saving.",
          }),
        );
        return;
      }

      nextTemplateText = stripLegacyImagePromptNegativeSection(templateText);
      defaultParams = buildImagePromptDefaultParams({
        state: imagePromptStructuredState,
        extraDefaultParams: parsedExtraDefaultParams,
      });
      inputPolicy = buildImagePromptInputPolicyFromState(imagePromptStructuredState);
    }

    if (isContentStructuredDefaultParams) {
      let parsedExtraDefaultParams: JsonObject | undefined;
      try {
        const parsed = parseJson(contentPromptExtraDefaultParamsText, "고급 defaultParams");
        if (parsed !== undefined && !isJsonObject(parsed)) {
          void dialog.alert(
            lang({
              ko: "고급 defaultParams는 JSON 객체 형태여야 합니다.",
              en: "Advanced defaultParams must be a JSON object.",
            }),
          );
          return;
        }
        parsedExtraDefaultParams = parsed;
      } catch (error: unknown) {
        void dialog.alert({
          variant: "danger",
          message:
            getErrorMessage(error) ||
            lang({
              ko: "고급 defaultParams JSON 파싱에 실패했습니다.",
              en: "Failed to parse advanced defaultParams JSON.",
            }),
        });
        return;
      }

      defaultParams = buildContentPromptDefaultParams({
        state: contentPromptStructuredState,
        extraDefaultParams: parsedExtraDefaultParams,
      });
    }

    const payload: PromptItemType = {
      key: nextKey,
      title: nextTitle,
      categories: categories.length ? categories : ["general"],
      templateText: nextTemplateText,
      ...(showImageDescriptionTemplateText ? { sceneTemplate: String(sceneTemplate || "").trim() } : {}),
      ...(allowAccessLevel ? { accessLevel: normalizePromptAccessLevel(editing.accessLevel) } : {}),
      ...(showUsageTip ? { usageTip } : {}),
      ...(defaultParams !== undefined ? { defaultParams } : {}),
      ...(inputPolicy !== undefined ? { inputPolicy } : {}),
      tags,
      enabled: editing.enabled !== false,
    };

    if (editing.__isNew) {
      const dup = rows.some((row) => row.key === nextKey);
      if (dup) {
        void dialog.alert({
          variant: "danger",
          message: lang({
            ko: `'${nextKey}' 키는 이미 존재합니다. 다른 키를 사용하세요.`,
            en: `Key '${nextKey}' already exists. Please use a different key.`,
          }),
        });
        return;
      }

      try {
        const saved = await upsertFn(payload, { strictNew: true });
        await load();
        if (syncKind) notifyPromptListChanged(syncKind);
        setEditorState({ ...(saved || payload), __isNew: false, __originalKey: saved?.key || nextKey });
      } catch (e: unknown) {
        const message = getErrorMessage(e);
        if (message.includes("duplicate_key")) {
          void dialog.alert({
            variant: "danger",
            message: lang({
              ko: `'${nextKey}' 키가 동시에 생성되어 충돌했습니다. 다른 키로 다시 시도하세요.`,
              en: `Key '${nextKey}' conflicted due to concurrent creation. Please try again with a different key.`,
            }),
          });
          return;
        }
        void dialog.alert({ variant: "danger", message: message || lang({ ko: "저장 실패", en: "Save failed" }) });
      }
      return;
    }

    const changedKey = nextKey !== editing.__originalKey;
    const keyConflict = changedKey && rows.some((row) => row.key === nextKey && row.key !== editing.__originalKey);
    const confirmed = await dialog.confirm({
      variant: keyConflict ? "danger" : "default",
      message: keyConflict
        ? lang({
            ko: `주의: '${nextKey}' 키가 이미 존재합니다.\n저장하면 해당 프롬프트를 덮어쓰기 합니다.\n계속하시겠습니까?`,
            en: `Warning: Key '${nextKey}' already exists.\nSaving will overwrite that prompt.\nDo you want to continue?`,
          })
        : lang({
            ko: "이 프롬프트를 저장하면 기존 내용이 업데이트됩니다.\n계속하시겠습니까?",
            en: "Saving this prompt will update the existing content.\nDo you want to continue?",
          }),
    });
    if (!confirmed) return;

    try {
      const saved = await upsertFn(payload, {
        originalKey: editing.__originalKey,
        overwrite: keyConflict,
      });
      await load();
      if (syncKind) notifyPromptListChanged(syncKind);
      setEditorState({ ...(saved || payload), __isNew: false, __originalKey: saved?.key || nextKey });
    } catch (e: unknown) {
      void dialog.alert({
        variant: "danger",
        message: getErrorMessage(e) || lang({ ko: "저장 실패", en: "Save failed" }),
      });
    }
  };

  const onDelete = async (key: string) => {
    const safeKey = String(key || "").trim();
    if (!safeKey) return;
    if (
      !(await dialog.confirm({
        variant: "danger",
        message: lang({ ko: "해당 프롬프트를 삭제할까요?", en: "Delete this prompt?" }),
      }))
    )
      return;

    try {
      await deleteFn(safeKey);
      await load();
      if (syncKind) notifyPromptListChanged(syncKind);
      if (editing && (editing.__originalKey === safeKey || editing.key === safeKey)) {
        closeEditor();
      }
    } catch (e: unknown) {
      void dialog.alert({
        variant: "danger",
        message: getErrorMessage(e) || lang({ ko: "삭제 실패", en: "Delete failed" }),
      });
    }
  };

  const currentKey = editing?.__originalKey || editing?.key || "";
  const legacyNegativeDetected = useMemo(
    () => (isImageStructuredDefaultParams ? hasLegacyImagePromptNegativeSection(templateText) : false),
    [isImageStructuredDefaultParams, templateText],
  );

  return (
    <div className="flex h-full flex-col gap-3">
      <div className="flex items-center justify-between gap-2 shrink-0">
        <div>
          <div className="text-lg font-semibold">{title}</div>
          <div className="text-xs text-muted-foreground">
            <Lang text={{ ko: `총 ${filtered.length}개`, en: `Total ${filtered.length}` }} />
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-2 shrink-0 sm:flex-row sm:flex-wrap sm:items-center">
        <div className="flex gap-2 items-center flex-1">
          {showSearchField && (
            <Select value={searchField} onValueChange={(value) => setSearchField(value as PromptSearchFieldType)}>
              <SelectTrigger className="max-w-24">
                <SelectValue placeholder={lang({ ko: "전체", en: "All" })} />
              </SelectTrigger>
              <SelectContent>
                {SEARCH_FIELD_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    <Lang text={opt.label} />
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          <Input
            className="flex-1"
            placeholder={lang({ ko: "검색하려면 입력하세요", en: "Type to search" })}
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>

        <div className="flex items-center justify-start gap-2">
          <div className="flex gap-2 shrink-0">
            <Button variant="outline" onClick={() => void load()}>
              <Lang text={{ ko: "새로고침", en: "Refresh" }} />
            </Button>
            <Button onClick={onNew}>
              <Lang text={{ ko: "신규", en: "New" }} />
            </Button>
          </div>

          {showAdminOnlyFilter && allowAccessLevel ? (
            <label className="flex items-center gap-3 px-3 py-2 sm:min-w-[132px]">
              <span className="text-xs font-medium text-primary-text">
                <Lang text={{ ko: "어드민 전용", en: "Admin only" }} />
              </span>
              <Switch checked={adminOnlyFilter} onCheckedChange={setAdminOnlyFilter} size="sm" />
            </label>
          ) : null}
        </div>
      </div>

      <div
        className={cn(
          "flex flex-col gap-3 flex-1 min-h-0",
          editing ? "md:flex-row md:overflow-hidden" : "md:block md:overflow-y-auto",
        )}
      >
        <div
          className={cn(
            "flex flex-col min-h-0",
            editing ? "hidden md:flex md:w-80 md:flex-col lg:w-96 md:shrink-0" : "",
          )}
        >
          <div className="overflow-y-auto flex-1">
            {filtered.length === 0 ? (
              <div className="p-3 text-sm text-muted-foreground">
                <Lang text={{ ko: "목록이 없습니다.", en: "No items." }} />
              </div>
            ) : (
              <ul className="space-y-2">
                {filtered.map((row) => {
                  const isSelected = currentKey === row.key;
                  return (
                    <li key={row.key}>
                      <div
                        className={cn(
                          "group flex items-start gap-2 rounded-xl border bg-card px-3 py-2.5 transition-colors cursor-pointer",
                          isSelected ? "bg-primary/10 border-primary/30" : "hover:border-primary",
                        )}
                        onClick={() => onEdit(row)}
                      >
                        <div className="flex-1 min-w-0">
                          <div className={cn("text-sm font-medium truncate", isSelected && "text-primary")}>
                            {row.title || "(no title)"}
                          </div>
                          <div className="text-xs text-muted-foreground truncate font-mono mt-0.5">{row.key}</div>
                          {allowAccessLevel && (
                            <div className="mt-1">
                              <span className="rounded-full border px-2 py-0.5 text-xxs font-medium text-muted-foreground">
                                {
                                  PROMPT_ACCESS_LEVEL_OPTIONS.find((opt) => opt.value === getPromptAccessLevel(row))
                                    ?.label.ko
                                }
                              </span>
                            </div>
                          )}
                          <div className="text-xxs text-muted-foreground/70 truncate mt-1">
                            {(row.categories || ["general"]).join(", ")}
                            {Array.isArray(row.tags) && row.tags.length > 0 ? ` · ${row.tags.join(", ")}` : ""}
                          </div>
                        </div>
                        <Button
                          variant="blank"
                          className="shrink-0 text-muted-foreground hover:text-destructive"
                          onClick={(e) => {
                            e.stopPropagation();
                            onDelete(row.key);
                          }}
                        >
                          <Lang text={{ ko: "삭제", en: "Delete" }} />
                        </Button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {!editing && (
            <div className="px-3 py-2 text-xs text-muted-foreground border-t shrink-0">
              <Lang
                text={{
                  ko: "항목을 선택하거나 신규를 눌러 편집을 시작하세요.",
                  en: "Pick an item or click New to start editing.",
                }}
              />
            </div>
          )}
        </div>

        {editing && (
          <div className="flex-1 rounded-xl border bg-card overflow-hidden flex flex-col min-h-0">
            <div className="flex items-center justify-between gap-2 px-4 py-3 border-b shrink-0">
              <div className="flex items-center gap-2 min-w-0">
                <Button variant="blank" className="md:hidden" onClick={closeEditor}>
                  <ArrowLeft className="h-5 w-5" />
                </Button>
                <div className="text-sm font-semibold truncate">{dialogTitle}</div>
              </div>

              <div className="flex gap-2 shrink-0">
                {!editing.__isNew && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => onDelete(String(editing.key || editing.__originalKey || ""))}
                  >
                    <Trash2 className="h-4 w-4" />
                    <Lang text={{ ko: "삭제", en: "Delete" }} />
                  </Button>
                )}
                <Button size="sm" onClick={onSave}>
                  <Lang text={{ ko: "저장", en: "Save" }} />
                </Button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-muted-foreground">
                    <Lang text={{ ko: "key *", en: "key *" }} />
                  </label>
                  <Input
                    value={editing.key || ""}
                    onChange={(e) => setEditing((prev) => (prev ? { ...prev, key: e.target.value } : prev))}
                  />
                </div>

                <div>
                  <label className="text-xs text-muted-foreground">
                    <Lang text={{ ko: "title *", en: "title *" }} />
                  </label>
                  <Input
                    value={editing.title || ""}
                    onChange={(e) => setEditing((prev) => (prev ? { ...prev, title: e.target.value } : prev))}
                  />
                </div>

                <div>
                  <label className="text-xs text-muted-foreground">
                    <Lang
                      text={{
                        ko: "categories (쉼표로 구분하세요)",
                        en: "categories (comma separated)",
                      }}
                    />
                  </label>
                  <Input value={categoriesText} onChange={(e) => setCategoriesText(e.target.value)} />
                </div>

                <div>
                  <label className="text-xs text-muted-foreground">
                    <Lang
                      text={{
                        ko: "tags (쉼표로 구분하세요)",
                        en: "tags (comma separated)",
                      }}
                    />
                  </label>
                  <Input value={tagsText} onChange={(e) => setTagsText(e.target.value)} />
                </div>

                {allowAccessLevel && (
                  <div>
                    <label className="text-xs text-muted-foreground">
                      <Lang text={{ ko: "노출 범위", en: "Access level" }} />
                    </label>
                    <Select
                      value={normalizePromptAccessLevel(editing.accessLevel)}
                      onValueChange={(value) =>
                        setEditing((prev) => (prev ? { ...prev, accessLevel: value as PromptAccessLevelType } : prev))
                      }
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {PROMPT_ACCESS_LEVEL_OPTIONS.map((opt) => (
                          <SelectItem key={opt.value} value={opt.value}>
                            <Lang text={opt.label} />
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                <div>
                  <label className="text-xs text-muted-foreground">
                    <Lang text={{ ko: "활성 상태", en: "Enabled" }} />
                  </label>
                  <label className="mt-1 flex h-9 items-center gap-3">
                    <Switch
                      checked={editing.enabled !== false}
                      onCheckedChange={(checked) =>
                        setEditing((prev) => (prev ? { ...prev, enabled: checked } : prev))
                      }
                      size="sm"
                    />
                    <span className="text-xs text-primary-text">
                      {editing.enabled !== false ? (
                        <Lang text={{ ko: "갤러리에 노출", en: "Visible in gallery" }} />
                      ) : (
                        <Lang text={{ ko: "비활성 (생성 차단)", en: "Disabled (generation blocked)" }} />
                      )}
                    </span>
                  </label>
                </div>
              </div>

              <div>
                <label className="text-xs text-muted-foreground">
                  <Lang text={{ ko: "templateText *", en: "templateText *" }} />
                </label>
                <Textarea
                  rows={10}
                  value={templateText}
                  onChange={(e) => setTemplateText(e.target.value)}
                  placeholder={defaultTemplateText}
                  autoResize
                />
                <p className="mt-1 text-xxs leading-relaxed text-muted-foreground">
                  <Lang
                    text={{
                      ko: '`{필드::옵션1|옵션2}`는 선택, `{필드*::옵션1|옵션2}`는 필수 선택입니다. `{#if 필드 == "옵션1"}...{/if}`로 선택값에 따른 문장을 추가할 수 있습니다.',
                      en: 'Use `{field::a|b}` for optional and `{field*::a|b}` for required selections. Add conditional text with `{#if field == "a"}...{/if}`.',
                    }}
                  />
                </p>
              </div>

              {showImageDescriptionTemplateText && (
                <div>
                  <label className="text-xs text-muted-foreground">
                    <Lang
                      text={{
                        ko: "이미지 설명 추천 템플릿 (sceneTemplate)",
                        en: "Image description template (sceneTemplate)",
                      }}
                    />
                  </label>
                  <p className="mb-2 mt-1 text-xxs leading-relaxed text-muted-foreground">
                    <Lang
                      text={{
                        ko: '`{필드::입력 placeholder}`는 텍스트 입력, `{필드::옵션1|옵션2}`는 선택 옵션입니다. `{#if 필드 == "옵션1"}...{/if}` 조건도 사용할 수 있으며, 비워두면 추천 이미지 설명 UI가 숨겨집니다.',
                        en: '`{field::input placeholder}` renders a text input and `{field::option1|option2}` a selector. Conditions use `{#if field == "option1"}...{/if}`. Leave it empty to hide the helper.',
                      }}
                    />
                  </p>
                  <Textarea
                    rows={3}
                    value={sceneTemplate}
                    onChange={(e) => setImageDescriptionTemplateText(e.target.value)}
                    autoResize
                  />
                </div>
              )}

              {showUsageTip && (
                <div>
                  <label className="text-xs text-muted-foreground">
                    <Lang text={{ ko: "활용 팁 (140자 이내)", en: "Usage Tip (max 140 chars)" }} />
                  </label>
                  <Textarea
                    rows={2}
                    value={editing.usageTip || ""}
                    onChange={(e) => setEditing((prev) => (prev ? { ...prev, usageTip: e.target.value } : prev))}
                    autoResize
                    className={cn(usageTipLength > 140 && "border-destructive")}
                  />
                  <p
                    className={cn(
                      "mt-2 text-xxs text-right text-muted-foreground",
                      usageTipLength > 140 && "text-destructive",
                    )}
                  >
                    {usageTipLength}/140
                  </p>
                </div>
              )}

              {isImageStructuredDefaultParams ? (
                <ImagePromptStructuredFields
                  value={imagePromptStructuredState}
                  onChange={setImagePromptStructuredState}
                  extraDefaultParamsText={imagePromptExtraDefaultParamsText}
                  onChangeExtraDefaultParamsText={setImagePromptExtraDefaultParamsText}
                  legacyNegativeDetected={legacyNegativeDetected}
                />
              ) : isContentStructuredDefaultParams ? (
                <ContentPromptStructuredFields
                  value={contentPromptStructuredState}
                  onChange={setContentPromptStructuredState}
                  extraDefaultParamsText={contentPromptExtraDefaultParamsText}
                  onChangeExtraDefaultParamsText={setContentPromptExtraDefaultParamsText}
                />
              ) : (
                <div>
                  <label className="text-xs text-muted-foreground">
                    <Lang text={{ ko: "defaultParams (JSON)", en: "defaultParams (JSON)" }} />
                  </label>
                  <Textarea
                    rows={4}
                    value={defaultParamsText}
                    onChange={(e) => setDefaultParamsText(e.target.value)}
                    autoResize
                  />
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
