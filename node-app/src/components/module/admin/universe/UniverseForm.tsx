"use client";

import { useState, useEffect, useCallback } from "react";
import { BottomSheetDialog, Button, Input, Textarea, Switch, RadioGroup, RadioGroupItem, dialog } from "@amu-labs/ui";
import { FileUpload } from "components/module/upload";
import { ImageBox } from "components/module/image";
import type { ICommerceShowroomConfig, IUniverse, IStageInfo, INpcInfo, UniverseType } from "types/game";
import fetchClient from "libs/api/fetchClient";
import { logger } from "utils/log";
import { Save, X, Minus, Images } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { GAME_CONSTANTS as GC } from "consts/game";
import { useUserData } from "hooks/auth";
import type { LanguageType } from "types/language";
import { DEFAULT_FANTASY_UNIVERSE } from "consts/app";
import { Lang, lang } from "components/module/i18n";
import { listStudioImageMetas } from "libs/api/lab";
import type { ImagePromptMetaType } from "types/app";
import { cn } from "utils/common";
import { runAfterCurrentRender, toUnknownRecord } from "utils/common/typeUtils";
import { useGlobalStore } from "store/global";
import { UniverseCommerceAccessFields } from "./UniverseCommerceAccessFields";

interface UniverseFormProps {
  universe?: IUniverse | null;
  onSuccess: () => void;
  onCancel: () => void;
}

interface FormData extends Omit<IUniverse, "createdAt" | "updatedAt" | "order"> {
  order?: number;
  commerceAdmins: string[];
}

const AUTHORIZED_IMAGE_LIMIT = 60;

type AuthorizedImageItem = ImagePromptMetaType & {
  sourceLabel: string;
};

type SubmitNotice = {
  type: "info" | "error";
  message: string;
};

type UniverseTypeSpecific = NonNullable<FormData["typeSpecific"]> & {
  branding?: {
    logoTextStyle?: {
      color?: string;
      shadow?: string;
    };
  };
  showroom?: ICommerceShowroomConfig;
};

const parseImageUrlList = (raw: string): string[] =>
  Array.from(
    new Set(
      raw
        .split(/[,\n]+/)
        .map((s) => s.trim())
        .filter(Boolean),
    ),
  );

const formatImageUrlList = (urls?: string[]) => (urls ?? []).join(",\n");

function UniverseImageField({
  id,
  label,
  value,
  onChange,
  multiple = false,
  uploadUniverseId,
  authorizedUniverseId,
  pid,
  kind,
  placeholder,
  helperText,
  error,
  maxFiles = 20,
}: {
  id: string;
  label: React.ReactNode;
  value: string | string[];
  onChange: (next: string | string[]) => void;
  multiple?: boolean;
  uploadUniverseId?: string;
  authorizedUniverseId?: string;
  pid?: string;
  kind: string;
  placeholder?: string;
  helperText?: React.ReactNode;
  error?: string;
  maxFiles?: number;
}) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [authorizedImages, setAuthorizedImages] = useState<AuthorizedImageItem[]>([]);
  const [authorizedLoading, setAuthorizedLoading] = useState(false);
  const [authorizedError, setAuthorizedError] = useState("");

  const currentUrls = Array.isArray(value) ? value : String(value || "").trim() ? [String(value).trim()] : [];
  const selectedUrlSet = new Set(currentUrls);
  const formattedCurrentUrls = formatImageUrlList(currentUrls);
  const [draftValue, setDraftValue] = useState(formattedCurrentUrls);
  const normalizedUploadUniverseId = String(uploadUniverseId || "").trim();
  const normalizedAuthorizedUniverseId = String(authorizedUniverseId || "").trim();

  const commitUrls = (nextUrls: string[]) => {
    const cleaned = Array.from(new Set(nextUrls.map((url) => String(url || "").trim()).filter(Boolean)));
    if (multiple) setDraftValue(formatImageUrlList(cleaned));
    onChange(multiple ? cleaned : cleaned[0] || "");
  };

  useEffect(() => {
    if (!multiple) return;
    runAfterCurrentRender(() => setDraftValue(formattedCurrentUrls));
  }, [multiple, formattedCurrentUrls]);

  useEffect(() => {
    if (!pickerOpen) return;
    let mounted = true;

    void (async () => {
      setAuthorizedLoading(true);
      setAuthorizedError("");

      try {
        const requests: Promise<AuthorizedImageItem[]>[] = [
          listStudioImageMetas({ scope: "user", limit: AUTHORIZED_IMAGE_LIMIT }).then((rows) =>
            rows.map((row) => ({ ...row, sourceLabel: lang({ ko: "내 이미지", en: "My image" }) })),
          ),
        ];

        if (normalizedAuthorizedUniverseId) {
          requests.push(
            listStudioImageMetas({
              scope: "universe",
              universeId: normalizedAuthorizedUniverseId,
              limit: AUTHORIZED_IMAGE_LIMIT,
            }).then((rows) =>
              rows.map((row) => ({ ...row, sourceLabel: lang({ ko: "유니버스 이미지", en: "Universe image" }) })),
            ),
          );
        }

        const settled = await Promise.allSettled(requests);
        const merged = settled.flatMap((result) => (result.status === "fulfilled" ? result.value : []));
        const seen = new Set<string>();
        const deduped = merged.filter((row) => {
          const url = String(row?.url || "").trim();
          if (!url || seen.has(url)) return false;
          seen.add(url);
          return true;
        });

        if (!mounted) return;
        setAuthorizedImages(deduped);

        if (settled.every((result) => result.status === "rejected")) {
          setAuthorizedError(
            lang({ ko: "선택 가능한 이미지를 불러오지 못했습니다.", en: "Failed to load selectable images." }),
          );
        }
      } finally {
        if (mounted) setAuthorizedLoading(false);
      }
    })();

    return () => {
      mounted = false;
    };
  }, [pickerOpen, normalizedAuthorizedUniverseId]);

  const handleAuthorizedSelect = (url: string) => {
    if (multiple) {
      if (selectedUrlSet.has(url)) {
        commitUrls(currentUrls.filter((item) => item !== url));
        return;
      }
      commitUrls([...currentUrls, url]);
      return;
    }

    commitUrls([url]);
    setPickerOpen(false);
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <label htmlFor={id} className="text-sm font-medium text-primary-text">
          {label}
        </label>
        <Button variant="outline" size="sm" onClick={() => setPickerOpen(true)}>
          <Images size={14} />
          <Lang text={{ ko: "이미지 선택", en: "Choose Image" }} />
        </Button>
      </div>

      {multiple ? (
        <Textarea
          id={id}
          rows={3}
          value={draftValue}
          onChange={(e) => setDraftValue(e.target.value)}
          onBlur={(e) => commitUrls(parseImageUrlList(e.target.value))}
          placeholder={placeholder}
          className={error ? "border-danger" : ""}
        />
      ) : (
        <Input
          id={id}
          value={currentUrls[0] || ""}
          onChange={(e) => commitUrls([e.target.value])}
          placeholder={placeholder}
          className={error ? "border-danger" : ""}
        />
      )}

      {error && <p className="text-sm text-danger">{error}</p>}
      {helperText && <p className="text-xs text-muted-foreground">{helperText}</p>}

      <FileUpload
        endpoint={normalizedUploadUniverseId ? undefined : "/upload"}
        universeId={normalizedUploadUniverseId || undefined}
        pid={pid}
        kind={kind}
        value={currentUrls}
        onChange={commitUrls}
        multiple={multiple}
        maxFiles={maxFiles}
        ui="dropzone"
      />

      <BottomSheetDialog
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        title={lang({ ko: "권한 있는 이미지 선택", en: "Select an authorized image" })}
      >
        <div className="space-y-4 px-4 py-4">
          <p className="text-xs leading-5 text-secondary-text">
            <Lang
              text={{
                ko: "내 Gen Studio 이미지와 이 유니버스에 편집 권한이 있는 이미지만 표시됩니다.",
                en: "Only your Gen Studio images and images from universes you can edit are shown.",
              }}
            />
          </p>

          {authorizedError ? <p className="text-xs text-danger">{authorizedError}</p> : null}

          {authorizedLoading ? (
            <div className="rounded-lg border border-dashed border-border/60 px-4 py-8 text-center text-sm text-secondary-text">
              <Lang text={{ ko: "이미지를 불러오는 중입니다.", en: "Loading images." }} />
            </div>
          ) : authorizedImages.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border/60 px-4 py-8 text-center text-sm text-secondary-text">
              <Lang text={{ ko: "선택 가능한 이미지가 없습니다.", en: "No selectable images." }} />
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {authorizedImages.map((image) => {
                const imageUrl = String(image.url || "").trim();
                const active = selectedUrlSet.has(imageUrl);

                return (
                  <button
                    key={`${image.assetId || imageUrl}-${image.sourceLabel}`}
                    type="button"
                    onClick={() => handleAuthorizedSelect(imageUrl)}
                    className={cn(
                      "overflow-hidden rounded-lg border border-border/60 bg-surface text-left transition-colors",
                      active && "border-primary ring-1 ring-primary/30",
                    )}
                  >
                    <div className="overflow-hidden border-b border-border/50 bg-muted/20">
                      <ImageBox
                        src={imageUrl}
                        alt={image.templateKey || image.assetId || "studio-image"}
                        className="h-auto w-full"
                        width="100%"
                        height="auto"
                        objectFit="object-cover"
                      />
                    </div>
                    <div className="space-y-1 px-3 py-3">
                      <div className="flex items-center justify-between gap-2">
                        <span className="line-clamp-1 text-xs font-semibold text-primary-text">
                          {image.templateKey || image.modelName || image.assetId}
                        </span>
                        {active ? (
                          <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xxs font-medium text-primary">
                            <Lang text={{ ko: "선택됨", en: "Selected" }} />
                          </span>
                        ) : null}
                      </div>
                      <p className="line-clamp-1 text-xxs text-secondary-text">{image.sourceLabel}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </BottomSheetDialog>
    </div>
  );
}

export function UniverseForm({ universe, onSuccess, onCancel }: UniverseFormProps) {
  const currentLanguage = useGlobalStore((state) => state.language);
  const [formData, setFormData] = useState<FormData>({
    id: "",
    name: "",
    description: { ko: "", en: "" },
    logo: "",
    thumbnail: "",
    type: "commerce",
    fixed: { x: 0, y: 0 }, //
    enabled: true,
    hideDisplay: false,
    order: undefined,
    billingOwnerEmail: universe?.billingOwnerEmail || universe?.commerceAdmins?.[0] || "",
    commerceAdmins: universe?.commerceAdmins || [],
    stages: universe?.stages || [{ stageId: GC.FALLBACK.STAGE_ID, stageName: GC.FALLBACK.STAGE_NAME }],
    npcs: universe?.npcs || [],
    typeSpecific: universe?.typeSpecific || {},
  });
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitNotice, setSubmitNotice] = useState<SubmitNotice | null>(null);

  // 자동 채우기 중복 방지 및 더 불러오기 상태 플래그
  const [autoPopulateDone, setAutoPopulateDone] = useState(false);
  const [pidCursor, setPidCursor] = useState<string | null>(null);
  const [npcLoading, setNpcLoading] = useState(false);

  const { isAdministrator } = useUserData();
  const queryClient = useQueryClient();

  // commerceAdmins용 드래프트 문자열을 동기화
  const [adminsDraft, setAdminsDraft] = useState<string>("");

  const commitAdmins = (raw: string) => {
    const admins = raw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    setFormData((prev) => ({ ...prev, commerceAdmins: admins }));
    // 커밋 후 보기 좋게 다시 정규화된 표시로 동기화
    setAdminsDraft(admins.join(", "));
  };

  useEffect(() => {
    runAfterCurrentRender(() => setAdminsDraft((formData.commerceAdmins || []).join(", ")));
  }, [formData.commerceAdmins]);

  // 로고 컬러/그림자 효과 설정
  const typeSpecific = (formData.typeSpecific ?? {}) as UniverseTypeSpecific;
  const logoTextColor = typeSpecific.branding?.logoTextStyle?.color ?? "#ffffff";
  const logoTextShadow =
    typeSpecific.branding?.logoTextStyle?.shadow ?? "0 1px 3px rgba(0,0,0,0.35)";

  const updateLogoTextStyle = (patch: Partial<{ color: string; shadow: string }>) => {
    setFormData((prev) => {
      const curTS = (prev.typeSpecific ?? {}) as UniverseTypeSpecific;
      const branding = curTS.branding ?? {};
      const logoTextStyle = branding.logoTextStyle ?? {};
      return {
        ...prev,
        typeSpecific: {
          ...curTS,
          branding: {
            ...branding,
            logoTextStyle: { ...logoTextStyle, ...patch },
          },
        },
      };
    });
  };

  const showroomConfig = typeSpecific.showroom || {};

  const updateShowroomConfig = (patch: Partial<ICommerceShowroomConfig>) => {
    setFormData((prev) => {
      const curTS = (prev.typeSpecific ?? {}) as UniverseTypeSpecific;
      const showroom = curTS.showroom ?? {};
      return {
        ...prev,
        typeSpecific: {
          ...curTS,
          showroom: { ...showroom, ...patch },
        },
      };
    });
  };

  const toDateTimeLocalValue = (value?: string | null) => {
    const raw = String(value || "").trim();
    if (!raw) return "";
    const date = new Date(raw);
    if (!Number.isFinite(date.getTime())) return "";

    const offset = date.getTimezoneOffset();
    const local = new Date(date.getTime() - offset * 60_000);
    return local.toISOString().slice(0, 16);
  };

  const fromDateTimeLocalValue = (value: string) => {
    const raw = String(value || "").trim();
    if (!raw) return undefined;
    const date = new Date(raw);
    return Number.isFinite(date.getTime()) ? date.toISOString() : undefined;
  };

  // 컬렉션명 === 유니버스 ID
  const getCollectionName = useCallback(() => (formData.id || "").trim(), [formData.id]);
  const canUseUniverseScopedData = Boolean(universe?.id);

  // 포트레이트 경로 컨벤션
  const guessPortraitPath = useCallback((pid: string) => {
    const col = getCollectionName();
    if (!col || !pid) return "";
    return `/assets/personas/${col}/${pid}/${pid}.jpg`;
  }, [getCollectionName]);

  const toNpcInfos = useCallback((pids: string[]): INpcInfo[] => {
    return pids.map((pid) => ({
      pid,
      role: "", // 빈 문자열 유지(UX 일관)
      isDefaultForStage: false,
      profiles: guessPortraitPath(pid) ? [guessPortraitPath(pid)] : [],
    }));
  }, [guessPortraitPath]);

  const appendUniqueNpcs = useCallback((incoming: INpcInfo[]) => {
    setFormData((prev) => {
      const exist = new Set((prev.npcs || []).map((n) => n.pid));
      const merged = [...(prev.npcs || []), ...incoming.filter((n) => !exist.has(n.pid))];
      return { ...prev, npcs: merged };
    });
  }, []);

  // 초기 페르소나 로드 후 npcs 자동 생성
  const autoPopulateNpcsFromCollection = useCallback(async () => {
    if (!canUseUniverseScopedData) return;
    const col = getCollectionName();
    if (!col) return;
    setNpcLoading(true);
    try {
      const { data } = await fetchClient.get<{ items: string[]; nextCursor: string | null }>("/universe/persona", {
        params: { collectionName: col, action: "pids", limit: 10 },
      });
      appendUniqueNpcs(toNpcInfos(data.items));
      setPidCursor(data.nextCursor);
    } catch (e) {
      logger.error("[NPC 자동 생성] pid 로드 실패:", e);
    } finally {
      setNpcLoading(false);
      setAutoPopulateDone(true);
    }
  }, [appendUniqueNpcs, canUseUniverseScopedData, getCollectionName, toNpcInfos]);

  // 더 불러오기 핸들러
  const loadMoreNpcs = async () => {
    if (!canUseUniverseScopedData) return;
    const col = getCollectionName();
    if (!col || !pidCursor) return;
    setNpcLoading(true);
    try {
      const { data } = await fetchClient.get<{ items: string[]; nextCursor: string | null }>("/universe/persona", {
        params: { collectionName: col, action: "pids", limit: 10, after: pidCursor },
      });
      appendUniqueNpcs(toNpcInfos(data.items));
      setPidCursor(data.nextCursor);
    } catch (e) {
      logger.error("[NPC 추가 로드] pid 로드 실패:", e);
    } finally {
      setNpcLoading(false);
    }
  };

  // 마운트 후 유니버스 ID 확정 시 1회 자동 로드
  const isValidId = (s: string) => /^[a-z0-9_-]{2,}$/i.test(s); // 간단 가드
  useEffect(() => {
    if (!canUseUniverseScopedData) return;
    if (autoPopulateDone) return;
    const col = getCollectionName();
    if (!col || !isValidId(col)) return;
    if ((formData.npcs?.length || 0) > 0) return;

    const t = setTimeout(() => {
      autoPopulateNpcsFromCollection();
    }, 400);
    return () => clearTimeout(t);
  }, [formData.id, autoPopulateDone, formData.npcs?.length, canUseUniverseScopedData, autoPopulateNpcsFromCollection, getCollectionName]);

  // 편집 모드인 경우 기본값 설정
  useEffect(() => {
    if (universe) {
      let processedStages = universe.stages;

      // stages가 없거나 빈 배열인 경우 기본 스테이지로 생성
      if (!processedStages || processedStages.length === 0) {
        processedStages = [{ stageId: GC.FALLBACK.STAGE_ID, stageName: GC.FALLBACK.STAGE_NAME }];
      }

      runAfterCurrentRender(() => {
        setFormData({
          id: universe.id,
          name: universe.name,
          description: universe.description,
          logo: universe.logo || "",
          thumbnail: universe.thumbnail,
          type: universe.type || "game",
          fixed: universe.fixed || { x: 0, y: 0 },
          enabled: universe.enabled,
          hideDisplay: universe.hideDisplay,
          order: Number.isFinite(universe.order) ? universe.order : undefined,
          billingOwnerEmail: universe.billingOwnerEmail || universe.commerceAdmins?.[0] || "",
          commerceAdmins: universe.commerceAdmins || [],
          stages: processedStages,
          npcs: universe.npcs || [],
          typeSpecific: universe.typeSpecific || {},
        });
      });
    }
  }, [universe]);

  // 폼 데이터 변경 핸들러
  const handleChange = <K extends keyof FormData>(field: K, value: FormData[K]) => {
    setFormData((prev) => ({
      ...prev,
      [field]: value,
    }));

    // 에러 메시지 제거
    if (errors[field]) {
      setErrors((prev) => ({ ...prev, [field]: "" }));
    }
    if (submitNotice) setSubmitNotice(null);
  };

  // 설명 변경 핸들러
  const handleDescriptionChange = (targetLang: LanguageType, value: string) => {
    setFormData((prev) => ({
      ...prev,
      description: { ...prev.description, [targetLang]: value },
    }));

    const field = `description.${targetLang}`;
    if (errors[field]) {
      setErrors((prev) => ({ ...prev, [field]: "" }));
    }
    if (submitNotice) setSubmitNotice(null);
  };

  // 유효성 검사
  const validateForm = () => {
    const newErrors: Record<string, string> = {};

    if (!formData.id.trim()) newErrors.id = "ID는 필수입니다.";
    if (!formData.name.trim()) newErrors.name = "이름은 필수입니다.";
    if (!formData.type.trim()) newErrors.type = "타입은 필수입니다.";
    if (!formData.description[currentLanguage]?.trim()) {
      newErrors[`description.${currentLanguage}`] = lang({
        ko: "현재 언어의 설명은 필수입니다.",
        en: "Description is required for the current language.",
      });
    }
    if (!formData.thumbnail.trim()) newErrors.thumbnail = "썸네일 이미지는 필수입니다.";
    if (
      formData.type === "commerce" &&
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(formData.billingOwnerEmail || "").trim())
    ) {
      newErrors.billingOwnerEmail = "유효한 결제 책임자 이메일은 필수입니다.";
    }
    if (
      formData.order !== undefined &&
      (!Number.isFinite(formData.order) || formData.order < 0 || !Number.isInteger(formData.order))
    ) {
      newErrors.order = "정렬 순서는 0 이상의 정수여야 합니다.";
    }

    const showroom = typeSpecific.showroom || {};
    const opensAt = showroom.opensAt ? new Date(showroom.opensAt).getTime() : NaN;
    const closesAt = showroom.closesAt ? new Date(showroom.closesAt).getTime() : NaN;

    if (
      formData.type === "commerce" &&
      showroom.enabled &&
      Number.isFinite(opensAt) &&
      Number.isFinite(closesAt) &&
      opensAt > closesAt
    ) {
      newErrors.showroom = "레거시 쇼룸 종료 시각은 시작 시각보다 늦어야 합니다.";
    }

    setErrors(newErrors);
    return newErrors;
  };

  // 폼 제출
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const validationErrors = validateForm();
    const validationCount = Object.values(validationErrors).filter(Boolean).length;

    if (validationCount > 0) {
      setSubmitNotice({
        type: "error",
        message: lang({
          ko: `필수 항목 ${validationCount}개를 확인해주세요.`,
          en: `Check ${validationCount} required field(s).`,
        }),
      });
      return;
    }

    try {
      setLoading(true);
      setSubmitNotice({
        type: "info",
        message: lang({
          ko: universe ? "유니버스를 수정하는 중입니다." : "유니버스를 생성하는 중입니다.",
          en: universe ? "Updating universe." : "Creating universe.",
        }),
      });

      // 전송할 데이터 복사본 생성 (React 상태 보호)
      const submitData = { ...formData };

      // 게임 타입은 빈 배열만 허용
      if (submitData.type !== "commerce") {
        submitData.billingOwnerEmail = undefined;
        submitData.commerceAdmins = [];
      }

      // commerceAdmins 정리: 빈 문자열 제거, 트림 처리
      if (submitData.type === "commerce" && Array.isArray(submitData.commerceAdmins)) {
        submitData.billingOwnerEmail = String(submitData.billingOwnerEmail || "").trim().toLowerCase();
        submitData.commerceAdmins = submitData.commerceAdmins
          .map((email) => email.trim().toLowerCase())
          .filter((email) => email.length > 0 && email !== submitData.billingOwnerEmail);
      }

      logger.log("전송할 폼 데이터:", submitData);

      await fetchClient.post("/universe", submitData);
      logger.log("유니버스 저장 완료:", submitData.id);

      // 캐시 무효화
      queryClient.invalidateQueries({ queryKey: ["universe", submitData.id] });
      onSuccess();
    } catch (error: unknown) {
      logger.error("유니버스 저장 실패:", error);

      const responseData = toUnknownRecord(toUnknownRecord(toUnknownRecord(error).response).data);
      const message =
        responseData.message ||
        responseData.error ||
        lang({ ko: "유니버스 저장에 실패했습니다.", en: "Failed to save the universe." });
      setSubmitNotice({ type: "error", message: String(message) });
    } finally {
      setLoading(false);
    }
  };

  // 스테이지 관리 함수들
  const handleStageChange = (index: number, field: keyof IStageInfo, value: string) => {
    setFormData((prev) => ({
      ...prev,
      stages: prev.stages?.map((stage, i) => (i === index ? { ...stage, [field]: value } : stage)) || [],
    }));
  };

  const addStage = () => {
    setFormData((prev) => ({
      ...prev,
      stages: [...(prev.stages || []), { stageId: GC.FALLBACK.STAGE_ID, stageName: GC.FALLBACK.STAGE_NAME }],
    }));
  };

  const removeStage = (index: number) => {
    if ((formData.stages?.length || 0) <= 1) {
      void dialog.alert("최소 하나의 스테이지는 필요합니다.");
      return;
    }

    setFormData((prev) => ({
      ...prev,
      stages: prev.stages?.filter((_, i) => i !== index) || [],
    }));
  };

  // NPC 변경
  const handleNpcChange = <K extends keyof INpcInfo>(index: number, field: K, value: INpcInfo[K]) => {
    setFormData((prev) => ({
      ...prev,
      npcs: (prev.npcs || []).map((npc, i) => (i === index ? { ...npc, [field]: value } : npc)),
    }));
  };

  const removeNpc = (index: number) => {
    setFormData((prev) => ({
      ...prev,
      npcs: (prev.npcs || []).filter((_, i) => i !== index),
    }));
  };

  const visibleErrorMessages = Object.values(errors).filter(Boolean);

  return (
    <form onSubmit={handleSubmit} className="space-y-6 text-primary-text">
      {/* Commerce 관리자 설정 */}
      {formData.type === "commerce" && isAdministrator && (
        <div className="rounded-lg border border-border bg-surface/70 p-4">
          <h3 className="mb-4 font-semibold text-primary-text">커머스 관리자 설정</h3>
          <UniverseCommerceAccessFields
            billingOwnerEmail={formData.billingOwnerEmail || ""}
            adminsDraft={adminsDraft}
            errors={errors}
            onBillingOwnerChange={(value) => handleChange("billingOwnerEmail", value)}
            onAdminsDraftChange={setAdminsDraft}
            onAdminsCommit={commitAdmins}
          />

          <div className="mt-5 border-t border-border pt-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h4 className="font-medium text-primary-text">레거시 쇼룸 공개 설정</h4>
                <p className="mt-1 text-sm text-secondary-text">
                  `/play/{formData.id || "universeId"}` 레거시 쇼룸을 이벤트 기간에만 선택적으로 오픈할 수 있습니다.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Switch
                  id="showroom-enabled"
                  checked={showroomConfig.enabled === true}
                  onCheckedChange={(checked) => updateShowroomConfig({ enabled: checked })}
                />
                <label htmlFor="showroom-enabled" className="text-sm font-medium text-primary-text">
                  쇼룸 공개
                </label>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
              <div>
                <label htmlFor="showroom-opensAt">오픈 시작 시각</label>
                <Input
                  id="showroom-opensAt"
                  type="datetime-local"
                  value={toDateTimeLocalValue(showroomConfig.opensAt)}
                  onChange={(e) => updateShowroomConfig({ opensAt: fromDateTimeLocalValue(e.target.value) })}
                />
                <p className="mt-1 text-xs text-secondary-text">비워두면 스위치를 켠 즉시 오픈된 것으로 간주합니다.</p>
              </div>

              <div>
                <label htmlFor="showroom-closesAt">오픈 종료 시각</label>
                <Input
                  id="showroom-closesAt"
                  type="datetime-local"
                  value={toDateTimeLocalValue(showroomConfig.closesAt)}
                  onChange={(e) => updateShowroomConfig({ closesAt: fromDateTimeLocalValue(e.target.value) })}
                />
                <p className="mt-1 text-xs text-secondary-text">비워두면 스위치를 끌 때까지 계속 공개됩니다.</p>
              </div>
            </div>

            {errors.showroom && <p className="mt-2 text-sm text-danger">{errors.showroom}</p>}
          </div>
        </div>
      )}

      {/* 기본 정보 */}
      <div className="p-4">
        <h3 className="font-semibold mb-4">기본 정보</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label htmlFor="id">유니버스 ID</label>
            <Input
              id="id"
              value={formData.id}
              onChange={(e) => handleChange("id", e.target.value)}
              placeholder={`예: ${DEFAULT_FANTASY_UNIVERSE}`}
              disabled={!!universe} // 편집 모드에서는 ID 변경 불가
              className={errors.id ? "border-danger" : ""}
            />
            {errors.id && <p className="mt-1 text-sm text-danger">{errors.id}</p>}
          </div>

          <div>
            <label htmlFor="name">유니버스 이름</label>
            <Input
              id="name"
              value={formData.name}
              onChange={(e) => handleChange("name", e.target.value)}
              placeholder="예: RH-83"
              className={errors.name ? "border-danger" : ""}
            />
            {errors.name && <p className="mt-1 text-sm text-danger">{errors.name}</p>}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
          <div>
            <label className="block mb-1 text-sm font-medium">유니버스 타입</label>

            <RadioGroup
              value={formData.type}
              onValueChange={(value) => handleChange("type", value as UniverseType)}
              className="flex flex-wrap gap-4 mt-1"
            >
              <div className="flex items-center space-x-2">
                <RadioGroupItem id="type-game" value="game" />
                <label htmlFor="type-game" className="text-sm">
                  게임 유니버스 (game)
                </label>
              </div>

              <div className="flex items-center space-x-2">
                <RadioGroupItem id="type-commerce" value="commerce" />
                <label htmlFor="type-commerce" className="text-sm">
                  커머스 유니버스 (commerce)
                </label>
              </div>
            </RadioGroup>

            {errors.type && <p className="mt-1 text-sm text-danger">{errors.type}</p>}
            <p className="text-xs text-muted-foreground mt-1">
              게임 유니버스: 스테이지/캐릭터 중심 인터랙션 · 커머스 유니버스: 판매/상품 중심 인터랙션용 입니다.
            </p>
          </div>

          <div>
            <label htmlFor="order">정렬 순서</label>
            <Input
              id="order"
              type="number"
              min="0"
              step="1"
              value={formData.order ?? ""}
              onChange={(e) => {
                const raw = e.target.value;
                handleChange("order", raw === "" ? undefined : Number(raw));
              }}
              placeholder="자동(마지막)"
              className={errors.order ? "border-danger" : ""}
            />
            {errors.order && <p className="mt-1 text-sm text-danger">{errors.order}</p>}
            <p className="mt-1 text-xs text-muted-foreground">
              비워두면 현재 등록된 유니버스의 마지막 순서로 자동 지정됩니다.
            </p>
          </div>

          <div className="flex flex-col space-y-2 mt-6">
            <div className="flex items-center gap-2">
              <Switch
                id="enabled"
                checked={formData.enabled}
                onCheckedChange={(checked) => handleChange("enabled", checked)}
              />
              <label htmlFor="enabled">활성화</label>
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              유니버스를 비활성화 합니다. 직접 URL로도 접근할 수 없습니다.
            </p>
          </div>

          <div className="flex flex-col space-y-2 mt-6">
            <div className="flex items-center gap-2">
              <Switch
                id="hideDisplay"
                checked={formData.hideDisplay}
                onCheckedChange={(checked) => handleChange("hideDisplay", checked)}
              />
              <label htmlFor="hideDisplay">홈/리스트에서 숨김</label>
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              홈 배너/리스트에 표시되지 않습니다. 직접 URL로는 접근 가능합니다.
            </p>
          </div>
        </div>
      </div>

      {/* 설명 */}
      <div className="p-4">
        <h3 className="font-semibold mb-4">
          <Lang text={{ ko: "설명", en: "Description" }} />
        </h3>
        <Textarea
          id="desc-current"
          value={formData.description[currentLanguage] || ""}
          onChange={(e) => handleDescriptionChange(currentLanguage, e.target.value)}
          placeholder={lang({ ko: "HTML 태그 사용 가능", en: "HTML tags allowed" })}
          rows={3}
          className={errors[`description.${currentLanguage}`] ? "border-danger" : ""}
        />
        {errors[`description.${currentLanguage}`] && (
          <p className="mt-1 text-sm text-danger">{errors[`description.${currentLanguage}`]}</p>
        )}
      </div>

      {/* 로고 */}
      <div className="p-4">
        <h3 className="font-semibold mb-4">로고 이미지 (선택)</h3>
        <UniverseImageField
          id="logo"
          label={<Lang text={{ ko: "이미지 URL", en: "Image URL" }} />}
          value={formData.logo || ""}
          onChange={(next) => handleChange("logo", typeof next === "string" ? next : next[0] || "")}
          uploadUniverseId={universe?.id ? getCollectionName() : ""}
          authorizedUniverseId={universe?.id ? getCollectionName() : ""}
          pid="logo"
          kind="universe-logo"
          placeholder="/assets/brands/amu/logo.png 또는 https://..."
          helperText={
            <Lang
              text={{
                ko: "Stage 상단에 작은 크기로 표시됩니다. PNG 권장(투명 배경).",
                en: "Shown in a small size at the top of the stage. PNG with transparency is recommended.",
              }}
            />
          }
          maxFiles={1}
        />
      </div>

      {/* 텍스트 로고 스타일 설정 */}
      {!formData.logo && (
        <div className="mt-4 rounded-lg border border-border bg-surface/70 p-4">
          <h4 className="mb-3 font-semibold text-primary-text">텍스트 로고 스타일</h4>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm mb-1">텍스트 색상</label>
              <div className="flex items-center gap-3">
                <input
                  type="color"
                  value={logoTextColor}
                  onChange={(e) => updateLogoTextStyle({ color: e.target.value })}
                  className="h-10 w-16 rounded border border-input bg-input-bg"
                />
                <Input
                  value={logoTextColor}
                  onChange={(e) => updateLogoTextStyle({ color: e.target.value })}
                  inputContainerClassName="flex-1"
                  placeholder="#ffffff"
                />
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                로고 이미지가 비어 있으면 스테이지 상단에 <b>유니버스 이름</b>을 텍스트로 표시합니다.
              </p>
            </div>

            <div>
              <label className="block text-sm mb-1">텍스트 그림자(CSS)</label>
              <Input
                value={logoTextShadow}
                onChange={(e) => updateLogoTextStyle({ shadow: e.target.value })}
                placeholder="예: 0 2px 8px rgba(0,0,0,0.6)"
              />
              <p className="text-xs text-muted-foreground mt-1">
                CSS <code>text-shadow</code> 형식. 복수 그림자는 콤마(,)로 구분.
              </p>
            </div>
          </div>

          {/* 미리보기 */}
          <div className="mt-4 rounded border border-border bg-background/70 p-4">
            <div
              className="font-extrabold tracking-tight text-2xl select-none"
              style={{ color: logoTextColor, textShadow: logoTextShadow }}
            >
              {formData.name || "Sample Universe"}
            </div>
            <p className="mt-2 text-xs text-secondary-text">
              * 로고 이미지 URL을 입력하면 텍스트 대신 이미지가 사용됩니다.
            </p>
          </div>
        </div>
      )}

      {/* 썸네일 */}
      <div className="p-4">
        <h3 className="font-semibold mb-4">썸네일 이미지</h3>
        <UniverseImageField
          id="thumbnail"
          label={<Lang text={{ ko: "이미지 URL", en: "Image URL" }} />}
          value={formData.thumbnail}
          onChange={(next) => handleChange("thumbnail", typeof next === "string" ? next : next[0] || "")}
          uploadUniverseId={universe?.id ? getCollectionName() : ""}
          authorizedUniverseId={universe?.id ? getCollectionName() : ""}
          pid="thumbnail"
          kind="universe-thumbnail"
          placeholder="/assets/personas/universe-name.jpg"
          error={errors.thumbnail}
          helperText={
            <Lang
              text={{
                ko: "/assets/personas/ 경로 또는 외부 URL을 입력하세요.",
                en: "Enter an /assets/personas/ path or an external URL.",
              }}
            />
          }
          maxFiles={1}
        />
      </div>

      {/* NPC 설정 */}
      <div className="mt-6 rounded-lg border border-border bg-surface/70 p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold">NPC 설정</h3>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={autoPopulateNpcsFromCollection}
              disabled={!canUseUniverseScopedData || !getCollectionName() || npcLoading}
              title="초기 10명 다시 채우기"
            >
              초기 자동 채우기
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={loadMoreNpcs}
              disabled={!canUseUniverseScopedData || !pidCursor || npcLoading}
              title="다음 10명 불러오기"
            >
              {npcLoading ? "불러오는 중…" : "더 불러오기"}
            </Button>
          </div>
        </div>

        {(formData.npcs || []).length === 0 && <p className="text-sm text-muted-foreground">등록된 NPC가 없습니다.</p>}

        <div className="space-y-3">
          {(formData.npcs || []).map((npc, index) => {
            return (
              <div key={index} className="rounded border border-border bg-background/70 p-3">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-medium mb-1">페르소나 PID</label>
                    <Input
                      value={npc.pid}
                      onChange={(e) => handleNpcChange(index, "pid", e.target.value)}
                      placeholder="예: npc_sales_master_01"
                      className={npc.pid ? "" : "border-danger"}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium mb-1">역할(Role)</label>
                    <Input
                      value={npc.role ?? ""}
                      onChange={(e) => handleNpcChange(index, "role", e.target.value)}
                      placeholder="예: sales_master, guide"
                      className={npc.role ? "" : "border-danger"}
                    />
                  </div>
                  <div className="flex items-center gap-2 pt-6">
                    <Switch
                      id={`npc-default-${index}`}
                      checked={!!npc.isDefaultForStage}
                      onCheckedChange={(checked) => handleNpcChange(index, "isDefaultForStage", checked)}
                    />
                    <label htmlFor={`npc-default-${index}`} className="text-sm">
                      스테이지 기본 NPC
                    </label>
                  </div>
                </div>

                <div className="mt-3">
                  <UniverseImageField
                    id={`npc-profiles-${index}`}
                    label={<Lang text={{ ko: "프로필 이미지 목록", en: "Profile Images" }} />}
                    value={npc.profiles || []}
                    onChange={(next) =>
                      handleNpcChange(index, "profiles", Array.isArray(next) ? next : parseImageUrlList(next))
                    }
                    multiple
                    uploadUniverseId={universe?.id ? getCollectionName() : ""}
                    authorizedUniverseId={universe?.id ? getCollectionName() : ""}
                    pid={npc.pid || `npc-${index}`}
                    kind="persona-profile"
                    placeholder={
                      `/assets/personas/${formData.id || "<universeId>"}/${npc.pid || "<pid>"}/${
                        npc.pid || "<pid>"
                      }.jpg,\n` + `/assets/.../b.jpg`
                    }
                    helperText={
                      <>
                        기본 portrait 규칙:{" "}
                        <code>
                          /assets/personas/{formData.id || "<universeId>"}/{npc.pid || "<pid>"}/{npc.pid || "<pid>"}.jpg
                        </code>
                      </>
                    }
                  />
                </div>

                <div className="flex justify-end mt-3">
                  <Button variant="outline" size="sm" onClick={() => removeNpc(index)}>
                    <Minus className="w-4 h-4 mr-1" /> 삭제
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 스테이지 고정 설정 */}
      <div className="rounded-lg border border-border bg-surface/70 p-4">
        <h3 className="mb-4 font-semibold text-primary-text">스테이지 설정</h3>

        {/* 고정 스테이지 설정 */}
        <div className="mb-4">
          <label className="block text-sm font-medium mb-2">스테이지 범위 설정</label>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="fixed-x" className="block text-sm">
                수평 축 스테이지 수
              </label>
              <Input
                id="fixed-x"
                type="number"
                min="0"
                value={formData.fixed.x}
                onChange={(e) =>
                  handleChange("fixed", {
                    ...formData.fixed,
                    x: parseInt(e.target.value) || 0,
                  })
                }
                placeholder="0 (무한)"
              />
              <p className="mt-1 text-xs text-secondary-text">0: 무한 스테이지, 1 이상: 고정 범위</p>
            </div>
            <div>
              <label htmlFor="fixed-y" className="block text-sm">
                수직 축 스테이지 수
              </label>
              <Input
                id="fixed-y"
                type="number"
                min="0"
                value={formData.fixed.y}
                onChange={(e) =>
                  handleChange("fixed", {
                    ...formData.fixed,
                    y: parseInt(e.target.value) || 0,
                  })
                }
                placeholder="0 (무한)"
              />
              <p className="mt-1 text-xs text-secondary-text">0: 무한 스테이지, 1 이상: 고정 범위</p>
            </div>
          </div>
          <div className="mt-2 rounded border-l-4 border-primary bg-primary/10 p-3">
            <p className="text-sm text-primary-text">
              <span className="font-medium">현재 설정:</span>{" "}
              {formData.fixed.x === 0 && formData.fixed.y === 0
                ? "무한 스테이지 모드"
                : `고정 스테이지 (${formData.fixed.x} × ${formData.fixed.y})`}
            </p>
          </div>
        </div>

        {/* 스테이지 에셋 설정 */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <label className="block text-sm font-medium">스테이지 에셋 설정</label>
            <Button variant="outline" size="sm" onClick={addStage}>
              + 스테이지 추가
            </Button>
          </div>

          <div className="space-y-3">
            {formData.stages?.map((stage, index) => (
              <div key={index} className="flex items-center gap-3 rounded border border-border bg-background/70 p-3">
                <div className="flex-1 grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium mb-1">스테이지 타입</label>
                    <Input
                      value={stage.stageId || formData.id}
                      onChange={(e) => handleStageChange(index, "stageId", e.target.value)}
                      placeholder="modern, alien 등"
                      className="text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium mb-1">스테이지명</label>
                    <Input
                      value={stage.stageName}
                      onChange={(e) => handleStageChange(index, "stageName", e.target.value)}
                      placeholder="mono-city, marble-house, blue-universe 등"
                      className="text-sm"
                    />
                  </div>
                </div>

                {formData.stages && formData.stages.length > 1 && (
                  <Button variant="outline" size="sm" onClick={() => removeStage(index)}>
                    삭제
                  </Button>
                )}
              </div>
            ))}
          </div>

          <div className="mt-3 rounded border-l-4 border-accent bg-accent/10 p-3">
            <p className="flex gap-2 text-sm text-primary-text">
              <span className="font-medium">스테이지 키:</span>
              <span>
                {formData.stages?.[0]?.stageId || GC.FALLBACK.STAGE_ID} /{" "}
                {formData.stages?.[0]?.stageName || GC.FALLBACK.STAGE_NAME}
              </span>
            </p>
            <p className="mt-1 text-xs text-secondary-text">
              첫 번째 스테이지가 기본 스테이지로 사용되며, 해당 스테이지가 없을 경우 다음 스테이지로 폴백됩니다.
            </p>
          </div>
        </div>
      </div>

      {formData.type === "commerce" && (
        <div className="mt-4 space-y-2 rounded-xl border border-border bg-background/70 p-3">
          <p className="text-xs font-semibold text-primary-text">페르소나 생성 제한 (커머스 유니버스 전용)</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-secondary-text">최대 생성 가능 페르소나 수</label>
              <Input
                type="number"
                min={0}
                value={formData.personaLimits?.maxTotal ?? ""}
                onChange={(e) =>
                  setFormData((prev) => ({
                    ...prev,
                    personaLimits: {
                      ...(prev.personaLimits || {}),
                      maxTotal: e.target.value === "" ? undefined : Number(e.target.value),
                    },
                  }))
                }
                placeholder="예: 10 (비워두면 제한 없음)"
              />
            </div>
            <div>
              <label className="text-xs text-secondary-text">일일 생성 가능 페르소나 수</label>
              <Input
                type="number"
                min={0}
                value={formData.personaLimits?.dailyCreateLimit ?? ""}
                onChange={(e) =>
                  setFormData((prev) => ({
                    ...prev,
                    personaLimits: {
                      ...(prev.personaLimits || {}),
                      dailyCreateLimit: e.target.value === "" ? undefined : Number(e.target.value),
                    },
                  }))
                }
                placeholder="예: 1 (비워두면 제한 없음)"
              />
            </div>
          </div>
          <p className="text-xxs text-secondary-text">값이 비어 있으면 해당 제한은 적용되지 않습니다. (0 이상 정수)</p>
        </div>
      )}

      {/* 액션 버튼 */}
      {(submitNotice || visibleErrorMessages.length > 0) && (
        <div
          role="alert"
          aria-live="polite"
          className={cn(
            "rounded-lg border px-3 py-3 text-sm",
            submitNotice?.type === "info"
              ? "border-primary/30 bg-primary/10 text-primary-text"
              : "border-danger/40 bg-danger/10 text-primary-text",
          )}
        >
          {submitNotice && <p className="font-medium">{submitNotice.message}</p>}
          {visibleErrorMessages.length > 0 && (
            <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-secondary-text">
              {visibleErrorMessages.map((message, index) => (
                <li key={`${message}-${index}`}>{message}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className="flex gap-2 pt-4 border-t">
        <Button
          type="submit"
          disabled={loading}
          loading={loading}
          loadingText={
            <Lang
              text={{
                ko: universe ? "수정 중..." : "생성 중...",
                en: universe ? "Updating..." : "Creating...",
              }}
            />
          }
        >
          <Save size={16} />
          <Lang text={{ ko: universe ? "수정" : "생성", en: universe ? "Update" : "Create" }} />
        </Button>
        <Button variant="outline" onClick={onCancel}>
          <X size={16} />
          <Lang text={{ ko: "취소", en: "Cancel" }} />
        </Button>
      </div>
    </form>
  );
}
