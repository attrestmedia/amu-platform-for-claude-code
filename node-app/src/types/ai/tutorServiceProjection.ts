/**
 * OOC-094 — Tutors·Play 서비스별 캐릭터 projection 계약.
 * shared identity/role은 양쪽에서 읽을 수 있지만 tutor mechanics는 Tutors만 읽는다.
 */

export const TUTOR_SERVICE_CONTEXT_VALUES = ["tutors", "play"] as const;
export type TutorServiceContext = (typeof TUTOR_SERVICE_CONTEXT_VALUES)[number];

export type TutorSharedIdentity = {
  pid: string;
  name: string;
  personaType?: "human" | "monster";
  appearance?: string;
  background?: string;
  personality?: string;
  speechStyle?: string;
  job?: string;
  universeId?: string;
  speciesId?: string;
  genesisSnapshot?: Record<string, unknown>;
};

export type TutorSharedRoleIdentity = {
  roleKey?: string;
  title?: string;
  summary?: string;
  responsibilities?: string[];
  relationshipStance?: string;
};

export type TutorRoleMechanics = {
  learningPolicy?: Record<string, unknown>;
  goalBlueprint?: Record<string, unknown>;
  behaviorAxes?: Record<string, unknown>;
};

export type TutorServiceProjection = {
  service: TutorServiceContext;
  sharedIdentity: TutorSharedIdentity;
  sharedRoleIdentity: TutorSharedRoleIdentity;
  tutorRoleMechanics: TutorRoleMechanics | null;
  narrativeProjection: {
    sharedIdentity: TutorSharedIdentity;
    sharedRoleIdentity: TutorSharedRoleIdentity;
    mechanicsIncluded: boolean;
  };
};
