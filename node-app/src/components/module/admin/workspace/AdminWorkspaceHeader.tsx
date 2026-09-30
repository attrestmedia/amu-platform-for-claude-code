"use client";

import { LayoutGrid, Menu } from "lucide-react";
import { SubHeader } from "components/module/common";
import { Lang, lang } from "components/module/i18n";

export function AdminWorkspaceHeader({ onOpenSidebar }: { onOpenSidebar: () => void }) {
  return (
    <SubHeader
      sticky
      backAction={{
        link: "/admin",
        label: lang({ ko: "관리자 홈", en: "Admin home" }),
      }}
      icon={<LayoutGrid className="h-5 w-5 shrink-0 text-primary" aria-hidden />}
      title={<Lang text={{ ko: "Assets Studio", en: "Assets Studio" }} />}
      description={<Lang text={{ ko: "캐릭터·모델 에셋 제작 워크스페이스", en: "Character and model asset workspace" }} />}
      actions={[
        {
          icon: <Menu className="h-5 w-5" aria-hidden />,
          label: lang({ ko: "Assets Studio 메뉴 열기", en: "Open Assets Studio menu" }),
          onClick: onOpenSidebar,
          className: "lg:hidden",
        },
      ]}
    />
  );
}
