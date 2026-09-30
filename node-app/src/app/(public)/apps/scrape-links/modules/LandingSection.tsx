"use client";

import { Link2, CircleCheck, Tag, Shield } from "lucide-react";
import { Button } from "@amu-labs/ui";
import { Lang } from "components/module/i18n";

const SUPPORTING = [
  {
    icon: Tag,
    title: { ko: "OG 자동 라벨", en: "OG auto-label" },
    desc: { ko: "사이트 제목/이미지를 자동 추출", en: "Pull title & image automatically" },
  },
  {
    icon: CircleCheck,
    title: { ko: "확인 체크리스트", en: "Read-later checklist" },
    desc: { ko: "확인한 링크는 체크로 정리", en: "Check off links you've visited" },
  },
  {
    icon: Shield,
    title: { ko: "개인 보관함", en: "Private vault" },
    desc: { ko: "로그인 계정에만 저장/조회", en: "Stored only for your account" },
  },
] as const;

export function LandingSection({ onStart }: { onStart: () => void }) {
  return (
    <div className="min-h-[60dvh] bg-background text-primary-text">
      <section className="mx-auto max-w-[50rem] px-5 pb-16 pt-12 sm:pt-20">
        <div className="text-center">
          <div className="mx-auto mb-6 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10">
            <Link2 className="h-7 w-7 text-primary" />
          </div>
          <h1 className="text-3xl font-bold sm:text-4xl">
            <Lang text={{ ko: "내 링크 보관함", en: "My Link Vault" }} />
          </h1>
          <p className="mt-3 text-base text-secondary-text sm:text-lg">
            <Lang
              text={{
                ko: "URL 목록이나 통 텍스트를 붙여넣으면 링크만 추출해 개인 보관함에 저장합니다.",
                en: "Paste URLs or free text — we extract the links and keep them in your private vault.",
              }}
            />
          </p>
        </div>

        <Button
          variant="primary"
          size="xl"
          rounded="full"
          className="mt-10 w-full"
          onClick={onStart}
        >
          <Link2 className="mr-2 h-4 w-4" />
          <Lang text={{ ko: "링크 보관함 열기", en: "Open Vault" }} />
        </Button>

        <div className="mt-12 grid gap-4 sm:grid-cols-3">
          {SUPPORTING.map(({ icon: Icon, title, desc }) => (
            <div
              key={title.en}
              className="flex flex-col items-center gap-2 rounded-2xl border border-border/60 bg-surface p-6 text-center"
            >
              <Icon className="h-6 w-6 text-primary" />
              <div className="text-sm font-semibold">
                <Lang text={title} />
              </div>
              <div className="text-xs text-secondary-text">
                <Lang text={desc} />
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
