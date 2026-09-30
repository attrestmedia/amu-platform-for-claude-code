"use client";

import { Bot } from "lucide-react";
import { Lang, lang } from "components/module/i18n";
import { ModelSelectField, type ModelSelectOption } from "components/module/model-select";
import type { IChatModelPolicyResult, TextProviderType } from "types/ai";

type ChatModelSelectorProps = {
  policy: IChatModelPolicyResult | null;
  loading: boolean;
  saving: boolean;
  onSelect: (provider: TextProviderType, modelName: string) => void | Promise<void>;
};

export function ChatModelSelector({ policy, loading, saving, onSelect }: ChatModelSelectorProps) {
  const audioInputMode = policy?.inputModality === "audio";
  const options: ModelSelectOption[] = (policy?.options || []).map((option) => {
    const locked = option.state === "locked";
    const audioUnavailable = audioInputMode && !option.audioEligible;
    const note = option.note ? lang(option.note) : "";
    return {
      value: option.key,
      title: option.displayName,
      providerLabel: option.provider,
      defaultModel: option.defaultModel,
      recommended: option.recommendedModel,
      adminOnly: option.adminOnly,
      note: [note, audioUnavailable ? lang({ ko: "음성 입력 미지원", en: "Voice input unavailable" }) : ""]
        .filter(Boolean)
        .join(" · ") || undefined,
      disabled: locked || audioUnavailable,
      usageBilled: !locked,
    };
  });

  const handleChange = (key: string) => {
    const option = policy?.options.find(
      (item) => item.key === key && item.state === "available" && (!audioInputMode || item.audioEligible),
    );
    if (!option) return;
    void onSelect(option.provider, option.modelName);
  };

  const availableAudioModels = (policy?.options || [])
    .filter((option) => option.state === "available" && option.audioEligible)
    .map((option) => option.displayName)
    .join(", ");
  const selectedAudioModel = policy?.options.find((option) => option.key === policy?.selected.key);
  const audioModeNotice = audioInputMode
    ? !policy?.audioTurnAvailable
      ? lang({
          ko: "음성 대화 모드는 아직 준비되지 않았습니다. 텍스트 입력으로 계속해 주세요.",
          en: "Voice conversation is not ready yet. Please continue with text input.",
        })
      : selectedAudioModel?.audioEligible
        ? ""
        : availableAudioModels
          ? lang({
              ko: `현재 선택한 모델은 음성 입력을 지원하지 않습니다. 사용 가능한 모델: ${availableAudioModels}. 텍스트 입력으로 계속할 수도 있습니다.`,
              en: `The selected model does not support voice input. Available models: ${availableAudioModels}. You can also continue with text input.`,
            })
          : lang({
              ko: "음성 입력을 지원하는 모델이 없습니다. 텍스트 입력으로 계속해 주세요.",
              en: "No model currently supports voice input. Please continue with text input.",
            })
    : "";

  return (
    <div className="mb-1 rounded-lg border border-white/5 bg-black/30 p-2">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h4 className="flex items-center gap-1 text-xs font-medium text-white">
          <Bot className="h-3 w-3" />
          <Lang text={{ ko: "AI 대화 모델", en: "AI Chat Model" }} />
        </h4>
      </div>

      {audioModeNotice ? (
        <p role="status" aria-live="polite" className="mb-2 text-xxs leading-relaxed text-amber-200/85">
          {audioModeNotice}
        </p>
      ) : null}

      <ModelSelectField
        value={policy?.selected.key || ""}
        options={options}
        onChange={handleChange}
        title={lang({ ko: "AI 대화 모델 선택", en: "Select AI Chat Model" })}
        placeholder={
          loading
            ? lang({ ko: "모델을 불러오는 중", en: "Loading models" })
            : lang({ ko: "사용 가능한 모델 없음", en: "No model available" })
        }
        disabled={loading || saving || options.length === 0}
        triggerClassName="min-h-14 border-white/10 bg-black/30 px-3 py-2 text-white shadow-none hover:border-white/20 [&_span]:text-white"
      />

      <p className="mt-2 text-xxs leading-relaxed text-white/50">
        {policy?.service === "tutors" ? (
          <Lang
            text={{
              ko: "모델마다 비용과 응답 특성이 다를 수 있으며, 사용량에 따라 코인이 차감됩니다.",
              en: "Cost and response behavior may vary by model. Coins are charged based on usage.",
            }}
          />
        ) : (
          <Lang
            text={{
              ko: "NPC별로 모델을 선택할 수 있으며 비용과 응답 특성은 모델마다 다를 수 있습니다.",
              en: "You can choose a model per NPC. Cost and response behavior may vary by model.",
            }}
          />
        )}
      </p>
      {policy?.selected.fallbackReason === "saved_model_unavailable" ? (
        <p className="mt-1 text-xxs text-amber-300">
          <Lang
            text={{
              ko: "기존 선택 모델을 사용할 수 없어 기본 모델로 전환했습니다.",
              en: "The previous model is unavailable, so the default model is being used.",
            }}
          />
        </p>
      ) : null}
    </div>
  );
}
