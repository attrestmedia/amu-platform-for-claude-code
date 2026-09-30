import { Schema } from "mongoose";

/**
 * @docHint
 * @purpose MongoDB 스키마 정의
 * @process 주요 필드(x, y, width, height, classType, label) 및 인덱스/기본값 선언
 * @domain catalog
 * @scope db_schema
 */

const AnnotationSchema: Schema = new Schema({
  x: { type: Number, required: true },
  y: { type: Number, required: true },
  width: { type: Number, required: true },
  height: { type: Number, required: true },
  classType: { type: String, required: true },
  label: { type: String, required: true },
  color: { type: String, required: true },
});

const MaskingPointSchema: Schema = new Schema({
  x: { type: Number, required: true },
  y: { type: Number, required: true },
});

const CategorySchema: Schema = new Schema({
  id: { type: String, required: true },
  src: { type: String, required: true },
  storage: { type: Schema.Types.Mixed, required: false },
  status: { type: String, required: false },
  annotations: { type: [AnnotationSchema], default: [] },
  maskings: { type: [[MaskingPointSchema]], default: [] },
});

const CategoryListSchema: Schema = new Schema({
  id: { type: String, required: true },
  name: { type: String, required: true },
  list: { type: [CategorySchema], default: [] },
});

export { AnnotationSchema, MaskingPointSchema, CategorySchema, CategoryListSchema };
