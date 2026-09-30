import { Schema, Document } from "mongoose";

// EL-202: audio(speech) modality 추가. 기존 image/text/video 동작은 그대로다.
export const SYSTEM_MODEL_CATALOG_MODALITY_TYPES = ["audio", "image", "text", "video"] as const;
export type SystemModelCatalogModalityType = (typeof SYSTEM_MODEL_CATALOG_MODALITY_TYPES)[number];

export const SYSTEM_MODEL_CATALOG_STATUS_TYPES = ["active", "deprecated"] as const;
export type SystemModelCatalogStatusType = (typeof SYSTEM_MODEL_CATALOG_STATUS_TYPES)[number];

export interface ISystemModelCatalogDocument extends Document {
  provider: string;
  modelName: string;
  modality: SystemModelCatalogModalityType;
  displayName: string;
  upstreamModelName: string;
  enabled: boolean;
  adminOnly: boolean;
  defaultModel: boolean;
  recommendedModel: boolean;
  supportsImageInput: boolean;
  /** TUTORS-193 D2 — audio(원음) 입력 수신 가능 여부. 코드 capability가 상한이다. */
  supportsAudioInput: boolean;
  /** TUTORS-193 D2 — audio 이해(발화 의미 파악) 실호출 증거가 등록됐는지. 코드 capability가 상한이다. */
  supportsAudioUnderstanding: boolean;
  /** reasoning effort 지원 모델만 값을 갖는다. 미지원 모델은 빈 문자열 */
  reasoningEffort: string;
  status: SystemModelCatalogStatusType;
  createdAt: Date;
  updatedAt: Date;
}

export const SystemModelCatalogSchema = new Schema<ISystemModelCatalogDocument>(
  {
    provider: { type: String, required: true, index: true, trim: true, lowercase: true },
    modelName: { type: String, required: true, index: true, trim: true },
    modality: { type: String, enum: SYSTEM_MODEL_CATALOG_MODALITY_TYPES, required: true, index: true },
    displayName: { type: String, default: "", trim: true },
    upstreamModelName: { type: String, default: "", trim: true },
    enabled: { type: Boolean, default: true },
    adminOnly: { type: Boolean, default: false },
    defaultModel: { type: Boolean, default: false },
    recommendedModel: { type: Boolean, default: false },
    supportsImageInput: { type: Boolean, default: false },
    supportsAudioInput: { type: Boolean, default: false },
    supportsAudioUnderstanding: { type: Boolean, default: false },
    reasoningEffort: { type: String, default: "", trim: true, lowercase: true },
    status: { type: String, enum: SYSTEM_MODEL_CATALOG_STATUS_TYPES, default: "active" },
  },
  { timestamps: true },
);

SystemModelCatalogSchema.index({ provider: 1, modelName: 1, modality: 1 }, { unique: true });
