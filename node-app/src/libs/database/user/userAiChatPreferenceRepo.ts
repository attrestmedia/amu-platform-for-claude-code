import "server-only";
import { MONGODB_USERS_URL } from "consts/env/server";
import { getModel } from "libs/database/modelCache";
import {
  UserAiChatPreferenceSchema,
  type IUserAiChatPreferenceDocument,
} from "models/user";
import type { ChatModelScopeType, ChatModelServiceType, TextProviderType } from "types/ai";

const USER_AI_CHAT_PREFERENCE_COLLECTION = "user_ai_chat_preferences";

type PreferenceScope = {
  scopeType: ChatModelScopeType;
  scopeId: string;
};

async function getUserAiChatPreferenceModel() {
  return await getModel<IUserAiChatPreferenceDocument>(
    MONGODB_USERS_URL,
    "UserAiChatPreference",
    UserAiChatPreferenceSchema,
    USER_AI_CHAT_PREFERENCE_COLLECTION,
  );
}

export async function findUserAiChatPreference(args: {
  uid: string;
  service: ChatModelServiceType;
  scopes: PreferenceScope[];
}) {
  if (!args.scopes.length) return null;
  const Model = await getUserAiChatPreferenceModel();
  const rows = await Model.find({
    uid: args.uid,
    service: args.service,
    $or: args.scopes.map((scope) => ({ scopeType: scope.scopeType, scopeId: scope.scopeId })),
  }).lean<IUserAiChatPreferenceDocument[]>();
  const byScope = new Map(rows.map((row) => [`${row.scopeType}:${row.scopeId}`, row]));
  for (const scope of args.scopes) {
    const hit = byScope.get(`${scope.scopeType}:${scope.scopeId}`);
    if (hit) return hit;
  }
  return null;
}

export async function upsertUserAiChatPreference(args: {
  uid: string;
  service: ChatModelServiceType;
  scopeType: ChatModelScopeType;
  scopeId: string;
  provider: TextProviderType;
  modelName: string;
}) {
  const Model = await getUserAiChatPreferenceModel();
  return await Model.findOneAndUpdate(
    {
      uid: args.uid,
      service: args.service,
      scopeType: args.scopeType,
      scopeId: args.scopeId,
    },
    {
      $set: {
        provider: args.provider,
        modelName: args.modelName,
      },
      $setOnInsert: {
        uid: args.uid,
        service: args.service,
        scopeType: args.scopeType,
        scopeId: args.scopeId,
      },
    },
    { new: true, upsert: true, lean: true },
  );
}

export async function deleteUserAiChatPreference(args: {
  uid: string;
  service: ChatModelServiceType;
  scopeType: ChatModelScopeType;
  scopeId: string;
}) {
  const Model = await getUserAiChatPreferenceModel();
  return await Model.deleteOne({
    uid: args.uid,
    service: args.service,
    scopeType: args.scopeType,
    scopeId: args.scopeId,
  });
}
