"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  DEFAULT_SERVICE_AVAILABILITY,
  normalizeServiceAvailability,
  type ServiceAvailabilityMap,
  type ServiceKey,
} from "consts/system/serviceAvailability";

const SERVICE_AVAILABILITY_QUERY_KEY = ["service-availability"] as const;

type ServiceAvailabilityContextValue = {
  services: ServiceAvailabilityMap;
  isEnabled: (key: ServiceKey) => boolean;
  replaceServices: (services: ServiceAvailabilityMap) => void;
};

const ServiceAvailabilityContext = createContext<ServiceAvailabilityContextValue | null>(null);

async function fetchServiceAvailability() {
  const response = await fetch("/api/service-availability", { cache: "no-store" });
  if (!response.ok) throw new Error("SERVICE_AVAILABILITY_FETCH_FAILED");
  const payload = (await response.json()) as { services?: unknown };
  return normalizeServiceAvailability(payload.services);
}

export function ServiceAvailabilityProvider({
  initialServices,
  children,
}: {
  initialServices: ServiceAvailabilityMap;
  children: ReactNode;
}) {
  const queryClient = useQueryClient();
  const { data } = useQuery({
    queryKey: SERVICE_AVAILABILITY_QUERY_KEY,
    queryFn: fetchServiceAvailability,
    initialData: initialServices,
    staleTime: 30_000,
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
  });
  const services = data || DEFAULT_SERVICE_AVAILABILITY;

  const value = useMemo<ServiceAvailabilityContextValue>(
    () => ({
      services,
      isEnabled: (key) => services[key],
      replaceServices: (nextServices) => {
        queryClient.setQueryData(SERVICE_AVAILABILITY_QUERY_KEY, nextServices);
      },
    }),
    [queryClient, services],
  );

  return <ServiceAvailabilityContext.Provider value={value}>{children}</ServiceAvailabilityContext.Provider>;
}

export function useServiceAvailability() {
  const value = useContext(ServiceAvailabilityContext);
  if (!value) {
    throw new Error("useServiceAvailability must be used within ServiceAvailabilityProvider");
  }
  return value;
}
