import { GenHorizontal } from "@amu-labs/ui/icons/brand/gen-studio";
import { Badge } from "@amu-labs/ui";
import { Lang } from "components/module/i18n";
import { isMobileScreen } from "utils/common";

export function GenStudioLogo() {
  return (
    <div className="relative inline-flex items-center">
      <GenHorizontal
        width={isMobileScreen() ? 144 : 200}
        height={isMobileScreen() ? 46 : 66}
        color={["var(--gen-studio-logo-accent)", "var(--foreground)"]}
      />
      <Badge
        variant="accent"
        size="xs"
        className="absolute -top-[0.35rem] -right-2 h-[1.25rem] scale-80 sm:-top-1 sm:scale-100"
      >
        AI
      </Badge>
      <span className="sr-only">
        <Lang text={{ ko: "Gen Studio (AI)", en: "Gen Studio (AI)" }} />
      </span>
    </div>
  );
}
