import type { ImageProviderType, TextProviderType, UiScopeType } from "../ai";
import type { ReferenceStrengthType } from "utils/lab";

// 생성형 콘텐츠 스코프 타입
export type PromptScopeType = "image" | "content";

// 콘텐츠 생성 타입
export type PromptGenType = "template" | "custom";

export type StudioGenerationSourceServiceType =
  | "gen-studio"
  | "tutors"
  | "store"
  | "play"
  | "mini-app"
  | "marketing"
  | "admin"
  | "agent"
  | "upload"
  | "unknown";
export type LibraryImageKindType = "generated" | "uploaded";
export type StudioGenerationSourceType = {
  service: StudioGenerationSourceServiceType;
  surface: string;
};

// 콘텐츠 Visibility 타입
export type PromptVisibilityType = "private" | "public";
export type PromptVisibilityExtendedType = PromptVisibilityType | "all";

// 이미지 생성 앱
export type PromptSearchFieldType = "all" | "key" | "title" | "categories" | "tags";
export type StudioImageSearchFieldType = "all" | "assetId" | "templateKey" | "prompt";
export type PromptAccessLevelType = "public" | "admin";
export type PromptListViewType = "public" | "admin";
export type GenStudioTemplateGroupVisibilityType = "public" | "private";
export type GenStudioTemplateGroupPromptType = "image" | "content" | "audio";
export type GenStudioTemplateGroupType = {
  key: string;
  promptType: GenStudioTemplateGroupPromptType;
  title: string;
  description: string;
  visibility: GenStudioTemplateGroupVisibilityType;
  serviceKeys: string[];
  templateKeys: string[];
  coverTemplateKey: string;
  // 추천 섹션 노출 대상 (templateKeys의 부분집합) — 서비스별 추천 템플릿 중앙 관리 원장
  recommendedTemplateKeys: string[];
  recommendedDescription: { ko: string; en: string };
  enabled: boolean;
  sortOrder: number;
  updatedBy: string;
};
export type ImageReferenceInputPolicyType = {
  required?: boolean;
  minCount?: number;
  maxCount?: number;
  enforceInCustomMode?: boolean;
};
export type ImagePromptInputPolicyType = {
  referenceImage?: ImageReferenceInputPolicyType;
  [k: string]: unknown;
};
export type ContentPromptDefaultParamsType = {
  platform?: string;
  language?: string;
  length?: string;
  outputFormat?: string;
  [k: string]: unknown;
};
export type ImagePromptDefaultParamsType = {
  aspectRatio?: string;
  size?: string;
  negative?: string;
  previewImage?: string;
  modelSamples?: Record<string, string[]>;
  provider?: ImageProviderType;
  modelName?: string;
  modelLock?: {
    enabled?: boolean;
    provider?: ImageProviderType;
    modelName?: string;
    allowedAlternates?: Array<{
      provider?: ImageProviderType;
      modelName?: string;
      alias?: string;
    }>;
    reason?: string;
  };
  [k: string]: unknown;
};
export type PromptItemType = {
  key: string;
  title: string;
  templateText: string;
  sceneTemplate?: string;
  templateScope?: UiScopeType;
  accessLevel?: PromptAccessLevelType;
  usageTip?: string;
  categories?: string[];
  defaultParams?: ImagePromptDefaultParamsType;
  inputPolicy?: ImagePromptInputPolicyType;
  tags?: string[];
  enabled?: boolean;
};
export type PromptItemExtendedType = PromptItemType & {
  updatedBy?: string;
  updatedAt?: string;
  version?: number;
};
export type PromptItemOptionType = {
  strictNew?: boolean;
  originalKey?: string;
  overwrite?: boolean;
  scope?: UiScopeType;
};

export type ImageStudioDoneMetaType = {
  requestId: string;
  entrySessionKey: number;
  templateKey?: string;
  templateTitle?: string;
  generationMode: PromptGenType;
  visibility: PromptVisibilityType;
  /**
   * 이번 생성이 돌려준 자산 메타 (SSM-203).
   *
   * 진입 surface가 결과 목록을 따로 조회해 찾아내지 않아도 되게 한다. 서버가 예전 job을 재사용하면
   * 그 자산은 최신 목록 페이지 밖일 수 있어, 목록 조회만으로는 "받았는데 고를 수 없는" 상태가 된다.
   */
  assets?: ImagePromptMetaType[];
};

export type PersonaArtifactContextType = {
  universeId: string;
  personaId: string;
  personaName?: string;
};

// 생성 앱 에디터 공통
type PromptUserProps = {
  mode: "user";
  onDone?: (images: string[], coins?: number, meta?: ImageStudioDoneMetaType) => void;
  onGenerationStarted?: (payload: { requestId: string; jobCount: number }) => void;
  onGenerationFailed?: (payload: { requestId: string; errorCode: string }) => void;
};
type PromptUniverseProps = {
  mode: "universe";
  universeId: string;
  onDone?: (images: string[], coins?: number, meta?: ImageStudioDoneMetaType) => void;
  onGenerationStarted?: (payload: { requestId: string; jobCount: number }) => void;
  onGenerationFailed?: (payload: { requestId: string; errorCode: string }) => void;
};
export type PromptProps = PromptUserProps | PromptUniverseProps;

export type ContentStudioDoneMetaType = {
  requestId: string;
  templateKey?: string;
  generationMode: PromptGenType;
  visibility: PromptVisibilityType;
  /** 생성 직후 결과와 원본 asset의 순서를 보존하는 식별자 목록 */
  assetIds?: string[];
  /** 현재 브라우저 세션에서만 유지되는 첨부 이미지 미리보기/업로드 payload */
  referenceImages?: ContentStudioReferenceImageType[];
};

export type ContentStudioReferenceImageType = {
  mimeType: string;
  data: string;
  previewUrl: string;
  name: string;
};

export type ContentStudioApplyContentArgsType = {
  assetId: string;
  text: string;
  referenceImages?: ContentStudioReferenceImageType[];
};

type ContentPromptUserProps = {
  mode: "user";
  onDone?: (contents: string[], coins?: number, meta?: ContentStudioDoneMetaType) => void;
  onGenerationStarted?: (payload: { requestId: string; jobCount: number }) => void;
  onGenerationFailed?: (payload: { requestId: string; errorCode: string }) => void;
};
type ContentPromptUniverseProps = {
  mode: "universe";
  universeId: string;
  onDone?: (contents: string[], coins?: number, meta?: ContentStudioDoneMetaType) => void;
  onGenerationStarted?: (payload: { requestId: string; jobCount: number }) => void;
  onGenerationFailed?: (payload: { requestId: string; errorCode: string }) => void;
};
export type ContentPromptProps = ContentPromptUserProps | ContentPromptUniverseProps;

export type PromptRequestCommonType = {
  generationMode?: PromptGenType;
  templateScope?: UiScopeType;
  variables?: Record<string, string>;
  extraPrompt?: string;
  confirmedPromptHash?: string;
  n?: number;
  modelName?: string;
  universeId?: string;
  source?: StudioGenerationSourceType;
};

export type PromptTemplateRequestBaseType = PromptRequestCommonType & {
  templateKey: string;
};

// 이미지 프롬프트
export type BaseImageType = { mimeType: string; data: string };
export type DeletePolicyType = "soft" | "hard" | "detach";

export type ImagePromptBodyType = PromptTemplateRequestBaseType & {
  aspectRatio?: string;
  size?: string;
  negative?: string;
  provider?: ImageProviderType;
  baseImages?: BaseImageType[];
  modelImages?: BaseImageType[];
  referenceStrength?: ReferenceStrengthType;
  modelReferenceStrength?: ReferenceStrengthType;
  visibility?: PromptVisibilityType;
};

export type ImagePromptCustomType = PromptRequestCommonType & {
  prompt?: string;
  templateKey?: string;
  aspectRatio?: string;
  size?: string;
  provider?: ImageProviderType;
  baseImages?: BaseImageType[];
  modelImages?: BaseImageType[];
  referenceStrength?: ReferenceStrengthType;
  modelReferenceStrength?: ReferenceStrengthType;
  visibility?: PromptVisibilityType;
};

export type ImagePromptMetaType = {
  assetId: string;
  jobId?: string;
  url: string;
  urlKind?: "public" | "signed" | "worker" | "local" | "none";
  urlExpiresAt?: string;
  refreshUrl?: string;
  templateKey: string;
  templateTitle?: string;
  visibility: PromptVisibilityType;
  createdAt: string | number | Date | null;
  width?: number;
  height?: number;
  canEdit?: boolean;
  isOwner?: boolean;
  scope?: string;
  uid?: string;
  universeId?: string;
  sourceService?: StudioGenerationSourceServiceType;
  sourceSurface?: string;
  provider?: ImageProviderType | "user-upload";
  modelName?: string;
  generationMode?: PromptGenType;
  outputIndex?: number;
  extraPrompt?: string;
  state?: string;
  storage?: {
    driver?: string;
    access?: "public" | "private";
    mimeType?: string;
    ext?: string;
    bytes?: number;
    width?: number;
    height?: number;
  };
};

export type ImageExtraPromptBookmarkType = {
  id: string;
  templateKey: string;
  text: string;
  createdAt: string;
  updatedAt: string;
};

export type ContentAssetMetaType = {
  assetId: string;
  text: string;
  textPreview?: string;
  templateKey: string;
  visibility: PromptVisibilityType;
  createdAt: string | number | Date | null;
  canEdit?: boolean;
  isOwner?: boolean;
  provider?: TextProviderType;
  modelName?: string;
  generationMode?: PromptGenType;
  extraPrompt?: string;
  state?: string;
  outputIndex?: number;
  content?: {
    chars?: number;
    bytes?: number;
  };
};

export type ContentAssetPreviewType = Pick<
  ContentAssetMetaType,
  "assetId" | "textPreview" | "templateKey" | "visibility" | "createdAt" | "canEdit" | "isOwner" | "content"
>;

// 콘텐츠 프롬프트
export type ContentPromptBodyType = PromptTemplateRequestBaseType & {
  platform?: string;
  language?: string;
  length?: string;
  outputFormat?: string;
  provider?: TextProviderType;
  baseImages?: BaseImageType[];
  visibility?: PromptVisibilityType;
  embedSessionId?: string;
};

export type ContentPromptCustomType = PromptRequestCommonType & {
  prompt?: string;
  platform?: string;
  language?: string;
  length?: string;
  outputFormat?: string;
  provider?: TextProviderType;
  baseImages?: BaseImageType[];
  visibility?: PromptVisibilityType;
  embedSessionId?: string;
};
