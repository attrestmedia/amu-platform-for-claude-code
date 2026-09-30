import fetchClient from "libs/api/fetchClient";
import { normalizeServiceAvailability, type ServiceAvailabilityMap, type ServiceKey } from "consts/system/serviceAvailability";

export async function patchServiceAvailability(args: {
  key: ServiceKey;
  enabled: boolean;
  reason: string;
}): Promise<ServiceAvailabilityMap> {
  const response = await fetchClient.patch<{ ok: boolean; services: unknown }>("/admin/service-availability", args, {
    responseType: "json",
  });
  return normalizeServiceAvailability(response.data.services);
}
