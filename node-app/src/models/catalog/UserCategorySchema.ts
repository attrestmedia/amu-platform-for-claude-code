import mongoose, { Document } from "mongoose";
import type { ICategoryList } from "types/catalog/annotation";
import { CategoryListSchema } from "./CategorySchema";

/**
 * @docHint
 * @purpose MongoDB 스키마 정의
 * @process 주요 필드(userId, category, data) 및 인덱스/기본값 선언
 * @domain catalog
 * @scope db_schema
 */

export interface IUserCategoryData extends Document {
  userId: string; // 추가
  category: string; // 이름 변경
  data: Record<string, ICategoryList>;
}

// 카테고리 스키마
export const UserCategorySchema = new mongoose.Schema<IUserCategoryData>({
  userId: { type: String, required: true, unique: true },
  category: { type: String, required: true, unique: true },
  data: {
    type: Map,
    of: CategoryListSchema,
    required: true,
  },
});
