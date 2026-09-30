import { Schema, type Document } from "mongoose";
import type { MagazineRenewalLog, MagazineRenewalStatus } from "libs/server-utils/magazine/magazineRenewalContract";

/**
 * @docHint
 * @purpose 리뉴얼 이력 flat 로그 모델 — postId 단위 멱등 키로 저장 (MIR-201)
 * @process 검증된 로그 계약과 status를 postId 기준으로 저장, 본문 로그는 `log`에 보관
 * @domain magazine-renewal-log
 * @scope db-schema
 */

export interface IMagazineRenewalLogDocument extends Document {
  contractType: "magazine-renewal-log";
  schemaVersion: "magazine-renewal-log.v1";
  renewalId: string;
  postId: number;
  contentId: string;
  status: MagazineRenewalStatus;
  aiModel: string;
  log: MagazineRenewalLog;
  source: string;
  updatedBy: string;
  createdAt: Date;
  updatedAt: Date;
}

export const MagazineRenewalLogSchema = new Schema<IMagazineRenewalLogDocument>(
  {
    contractType: { type: String, enum: ["magazine-renewal-log"], required: true, default: "magazine-renewal-log" },
    schemaVersion: { type: String, enum: ["magazine-renewal-log.v1"], required: true, default: "magazine-renewal-log.v1" },
    renewalId: { type: String, required: true, unique: true },
    // postId 멱등 — 같은 postId의 재실행이 새 문서·중복 발행을 만들지 않는다 (G-MIR-02).
    postId: { type: Number, required: true, unique: true },
    contentId: { type: String, required: true, index: true },
    status: { type: String, enum: ["queued", "processing", "review", "ready", "published", "failed"], required: true, index: true },
    aiModel: { type: String, required: true },
    log: { type: Schema.Types.Mixed, required: true },
    source: { type: String, enum: ["admin", "agent"], required: true },
    updatedBy: { type: String, required: true },
  },
  { timestamps: true, strict: "throw" },
);

// wave 조회(상태별)·모델별 성과 분석의 기본 진입점. 로그 본문은 Mixed라 중첩 경로를 직접 인덱싱한다.
MagazineRenewalLogSchema.index({ status: 1, "log.publishedAt": 1 }, { name: "magazine_renewal_status_published" });
MagazineRenewalLogSchema.index({ aiModel: 1, "log.promptVersion": 1 }, { name: "magazine_renewal_model_version" });
