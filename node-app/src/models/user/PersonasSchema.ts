import { Schema, Document } from "mongoose";
import type { IPersonaItem } from "types/ai";

/**
 * @docHint
 * @purpose MongoDB 스키마 정의
 * @process 주요 필드(uid, universe) 및 인덱스/기본값 선언
 * @domain persona
 * @scope db_schema
 */

export interface IPersonasDocument extends Document {
  uid: string;
  universe: string;
  personas: IPersonaItem[];
  updatedAt: Date;
  createdAt: Date;
}

const PersonasSchema = new Schema<IPersonasDocument>(
  {
    uid: { type: String, required: true, index: true },
    universe: { type: String, required: true, index: true },
    personas: [{ type: Schema.Types.Mixed }],
  },
  {
    timestamps: true,
  }
);

PersonasSchema.index({ uid: 1, universe: 1 }, { unique: true });

export { PersonasSchema };
