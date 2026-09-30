import { Schema, type Document } from "mongoose";
import type { UnknownRecord } from "utils/common/typeUtils";

/**
 * @docHint
 * @purpose MongoDB 스키마 정의
 * @process 시스템 운영 설정 key/value 저장  서버 권위 설정 조회/갱신에 사용
 * @domain system-control
 * @scope db_schema
 */

export type SystemSettingScopeType = "global";

export interface ISystemSettingDocument extends Document {
  key: string;
  scope: SystemSettingScopeType;
  value: UnknownRecord;
  description?: string;
  updatedBy?: string;
  createdAt: Date;
  updatedAt: Date;
}

export const SystemSettingSchema = new Schema<ISystemSettingDocument>(
  {
    key: { type: String, required: true, index: true },
    scope: { type: String, enum: ["global"], default: "global", index: true },
    value: { type: Schema.Types.Mixed, default: {} },
    description: { type: String, default: "" },
    updatedBy: { type: String, default: "" },
  },
  { timestamps: true },
);

SystemSettingSchema.index({ key: 1, scope: 1 }, { unique: true });
