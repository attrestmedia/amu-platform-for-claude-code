"use client";

import { useCallback, useEffect, useState } from "react";
import {
  getChatModelPolicy,
  setAmuChatModelPreference,
} from "libs/api/ai";
import type { IChatModelPolicyResult, TextProviderType } from "types/ai";
import { lang } from "components/module/i18n";
import { logger } from "utils/log";

/**
 * @docHint
 * @purpose 계정 화면의 일반 AMU 대화 모델 선호 상태 관리
 * @process 추천/사용자 선호 정책 조회  선택 저장/reset  저장·조회 상태 노출
 * @domain ai-chat
 * @scope client-hook
 */

export function useAmuChatModelPreference() {
  const [policy, setPolicy] = useState<IChatModelPolicyResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const reload = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const next = await getChatModelPolicy({ service: "amu" });
      setPolicy(next);
      if (!next) throw new Error("AMU_CHAT_POLICY_EMPTY");
      return next;
    } catch (loadError) {
      logger.error("[useAmuChatModelPreference] load failed", loadError);
      setPolicy(null);
      setError(lang({ ko: "일반 대화 모델 설정을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.", en: "We could not load general chat model settings. Please try again shortly." }));
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // 다음 microtask에서 시작해 effect 본문이 동기적으로 state를 갱신하지 않도록 한다.
    void Promise.resolve().then(() => reload());
  }, [reload]);

  const selectModel = useCallback(async (provider: TextProviderType, modelName: string) => {
    if (saving) return;
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const next = await setAmuChatModelPreference({ mode: "preference", provider, modelName });
      if (!next) throw new Error("AMU_CHAT_PREFERENCE_EMPTY");
      setPolicy(next);
      setMessage(lang({ ko: "일반 대화의 선호 모델을 저장했습니다.", en: "Your general chat preference was saved." }));
    } catch (saveError) {
      logger.error("[useAmuChatModelPreference] preference save failed", saveError);
      setError(lang({ ko: "선호 모델을 저장하지 못했습니다. 잠시 후 다시 시도해 주세요.", en: "We could not save your preferred model. Please try again shortly." }));
    } finally {
      setSaving(false);
    }
  }, [saving]);

  const selectRecommended = useCallback(async () => {
    if (saving) return;
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const next = await setAmuChatModelPreference({ mode: "recommended" });
      if (!next) throw new Error("AMU_CHAT_RECOMMENDED_EMPTY");
      setPolicy(next);
      setMessage(lang({ ko: "AMU 추천 모델을 사용하도록 설정했습니다.", en: "AMU recommendations are now used for general chat." }));
    } catch (saveError) {
      logger.error("[useAmuChatModelPreference] recommendation reset failed", saveError);
      setError(lang({ ko: "AMU 추천 설정을 저장하지 못했습니다. 잠시 후 다시 시도해 주세요.", en: "We could not save the AMU recommendation setting. Please try again shortly." }));
    } finally {
      setSaving(false);
    }
  }, [saving]);

  return { policy, loading, saving, error, message, reload, selectModel, selectRecommended };
}
