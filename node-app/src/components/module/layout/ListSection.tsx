"use client";

import Image from "next/image";
import { Handshake, Gamepad2 } from "lucide-react";
import type { IUniverse } from "types/game";
import { cn } from "utils/common";

type Props = {
  title: string;
  items: IUniverse[]; // 유니버스 목록
  variant: "Biz" | "Game";
  onSelect: (universeId: string) => void;
  renderDescription?: (description: { ko: string; en: string }) => string;
};

export function ListSection({ title, items, variant, onSelect, renderDescription }: Props) {
  if (!items || items.length === 0) return null;

  const isBiz = variant === "Biz";

  return (
    <section className="px-4 py-6">
      {/* 섹션 헤더 */}
      <h3
        className={cn(
          "flex items-center gap-2 text-xl sm:text-2xl font-bold mb-4",
          isBiz ? "text-primary" : "text-secondary",
        )}
      >
        {isBiz ? <Handshake /> : <Gamepad2 />}
        {title}
      </h3>

      {/* 카드 리스트 */}
      <ul className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {items.map((u) => {
          const clickable = Boolean(u.enabled);
          return (
            <li
              key={u.id}
              className={cn("group cursor-pointer", !clickable && "cursor-not-allowed opacity-60")}
              onClick={() => (clickable ? onSelect(u.id) : null)}
            >
              {/* 썸네일 */}
              <div className="relative w-full aspect-video overflow-hidden">
                <Image
                  src={u.thumbnail}
                  alt={u.name}
                  fill
                  className="object-cover group-hover:scale-105 transition-transform duration-500"
                  sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                  priority={false}
                  unoptimized
                />
                {/* 그라데이션 */}
                <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
                {/* 타입 배지 */}
                <div className="absolute bottom-0 left-0 right-0 p-4">
                  <span className="text-xs text-white/60 bg-black/50 py-1 px-3 rounded-xl relative -top-2">
                    {variant}
                  </span>
                </div>
              </div>

              {/* 본문 */}
              <div className="py-4">
                <div className="flex items-center justify-between">
                  <div className="list-header">
                    <h4
                      className={cn(
                        "text-lg text-primary font-medium mb-1 duration-300",
                        "hover:font-semibold group-hover:text-secondary",
                      )}
                    >
                      {u.name}
                    </h4>
                    {!!u?.description && !!renderDescription && (
                      <p
                        className="text-sm text-gray-600 line-clamp-2"
                        // 페이지 쪽에서 sanitize한 결과를 그대로 사용
                        dangerouslySetInnerHTML={{ __html: renderDescription(u.description) }}
                      />
                    )}
                  </div>
                  {/* 필요 시 우측 액션 버튼 영역 */}
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
