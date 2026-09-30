"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Bell, Check, ExternalLink, Loader2, X } from "lucide-react";
import { Button, Popover, PopoverContent, PopoverTrigger } from "@amu-labs/ui";
import { ImageBox } from "components/module/image";
import { Lang, lang } from "components/module/i18n";
import { cn } from "utils/common";
import { useGlobalNotifications, type GlobalNotificationItemType } from "./GlobalNotificationProvider";

function getStatusIcon(item: GlobalNotificationItemType) {
  if (item.active) return <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin text-primary" />;
  if (item.tone === "danger") return <X className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />;
  if (item.terminal) return <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />;
  return <Bell className="mt-0.5 h-4 w-4 shrink-0 text-secondary-text" />;
}

function getDescriptionClass(item: GlobalNotificationItemType) {
  return cn("mt-0.5 text-xs", item.tone === "danger" ? "text-destructive" : "text-secondary-text");
}

// 기본은 항상 닫힘 상태를 유지한다. 알림 도착 시 자동으로 팝오버를 여는 UX가
// 사용자에게 불편하다는 피드백에 따라 기본값을 false로 둔다. 자동 오픈이 필요한
// 화면에서만 명시적으로 autoOpen을 켠다.
export function GlobalNotificationCenter({ autoOpen = false }: { autoOpen?: boolean }) {
  const { enabled, items, activeCount, badgeCount, loading, error, markRead } = useGlobalNotifications();
  const [open, setOpen] = useState(false);
  const seenAutoOpenIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!autoOpen) return;
    const nextAutoOpen = items.find((item) => item.autoOpen && !seenAutoOpenIdsRef.current.has(item.id));
    items.forEach((item) => {
      if (item.autoOpen) seenAutoOpenIdsRef.current.add(item.id);
    });
    if (nextAutoOpen) setOpen(true);
  }, [autoOpen, items]);

  if (!enabled) return null;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="blank"
          size="icon-lg"
          className="relative"
          aria-label={lang({ ko: "알림 열기", en: "Open notifications" })}
        >
          <Bell className="icon-xs" />
          {badgeCount > 0 ? (
            <span className="absolute right-2 top-2 min-w-4 rounded-full bg-primary px-1 py-0.5 text-xxs leading-none text-white">
              {badgeCount > 9 ? "9+" : badgeCount}
            </span>
          ) : null}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-[calc(100vw-1.5rem)] max-w-[20rem] overflow-hidden p-0"
        align="end"
        sideOffset={0}
        alignOffset={-20}
      >
        <section>
          <header className="flex items-center justify-between border-b border-border px-4 py-3">
            <div className="flex items-center gap-3 min-w-0">
              <h2 className="text-sm font-bold text-primary-text">
                <Lang text={{ ko: "알림", en: "Notifications" }} />
              </h2>
              <p className="text-xs text-secondary-text">
                {activeCount > 0 ? (
                  <Lang text={{ ko: `처리 중 ${activeCount}건`, en: `${activeCount} in progress` }} />
                ) : badgeCount > 0 ? (
                  <Lang text={{ ko: "확인할 알림이 있습니다.", en: "You have notifications." }} />
                ) : (
                  <Lang text={{ ko: "새 알림이 없습니다.", en: "No new notifications." }} />
                )}
              </p>
            </div>
            <Button
              variant="blank"
              size="icon-sm"
              onClick={() => setOpen(false)}
              aria-label={lang({ ko: "닫기", en: "Close" })}
              className="-mr-1"
            >
              <X className="icon-xs" />
            </Button>
          </header>

          <div className="max-h-[70vh] overflow-y-auto p-3">
            {error ? <p className="px-1 py-2 text-xs text-destructive">{error}</p> : null}

            {items.length === 0 && !loading ? (
              <div className="flex flex-col items-center justify-center gap-2 px-4 py-8 text-center">
                <Bell className="h-6 w-6 text-secondary-text" />
                <p className="text-sm font-semibold text-primary-text">
                  <Lang text={{ ko: "새 알림이 없습니다.", en: "No new notifications." }} />
                </p>
              </div>
            ) : null}

            {items.map((item) => (
              <article key={item.id} className="py-3 border-b border-border/70 last:border-b-0">
                <div className="flex gap-3">
                  {item.imageUrl ? (
                    <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-md bg-muted">
                      <ImageBox
                        src={item.imageUrl}
                        alt={item.imageAlt || item.title}
                        width={64}
                        height={64}
                        minWidth={64}
                        minHeight={64}
                        maxWidth={64}
                        maxHeight={64}
                        objectFit="object-cover"
                      />
                    </div>
                  ) : null}

                  <div className="flex items-start gap-2 flex-1">
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-semibold uppercase text-secondary-text">{item.categoryLabel}</p>
                      <p className="truncate text-sm font-semibold text-primary-text whitespace-pre-line">
                        {item.title === "__gen_studio_custom_prompt__" ? "Custom Template" : item.title}
                      </p>
                      <p className={getDescriptionClass(item)}>{item.description}</p>
                    </div>
                    {getStatusIcon(item)}
                  </div>
                </div>

                {item.terminal ? (
                  <div className="mt-2 flex items-center gap-2">
                    {item.href ? (
                      <Button asChild size="xs" rounded="full">
                        <Link href={item.href} onClick={() => setOpen(false)}>
                          <ExternalLink className="icon-xxs" />
                          <Lang text={{ ko: "열기", en: "Open" }} />
                        </Link>
                      </Button>
                    ) : null}
                    <Button variant="blank" size="xs" rounded="full" onClick={() => markRead(item)}>
                      <Lang text={{ ko: "확인", en: "Done" }} />
                    </Button>
                  </div>
                ) : null}
              </article>
            ))}

            {loading && items.length === 0 ? (
              <div className="flex items-center gap-2 px-1 py-3 text-xs text-secondary-text">
                <Loader2 className="icon-xs animate-spin" />
                <Lang text={{ ko: "알림을 확인 중입니다.", en: "Checking notifications." }} />
              </div>
            ) : null}
          </div>
        </section>
      </PopoverContent>
    </Popover>
  );
}
