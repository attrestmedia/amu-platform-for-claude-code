import fetchClient from "libs/api/fetchClient";
import type { CrossUniverseMatchCandidate, IPersonalUniverseCanonRevisionDoc, IPersonalUniverseDoc } from "types/game";

export type PersonalUniverseOverviewCharacter = {
  characterId: string;
  name: string;
  sourceImageRef: string;
  speciesId?: "human" | "monster";
  primaryAttributeId?: string;
  updatedAt?: string | Date;
};

export type PersonalUniverseOverviewData = {
  universe: IPersonalUniverseDoc | null;
  canon: IPersonalUniverseCanonRevisionDoc[];
  characters: PersonalUniverseOverviewCharacter[];
};

export type CrossUniverseGraphData = {
  enabled: boolean;
  gate: { ready: boolean };
  nodes: Array<{ universeId: string; publicSnapshotId: string; title: string }>;
  bridges: Array<{ bridgeId: string; kind: "guest-encounter" | "canon-bridge"; status: string; hostUniverseId: string; guestUniverseId: string; foreignCharacter: { readonly: true; sourceUniverseId: string; characterId: string; characterRevision: number; promptLabel: string }; sharedFact: { title: string; occurredAt?: string | Date | null }; createdAt?: string | Date }>;
  candidates: CrossUniverseMatchCandidate[];
  characters: Array<{ characterId: string; name: string }>;
  requests: Array<{ bridgeId: string; title: string; kind: "guest-encounter" | "canon-bridge" }>;
  canonBridges: Array<{ bridgeId: string; title: string }>;
  shareEnabled: boolean;
};

type ApiEnvelope<T> = {
  ok?: boolean;
  data?: T;
  error?: string;
};

export async function getMyPersonalUniverseOverview() {
  const response = await fetchClient.get<ApiEnvelope<PersonalUniverseOverviewData>>(
    "/game/personal-universe/overview",
    { responseType: "auto", cache: "no-store" },
  );
  const data = response.data?.data;
  if (!data) throw new Error(response.data?.error || "personal_universe_overview_failed");
  return data;
}

export async function getMyCrossUniverseGraph() {
  const response = await fetchClient.get<ApiEnvelope<CrossUniverseGraphData>>(
    "/game/personal-universe/cross-universe",
    { responseType: "auto", cache: "no-store" },
  );
  const data = response.data?.data;
  if (!data) throw new Error(response.data?.error || "cross_universe_graph_failed");
  return data;
}

export async function postCrossUniverseAction(payload: Record<string, unknown>) {
  const response = await fetchClient.post<ApiEnvelope<Record<string, unknown>>>(
    "/game/personal-universe/cross-universe",
    payload,
    { responseType: "auto" },
  );
  if (response.data?.ok !== true) throw new Error(response.data?.error || "cross_universe_action_failed");
  return response.data.data || {};
}
