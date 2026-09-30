"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { getChatModelPolicy, setChatModelPreference } from "libs/api/ai";
import type {
  ChatModelServiceType,
  IChatModelPolicyResult,
  TextProviderType,
} from "types/ai";
import { lang } from "components/module/i18n";
import { logger } from "utils/log";

type ChatModelSelectionState = {
  contextKey: string;
  policy: IChatModelPolicyResult | null;
};

export function useChatModelSelection(args: {
  enabled: boolean;
  service: ChatModelServiceType;
  universeId?: string;
  personaId?: string;
}) {
  const universeId = String(args.universeId || "").trim();
  const personaId = String(args.personaId || "").trim();
  const contextKey = `${args.service}:${universeId}:${personaId}`;
  const [state, setState] = useState<ChatModelSelectionState>({ contextKey: "", policy: null });
  const [saving, setSaving] = useState(false);

  const reload = useCallback(async () => {
    if (!args.enabled || !universeId || !personaId) return null;
    const policy = await getChatModelPolicy({ service: args.service, universeId, personaId });
    setState({ contextKey, policy });
    return policy;
  }, [args.enabled, args.service, contextKey, personaId, universeId]);

  useEffect(() => {
    if (!args.enabled || !universeId || !personaId) return;
    let alive = true;
    getChatModelPolicy({ service: args.service, universeId, personaId })
      .then((policy) => {
        if (alive) setState({ contextKey, policy });
      })
      .catch((error) => {
        logger.error("[useChatModelSelection] load failed", error);
        if (alive) setState({ contextKey, policy: null });
      });
    return () => {
      alive = false;
    };
  }, [args.enabled, args.service, contextKey, personaId, universeId]);

  const selectModel = useCallback(
    async (provider: TextProviderType, modelName: string) => {
      if (!args.enabled || !universeId || !personaId || saving) return;
      setSaving(true);
      try {
        const policy = await setChatModelPreference({
          service: args.service,
          universeId,
          personaId,
          provider,
          modelName,
        });
        if (policy) setState({ contextKey, policy });
        toast.success(lang({ ko: "AI 모델을 변경했습니다.", en: "AI model updated." }));
      } catch (error) {
        logger.error("[useChatModelSelection] save failed", error);
        toast.error(lang({ ko: "AI 모델 변경에 실패했습니다.", en: "Failed to update the AI model." }));
      } finally {
        setSaving(false);
      }
    },
    [args.enabled, args.service, contextKey, personaId, saving, universeId],
  );

  const policy = state.contextKey === contextKey ? state.policy : null;
  return useMemo(
    () => ({
      policy,
      loading: Boolean(args.enabled && universeId && personaId && !policy),
      saving,
      reload,
      selectModel,
    }),
    [args.enabled, personaId, policy, reload, saving, selectModel, universeId],
  );
}
