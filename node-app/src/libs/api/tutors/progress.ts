"use client";

import fetchClient from "libs/api/fetchClient";

export type TutorsProgressOverview = {
  dateKey: string;
  nextCreationResetAt: string;
  canCreate: boolean;
  baseCanCreate?: boolean;
  adminBypass?: boolean;
  dailyCreationCount: number;
  dailyCreationLimit: number;
  creationCredits: number;
  completedSessionCount?: number;
  creationUnlockSessionInterval?: number;
  allowedCreationCount?: number;
  usedCreationCount?: number;
  remainingSessionsForNextTutor?: number;
  validLearningDates: string[];
  tutors: Array<{ personaId: string; totalXp: number; level: number; completedSessionCount: number }>;
};

export type SharedTutorProgressItem = {
  grantId: string;
  friendActorId: string;
  friendDisplayName: string;
  sourcePersonaId: string;
  tutorName: string;
  totalXp: number;
  level: number;
  completedSessionCount: number;
  updatedAt?: string;
};

type Envelope<T> = { ok: boolean; data: T; error?: string };

export async function getTutorsProgress() {
  const response = await fetchClient.get<Envelope<TutorsProgressOverview>>("/tutors/progress", { responseType: "auto" });
  return response.data.data;
}

export async function getSharedTutorsProgress() {
  const response = await fetchClient.get<Envelope<SharedTutorProgressItem[]>>("/tutors/progress/shared", {
    responseType: "auto",
  });
  return response.data.data || [];
}

export async function completeTutorsSession(args: { personaId: string; sessionId: string }) {
  const response = await fetchClient.post<
    Envelope<{
      sessionId: string;
      eventKey: string;
      xpDelta: number;
      intimacyDelta: number;
      creationCreditDelta: number;
      totalXp?: number;
      level?: number;
      completedMissions?: string[];
    }> & { duplicate?: boolean }
  >("/tutors/sessions/complete", args, { responseType: "auto" });
  return response.data;
}
