import type { Dispatch, SetStateAction } from "react";
import { Button, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Textarea } from "@amu-labs/ui";
import { Lang, lang } from "components/module/i18n";
import { TEXT_PROVIDER_TYPES } from "consts/ai";
import {
  MARKETING_PROOFREAD_DEFAULT_MODEL,
  MARKETING_PROOFREAD_DEFAULT_MODEL_BY_PROVIDER,
  MARKETING_PROOFREAD_DEFAULT_PROVIDER,
} from "consts/marketing/proofread";
import type { UnknownRecord } from "utils/common/typeUtils";
import type { MarketingChannelSummary } from "./MarketingOpsTypes";
import { REVIEW_PANEL_LABEL_CLASS } from "./MarketingOpsConstants";
import { toSafeString } from "./MarketingOpsUtils";

export type ProofreadDialogState = {
  open: boolean;
  channel: MarketingChannelSummary | null;
  loading: boolean;
  findings: UnknownRecord[];
  manualInstruction: string;
  modelProvider: string;
  modelName: string;
};

export const INITIAL_PROOFREAD_DIALOG: ProofreadDialogState = {
  open: false,
  channel: null,
  loading: false,
  findings: [],
  manualInstruction: "",
  modelProvider: MARKETING_PROOFREAD_DEFAULT_PROVIDER,
  modelName: MARKETING_PROOFREAD_DEFAULT_MODEL,
};

export function MarketingProofreadDialog({
  state,
  modelOptions,
  setState,
  onClose,
  onSubmit,
}: {
  state: ProofreadDialogState;
  modelOptions: readonly string[];
  setState: Dispatch<SetStateAction<ProofreadDialogState>>;
  onClose: () => void;
  onSubmit: () => void;
}) {
  return (
    <Dialog open={state.open} onOpenChange={(open) => !open && !state.loading && onClose()}>
      <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            <Lang text={{ ko: "오탈자 검수", en: "Proofread channel draft" }} />
          </DialogTitle>
          <DialogDescription>
            <Lang
              text={{
                ko: "필요할 때만 실행하는 옵션 기능입니다. 현재 편집 중인 제목, 본문, CTA, 해시태그/태그 전체를 검사·수정하며 선택한 모델 사용량만큼 사용자 코인이 차감됩니다.",
                en: "This optional action checks and corrects every editable text field when needed. The signed-in user is charged for the selected model usage.",
              }}
            />
          </DialogDescription>
        </DialogHeader>

        {state.loading ? (
          <p className="text-sm text-secondary-text">
            <Lang text={{ ko: "오탈자를 처리하고 있습니다.", en: "Processing proofreading request." }} />
          </p>
        ) : (
          <div className="space-y-4">
            <div className="space-y-2">
              <p className="text-sm font-medium text-primary-text">
                {lang({ ko: `발견 항목 ${state.findings.length}건`, en: `${state.findings.length} findings` })}
              </p>
              {state.findings.length === 0 ? (
                <p className="text-sm text-secondary-text">
                  <Lang
                    text={{
                      ko: "활성 오탈자 사전에서 발견된 항목이 없습니다. 직접 발견한 내용이 있으면 아래에 입력하세요.",
                      en: "No active typo rule matched. Enter a manually found issue below if needed.",
                    }}
                  />
                </p>
              ) : (
                state.findings.map((finding, index) => (
                  <div
                    key={`${toSafeString(finding.ruleId)}:${toSafeString(finding.field)}:${index}`}
                    className="border-l-2 border-warning pl-3 text-sm"
                  >
                    <p className="font-medium text-primary-text">
                      {toSafeString(finding.field)} · {toSafeString(finding.pattern)}
                    </p>
                    <p className="text-secondary-text">{toSafeString(finding.context)}</p>
                  </div>
                ))
              )}
            </div>

            <div>
              <label className={REVIEW_PANEL_LABEL_CLASS}>
                <Lang text={{ ko: "수동 발견/수정 요청", en: "Manual correction request" }} />
              </label>
              <Textarea
                value={state.manualInstruction}
                onChange={(event) => setState((prev) => ({ ...prev, manualInstruction: event.target.value }))}
                rows={3}
                placeholder={lang({
                  ko: "예: 본문의 ‘됬습니다’를 ‘됐습니다’로 수정",
                  en: "Describe a manually found typo and its correction.",
                })}
              />
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className={REVIEW_PANEL_LABEL_CLASS}>
                  <Lang text={{ ko: "AI 제공자", en: "AI provider" }} />
                </label>
                <Select
                  value={state.modelProvider}
                  onValueChange={(value) => {
                    const provider = Array.isArray(value) ? value[0] || "" : value;
                    setState((prev) => ({
                      ...prev,
                      modelProvider: provider,
                      modelName:
                        (MARKETING_PROOFREAD_DEFAULT_MODEL_BY_PROVIDER as Record<string, string>)[provider] || "",
                    }));
                  }}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TEXT_PROVIDER_TYPES.map((provider) => (
                      <SelectItem key={provider} value={provider}>
                        {provider}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className={REVIEW_PANEL_LABEL_CLASS}>
                  <Lang text={{ ko: "AI 모델", en: "AI model" }} />
                </label>
                <Select
                  value={state.modelName}
                  onValueChange={(value) =>
                    setState((prev) => ({ ...prev, modelName: Array.isArray(value) ? value[0] || "" : value }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {modelOptions.map((modelName) => (
                      <SelectItem key={modelName} value={modelName}>
                        {modelName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={state.loading}>
            <Lang text={{ ko: "닫기", en: "Close" }} />
          </Button>
          <Button onClick={onSubmit} disabled={state.loading}>
            <Lang text={{ ko: "AI 검수 및 수정", en: "AI proofread and correction" }} />
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
