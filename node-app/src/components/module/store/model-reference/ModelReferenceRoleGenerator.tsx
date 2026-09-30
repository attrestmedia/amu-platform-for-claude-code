"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { useMutation, useQuery } from "@tanstack/react-query";
import { CheckCircle2, ImagePlus, RefreshCcw } from "lucide-react";
import {
  Badge,
  Button,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  dialog,
} from "@amu-labs/ui";
import { Lang, lang } from "components/module/i18n";
import { ImageStudioEditor } from "components/template/gen-studio/ImageStudioEditor";
import {
  CHARACTER_REFERENCE_LOCKED_TEMPLATE_VARIABLE_KEYS,
  CHARACTER_REFERENCE_IDENTITY_IMAGE_ROLES,
  CHARACTER_REFERENCE_KIT_TEMPLATE_KEY,
  CHARACTER_REFERENCE_ROLE_SHOT_TYPES,
  CHARACTER_REFERENCE_SHOT_TYPE_VARIABLE_KEY,
  CHARACTER_REFERENCE_SPEC_VARIABLE_KEY,
} from "consts/app";
import fetchClient from "libs/api/fetchClient";
import type { ImagePromptMetaType } from "types/app";
import type { CharacterReferenceImageRoleType, ICharacterReferenceKit } from "types/character";
import { fetchRemoteImageAsBasePayload } from "utils/app/imageFile";
import { toUnknownRecord } from "utils/common/typeUtils";
import { getImageReferenceName, type SmartstoreGenStudioReferenceImage } from "../manage/smartstoreDraftUtils";

type ApiEnvelope<T = unknown> = { data?: T };

// 부트스트랩 effect의 의존성으로 들어가므로 렌더마다 새 배열을 만들면
// 에디터가 매번 초기화되어 방금 생성한 결과가 사라진다 (SSM-202 독립 리뷰 P0).
// 기존 Store 계약의 지역 심볼은 공통 정본을 가리키는 alias로만 남긴다.
// 레거시 계약: const LOCKED_TEMPLATE_VARIABLE_KEYS = [CHARACTER_REFERENCE_SHOT_TYPE_VARIABLE_KEY] as const;
const LOCKED_TEMPLATE_VARIABLE_KEYS = CHARACTER_REFERENCE_LOCKED_TEMPLATE_VARIABLE_KEYS;
const ALLOWED_TEMPLATE_KEYS = [CHARACTER_REFERENCE_KIT_TEMPLATE_KEY] as const;

type ModelReferenceRoleGeneratorProps = {
  universeId: string;
  kit: ICharacterReferenceKit;
  role: CharacterReferenceImageRoleType;
  roleLabel: { ko: string; en: string };
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 슬롯 배정이 실제로 반영된 뒤 호출된다. */
  onAssigned: () => void | Promise<void>;
};

/** 생성 결과 목록에서 이 역할의 정체성 기준으로 쓸 앵커 컷. 역할 자신은 앵커에서 제외한다. */
function getIdentityAnchorUrls(kit: ICharacterReferenceKit, role: CharacterReferenceImageRoleType) {
  return CHARACTER_REFERENCE_IDENTITY_IMAGE_ROLES.filter((anchorRole) => anchorRole !== role)
    .map((anchorRole) => String(toUnknownRecord(kit.images?.[anchorRole]).url || "").trim())
    .filter(Boolean);
}

export function ModelReferenceRoleGenerator({
  universeId,
  kit,
  role,
  roleLabel,
  open,
  onOpenChange,
  onAssigned,
}: ModelReferenceRoleGeneratorProps) {
  const [anchorImages, setAnchorImages] = useState<SmartstoreGenStudioReferenceImage[]>([]);
  const [anchorLoading, setAnchorLoading] = useState(false);
  const [assignedAssetId, setAssignedAssetId] = useState("");
  // 이 시트를 연 시점. 이후에 만들어진 컷만 후보로 보여준다.
  // 목록을 유니버스 전체로 열어 두면 "후면 전신" 컷을 얼굴 슬롯에 넣어 readiness를 되살릴 수 있다
  // (SSM-202 독립 리뷰 P1). 서버는 샷타입을 모르므로 후보 범위를 좁히는 것이 유일한 방어다.
  const [openedAt] = useState(() => Date.now());

  const shotType = CHARACTER_REFERENCE_ROLE_SHOT_TYPES[role];
  const specText = String(kit.spec?.promptText || "").trim();
  const anchorUrls = useMemo(() => getIdentityAnchorUrls(kit, role), [kit, role]);
  // 같은 이유로 변수 객체도 값이 바뀔 때만 새로 만든다.
  const templateVariables = useMemo(
    () => ({
      [CHARACTER_REFERENCE_SHOT_TYPE_VARIABLE_KEY]: shotType,
      ...(specText ? { [CHARACTER_REFERENCE_SPEC_VARIABLE_KEY]: specText } : {}),
    }),
    [shotType, specText],
  );

  // 정체성 앵커를 참고 이미지로 미리 준비한다. 실패한 항목은 조용히 빠지고 생성 자체는 계속 가능하다.
  const prepareAnchorImages = useCallback(async () => {
    if (anchorUrls.length === 0) {
      setAnchorImages([]);
      return;
    }
    setAnchorLoading(true);
    try {
      const settled = await Promise.allSettled(
        anchorUrls.map(async (url) => {
          const requestUrl = /^https?:\/\//i.test(url) ? `/api/proxy/image?url=${encodeURIComponent(url)}` : url;
          const payload = await fetchRemoteImageAsBasePayload(requestUrl, getImageReferenceName(url));
          return {
            mimeType: payload.mimeType,
            data: payload.data,
            preview: payload.preview,
            name: getImageReferenceName(url),
          };
        }),
      );
      setAnchorImages(
        settled
          .filter((item): item is PromiseFulfilledResult<SmartstoreGenStudioReferenceImage> => item.status === "fulfilled")
          .map((item) => item.value),
      );
    } finally {
      setAnchorLoading(false);
    }
  }, [anchorUrls]);

  // 역할이 바뀌면 부모가 key로 remount하므로 여기서 상태를 되돌리지 않는다.
  // 준비 작업은 렌더 이후로 미룬다 — StoreManagePanel의 참고 이미지 준비와 같은 패턴이다.
  useEffect(
    function prepareAnchorsWhenOpened() {
      if (!open) return;
      let cancelled = false;
      const timeoutId = window.setTimeout(() => {
        if (!cancelled) void prepareAnchorImages();
      }, 0);
      return () => {
        cancelled = true;
        window.clearTimeout(timeoutId);
      };
    },
    [open, prepareAnchorImages],
  );

  const generatedAssetsQuery = useQuery<ImagePromptMetaType[]>({
    queryKey: ["commerce-model-kit-generated", universeId, kit.kitId, role],
    queryFn: async () => {
      const response = await fetchClient.get<ApiEnvelope>(
        `/lab/studio-images?scope=universe&universeId=${encodeURIComponent(universeId)}&templateKey=${encodeURIComponent(
          CHARACTER_REFERENCE_KIT_TEMPLATE_KEY,
        )}&includeMeta=true&limit=12`,
        { cache: "no-store" },
      );
      return (response?.data?.data || []) as ImagePromptMetaType[];
    },
    enabled: open && !!universeId,
    staleTime: 0,
    refetchOnWindowFocus: false,
  });

  const assignMutation = useMutation({
    mutationFn: async (assetId: string) => {
      await fetchClient.post<ApiEnvelope>(
        `/universe/${universeId}/character-reference-kits/${kit.kitId}/attach-image`,
        { role, assetId, source: "gen_studio" },
      );
      return assetId;
    },
    onSuccess: async (assetId) => {
      setAssignedAssetId(assetId);
      await onAssigned();
    },
    onError: async () => {
      await dialog.alert(
        lang({
          ko: "이 이미지를 역할 슬롯에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.",
          en: "Could not attach this image to the role slot. Please try again.",
        }),
      );
    },
  });

  // 시트를 연 뒤 생성된 컷만 남긴다. 직전 역할에서 만든 컷이 다른 슬롯 후보로 새지 않게 한다.
  const generatedAssets = useMemo(
    () =>
      (generatedAssetsQuery.data || []).filter((asset) => {
        const createdAt = new Date(String(asset.createdAt || "")).getTime();
        return Number.isFinite(createdAt) && createdAt >= openedAt;
      }),
    [generatedAssetsQuery.data, openedAt],
  );

  const handleGenerationDone = useCallback(async () => {
    await generatedAssetsQuery.refetch();
  }, [generatedAssetsQuery]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        disableOutsideClick
        lockBodyScroll
        onFocusOutside={(event) => event.preventDefault()}
        className="flex h-[92vh] max-h-[92vh] w-full flex-col bg-surface p-0"
      >
        <SheetHeader className="border-b border-border px-5 py-4 text-left">
          <SheetTitle>
            <Lang text={{ ko: "역할 컷 생성", en: "Generate role cut" }} /> · <Lang text={roleLabel} />
          </SheetTitle>
          <SheetDescription>
            <Lang
              text={{
                ko: "생성한 결과 중 하나를 직접 골라 이 역할 슬롯에 적용하세요. 자동으로 반영되지 않습니다.",
                en: "Pick one generated result and apply it to this role slot. Nothing is applied automatically.",
              }}
            />
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 space-y-4 overflow-y-auto p-5">
          <div className="rounded-2xl border border-primary/25 bg-primary/5 p-3 text-xs leading-5 text-secondary-text">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="primary">{shotType}</Badge>
              <span className="font-semibold text-primary-text">{kit.name}</span>
            </div>
            <p className="mt-2">
              {anchorLoading ? (
                <Lang text={{ ko: "정체성 기준 컷을 준비하는 중입니다.", en: "Preparing identity anchor cuts." }} />
              ) : anchorImages.length > 0 ? (
                <Lang
                  text={{
                    ko: `정체성 기준 컷 ${anchorImages.length}장이 참고 이미지로 연결됩니다.`,
                    en: `${anchorImages.length} identity anchor cut(s) will be attached as references.`,
                  }}
                />
              ) : (
                <Lang
                  text={{
                    ko: "정체성 기준 컷이 없습니다. 얼굴 클로즈업과 원거리 얼굴 스케일을 먼저 만들면 인물이 덜 흔들립니다.",
                    en: "No identity anchor cut yet. Create the face close-up and distance face scale first for stable identity.",
                  }}
                />
              )}
            </p>
            {!specText ? (
              <p className="mt-1">
                <Lang
                  text={{
                    ko: "스펙 문서가 비어 있어 프롬프트에 주입할 고정 스펙이 없습니다.",
                    en: "The spec document is empty, so no fixed spec is injected into the prompt.",
                  }}
                />
              </p>
            ) : null}
          </div>

          <ImageStudioEditor
            mode="universe"
            universeId={universeId}
            surface="embedded"
            detailPresentation="embedded"
            allowedTemplateKeys={ALLOWED_TEMPLATE_KEYS}
            initialTemplateKey={CHARACTER_REFERENCE_KIT_TEMPLATE_KEY}
            initialModelImages={anchorImages}
            initialTemplateVariables={templateVariables}
            // 슬롯에서 진입했으므로 샷타입이 다른 역할로 흘러가면 안 된다.
            lockedTemplateVariableKeys={LOCKED_TEMPLATE_VARIABLE_KEYS}
            onDone={handleGenerationDone}
          />

          <div className="rounded-2xl border border-border bg-background/70 p-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-secondary-text">
                <Lang text={{ ko: "이 역할로 생성한 결과에서 선택", en: "Pick from results for this role" }} />
              </p>
              <Button
                size="xs"
                variant="outline"
                rounded="md"
                onClick={() => void generatedAssetsQuery.refetch()}
                loading={generatedAssetsQuery.isFetching}
              >
                <RefreshCcw className="h-3.5 w-3.5" />
                <Lang text={{ ko: "새로고침", en: "Refresh" }} />
              </Button>
            </div>

            {generatedAssets.length === 0 ? (
              <div className="mt-3 flex flex-col items-center gap-2 rounded-xl border border-dashed border-border px-4 py-8 text-center text-xs text-secondary-text">
                <ImagePlus className="h-5 w-5" />
                <Lang
                  text={{
                    ko: "이 역할로 만든 결과가 아직 없습니다. 위에서 먼저 생성하세요.",
                    en: "No result for this role yet. Generate one above first.",
                  }}
                />
              </div>
            ) : (
              <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                {generatedAssets.map((asset) => {
                  const assigned = assignedAssetId === asset.assetId;
                  return (
                    <div key={asset.assetId} className="rounded-[0.85rem] border border-border bg-surface p-2">
                      <div className="relative aspect-[3/4] overflow-hidden rounded-[0.65rem] bg-background">
                        {asset.url ? (
                          <Image src={asset.url} alt="" fill unoptimized sizes="180px" className="object-cover" />
                        ) : null}
                        {assigned ? (
                          <span className="absolute right-1 top-1 rounded-full bg-primary p-1 text-white">
                            <CheckCircle2 className="h-3.5 w-3.5" />
                          </span>
                        ) : null}
                      </div>
                      <Button
                        size="xs"
                        variant={assigned ? "outline" : "primary"}
                        rounded="md"
                        className="mt-2 w-full"
                        disabled={assigned}
                        loading={assignMutation.isPending && assignMutation.variables === asset.assetId}
                        onClick={() => assignMutation.mutate(asset.assetId)}
                      >
                        {assigned ? (
                          <Lang text={{ ko: "적용됨", en: "Applied" }} />
                        ) : (
                          <Lang text={{ ko: "이 역할에 적용", en: "Apply to role" }} />
                        )}
                      </Button>
                    </div>
                  );
                })}
              </div>
            )}
            <p className="mt-3 text-xxs leading-4 text-secondary-text">
              {lang({
                ko: "적용하면 해당 assetId가 이 모델의 생성 이력에 기록됩니다.",
                en: "Applying records the assetId in this model's generation lineage.",
              })}
            </p>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
