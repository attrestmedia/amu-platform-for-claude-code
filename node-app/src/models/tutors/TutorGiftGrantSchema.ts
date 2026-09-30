import { Schema, type Types } from "mongoose";

export type TutorGiftGrantStatus = "pending" | "accepted" | "rejected" | "revoked";

export interface ITutorGiftGrantDocument {
  _id?: Types.ObjectId | string;
  grantId: string;
  sourcePersonaId: string;
  sourceCollection: string;
  sourceOwnerId: string;
  recipientActorId: string;
  recipientEmailLower?: string;
  status: TutorGiftGrantStatus;
  message?: string;
  acceptedAt?: Date;
  rejectedAt?: Date;
  revokedAt?: Date;
  createdAt?: Date;
  updatedAt?: Date;
}

export const TutorGiftGrantSchema = new Schema<ITutorGiftGrantDocument>(
  {
    grantId: { type: String, required: true, unique: true, index: true },
    sourcePersonaId: { type: String, required: true, index: true },
    sourceCollection: { type: String, required: true },
    sourceOwnerId: { type: String, required: true, index: true },
    recipientActorId: { type: String, required: true, index: true },
    recipientEmailLower: { type: String, default: "", index: true },
    status: {
      type: String,
      enum: ["pending", "accepted", "rejected", "revoked"],
      default: "pending",
      index: true,
    },
    message: { type: String, default: "" },
    acceptedAt: { type: Date },
    rejectedAt: { type: Date },
    revokedAt: { type: Date },
  },
  { timestamps: true, collection: "tutor_gift_grants" },
);

TutorGiftGrantSchema.index({ sourceOwnerId: 1, sourcePersonaId: 1, recipientActorId: 1 }, { unique: true });
TutorGiftGrantSchema.index({ recipientActorId: 1, status: 1, updatedAt: -1 });
TutorGiftGrantSchema.index({ sourceCollection: 1, sourcePersonaId: 1 });
