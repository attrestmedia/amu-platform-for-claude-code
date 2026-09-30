"use client";

import { Bot, Sparkles } from "lucide-react";
import { Button, Preloader } from "@amu-labs/ui";
import { Lang, lang } from "components/module/i18n";
import { ModelSelectField, type ModelSelectOption } from "components/module/model-select";
import { useAmuChatModelPreference } from "hooks/chat";

/**
 * @docHint
 * @purpose 일반 AMU 대화의 추천/사용자 선호 모델 설정 UI
 * @process 현재 정책 조회  적용 범위 안내  추천 reset 또는 사용자 모델 저장
 * @domain ai-chat
 * @scope client-ui
 */

export default function AmuChatPreferencePanel() {
  const { policy, loading, saving, error, message, reload, selectModel, selectRecommended } =
    useAmuChatModelPreference();

  if (loading && !policy) {
    return (
      <section className="min-h-48 rounded-2xl border border-border bg-surface p-5 sm:p-6" aria-busy="true" aria-labelledby="amu-chat-preference-title">
        <h2 id="amu-chat-preference-title" className="font-semibold">
          <Lang text={{ ko: "일반 대화 AI 모델", en: "General chat AI model" }} />
        </h2>
        <div className="mt-4 flex min-h-12 items-center justify-center"><Preloader /></div>
      </section>
    );
  }

  if (error || !policy) {
    return (
      <section className="rounded-2xl border border-destructive/40 bg-destructive/5 p-5 sm:p-6" aria-labelledby="amu-chat-preference-title">
        <h2 id="amu-chat-preference-title" className="font-semibold">
          <Lang text={{ ko: "일반 대화 AI 모델", en: "General chat AI model" }} />
        </h2>
        <p className="mt-3 text-sm text-destructive" role="alert">
          {error || lang({ ko: "설정을 불러오지 못했습니다.", en: "We could not load these settings." })}
        </p>
        <Button variant="outline" className="mt-4 min-h-11" onClick={() => void reload()} loading={loading}>
          <Lang text={{ ko: "다시 시도", en: "Try again" }} />
        </Button>
      </section>
    );
  }

  const modelOptions: ModelSelectOption[] = policy.options
    .filter((option) => option.state === "available")
    .map((option) => ({
      value: option.key,
      title: option.displayName,
      providerLabel: option.provider,
      defaultModel: option.defaultModel,
      recommended: option.key === policy.recommended.key || option.recommendedModel,
      adminOnly: option.adminOnly,
      note: option.note ? lang(option.note) : undefined,
      usageBilled: true,
    }));
  const preferredModelValue = policy.preferenceMode === "preference" ? policy.selected.key : "";
  const recommendedName = policy.recommended.displayName || policy.recommended.modelName;

  return (
    <section className="rounded-2xl border border-border bg-surface p-5 sm:p-6" aria-labelledby="amu-chat-preference-title">
      <div className="flex items-start gap-3">
        <Sparkles className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
        <div>
          <h2 id="amu-chat-preference-title" className="font-semibold">
            <Lang text={{ ko: "일반 대화 AI 모델", en: "General chat AI model" }} />
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-secondary-text">
            <Lang
              text={{
                ko: "AMU의 일반 대화에만 적용됩니다. Play·Tutor·페르소나 생성은 각 서비스의 독립 runtime 정책을 유지합니다.",
                en: "This applies only to general AMU chat. Play, Tutor, and persona generation keep their own runtime policies.",
              }}
            />
          </p>
        </div>
      </div>

      <fieldset className="mt-5 space-y-2" disabled={saving}>
        <legend className="sr-only"><Lang text={{ ko: "일반 대화 모델 적용 방식", en: "General chat model mode" }} /></legend>
        <label className="flex min-h-11 cursor-pointer items-start gap-3 rounded-xl border border-border px-3 py-3 transition-colors hover:bg-muted/50 focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/30">
          <input
            type="radio"
            name="amu-chat-preference-mode"
            value="recommended"
            checked={policy.preferenceMode === "recommended"}
            onChange={() => void selectRecommended()}
            className="mt-1 h-4 w-4 accent-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
          />
          <span className="min-w-0">
            <span className="flex items-center gap-2 font-medium"><Sparkles className="h-4 w-4 text-primary" aria-hidden="true" /><Lang text={{ ko: "AMU 추천", en: "AMU recommended" }} /></span>
            <span className="mt-1 block text-sm text-secondary-text"><Lang text={{ ko: "현재 운영 상태에 맞춰 추천 모델과 fallback을 자동 선택합니다.", en: "Automatically choose the recommended model and fallback for current runtime conditions." }} /></span>
          </span>
        </label>

        <label className="flex min-h-11 cursor-pointer items-start gap-3 rounded-xl border border-border px-3 py-3 transition-colors hover:bg-muted/50 focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/30">
          <input
            type="radio"
            name="amu-chat-preference-mode"
            value="preference"
            checked={policy.preferenceMode === "preference"}
            onChange={() => {
              const first = policy.options.find((option) => option.state === "available");
              if (first) void selectModel(first.provider, first.modelName);
            }}
            className="mt-1 h-4 w-4 accent-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
          />
          <span className="min-w-0">
            <span className="flex items-center gap-2 font-medium"><Bot className="h-4 w-4 text-primary" aria-hidden="true" /><Lang text={{ ko: "내 선호 모델 사용", en: "Use my preferred model" }} /></span>
            <span className="mt-1 block text-sm text-secondary-text"><Lang text={{ ko: "선택한 모델을 우선 사용하며, provider 장애 시 승인된 fallback으로 전환합니다.", en: "Prefer your selected model and use an approved fallback if its provider is unavailable." }} /></span>
          </span>
        </label>
      </fieldset>

      {policy.preferenceMode === "preference" ? (
        <div className="mt-4">
          <p className="mb-2 block text-sm font-medium">
            <Lang text={{ ko: "선호 모델", en: "Preferred model" }} />
          </p>
          <ModelSelectField
            value={preferredModelValue}
            options={modelOptions}
            onChange={(key) => {
              const option = policy.options.find((item) => item.key === key && item.state === "available");
              if (option) void selectModel(option.provider, option.modelName);
            }}
            title={lang({ ko: "일반 대화 선호 모델 선택", en: "Select a general chat preference" })}
            placeholder={lang({ ko: "사용 가능한 모델 없음", en: "No available model" })}
            disabled={saving || modelOptions.length === 0}
            triggerClassName="min-h-11"
          />
        </div>
      ) : null}

      <p className="mt-4 text-xs leading-relaxed text-secondary-text">
        <Lang text={{ ko: "현재 AMU 추천 모델", en: "Current AMU recommendation" }} />: <span className="font-medium text-primary-text">{recommendedName}</span>
        <span className="ml-1">({policy.recommended.provider}/{policy.recommended.modelName})</span>
      </p>
      {policy.selected.fallbackReason ? (
        <p className="mt-2 text-sm text-amber-700 dark:text-amber-300" role="status">
          {policy.selected.fallbackReason === "saved_model_unavailable" ? (
            <Lang text={{ ko: "저장한 모델을 사용할 수 없어 AMU 추천으로 전환했습니다.", en: "The saved model is unavailable, so AMU recommendations are being used." }} />
          ) : (
            <Lang text={{ ko: "기본 추천 provider를 사용할 수 없어 승인된 fallback으로 전환했습니다.", en: "The primary recommended provider is unavailable, so an approved fallback is being used." }} />
          )}
        </p>
      ) : null}
      <p className="mt-3 min-h-5 text-sm text-primary" role="status" aria-live="polite">{saving ? lang({ ko: "저장 중…", en: "Saving…" }) : message}</p>
      {error ? <p className="mt-1 text-sm text-destructive" role="alert">{error}</p> : null}
    </section>
  );
}
