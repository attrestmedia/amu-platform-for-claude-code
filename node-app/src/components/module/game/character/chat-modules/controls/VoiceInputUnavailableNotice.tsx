"use client";

import { Lang } from "components/module/i18n";

type VoiceInputUnavailableNoticeProps = {
  supportedLanguages: readonly string[];
};

export function VoiceInputUnavailableNotice({ supportedLanguages }: VoiceInputUnavailableNoticeProps) {
  const supported = supportedLanguages.length > 0 ? supportedLanguages.join(", ") : "—";

  return (
    <p
      role="status"
      aria-live="polite"
      className="rounded-lg border border-amber-200/20 bg-amber-200/5 px-3 py-2 text-xs leading-relaxed text-amber-100/90"
    >
      <Lang
        text={{
          ko: `지금 선택한 학습 언어는 음성 입력을 지원하지 않습니다. 지원 언어: ${supported}. 텍스트로 계속 대화할 수 있습니다.`,
          en: `Voice input isn't available for the selected learning language. Supported: ${supported}. You can keep chatting in text.`,
        }}
      />
    </p>
  );
}
