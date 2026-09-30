"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Badge, Button, Checkbox, Input, Preloader } from "@amu-labs/ui";
import { Lang } from "components/module/i18n";
import { TemplateGroupBulkDialog } from "components/template/gen-studio/modules/TemplateGroupBulkDialog";
import { listAdminGenStudioTemplateGroups, writeAdminGenStudioTemplateGroup } from "libs/api/lab";
import type { GenStudioTemplateGroupType } from "types/app";
import { splitCsv } from "utils/data";
import { cn, runAfterCurrentRender, toErrorMessage } from "utils/common";
import { Layers, RefreshCw, Star, Trash2 } from "lucide-react";

export default function TemplateGroupAdminPanel() {
  const [promptType, setPromptType] = useState<"image" | "content">("image");
  const [groups, setGroups] = useState<GenStudioTemplateGroupType[]>([]);
  const [selectedGroupKey, setSelectedGroupKey] = useState("");
  const [selectedMemberKeys, setSelectedMemberKeys] = useState<string[]>([]);
  const [newMemberKeys, setNewMemberKeys] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const loadGroups = useCallback(async () => {
    setLoading(true);
    setErrorMessage("");
    try {
      setGroups(await listAdminGenStudioTemplateGroups());
    } catch (error) {
      setErrorMessage(toErrorMessage(error, "템플릿 그룹 목록을 불러오지 못했습니다."));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    runAfterCurrentRender(() => void loadGroups());
  }, [loadGroups]);

  const visibleGroups = useMemo(() => groups.filter((group) => group.promptType === promptType), [groups, promptType]);
  const selectedGroup = useMemo(
    () => visibleGroups.find((group) => group.key === selectedGroupKey) || visibleGroups[0] || null,
    [selectedGroupKey, visibleGroups],
  );

  const toggleMember = (templateKey: string, checked: boolean) => {
    setSelectedMemberKeys((current) =>
      checked ? Array.from(new Set([...current, templateKey])) : current.filter((key) => key !== templateKey),
    );
  };

  const updateMembership = async (action: "add_templates" | "remove_templates", templateKeys: string[]) => {
    if (!selectedGroup || templateKeys.length === 0) return;
    setSaving(true);
    setErrorMessage("");
    try {
      await writeAdminGenStudioTemplateGroup({ action, key: selectedGroup.key, templateKeys });
      setSelectedMemberKeys([]);
      setNewMemberKeys("");
      await loadGroups();
    } catch (error) {
      setErrorMessage(toErrorMessage(error, "그룹 멤버십을 저장하지 못했습니다."));
    } finally {
      setSaving(false);
    }
  };

  if (loading && groups.length === 0) {
    return (
      <div className="flex min-h-48 items-center justify-center">
        <Preloader />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1">
          <h2 className="text-base font-semibold text-primary-text">
            <Lang text={{ ko: "템플릿 그룹 원장", en: "Template group registry" }} />
          </h2>
          <p className="mt-1 text-xs text-secondary-text">
            <Lang
              text={{
                ko: "이미지·콘텐츠 그룹과 실제 멤버십, 추천 등록 상태를 확인하고 편집합니다.",
                en: "Inspect and edit image/content groups, memberships, and recommendations.",
              }}
            />
          </p>
        </div>
        <Button
          variant="outline"
          size="icon-sm"
          rounded="full"
          onClick={() => void loadGroups()}
          disabled={loading || saving}
        >
          <RefreshCw className={cn("icon-xs", loading && "animate-spin")} />
          <Lang text={{ ko: "새로고침", en: "Refresh" }} className="sr-only" />
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-2">
        {(["image", "content"] as const).map((type) => (
          <Button
            key={type}
            variant={promptType === type ? "primary" : "outline"}
            onClick={() => {
              setPromptType(type);
              setSelectedGroupKey("");
              setSelectedMemberKeys([]);
              setNewMemberKeys("");
            }}
          >
            <Lang
              text={
                type === "image"
                  ? { ko: "이미지 그룹", en: "Image groups" }
                  : { ko: "콘텐츠 그룹", en: "Content groups" }
              }
            />
          </Button>
        ))}
      </div>

      {errorMessage ? (
        <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          {errorMessage}
        </p>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[minmax(15rem,0.8fr)_minmax(0,1.7fr)]">
        <div className="space-y-2 rounded-xl border border-input bg-card p-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-semibold">
              <Lang text={{ ko: `그룹 목록 (${visibleGroups.length})`, en: `Groups (${visibleGroups.length})` }} />
            </p>
            <Button size="sm" variant="outline" onClick={() => setDialogOpen(true)}>
              <Layers className="h-4 w-4" />
              <Lang text={{ ko: "그룹 설정", en: "Settings" }} />
            </Button>
          </div>
          {visibleGroups.length === 0 ? (
            <p className="rounded-lg bg-muted p-3 text-xs text-secondary-text">
              <Lang text={{ ko: "등록된 그룹이 없습니다.", en: "No groups registered." }} />
            </p>
          ) : (
            visibleGroups.map((group) => (
              <button
                key={group.key}
                type="button"
                onClick={() => {
                  setSelectedGroupKey(group.key);
                  setSelectedMemberKeys([]);
                  setNewMemberKeys("");
                }}
                className={cn(
                  "w-full rounded-lg border px-3 py-2 text-left transition-colors",
                  selectedGroup?.key === group.key ? "border-primary/40 bg-primary/10" : "border-input hover:bg-muted",
                )}
              >
                <span className="flex items-center justify-between gap-2">
                  <span className="truncate text-sm font-medium">{group.title}</span>
                  <Badge variant="outline" size="xs">
                    {group.templateKeys.length}
                  </Badge>
                </span>
                <span className="mt-1 block truncate font-mono text-xxs text-secondary-text">{group.key}</span>
              </button>
            ))
          )}
        </div>

        <div className="space-y-3 rounded-xl border border-input bg-card p-3">
          {selectedGroup ? (
            <>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">{selectedGroup.title}</p>
                  <p className="mt-1 break-all font-mono text-xxs text-secondary-text">{selectedGroup.key}</p>
                  <p className="mt-1 text-xs text-secondary-text">
                    services: {selectedGroup.serviceKeys.join(", ") || "-"} · {selectedGroup.visibility} · enabled{" "}
                    {String(selectedGroup.enabled)}
                  </p>
                </div>
                <Button size="sm" variant="outline" onClick={() => setDialogOpen(true)}>
                  <Star className="h-4 w-4" />
                  <Lang text={{ ko: "메타·추천 편집", en: "Edit metadata" }} />
                </Button>
              </div>

              <div className="flex flex-col gap-2 sm:flex-row">
                <Input
                  value={newMemberKeys}
                  onChange={(event) => setNewMemberKeys(event.target.value)}
                  placeholder="template-key-1, template-key-2"
                  className="min-w-0 flex-1"
                />
                <Button
                  size="sm"
                  onClick={() => void updateMembership("add_templates", splitCsv(newMemberKeys))}
                  disabled={saving || splitCsv(newMemberKeys).length === 0}
                >
                  <Lang text={{ ko: "멤버 추가", en: "Add members" }} />
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={() => void updateMembership("remove_templates", selectedMemberKeys)}
                  disabled={saving || selectedMemberKeys.length === 0}
                >
                  <Trash2 className="h-4 w-4" />
                  <Lang
                    text={{
                      ko: `선택 제거 (${selectedMemberKeys.length})`,
                      en: `Remove (${selectedMemberKeys.length})`,
                    }}
                  />
                </Button>
              </div>

              <div className="max-h-[50vh] space-y-1 overflow-y-auto rounded-lg border border-input p-2">
                {selectedGroup.templateKeys.length === 0 ? (
                  <p className="p-3 text-center text-xs text-secondary-text">
                    <Lang text={{ ko: "그룹에 등록된 템플릿이 없습니다.", en: "No templates in this group." }} />
                  </p>
                ) : (
                  selectedGroup.templateKeys.map((templateKey) => {
                    const recommended = selectedGroup.recommendedTemplateKeys.includes(templateKey);
                    return (
                      <label
                        key={templateKey}
                        className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-2 hover:bg-muted"
                      >
                        <Checkbox
                          checked={selectedMemberKeys.includes(templateKey)}
                          onCheckedChange={(checked) => toggleMember(templateKey, checked === true)}
                        />
                        <span className="min-w-0 flex-1 break-all font-mono text-xs">{templateKey}</span>
                        {recommended ? (
                          <Badge variant="outline" size="xs" className="gap-1 border-amber-500/30 text-amber-600">
                            <Star className="h-3 w-3 fill-current" />
                            <Lang text={{ ko: "추천", en: "Recommended" }} />
                          </Badge>
                        ) : null}
                      </label>
                    );
                  })
                )}
              </div>
            </>
          ) : (
            <p className="p-6 text-center text-xs text-secondary-text">
              <Lang
                text={{ ko: "왼쪽에서 그룹을 선택하거나 새 그룹을 생성하세요.", en: "Select or create a group." }}
              />
            </p>
          )}
        </div>
      </div>

      <TemplateGroupBulkDialog
        open={dialogOpen}
        promptType={promptType}
        initialGroupKey={selectedGroup?.key}
        selectedTemplateKeys={[]}
        onOpenChange={setDialogOpen}
        onComplete={() => void loadGroups()}
      />
    </div>
  );
}
