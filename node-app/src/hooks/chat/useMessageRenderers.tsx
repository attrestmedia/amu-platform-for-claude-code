import { useCallback } from "react";
import type { ReactNode } from "react";
import { RichTextRenderer } from "@amu-labs/ui";

/**
 * @docHint
 * @purpose useMessageRenderers 훅 클라이언트 로직 캡슐화
 * @process 상태/이펙트/구독 구성  API 호출/스토어 연동  재사용 동작 제공
 * @domain chat-ui
 * @scope client
 */

export function useMessageRenderers() {
  const inlineMdToJsx = useCallback((text: string): ReactNode => {
    return <RichTextRenderer content={text} compact />;
  }, []);

  const renderTalkContent = useCallback((raw: string): ReactNode => {
    if (!raw) return null;
    return <RichTextRenderer content={raw} compact className="break-keep" />;
  }, []);

  return { inlineMdToJsx, renderTalkContent };
}

export default useMessageRenderers;
