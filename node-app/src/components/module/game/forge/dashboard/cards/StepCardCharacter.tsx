"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { Images, Info, Upload, User, Wand2 } from "lucide-react";
import { Lang } from "components/module/i18n";
import type { ForgeSummary } from "libs/api/game/forgeSummaryClient";

const METHODS = [
  { key: "template", icon: Images, label: { ko: "Gen Studio 템플릿", en: "Gen Studio template" } },
  { key: "new", icon: Wand2, label: { ko: "새 캐릭터 생성", en: "Create new character" } },
  { key: "upload", icon: Upload, label: { ko: "이미지 업로드", en: "Upload image" } },
] as const;

/** STEP1 카드 미리보기 — 대표 이미지 + 등록 방법 3버튼 + 힌트. */
export function StepCardCharacter({ summary }: { summary: ForgeSummary | undefined }) {
  const router = useRouter();
  const latest = summary?.characters.latest;

  return (
    <div className="flex flex-col gap-3">
      {/* 대표 캐릭터 이미지 (없으면 기본 일러스트 글리프) */}
      <div className="relative aspect-[3/4] overflow-hidden rounded-[10px] bg-surface-2">
        {latest?.imageUrl ? (
          <Image src={latest.imageUrl} alt="" fill sizes="200px" className="object-cover" />
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-1 text-muted-text">
            <User className="h-8 w-8" aria-hidden />
            <span className="text-[11px]">
              <Lang text={{ ko: "아직 캐릭터가 없어요", en: "No character yet" }} />
            </span>
          </div>
        )}
      </div>

      {/* 등록 방법 선택 — 카드에서 바로 라우트 진입(stepCardSpec 예외) */}
      <div className="flex flex-col gap-1.5 rounded-[10px] border border-border bg-surface-2 p-2.5">
        <p className="px-0.5 text-[11px] font-semibold text-muted-text">
          <Lang text={{ ko: "등록 방법 선택", en: "Choose a method" }} />
        </p>
        {METHODS.map((method) => (
          <button
            key={method.key}
            type="button"
            onClick={() => router.push(`/assets-studio/character?method=${method.key}`)}
            className="flex min-h-11 items-center gap-2 rounded-[9px] border border-border bg-surface px-2.5 text-xs font-medium text-primary-text hover:border-border-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
          >
            <method.icon className="h-[18px] w-[18px] shrink-0" aria-hidden />
            <Lang text={method.label} />
          </button>
        ))}
      </div>

      {/* 힌트 */}
      <p className="flex items-center gap-1 text-[11px] text-muted-text">
        <Info className="h-3 w-3 shrink-0" aria-hidden />
        <Lang text={{ ko: "튜터스/Gen Studio 이미지도 사용할 수 있어요!", en: "You can also use Tutors/Gen Studio images!" }} />
      </p>
    </div>
  );
}
