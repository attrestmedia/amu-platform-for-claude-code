import { Schema, type Document } from "mongoose";
import type { ChatModelScopeType, ChatModelServiceType, TextProviderType } from "types/ai";

/**
 * @docHint
 * @purpose 사용자별 AI 채팅 모델 선호 저장
 * @process 서비스와 적용 범위별 provider/modelName을 단일 문서로 upsert
 * @domain ai-chat
 * @scope db_schema
 */

export interface IUserAiChatPreferenceDocument extends Document {
  uid: string;
  service: ChatModelServiceType;
  scopeType: ChatModelScopeType;
  scopeId: string;
  provider: TextProviderType;
  modelName: string;
  createdAt: Date;
  updatedAt: Date;
}

export const UserAiChatPreferenceSchema = new Schema<IUserAiChatPreferenceDocument>(
  {
    uid: { type: String, required: true, index: true, trim: true },
    service: { type: String, enum: ["amu", "tutors", "game"], required: true, index: true },
    scopeType: { type: String, enum: ["service", "universe", "persona"], required: true },
    scopeId: { type: String, required: true, trim: true },
    provider: { type: String, enum: ["google", "openai", "claude", "deepseek", "xai", "zai"], required: true },
    modelName: { type: String, required: true, trim: true },
  },
  { timestamps: true },
);

UserAiChatPreferenceSchema.index(
  { uid: 1, service: 1, scopeType: 1, scopeId: 1 },
  { unique: true, name: "uniq_user_chat_model_scope" },
);
