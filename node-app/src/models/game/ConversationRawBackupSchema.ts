import { Schema, Document } from "mongoose";
import { AI_MESSAGE_BASE_TYPES } from "consts/ai";

export interface IConversationRawBackupDoc extends Document {
  userId: string;
  personaId: string;
  userPersonaId?: string;
  universeId?: string;
  sessionId: string;
  sessionDate?: Date;
  sessionFirstMessageAt?: Date;
  sessionLastMessageAt?: Date;
  sessionLocation?: string;
  sessionSummary?: string;
  sessionMessageCount: number;
  backupReason: string;
  backedUpAt: Date;
  messages: Array<{
    role: (typeof AI_MESSAGE_BASE_TYPES)[number];
    content: string;
    timestamp: Date;
    clientId: string;
    translation?: string;
    systemCode?: string[];
    productCode?: string[];
  }>;
}

export const ConversationRawBackupSchema = new Schema<IConversationRawBackupDoc>(
  {
    userId: { type: String, required: true, index: true },
    personaId: { type: String, required: true, index: true },
    userPersonaId: { type: String, required: false, index: true },
    universeId: { type: String, required: false, index: true },
    sessionId: { type: String, required: true, index: true },
    sessionDate: { type: Date },
    sessionFirstMessageAt: { type: Date },
    sessionLastMessageAt: { type: Date, index: true },
    sessionLocation: { type: String, default: "unknown" },
    sessionSummary: { type: String, default: "" },
    sessionMessageCount: { type: Number, default: 0 },
    backupReason: { type: String, default: "retention_prune" },
    backedUpAt: { type: Date, default: Date.now },
    messages: [
      {
        role: { type: String, enum: AI_MESSAGE_BASE_TYPES, required: true },
        content: { type: String, required: true },
        timestamp: { type: Date, default: Date.now },
        clientId: { type: String, required: true },
        translation: { type: String, default: "" },
        systemCode: { type: [String], default: [] },
        productCode: { type: [String], default: [] },
      },
    ],
  },
  { timestamps: true }
);

ConversationRawBackupSchema.index(
  { userId: 1, personaId: 1, userPersonaId: 1, sessionId: 1 },
  { unique: true, partialFilterExpression: { userPersonaId: { $exists: true, $type: "string" } } }
);
ConversationRawBackupSchema.index(
  { userId: 1, personaId: 1, universeId: 1, sessionId: 1 },
  { unique: true, partialFilterExpression: { universeId: { $exists: true, $type: "string" } } }
);
