"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@amu-labs/ui";
import { ArrowLeft } from "lucide-react";
import { Lang } from "components/module/i18n";
import { DEFAULT_PLAY_UNIVERSE } from "consts/app/universe";
import { DirectionSheetView } from "./DirectionSheetView";

export function DirectionSheetRoute() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const characterId = searchParams.get("characterId")?.trim() || "";

  if (!characterId) {
    return (
      <div className="flex min-h-[60dvh] flex-col items-center justify-center gap-3 text-center">
        <h1 className="text-lg font-semibold">
          <Lang text={{ ko: "캐릭터를 먼저 등록하세요", en: "Register a character first" }} />
        </h1>
        <p className="text-sm text-secondary-text">
          <Lang text={{ ko: "등록을 마치면 이 화면에서 다음 단계를 이어갈 수 있습니다.", en: "Continue here after registration is complete." }} />
        </p>
        <Button className="min-h-11" onClick={() => router.push("/assets-studio/character")}>
          <ArrowLeft className="mr-2 size-4" aria-hidden />
          <Lang text={{ ko: "캐릭터 등록으로 이동", en: "Go to character registration" }} />
        </Button>
      </div>
    );
  }

  return (
    <DirectionSheetView
      universeId={DEFAULT_PLAY_UNIVERSE}
      characterId={characterId}
      onContinue={() => router.push(`/assets-studio/sprite?characterId=${encodeURIComponent(characterId)}`)}
      onReselect={() => router.push("/assets-studio/character?method=template")}
    />
  );
}
