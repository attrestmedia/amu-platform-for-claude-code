import type { TutorConversationLevel, TutorGoalType } from "consts/tutors";

/** Shared Tutors persona policy settings, still used by `tutorsPolicyPrompt`. */
export interface ITutorsSettings {
  operationMode?: "free" | "guided";
  correctionLevel?: "none" | "light" | "strict";
  includeKnowledgeDefault?: boolean;
  conversationLevel?: TutorConversationLevel;
  goalType?: TutorGoalType;
}
