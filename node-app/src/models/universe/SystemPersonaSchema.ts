import { Schema, Document } from "mongoose";
import type {
  SystemPersonaLifecycleType,
  SystemPersonaPresetKindType,
  SystemPersonaSafetyProfileType,
  SystemPersonaServiceType,
  SystemPersonaTutorsPolicyDefaultsType,
  SystemPersonaUsageType,
} from "types/ai";
import {
  SYSTEM_PERSONA_LIFECYCLE_VALUES,
  SYSTEM_PERSONA_PRESET_KIND_VALUES,
  SYSTEM_PERSONA_SELECTABLE_SERVICE_VALUES,
  SYSTEM_PERSONA_USAGE_VALUES,
} from "types/ai";

/**
 * @docHint
 * @purpose MongoDB 스키마 정의
 * @process 주요 필드(key, title, category, prompt, forUniverses, enabled) 및 인덱스/기본값 선언
 * @domain prompt
 * @scope db_schema
 */

export interface ISystemPersonaDocument extends Document {
  key: string;
  title: string;
  category?: string;
  summary?: string;
  prompt: string;
  forUniverses?: SystemPersonaUsageType;
  presetKind: SystemPersonaPresetKindType;
  lifecycle: SystemPersonaLifecycleType;
  selectableServices: SystemPersonaServiceType[];
  runtimeResolvable: boolean;
  replacementKey?: string;
  revision: number;
  safetyProfile: SystemPersonaSafetyProfileType;
  tutorsPolicyDefaults?: SystemPersonaTutorsPolicyDefaultsType;
  enabled: boolean;
  version?: number;
  updatedBy?: string;
  universeId?: string | null; // 이 시스템 페르소나가 속한 유니버스(옵션)
  personaPid?: string | null; // 개별 캐릭터 연결형 system persona에서만 사용(공통 관리자 UI에서는 노출하지 않음)
  createdAt: Date;
  updatedAt: Date;
}

export const SystemPersonaSchema = new Schema<ISystemPersonaDocument>(
  {
    key: { type: String, required: true, trim: true, lowercase: true },
    title: { type: String, required: true, trim: true },
    category: { type: String, default: "core", trim: true },
    summary: { type: String, default: "" },
    prompt: { type: String, default: "" },
    forUniverses: { type: String, enum: SYSTEM_PERSONA_USAGE_VALUES, default: "all" },
    presetKind: { type: String, enum: SYSTEM_PERSONA_PRESET_KIND_VALUES, default: "system-persona" },
    lifecycle: { type: String, enum: SYSTEM_PERSONA_LIFECYCLE_VALUES, default: "published", index: true },
    selectableServices: {
      type: [String],
      enum: SYSTEM_PERSONA_SELECTABLE_SERVICE_VALUES,
      default: ["game", "tutors"],
    },
    runtimeResolvable: { type: Boolean, default: true, index: true },
    replacementKey: { type: String, default: "", trim: true },
    revision: { type: Number, min: 1, default: 1, index: true },
    safetyProfile: { type: String, default: "standard", trim: true },
    tutorsPolicyDefaults: {
      operationMode: { type: String, default: "" },
      answerStyle: { type: String, default: "" },
      correctionStrength: { type: Number, min: 0, max: 3 },
      strict: { type: Boolean },
      conversationLevel: { type: String, default: "" },
      goalType: { type: String, default: "" },
    },
    enabled: { type: Boolean, default: true },
    version: { type: Number, default: 1 },
    universeId: { type: String, default: null, index: true },
    personaPid: { type: String, default: null, index: true },
    updatedBy: { type: String, default: "" },
  },
  { timestamps: true }
);

// 같은 key라도 universeId / personaPid 조합에 따라 여러 문서를 둘 수 있어야 함
// - (global, null persona) / (universe, null persona) / (universe, personaPid) 등을 모두 허용
SystemPersonaSchema.index(
  { key: 1, universeId: 1, personaPid: 1 },
  { unique: true, collation: { locale: "en", strength: 2 } }
);
