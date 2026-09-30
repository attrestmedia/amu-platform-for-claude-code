import { Button } from "@amu-labs/ui";
import { Lang, lang } from "components/module/i18n";
import { Eye } from "lucide-react";
import { cn } from "utils/common";
import type { MarketingTemplatePreviewState } from "./MarketingTemplateSheets";
import type { MarketingTemplateOption } from "./MarketingOpsTypes";
import { toSafeString } from "./MarketingOpsUtils";

type MarketingTemplateReferenceProps = {
  type: "content" | "image";
  label: string;
  templateKey?: string;
  template?: MarketingTemplateOption;
  compact?: boolean;
  setTemplatePreview: (preview: MarketingTemplatePreviewState) => void;
};

export function MarketingTemplateReference({
  type,
  label,
  templateKey: templateKeyInput,
  template,
  compact,
  setTemplatePreview,
}: MarketingTemplateReferenceProps) {
  const templateKey = toSafeString(templateKeyInput);
  const title = toSafeString(template?.title) || templateKey;
  const usageTip = toSafeString(template?.usageTip);

  return (
    <div
      className={cn(
        "rounded-lg border border-border bg-muted/10 px-4 py-3 text-xs leading-5 text-secondary-text",
        compact ? "mt-2" : "",
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium text-primary-text">{label}</p>
        {template ? (
          <Button variant="outline" size="xs" onClick={() => setTemplatePreview({ type, item: template })}>
            <Eye className="icon-xxs" />
            <span>{lang({ ko: "템플릿 보기", en: "View template" })}</span>
          </Button>
        ) : null}
      </div>
      {templateKey ? (
        <>
          <p className="mt-1 break-all text-secondary-text">
            {title}
            {title !== templateKey ? <span className="text-muted-text"> ({templateKey})</span> : null}
          </p>
          {usageTip ? <p className="mt-1 text-muted-text">{usageTip}</p> : null}
          {!template ? (
            <p className="mt-1 text-primary-text">
              <Lang text={{ ko: "템플릿 목록에서 상세 정보를 찾지 못했습니다.", en: "Template detail is not loaded." }} />
            </p>
          ) : null}
        </>
      ) : (
        <p className="mt-1 text-muted-text">
          <Lang text={{ ko: "선택된 템플릿이 없습니다.", en: "No template selected." }} />
        </p>
      )}
    </div>
  );
}
