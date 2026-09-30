import { Schema, type Types } from "mongoose";

export type UserFriendshipStatus = "pending" | "accepted" | "declined" | "cancelled" | "removed" | "blocked";

export interface IUserFriendshipDocument {
  _id?: Types.ObjectId | string;
  friendshipId: string;
  requesterActorId: string;
  recipientActorId: string;
  actorPairKey: string;
  status: UserFriendshipStatus;
  requestedAt?: Date;
  acceptedAt?: Date;
  declinedAt?: Date;
  cancelledAt?: Date;
  removedAt?: Date;
  blockedAt?: Date;
  blockedByActorId?: string;
  capabilities?: {
    giftTutors?: boolean;
    progressShare?: boolean;
    presence?: boolean;
    directChat?: boolean;
  };
  createdAt?: Date;
  updatedAt?: Date;
}

export const UserFriendshipSchema = new Schema<IUserFriendshipDocument>(
  {
    friendshipId: { type: String, required: true, unique: true, index: true },
    requesterActorId: { type: String, required: true, index: true },
    recipientActorId: { type: String, required: true, index: true },
    actorPairKey: { type: String, required: true, unique: true, index: true },
    status: {
      type: String,
      enum: ["pending", "accepted", "declined", "cancelled", "removed", "blocked"],
      default: "pending",
      index: true,
    },
    requestedAt: { type: Date },
    acceptedAt: { type: Date },
    declinedAt: { type: Date },
    cancelledAt: { type: Date },
    removedAt: { type: Date },
    blockedAt: { type: Date },
    blockedByActorId: { type: String, default: "" },
    capabilities: {
      giftTutors: { type: Boolean, default: true },
      progressShare: { type: Boolean, default: true },
      presence: { type: Boolean, default: false },
      directChat: { type: Boolean, default: false },
    },
  },
  { timestamps: true, collection: "user_friendships" },
);

UserFriendshipSchema.index({ requesterActorId: 1, status: 1, updatedAt: -1 });
UserFriendshipSchema.index({ recipientActorId: 1, status: 1, updatedAt: -1 });
UserFriendshipSchema.index({ actorPairKey: 1, status: 1 });
