import "server-only";

import { getModel } from "libs/database/modelCache";
import { PersonaSchema } from "models/universe";
import type { IPersonaDocument } from "models/universe";
import { MONGODB_PERSONA_URL } from "consts/env/server";
import type { AuthenticatedUserType } from "libs/server-utils/api/_helpers";
import { getTutorsCollectionName, isSafeTutorsCollectionName } from "libs/services/tutors/tutorsCollectionKey";

export type TutorPersonaAccess = {
  kind: "owner";
  canEdit: true;
  grant: null;
  sourceCollection: string;
};

export type ResolvedTutorPersonaAccess = {
  persona: IPersonaDocument | null;
  access: TutorPersonaAccess | null;
};

function safeShortText(value: unknown, maxLen: number) {
  return String(value || "")
    .trim()
    .slice(0, maxLen);
}

async function getPersonaModel(collectionName: string) {
  if (!isSafeTutorsCollectionName(collectionName)) throw new Error("INVALID_TUTORS_COLLECTION");
  return getModel<IPersonaDocument>(MONGODB_PERSONA_URL, collectionName, PersonaSchema, collectionName);
}

export async function resolveTutorPersonaReadAccess(
  user: AuthenticatedUserType | unknown,
  pid: string,
): Promise<ResolvedTutorPersonaAccess> {
  const sourcePersonaId = safeShortText(pid, 128);
  if (!sourcePersonaId) return { persona: null, access: null };

  const sourceCollection = getTutorsCollectionName(user);
  const Model = await getPersonaModel(sourceCollection);
  const persona = await Model.findOne({
    pid: sourcePersonaId,
    isTemplate: { $ne: true },
    status: { $ne: "blocked" },
  })
    .lean()
    .exec();
  if (!persona) return { persona: null, access: null };

  return {
    persona: persona as IPersonaDocument,
    access: { kind: "owner", canEdit: true, grant: null, sourceCollection },
  };
}
