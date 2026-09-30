"use client";

import { useEffect, useState } from "react";
import { Check, Folder, Pencil, Plus, Trash2, X } from "lucide-react";
import { Button, Dialog, DialogContent, DialogHeader, DialogTitle, Input } from "@amu-labs/ui";
import { Lang, lang } from "components/module/i18n";
import type { IScrapeLinkCategory } from "libs/api/mini-app/scrapeLinks";
import { ALL_CATEGORY_VALUE, UNCATEGORIZED_CATEGORY_VALUE } from "./categoryConstants";

interface Props {
  categories: IScrapeLinkCategory[];
  totalCount: number;
  uncategorizedCount: number;
  activeCategory: string;
  onActiveCategoryChange: (next: string) => void;
  onCreate: (name: string) => void;
  onRename: (id: string, name: string) => void;
  onDelete: (id: string) => void;
}

export function CategoryManager({
  categories,
  totalCount,
  uncategorizedCount,
  activeCategory,
  onActiveCategoryChange,
  onCreate,
  onRename,
  onDelete,
}: Props) {
  const [open, setOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [editingId, setEditingId] = useState("");
  const [draft, setDraft] = useState("");

  useEffect(function resetDraftWhenEditingCleared() {
    // editingId(외부 선택) 해제 시 draft 초기화
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!editingId) setDraft("");
  }, [editingId]);

  useEffect(function resetFieldsWhenSheetClosed() {
    if (!open) {
      // open(외부 가시성) 해제 시 폼 필드 일괄 초기화
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setNewName("");
      setEditingId("");
      setDraft("");
    }
  }, [open]);

  const submitCreate = () => {
    const trimmed = newName.trim();
    if (!trimmed) return;
    onCreate(trimmed);
    setNewName("");
  };

  const startRename = (category: IScrapeLinkCategory) => {
    setEditingId(category.id);
    setDraft(category.name);
  };

  const commitRename = () => {
    const trimmed = draft.trim();
    if (!editingId || !trimmed) return;
    onRename(editingId, trimmed);
    setEditingId("");
    setDraft("");
  };

  return (
    <>
      <section className="mt-5 rounded-2xl border border-border/60 bg-surface p-4 sm:p-5">
        <div className="mb-3 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Folder className="h-4 w-4 text-primary" />
            <h2 className="text-sm font-semibold">
              <Lang text={{ ko: "카테고리", en: "Categories" }} />
            </h2>
          </div>
          <Button
            size="icon-xs"
            variant="outline"
            onClick={() => setOpen(true)}
            aria-label={lang({ ko: "카테고리 추가/편집", en: "Manage categories" })}
            aria-pressed={open}
            className="ml-1"
          >
            <Plus className="h-4 w-4" />
          </Button>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => onActiveCategoryChange(ALL_CATEGORY_VALUE)}
            className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${
              activeCategory === ALL_CATEGORY_VALUE ? "bg-primary text-white" : "bg-background text-secondary-text"
            }`}
          >
            <Lang text={{ ko: "전체", en: "All" }} />
            <span className="ml-1 opacity-70">{totalCount}</span>
          </button>
          <button
            type="button"
            onClick={() => onActiveCategoryChange(UNCATEGORIZED_CATEGORY_VALUE)}
            className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${
              activeCategory === UNCATEGORIZED_CATEGORY_VALUE
                ? "bg-primary text-white"
                : "bg-background text-secondary-text"
            }`}
          >
            <Lang text={{ ko: "미분류", en: "Uncategorized" }} />
            <span className="ml-1 opacity-70">{uncategorizedCount}</span>
          </button>
          {categories.map((category) => (
            <button
              key={category.id}
              type="button"
              onClick={() => onActiveCategoryChange(category.id)}
              className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${
                activeCategory === category.id ? "bg-primary text-white" : "bg-background text-secondary-text"
              }`}
            >
              {category.name}
              <span className="ml-1 opacity-70">{category.count}</span>
            </button>
          ))}
        </div>
      </section>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              <Lang text={{ ko: "카테고리 관리", en: "Manage categories" }} />
            </DialogTitle>
          </DialogHeader>

          <div className="flex flex-col gap-2 sm:flex-row">
            <Input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") submitCreate();
              }}
              placeholder={lang({ ko: "새 카테고리", en: "New category" })}
              maxLength={40}
              className="h-9 text-xs"
              autoFocus
            />
            <Button size="sm" variant="outline" onClick={submitCreate} disabled={!newName.trim()}>
              <Plus className="mr-1 h-3.5 w-3.5" />
              <Lang text={{ ko: "추가", en: "Add" }} />
            </Button>
          </div>

          {categories.length > 0 ? (
            <ul className="max-h-[60vh] space-y-1 overflow-y-auto pr-1">
              {categories.map((category) => (
                <li key={category.id} className="flex items-center gap-2 rounded-lg bg-background/70 px-2 py-1.5">
                  {editingId === category.id ? (
                    <>
                      <Input
                        value={draft}
                        onChange={(e) => setDraft(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") commitRename();
                          if (e.key === "Escape") setEditingId("");
                        }}
                        className="h-8 text-xs"
                        autoFocus
                        maxLength={40}
                      />
                      <Button
                        size="icon-sm"
                        variant="ghost"
                        onClick={commitRename}
                        aria-label={lang({ ko: "저장", en: "Save" })}
                      >
                        <Check className="h-4 w-4" />
                      </Button>
                      <Button
                        size="icon-sm"
                        variant="ghost"
                        onClick={() => setEditingId("")}
                        aria-label={lang({ ko: "취소", en: "Cancel" })}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </>
                  ) : (
                    <>
                      <span className="min-w-0 flex-1 truncate text-xs font-medium">{category.name}</span>
                      <span className="text-xxs text-secondary-text">{category.count}</span>
                      <Button
                        size="icon-sm"
                        variant="ghost"
                        onClick={() => startRename(category)}
                        aria-label={lang({ ko: "이름 변경", en: "Rename" })}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        size="icon-sm"
                        variant="ghost"
                        onClick={() => onDelete(category.id)}
                        aria-label={lang({ ko: "삭제", en: "Delete" })}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className="rounded-lg border border-dashed border-border/60 bg-background/40 px-3 py-6 text-center text-xs text-secondary-text">
              <Lang
                text={{
                  ko: "등록된 카테고리가 없습니다. 위에서 새 카테고리를 추가해보세요.",
                  en: "No categories yet. Add one above.",
                }}
              />
            </p>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
