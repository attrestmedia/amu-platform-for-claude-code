import { Schema, type Types } from "mongoose";

export interface ITutorCreationPermitDocument {
  _id?: Types.ObjectId | string;
  permitKey: string;
  requestKey: string;
  actorId: string;
  requestId: string;
  source: "daily" | "reward" | "conversation" | "admin";
  dateKey: string;
  state: "reserved" | "consumed";
  personaId?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export const TutorCreationPermitSchema = new Schema<ITutorCreationPermitDocument>(
  {
    permitKey: { type: String, required: true, unique: true, index: true },
    requestKey: { type: String, required: true, unique: true, index: true },
    actorId: { type: String, required: true, index: true },
    requestId: { type: String, required: true },
    source: { type: String, enum: ["daily", "reward", "conversation", "admin"], required: true },
    dateKey: { type: String, required: true, index: true },
    state: { type: String, enum: ["reserved", "consumed"], default: "reserved", index: true },
    personaId: { type: String, default: "" },
  },
  { timestamps: true, collection: "tutor_creation_permits" },
);

TutorCreationPermitSchema.index({ actorId: 1, state: 1, createdAt: -1 });
