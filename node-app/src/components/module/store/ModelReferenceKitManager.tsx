"use client";

import { useMemo, useRef, useState } from "react";
import Image from "next/image";
import { useMutation } from "@tanstack/react-query";
import { CheckCircle2, ImagePlus, Plus, RefreshCcw, Save, SquareUserRound, Upload, Wand } from "lucide-react";
import { Badge, Button, Checkbox, Input, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Textarea, dialog } from "@amu-labs/ui";
import { Lang, lang } from "components/module/i18n";
import { CHARACTER_REFERENCE_KIT_TEMPLATE_KEY } from "consts/app";
import { CHARACTER_REFERENCE_IMAGE_ROLES } from "consts/app/characterReferenceSet";
import { CHARACTER_GENESIS_STAGES } from "types/ui/characterGenesis";
import { ModelReferenceRoleGenerator } from "./model-reference/ModelReferenceRoleGenerator";
import fetchClient from "libs/api/fetchClient";
import type {
  CharacterReferenceImageRoleType,
  CharacterReferenceQualityAxisType,
  CharacterReferenceSpecType,
  ICharacterReferenceKit,
} from "types/character";
import { toUnknownRecord } from "utils/common/typeUtils";

type ApiEnvelope<T = unknown> = {
  data?: T;
};

type ModelReferenceKitManagerProps = {
  universeId: string;
  kits?: ICharacterReferenceKit[];
  selectedKitIds?: string[];
  onSelectedKitIdsChange?: (kitIds: string[]) => void;
  onChanged?: () => void | Promise<void>;
  onInsertBodyImage?: (url: string) => void;
  /** Gen Studio 진입 전 로그인·접근 확인. false를 돌려주면 생성 시트를 열지 않는다. */
  ensureGenStudioAccess?: () => boolean;
};

type KitResponse = {
  kit?: ICharacterReferenceKit | null;
};

type UploadResponse = {
  url?: string;
};

const MODEL_REFERENCE_IMAGE_ROLE_PRESENTATION: Record<
  CharacterReferenceImageRoleType,
  { label: { ko: string; en: string }; helper: { ko: string; en: string } }
> = {
  profile: {
    label: { ko: "대표 프로필", en: "Profile" },
    helper: { ko: "목록 썸네일과 내부 식별용", en: "Thumbnail and internal identity" },
  },
  frontFullBody: {
    label: { ko: "정면 전신", en: "Front full body" },
    helper: { ko: "핏과 비율 유지 핵심 기준", en: "Main fit and proportion reference" },
  },
  faceCloseup: {
    label: { ko: "얼굴 클로즈업", en: "Face close-up" },
    helper: { ko: "얼굴 일관성 기준", en: "Face consistency reference" },
  },
  leftFullBody: {
    label: { ko: "좌측 전신", en: "Left full body" },
    helper: { ko: "측면 착장 생성용", en: "Side outfit generation" },
  },
  rightFullBody: {
    label: { ko: "우측 전신", en: "Right full body" },
    helper: { ko: "측면 착장 생성용", en: "Side outfit generation" },
  },
  backFullBody: {
    label: { ko: "후면 전신", en: "Back full body" },
    helper: { ko: "아우터/팬츠 뒷핏 기준", en: "Back fit reference" },
  },
  headlessFrontBody: {
    label: { ko: "헤드리스 정면 전신", en: "Headless front body" },
    helper: { ko: "얼굴 없이 핏·기장만 판단", en: "Fit and length only, no face" },
  },
  distanceFaceScale: {
    label: { ko: "원거리 얼굴 스케일", en: "Distance face scale" },
    helper: { ko: "클로즈업과 한 쌍인 정체성 기준", en: "Paired identity anchor with close-up" },
  },
};

const MODEL_REFERENCE_IMAGE_ROLES = CHARACTER_REFERENCE_IMAGE_ROLES.map((role) => ({
  role,
  ...MODEL_REFERENCE_IMAGE_ROLE_PRESENTATION[role],
}));

/** readiness 축 표시. 역할 개수가 아니라 무엇을 판단할 수 있는지를 보여준다 (SSM-202). */
const QUALITY_AXIS_LABELS: Array<{
  axis: CharacterReferenceQualityAxisType;
  label: { ko: string; en: string };
}> = [
  { axis: "identity", label: { ko: "정체성", en: "Identity" } },
  { axis: "fit", label: { ko: "착장 핏", en: "Fit" } },
  { axis: "angle", label: { ko: "각도", en: "Angle" } },
];

const MODEL_REFERENCE_SPEC_FIELDS: Array<{
  key: keyof CharacterReferenceSpecType;
  label: { ko: string; en: string };
}> = [
  { key: "heightImpression", label: { ko: "키 인상", en: "Height impression" } },
  { key: "bodyType", label: { ko: "체형", en: "Body type" } },
  { key: "skinTone", label: { ko: "피부톤", en: "Skin tone" } },
  { key: "hair", label: { ko: "헤어", en: "Hair" } },
  { key: "faceShape", label: { ko: "얼굴형", en: "Face shape" } },
  { key: "mood", label: { ko: "분위기", en: "Mood" } },
];

function toSafeString(value: unknown) {
  return value == null ? "" : String(value).trim();
}

function listTextToArray(value: string) {
  return Array.from(
    new Set(
      value
        .split(/[,\n]+/)
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  );
}

function getRoleImageUrl(kit: ICharacterReferenceKit | null | undefined, role: CharacterReferenceImageRoleType) {
  return toSafeString(toUnknownRecord(kit?.images?.[role]).url);
}

function countImages(kit: ICharacterReferenceKit) {
  return MODEL_REFERENCE_IMAGE_ROLES.filter((item) => getRoleImageUrl(kit, item.role)).length;
}

function getReadinessLabel(level?: string) {
  if (level === "complete") return { ko: "완성", en: "Complete" };
  if (level === "recommended") return { ko: "권장", en: "Recommended" };
  if (level === "minimum") return { ko: "최소 충족", en: "Minimum" };
  return { ko: "보완 필요", en: "Needs work" };
}

function buildSpecPrompt(spec: CharacterReferenceSpecType) {
  const lines = [
    ["Height impression", spec.heightImpression],
    ["Body type", spec.bodyType],
    ["Skin tone", spec.skinTone],
    ["Hair", spec.hair],
    ["Face shape", spec.faceShape],
    ["Mood", spec.mood],
    ["Pose rules", spec.poseRules],
    ["Styling rules", spec.stylingRules],
    ["Negative rules", spec.negativeRules],
  ]
    .filter(([, value]) => toSafeString(value))
    .map(([label, value]) => `${label}: ${value}`);
  return lines.join("\n");
}

export function ModelReferenceKitManager({
  universeId,
  kits = [],
  selectedKitIds,
  onSelectedKitIdsChange,
  onChanged,
  onInsertBodyImage,
  ensureGenStudioAccess,
}: ModelReferenceKitManagerProps) {
  const [newKitName, setNewKitName] = useState("");
  const [activeKitId, setActiveKitId] = useState(kits[0]?.kitId || "");
  const activeKit = useMemo(
    () => kits.find((kit) => kit.kitId === activeKitId) || kits[0] || null,
    [activeKitId, kits],
  );
  const [draftSpec, setDraftSpec] = useState<CharacterReferenceSpecType>({});
  const [tagText, setTagText] = useState("");
  const [categoryHintText, setCategoryHintText] = useState("");
  const [uploadTargetRole, setUploadTargetRole] = useState<CharacterReferenceImageRoleType>("profile");
  const [manualImageUrl, setManualImageUrl] = useState("");
  const [generatorRole, setGeneratorRole] = useState<CharacterReferenceImageRoleType | null>(null);
  const uploadInputRef = useRef<HTMLInputElement | null>(null);

  const selectedSet = useMemo(() => (selectedKitIds ? new Set(selectedKitIds) : null), [selectedKitIds]);

  const notifyChanged = async () => {
    await onChanged?.();
  };

  const createKitMutation = useMutation({
    mutationFn: async () => {
      const response = await fetchClient.post<ApiEnvelope<KitResponse>>(
        `/universe/${universeId}/character-reference-kits`,
        { name: newKitName.trim() },
      );
      return response?.data?.data?.kit || null;
    },
    onSuccess: async (kit) => {
      setNewKitName("");
      if (kit?.kitId) setActiveKitId(kit.kitId);
      await notifyChanged();
    },
  });

  const updateKitMutation = useMutation({
    mutationFn: async () => {
      if (!activeKit) return null;
      const spec = {
        ...draftSpec,
        promptText: toSafeString(draftSpec.promptText) || buildSpecPrompt(draftSpec),
      };
      const response = await fetchClient.patch<ApiEnvelope<KitResponse>>(
        `/universe/${universeId}/character-reference-kits/${activeKit.kitId}`,
        {
          patch: {
            name: activeKit.name,
            tags: listTextToArray(tagText),
            categoryHints: listTextToArray(categoryHintText),
            spec,
          },
        },
      );
      return response?.data?.data?.kit || null;
    },
    onSuccess: async () => {
      await notifyChanged();
    },
  });

  const attachImageMutation = useMutation({
    mutationFn: async (params: { role: CharacterReferenceImageRoleType; url: string; source?: string }) => {
      if (!activeKit) return null;
      const response = await fetchClient.post<ApiEnvelope<KitResponse>>(
        `/universe/${universeId}/character-reference-kits/${activeKit.kitId}/attach-image`,
        params,
      );
      return response?.data?.data?.kit || null;
    },
    onSuccess: async () => {
      setManualImageUrl("");
      await notifyChanged();
    },
  });

  const uploadImageMutation = useMutation({
    mutationFn: async (file: File) => {
      if (!activeKit) return null;
      const formData = new FormData();
      formData.append("file", file);
      formData.append("kind", "commerce-model-reference");
      formData.append("pid", activeKit.kitId);
      const response = await fetchClient.post<ApiEnvelope<UploadResponse>>(`/universe/${universeId}/upload`, formData);
      const url = toSafeString(response?.data?.data?.url);
      if (!url) throw new Error("upload_url_missing");
      return await attachImageMutation.mutateAsync({ role: uploadTargetRole, url, source: "upload" });
    },
    onSuccess: async () => {
      await notifyChanged();
    },
  });

  const readinessMutation = useMutation({
    mutationFn: async () => {
      if (!activeKit) return null;
      const response = await fetchClient.post<ApiEnvelope<KitResponse>>(
        `/universe/${universeId}/character-reference-kits/${activeKit.kitId}/readiness`,
        {},
      );
      return response?.data?.data?.kit || null;
    },
    onSuccess: async () => {
      await notifyChanged();
    },
  });

  const archiveKitMutation = useMutation({
    mutationFn: async () => {
      if (!activeKit) return null;
      const confirmed = await dialog.confirm(
        lang({
          ko: "이 전용 모델을 보관할까요? 기존 상품 선택에서는 제거되지 않지만 새 생성에는 사용하지 않는 것이 좋습니다.",
          en: "Archive this model kit? Existing draft selections remain, but it should not be used for new generations.",
        }),
      );
      if (!confirmed) return null;
      const response = await fetchClient.delete<ApiEnvelope<KitResponse>>(
        `/universe/${universeId}/character-reference-kits/${activeKit.kitId}`,
      );
      return response?.data?.data?.kit || null;
    },
    onSuccess: async () => {
      setActiveKitId("");
      await notifyChanged();
    },
  });

  const handleSelectKit = (kitId: string, checked: boolean) => {
    if (!selectedKitIds || !onSelectedKitIdsChange) return;
    const next = new Set(selectedKitIds);
    if (checked) next.add(kitId);
    else next.delete(kitId);
    onSelectedKitIdsChange(Array.from(next));
  };

  const applyActiveToDraft = () => {
    if (!activeKit?.kitId) return;
    handleSelectKit(activeKit.kitId, true);
  };

  return (
    <div className="space-y-4">
      <div
        data-character-genesis-stage={CHARACTER_GENESIS_STAGES[0]}
        className="rounded-[1rem] border border-border bg-background/70 p-3"
      >
        <p className="text-sm font-semibold text-primary-text">
          <Lang text={{ ko: "새 전용 모델", en: "New store model" }} />
        </p>
        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
          <Input
            value={newKitName}
            onChange={(event) => setNewKitName(event.target.value)}
            placeholder={lang({ ko: "예: 20대 데일리 여성 모델", en: "e.g. Daily female model" })}
          />
          <Button
            className="shrink-0"
            onClick={() => createKitMutation.mutate()}
            loading={createKitMutation.isPending}
            disabled={!newKitName.trim()}
          >
            <Plus className="h-4 w-4" />
            <Lang text={{ ko: "생성", en: "Create" }} />
          </Button>
        </div>
      </div>

      {kits.length > 0 ? (
        <div className="grid gap-4 lg:grid-cols-[18rem_minmax(0,1fr)]">
          <div className="space-y-2">
            {kits.map((kit) => {
              const active = activeKit?.kitId === kit.kitId;
              const selected = selectedSet?.has(kit.kitId) ?? false;
              const profileUrl = getRoleImageUrl(kit, "profile") || getRoleImageUrl(kit, "frontFullBody");
              return (
                <button
                  key={kit.kitId}
                  className={`w-full rounded-[0.9rem] border p-3 text-left transition ${
                    active ? "border-primary bg-primary/10" : "border-border bg-background/70 hover:border-primary/60"
                  }`}
                  onClick={() => {
                    setActiveKitId(kit.kitId);
                    setDraftSpec(kit.spec || {});
                    setTagText((kit.tags || []).join(", "));
                    setCategoryHintText((kit.categoryHints || []).join(", "));
                  }}
                >
                  <div className="flex gap-3">
                    <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-[0.7rem] bg-surface">
                      {profileUrl ? (
                        <Image src={profileUrl} alt="" fill unoptimized sizes="56px" className="object-cover" />
                      ) : (
                        <div className="flex h-full items-center justify-center text-secondary-text">
                          <SquareUserRound className="h-5 w-5" />
                        </div>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="truncate text-sm font-semibold text-primary-text">{kit.name}</p>
                        {selected ? <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-primary" /> : null}
                      </div>
                      <p className="mt-1 text-xxs text-secondary-text">
                        v{kit.version || 1} · {countImages(kit)}/{MODEL_REFERENCE_IMAGE_ROLES.length}{" "}
                        <Lang text={{ ko: "이미지", en: "images" }} />
                      </p>
                      <Badge variant={kit.quality?.ready ? "primary" : "secondary"} className="mt-2">
                        <Lang text={getReadinessLabel(kit.quality?.readinessLevel)} />
                      </Badge>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>

          {activeKit ? (
            <div className="space-y-4">
              <div
                data-character-genesis-stage={CHARACTER_GENESIS_STAGES[2]}
                className="rounded-[1rem] border border-border bg-background/70 p-3"
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="text-base font-semibold text-primary-text">{activeKit.name}</p>
                    <p className="mt-1 text-xs leading-5 text-secondary-text">
                      <Lang
                        text={{
                          ko: "선택한 전용 모델은 AI 이미지 생성 시 모델 이미지로 자동 첨부됩니다.",
                          en: "Selected kits are attached as Gen Studio model images automatically.",
                        }}
                      />
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <Badge variant="secondary">
                        <Lang text={{ ko: "기준 템플릿", en: "Source template" }} />:{" "}
                        {activeKit.sourceTemplateKey || CHARACTER_REFERENCE_KIT_TEMPLATE_KEY}
                      </Badge>
                      <Badge variant="secondary">v{activeKit.version || 1}</Badge>
                      <Badge variant={activeKit.quality?.ready ? "primary" : "secondary"}>
                        <Lang text={getReadinessLabel(activeKit.quality?.readinessLevel)} />
                      </Badge>
                    </div>
                  </div>
                  {selectedKitIds !== undefined && onSelectedKitIdsChange ? (
                    <div className="flex flex-wrap gap-2">
                      <label className="flex items-center gap-2 rounded-[0.75rem] border border-border px-3 py-2 text-xs text-secondary-text">
                        <Checkbox
                          checked={selectedSet?.has(activeKit.kitId) ?? false}
                          onCheckedChange={(checked) => handleSelectKit(activeKit.kitId, checked === true)}
                        />
                        <Lang text={{ ko: "이 상품에 사용", en: "Use for this product" }} />
                      </label>
                      <Button size="sm" variant="outline" rounded="md" onClick={applyActiveToDraft}>
                        <Lang text={{ ko: "선택", en: "Select" }} />
                      </Button>
                    </div>
                  ) : null}
                </div>
              </div>

              <div
                data-character-genesis-stage={CHARACTER_GENESIS_STAGES[0]}
                className="rounded-[1rem] border border-border bg-background/70 p-3"
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                  <div className="grid flex-1 gap-3 sm:grid-cols-2">
                    <div>
                      <label className="text-xs font-semibold text-primary-text">
                        <Lang text={{ ko: "태그", en: "Tags" }} />
                      </label>
                      <Input value={tagText} onChange={(event) => setTagText(event.target.value)} />
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-primary-text">
                        <Lang text={{ ko: "카테고리 힌트", en: "Category hints" }} />
                      </label>
                      <Input value={categoryHintText} onChange={(event) => setCategoryHintText(event.target.value)} />
                    </div>
                  </div>
                  <Button
                    size="sm"
                    rounded="md"
                    onClick={() => updateKitMutation.mutate()}
                    loading={updateKitMutation.isPending}
                  >
                    <Save className="h-4 w-4" />
                    <Lang text={{ ko: "스펙 저장", en: "Save spec" }} />
                  </Button>
                </div>

                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  {MODEL_REFERENCE_SPEC_FIELDS.map(({ key, label }) => (
                    <div key={key}>
                      <label className="text-xs font-semibold text-primary-text">
                        <Lang text={label} />
                      </label>
                      <Input
                        value={toSafeString(draftSpec[key])}
                        onChange={(event) => setDraftSpec((prev) => ({ ...prev, [key]: event.target.value }))}
                      />
                    </div>
                  ))}
                </div>

                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <div>
                    <label className="text-xs font-semibold text-primary-text">
                      <Lang text={{ ko: "포즈 제한", en: "Pose rules" }} />
                    </label>
                    <Textarea
                      rows={3}
                      value={toSafeString(draftSpec.poseRules)}
                      onChange={(event) => setDraftSpec((prev) => ({ ...prev, poseRules: event.target.value }))}
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-primary-text">
                      <Lang text={{ ko: "스타일링 규칙", en: "Styling rules" }} />
                    </label>
                    <Textarea
                      rows={3}
                      value={toSafeString(draftSpec.stylingRules)}
                      onChange={(event) => setDraftSpec((prev) => ({ ...prev, stylingRules: event.target.value }))}
                    />
                  </div>
                </div>

                <div className="mt-3">
                  <label className="text-xs font-semibold text-primary-text">
                    <Lang text={{ ko: "반복 삽입용 프롬프트 문서", en: "Reusable prompt document" }} />
                  </label>
                  <Textarea
                    rows={5}
                    value={toSafeString(draftSpec.promptText)}
                    onChange={(event) => setDraftSpec((prev) => ({ ...prev, promptText: event.target.value }))}
                    placeholder={buildSpecPrompt(draftSpec)}
                  />
                </div>
              </div>

              <div
                data-character-genesis-stage={CHARACTER_GENESIS_STAGES[1]}
                className="rounded-[1rem] border border-border bg-background/70 p-3"
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                  <div className="grid flex-1 gap-2 sm:grid-cols-[12rem_minmax(0,1fr)]">
                    <Select value={uploadTargetRole} onValueChange={(value) => setUploadTargetRole(value as CharacterReferenceImageRoleType)}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {MODEL_REFERENCE_IMAGE_ROLES.map((item) => (
                          <SelectItem key={item.role} value={item.role}>
                            {lang(item.label)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Input
                      value={manualImageUrl}
                      onChange={(event) => setManualImageUrl(event.target.value)}
                      placeholder={lang({ ko: "이미지 URL을 붙여넣거나 업로드하세요.", en: "Paste an image URL or upload." })}
                    />
                  </div>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      rounded="md"
                      onClick={() => uploadInputRef.current?.click()}
                      loading={uploadImageMutation.isPending}
                    >
                      <Upload className="h-4 w-4" />
                      <Lang text={{ ko: "업로드", en: "Upload" }} />
                    </Button>
                    <Button
                      size="sm"
                      rounded="md"
                      onClick={() => attachImageMutation.mutate({ role: uploadTargetRole, url: manualImageUrl.trim(), source: "manual" })}
                      disabled={!manualImageUrl.trim()}
                      loading={attachImageMutation.isPending}
                    >
                      <ImagePlus className="h-4 w-4" />
                      <Lang text={{ ko: "연결", en: "Attach" }} />
                    </Button>
                  </div>
                </div>
                <input
                  ref={uploadInputRef}
                  className="hidden"
                  type="file"
                  accept="image/*"
                  onChange={(event) => {
                    const file = event.target.files?.[0] || null;
                    event.target.value = "";
                    if (file) uploadImageMutation.mutate(file);
                  }}
                />

                <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {MODEL_REFERENCE_IMAGE_ROLES.map((item) => {
                    const url = getRoleImageUrl(activeKit, item.role);
                    return (
                      <div key={item.role} className="rounded-[0.85rem] border border-border bg-surface p-2">
                        <div className="relative aspect-[3/4] overflow-hidden rounded-[0.65rem] bg-background">
                          {url ? (
                            <Image src={url} alt="" fill unoptimized sizes="180px" className="object-cover" />
                          ) : (
                            <div className="flex h-full items-center justify-center text-secondary-text">
                              <ImagePlus className="h-6 w-6" />
                            </div>
                          )}
                        </div>
                        <p className="mt-2 truncate text-xs font-semibold text-primary-text">
                          <Lang text={item.label} />
                        </p>
                        <p className="mt-1 line-clamp-2 text-xxs leading-4 text-secondary-text">
                          <Lang text={item.helper} />
                        </p>
                        <Button
                          size="xs"
                          variant="outline"
                          rounded="md"
                          className="mt-2 w-full"
                          onClick={() => {
                            // gen-studio-process.md §4 — 생성 진입은 로그인 게이트를 먼저 통과한다.
                            if (ensureGenStudioAccess && !ensureGenStudioAccess()) return;
                            setGeneratorRole(item.role);
                          }}
                        >
                          <Wand className="h-3.5 w-3.5" />
                          <Lang text={url ? { ko: "다시 생성", en: "Regenerate" } : { ko: "생성", en: "Generate" }} />
                        </Button>
                        {url && onInsertBodyImage ? (
                          <Button
                            size="xs"
                            variant="outline"
                            rounded="md"
                            className="mt-2 w-full"
                            onClick={() => onInsertBodyImage(url)}
                          >
                            <Lang text={{ ko: "본문 삽입", en: "Insert body" }} />
                          </Button>
                        ) : null}
                      </div>
                    );
                  })}
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    rounded="md"
                    onClick={() => readinessMutation.mutate()}
                    loading={readinessMutation.isPending}
                  >
                    <RefreshCcw className="h-4 w-4" />
                    <Lang text={{ ko: "품질 검사", en: "Check readiness" }} />
                  </Button>
                  <Button
                    size="sm"
                    variant="destructive"
                    rounded="md"
                    onClick={() => archiveKitMutation.mutate()}
                    loading={archiveKitMutation.isPending}
                  >
                    <Lang text={{ ko: "보관", en: "Archive" }} />
                  </Button>
                  {activeKit.quality?.warnings?.length ? (
                    <span className="self-center text-xxs text-secondary-text">
                      <Lang text={{ ko: `경고 ${activeKit.quality.warnings.length}개`, en: `${activeKit.quality.warnings.length} warnings` }} />
                    </span>
                  ) : null}
                </div>

                <div className="mt-3 flex flex-wrap gap-2">
                  {QUALITY_AXIS_LABELS.map(({ axis, label }) => {
                    const satisfied = Boolean(activeKit.quality?.axes?.[axis]?.satisfied);
                    return (
                      <Badge key={axis} variant={satisfied ? "primary" : "secondary"}>
                        <Lang text={label} />
                        {satisfied ? " ✓" : ""}
                      </Badge>
                    );
                  })}
                </div>
              </div>
            </div>
          ) : null}
        </div>
      ) : (
        <div className="rounded-[1rem] border border-dashed border-border px-4 py-8 text-center text-sm text-secondary-text">
          <Lang text={{ ko: "아직 전용 모델이 없습니다. 첫 모델을 만들어보세요.", en: "No store model yet. Create the first one." }} />
        </div>
      )}

      {activeKit && generatorRole ? (
        <ModelReferenceRoleGenerator
          key={`${activeKit.kitId}:${generatorRole}`}
          universeId={universeId}
          kit={activeKit}
          role={generatorRole}
          roleLabel={
            MODEL_REFERENCE_IMAGE_ROLES.find((item) => item.role === generatorRole)?.label || {
              ko: "역할",
              en: "Role",
            }
          }
          open={Boolean(generatorRole)}
          onOpenChange={(open) => {
            if (!open) setGeneratorRole(null);
          }}
          onAssigned={notifyChanged}
        />
      ) : null}
    </div>
  );
}
