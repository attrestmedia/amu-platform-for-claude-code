import { AmuLogo, AmuSimbol } from "@amu-labs/ui/icons/brand/amu";
import { Lang } from "components/module/i18n";

export function MiniAppDefaultLogo() {
  return (
    <div className="inline-flex items-center gap-2">
      <AmuSimbol width={22} height={22} />
      <AmuLogo width={82} height={28} className="relative top-[2px]" />
      <span className="sr-only">
        <Lang text={{ ko: "All My Universe", en: "All My Universe" }} />
      </span>
    </div>
  );
}
