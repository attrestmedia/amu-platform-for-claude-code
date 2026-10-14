import fetchClient from "libs/api/fetchClient";

export type ModelEmergencyDisableTarget =
  | { kind: "modelProfile"; modelRef: string }
  | { kind: "executionRoute"; modelRef: string; route: string };

export type ModelEmergencyDisableRecord = {
  schemaVersion: 1;
  target: ModelEmergencyDisableTarget;
  disabledUntil: string;
  reason: string;
  actor: string;
  issuedAt: string;
  releasedAt: string | null;
  releasedBy: string | null;
  releaseReason: string | null;
};

export type ModelEmergencyDisableItem = {
  key: string;
  state: "active" | "expired" | "released";
  record: ModelEmergencyDisableRecord;
};

export type ModelEmergencyDisableSnapshot = {
  ok: true;
  readable: true;
  now: string;
  records: ModelEmergencyDisableItem[];
  invalidKeys: Array<{ key: string; reason: string }>;
  targets: {
    modelProfiles: string[];
    executionRoutes: Array<{ modelRef: string; route: string }>;
  };
};

type ModelEmergencyDisableMutationResponse = {
  ok: true;
  key: string;
  record: ModelEmergencyDisableRecord;
  auditId: string;
};

const MODEL_EMERGENCY_DISABLE_PATH = "/admin/model-emergency-disables";

export async function fetchModelEmergencyDisables(): Promise<ModelEmergencyDisableSnapshot> {
  const response = await fetchClient.get<ModelEmergencyDisableSnapshot>(MODEL_EMERGENCY_DISABLE_PATH, {
    responseType: "json",
  });
  return response.data;
}

export async function createModelEmergencyDisable(args: {
  target: ModelEmergencyDisableTarget;
  disabledUntil: string;
  reason: string;
}): Promise<ModelEmergencyDisableMutationResponse> {
  const response = await fetchClient.post<ModelEmergencyDisableMutationResponse>(MODEL_EMERGENCY_DISABLE_PATH, args, {
    responseType: "json",
  });
  return response.data;
}

export async function releaseModelEmergencyDisable(args: {
  key: string;
  reason: string;
}): Promise<ModelEmergencyDisableMutationResponse> {
  const response = await fetchClient.post<ModelEmergencyDisableMutationResponse>(
    `${MODEL_EMERGENCY_DISABLE_PATH}/release`,
    args,
    { responseType: "json" },
  );
  return response.data;
}
