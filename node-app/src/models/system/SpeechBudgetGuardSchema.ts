import mongoose from "mongoose";

export interface ISpeechBudgetGuardDocument extends mongoose.Document {
  environment: string;
  provider: string;
  seq: number;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * @docHint
 * @purpose speech budget reserve transaction을 provider·environment 단위로 직렬화
 * @process 예약마다 seq 원자 증가  동일 키의 write conflict로 snapshot write skew 차단
 * @domain system-control
 * @scope server
 *
 * seq 값 자체에는 업무 의미가 없다. reserve 트랜잭션이 같은 문서를 갱신하게 만드는 guard다.
 */
export const SpeechBudgetGuardSchema = new mongoose.Schema<ISpeechBudgetGuardDocument>(
  {
    environment: { type: String, required: true },
    provider: { type: String, required: true, lowercase: true },
    seq: { type: Number, required: true, default: 0, min: 0 },
  },
  { timestamps: true },
);

SpeechBudgetGuardSchema.index(
  { environment: 1, provider: 1 },
  { unique: true, name: "speech_budget_guard_scope_unique" },
);
