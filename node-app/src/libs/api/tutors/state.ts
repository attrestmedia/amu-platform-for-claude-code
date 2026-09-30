import fetchClient from "libs/api/fetchClient";
import type { ITutorsState } from "types/app";

type TutorsStateEnvelope = { state?: ITutorsState; data?: { state?: ITutorsState } };

export async function getTutorsState(): Promise<ITutorsState | null> {
  const out = await fetchClient.get<TutorsStateEnvelope>("/tutors/state", { responseType: "auto" });
  const body = ((out as { data?: TutorsStateEnvelope })?.data ?? (out as TutorsStateEnvelope)) || {};
  return (body?.state || body?.data?.state || null) as ITutorsState | null;
}

export async function updateTutorsSelected(selected: Array<{ personaId: string; universeId: string }>) {
  const out = await fetchClient.post<TutorsStateEnvelope>("/tutors/state", { selected }, {
    responseType: "auto",
    loading: "global",
  });
  return out.data?.state;
}
