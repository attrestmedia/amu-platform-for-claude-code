"use client";

import { useParams } from "next/navigation";
import { MARKETING_FEATURE_ENABLED } from "consts/marketing/public";
import { buildStoreNavSections } from "./storeNavModel";

export function useStoreNavSections() {
  const params = useParams<{ universeId: string }>();
  const universeId = params?.universeId ?? "";

  return buildStoreNavSections({ universeId, marketingEnabled: MARKETING_FEATURE_ENABLED });
}
