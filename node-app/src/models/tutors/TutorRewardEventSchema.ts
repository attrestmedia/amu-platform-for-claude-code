import { Schema, type Types } from "mongoose";

export type TutorRewardEventType = "session_complete" | "mission_reward";

export interface ITutorRewardEventDocument {
  _id?: Types.ObjectId | string;
  eventKey: string;
  actorId: string;
  personaId?: string;
  sessionId?: string;
  missionId?: string;
  periodKey?: string;
  type: TutorRewardEventType;
  xpDelta: number;
  intimacyDelta: number;
  creationCreditDelta: number;
  payload?: Record<string, unknown>;
  createdAt?: Date;
  updatedAt?: Date;
}

export const TutorRewardEventSchema = new Schema<ITutorRewardEventDocument>(
  {
    eventKey: { type: String, required: true, unique: true, index: true },
    actorId: { type: String, required: true, index: true },
    personaId: { type: String, default: "", index: true },
    sessionId: { type: String, default: "", index: true },
    missionId: { type: String, default: "", index: true },
    periodKey: { type: String, default: "" },
    type: { type: String, enum: ["session_complete", "mission_reward"], required: true, index: true },
    xpDelta: { type: Number, default: 0 },
    intimacyDelta: { type: Number, default: 0 },
    creationCreditDelta: { type: Number, default: 0 },
    payload: { type: Schema.Types.Mixed, default: undefined },
  },
  { timestamps: true, collection: "tutor_reward_events" },
);

TutorRewardEventSchema.index({ actorId: 1, type: 1, createdAt: -1 });
