import { Schema, type Types } from "mongoose";

export interface ITutorAccountProgressDocument {
  _id?: Types.ObjectId | string;
  actorId: string;
  creationDateKey: string;
  dailyCreationCount: number;
  creationCredits: number;
  validLearningDates: string[];
  createdAt?: Date;
  updatedAt?: Date;
}

export interface ITutorLearningProgressDocument {
  _id?: Types.ObjectId | string;
  actorId: string;
  personaId: string;
  totalXp: number;
  completedSessionCount: number;
  dailyXpDateKey: string;
  dailyXpAmount: number;
  dailyIntimacyDateKey: string;
  dailyIntimacyAmount: number;
  createdAt?: Date;
  updatedAt?: Date;
}

export const TutorAccountProgressSchema = new Schema<ITutorAccountProgressDocument>(
  {
    actorId: { type: String, required: true, unique: true, index: true },
    creationDateKey: { type: String, default: "" },
    dailyCreationCount: { type: Number, default: 0, min: 0 },
    creationCredits: { type: Number, default: 0, min: 0 },
    validLearningDates: { type: [String], default: [] },
  },
  { timestamps: true, collection: "tutor_account_progress" },
);

export const TutorLearningProgressSchema = new Schema<ITutorLearningProgressDocument>(
  {
    actorId: { type: String, required: true, index: true },
    personaId: { type: String, required: true, index: true },
    totalXp: { type: Number, default: 0, min: 0 },
    completedSessionCount: { type: Number, default: 0, min: 0 },
    dailyXpDateKey: { type: String, default: "" },
    dailyXpAmount: { type: Number, default: 0, min: 0 },
    dailyIntimacyDateKey: { type: String, default: "" },
    dailyIntimacyAmount: { type: Number, default: 0, min: 0 },
  },
  { timestamps: true, collection: "tutor_learning_progress" },
);

TutorLearningProgressSchema.index({ actorId: 1, personaId: 1 }, { unique: true });
