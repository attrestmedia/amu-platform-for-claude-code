import { Schema, type Types } from "mongoose";
import type { IPersona } from "types/ai";
import type { UnknownRecord } from "utils/common/typeUtils";

/**
 * @docHint
 * @purpose MongoDB 스키마 정의
 * @process 주요 필드(pid, personaType, name, age, appearance, background) 및 인덱스/기본값 선언
 * @domain persona
 * @scope db_schema
 */

// 공용 도큐먼트 타입 (human/monster 공용 필드 보유)
export interface IPersonaDocument extends IPersona {
  // human 전용
  gender?: string;
  nationality?: string;
  job?: string;
  language?: string;
  values?: string;
  preferences?: string;

  // monster 전용
  species?: string;
  habitat?: string;
  threatLevel?: string;
  specialAbilities?: string;
  artifact?: string;

  // tutors 전용
  tutorIntro?: string;
  sharedRoleIdentity?: UnknownRecord;
  tutorsPolicy?: UnknownRecord;
  tutorsUi?: UnknownRecord;
  creationPermitKey?: string;
  creationRequestId?: string;

  _id?: Types.ObjectId | string;
  createdAt?: Date;
  updatedAt?: Date;
}

const PersonaSchema = new Schema<IPersonaDocument>(
  {
    voiceProfile: {
      type: new Schema(
        {
          provider: { type: String, enum: ["openai", "google", "elevenlabs"] },
          voiceId: { type: String },
          modelName: { type: String },
          locale: { type: String },
          instructions: { type: String },
          voiceFingerprint: { type: String, index: true },
          source: { type: String },
          tags: { type: [String], default: [] },
          resolvedAt: { type: Date },
        },
        { _id: false },
      ),
      default: undefined,
    },
    // 공통 베이스
    pid: { type: String, required: true },
    personaType: { type: String, enum: ["human", "monster"], required: true },

    name: { type: String, required: true },
    age: { type: String },
    appearance: { type: String },
    background: { type: String },
    personality: { type: String },
    speechStyle: { type: String },
    summary: { type: String },

    // 메타
    universeId: { type: String, index: true },
    speciesId: { type: String, index: true },
    systemPersonaKey: { type: String, index: true },
    systemPersonaRevision: { type: Number, min: 1, index: true },
    ownerId: { type: String, index: true },
    instanceOwnerId: { type: String, index: true },
    visibility: { type: String, enum: ["private", "unlisted", "public"], default: "private", index: true },
    editPolicy: { type: String, enum: ["owner-only", "admin-only"], default: "owner-only" },
    forkPolicy: { type: String, enum: ["fork-on-use"], default: "fork-on-use" },
    status: { type: String, enum: ["active", "archived", "blocked"], default: "active", index: true },
    version: { type: Number, default: 1 },
    isTemplate: { type: Boolean, default: false, index: true },
    sourcePersonaId: { type: String, index: true },
    sourceVersion: { type: Number },
    sourceOwnerId: { type: String },
    derivedFromSystemPersonaKey: { type: String },
    lastSyncedAt: { type: String },
    authorProfile: { type: Schema.Types.Mixed },
    credits: { type: Schema.Types.Mixed },

    // 프로필 & 스프라이트
    profiles: { type: Schema.Types.Mixed },
    sprite: { type: Schema.Types.Mixed },

    // 인간형 전용 확장 (optional)
    gender: { type: String },
    nationality: { type: String },
    job: { type: String },
    language: { type: String },
    values: { type: String },
    preferences: { type: String },

    // 몬스터형 전용 확장 (optional)
    species: { type: String },
    habitat: { type: String },
    threatLevel: { type: String },
    specialAbilities: { type: String },
    artifact: { type: String },

    // tutors 전용 확장 (optional)
    tutorIntro: { type: String },
    sharedRoleIdentity: { type: Schema.Types.Mixed },
    tutorsPolicy: { type: Schema.Types.Mixed },
    tutorsUi: { type: Schema.Types.Mixed },
    tutorGoalBlueprint: { type: Schema.Types.Mixed },
    tutorBehaviorAxes: { type: Schema.Types.Mixed },
    narrativeGenesis: { type: Schema.Types.Mixed },
    creationPermitKey: { type: String },
    creationRequestId: { type: String },
  },
  {
    timestamps: true,
  }
);

PersonaSchema.index({ pid: 1 }, { unique: true });
PersonaSchema.index({ universeId: 1, pid: 1 });
PersonaSchema.index({ ownerId: 1, visibility: 1, status: 1 });
PersonaSchema.index({ instanceOwnerId: 1, status: 1 });
PersonaSchema.index({ isTemplate: 1, visibility: 1, status: 1, updatedAt: -1 });
PersonaSchema.index({ sourcePersonaId: 1, ownerId: 1, isTemplate: 1 });
PersonaSchema.index({ creationPermitKey: 1 }, { unique: true, sparse: true });


export { PersonaSchema };
