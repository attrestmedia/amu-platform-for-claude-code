import { getModel } from "libs/database/modelCache";
import { PersonaSchema, type IPersonaDocument } from "models/universe";
import { MONGODB_PERSONA_URL } from "consts/env/server";

/**
 * @docHint
 * @purpose 도메인 데이터 접근 로직
 * @process get 작업  DB 조회/저장 수행
 * @domain persona
 * @scope server
 */

export async function getPersonaForPrompt(universeId: string, pid: string) {
  if (!universeId || !pid) return null;

  const Model = await getModel<IPersonaDocument>(MONGODB_PERSONA_URL, universeId, PersonaSchema, universeId);

  const doc = await Model.findOne({ pid })
    .select({
      pid: 1,
      personaType: 1,
      name: 1,
      universeId: 1,
      speciesId: 1,
      systemPersonaKey: 1,
      gender: 1,
      nationality: 1,
      job: 1,
      language: 1,
      personality: 1,
      speechStyle: 1,
      summary: 1,
      voiceProfile: 1,
      appearance: 1,
      background: 1,
      sharedRoleIdentity: 1,
      narrativeGenesis: 1,
      values: 1,
      preferences: 1,
      species: 1,
      habitat: 1,
      threatLevel: 1,
      specialAbilities: 1,
    })
    .lean()
    .exec();

  return doc ?? null;
}
