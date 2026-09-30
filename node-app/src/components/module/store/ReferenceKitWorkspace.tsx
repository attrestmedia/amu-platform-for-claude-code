"use client";

import { useQuery } from "@tanstack/react-query";
import { Button, Preloader } from "@amu-labs/ui";
import { Lang, lang } from "components/module/i18n";
import fetchClient from "libs/api/fetchClient";
import type { ICharacterReferenceKit } from "types/character";
import { toErrorMessage } from "utils/common";
import { ModelReferenceKitManager } from "./ModelReferenceKitManager";

type ApiEnvelope<T = unknown> = {
  data?: T;
};

type ModelReferenceKitListResponse = {
  kits: ICharacterReferenceKit[];
  totalCount: number;
};

export function ReferenceKitWorkspace({ universeId }: { universeId: string }) {
  const kitsQuery = useQuery<ModelReferenceKitListResponse>({
    queryKey: ["character-reference-kits", universeId],
    queryFn: async () => {
      const response = await fetchClient.get<ApiEnvelope>(
        `/universe/${universeId}/character-reference-kits?limit=80`,
        { cache: "no-store" },
      );
      return (response?.data?.data || { kits: [], totalCount: 0 }) as ModelReferenceKitListResponse;
    },
    enabled: !!universeId,
    staleTime: 0,
    refetchOnWindowFocus: false,
  });

  if (kitsQuery.isLoading) {
    return <Preloader variant="spin" size="lg" container />;
  }

  if (kitsQuery.isError) {
    return (
      <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-5" role="alert">
        <p className="text-sm text-destructive">
          {toErrorMessage(kitsQuery.error, lang({ ko: "레퍼런스 킷을 불러오지 못했습니다.", en: "Reference kits could not be loaded." }))}
        </p>
        <Button variant="outline" className="mt-4 min-h-11" onClick={() => void kitsQuery.refetch()}>
          <Lang text={{ ko: "다시 불러오기", en: "Try again" }} />
        </Button>
      </div>
    );
  }

  return (
    <ModelReferenceKitManager
      universeId={universeId}
      kits={kitsQuery.data?.kits}
      onChanged={async () => {
        await kitsQuery.refetch();
      }}
    />
  );
}
