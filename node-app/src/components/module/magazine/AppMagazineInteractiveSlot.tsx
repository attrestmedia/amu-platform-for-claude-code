"use client";

import { useCallback, useEffect, useRef } from "react";
import { Lang } from "components/module/i18n";
import { trackGaEvent } from "utils/analytics/ga4";
import type { MagazineEmbedAllowedProps } from "libs/server-utils/magazine/magazineEmbedContract";
import { TutorsMagazineComposer } from "components/module/magazine/TutorsMagazineComposer";
import { ImageStudioEditor } from "components/template/gen-studio/ImageStudioEditor";
import { ContentStudioEditor } from "components/template/gen-studio/ContentStudioEditor";

/**
 * @docHint
 * @purpose App Magazine 콘텐츠의 E3 동적 모듈을 iframe 없이 직접 렌더
 * @process slot.moduleType/serviceKey에 따라 동일 앱 편집기(Tutors·Gen Studio)를 직접 임포트해 렌더.
 *          iframe 대신 React 컨텍스트(인증·테마·i18n)를 그대로 쓰고, 복귀는 로컬 스크롤로 처리한다.
 *          템플릿 변수는 hardcoded map이 아니라 slot이 허용한 allowlistedInputKeys를 그대로 전달한다(확장성).
 *          AIR-403 계측 — 노출은 article_experience_impression, 확장 진입은 모듈 안 첫 상호작용,
 *          모듈 복귀는 magazine_return(return_type=in_page_module)으로 발화한다.
 *          제품 행동(생성·질문·과금)은 직접 임포트된 편집기가 소유하며 이 컴포넌트가 다시 쏘지 않는다.
 * @domain magazine-content-experience
 * @scope article-surface
 */

type AppMagazineInteractiveSlotProps = {
  content: { title: string; primaryQuestion: string };
  slot: {
    slotId: string;
    sectionId: string;
    intent: string;
    moduleType: string;
    serviceKey?: string;
    templateKey?: string;
    contextKey?: string;
    allowedProps?: MagazineEmbedAllowedProps | Record<string, unknown>;
    staticFallback: string;
  };
  enabled: boolean;
};

// slot이 허용한 템플릿 변수 키 -> 편집기 allowedTemplateVariableKeys. hardcoded map을 쓰지 않는다.
function allowedVariableKeys(slot: AppMagazineInteractiveSlotProps["slot"]): string[] {
  if (!slot.allowedProps) return [];
  const props = slot.allowedProps as Partial<MagazineEmbedAllowedProps>;
  return Array.from(props.allowlistedInputKeys || []);
}

/** slot.serviceKey는 계약상 `gen-studio`·`tutors`다. GA4 service_name 어휘(`gen_studio`)로 정규화한다. */
function serviceName(serviceKey?: string) {
  return serviceKey === "gen-studio" ? "gen_studio" : serviceKey || "";
}

export default function AppMagazineInteractiveSlot({ content, slot, enabled }: AppMagazineInteractiveSlotProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const returnButtonRef = useRef<HTMLButtonElement>(null);
  const entryTrackedRef = useRef(false);

  const vars = allowedVariableKeys(slot);
  const isInteractive = enabled && (slot.moduleType === "tutors_embed" || vars.length > 0);
  const integrationMode = isInteractive ? "direct_import" : "static_fallback";
  const service = serviceName(slot.serviceKey);
  const entryEvent = service === "tutors" ? "tutors_entry" : service === "gen_studio" ? "gen_studio_entry" : "";

  const moduleParams = {
    section_id: slot.sectionId,
    experience_id: slot.slotId,
    archetype: slot.intent,
    module_type: slot.moduleType,
    integration_mode: integrationMode,
    template_key: slot.templateKey,
  };

  // AIR-403 — 모듈 노출. enabled/staticFallback을 integration_mode로 구분해 fail-closed 비율을 그대로 읽는다.
  useEffect(() => {
    trackGaEvent("article_experience_impression", moduleParams);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slot.slotId, integrationMode]);

  // AIR-403 — 직접 임포트라 페이지 이동이 없다. 확장 진입은 모듈 안의 첫 사용자 상호작용 시점으로 잡는다
  // (마운트 시점으로 잡으면 클릭 진입인 WordPress 표면과 분모가 어긋난다).
  useEffect(() => {
    const node = rootRef.current;
    if (!isInteractive || !entryEvent || !node) return;
    const trackEntry = () => {
      if (entryTrackedRef.current) return;
      entryTrackedRef.current = true;
      trackGaEvent(entryEvent, { ...moduleParams, entry_type: "article_inline", service_name: service });
    };
    node.addEventListener("pointerdown", trackEntry);
    node.addEventListener("focusin", trackEntry);
    return () => {
      node.removeEventListener("pointerdown", trackEntry);
      node.removeEventListener("focusin", trackEntry);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entryEvent, isInteractive, slot.slotId]);

  const returnToSection = useCallback(() => {
    // AIR-403 — 서비스→매거진 교차 복귀가 아니라 같은 페이지 안의 모듈 복귀다.
    // §14 판정의 Magazine Return 단계는 return_type=cross_service만 센다.
    trackGaEvent("magazine_return", {
      return_type: "in_page_module",
      from_service: service,
      section_id: slot.sectionId,
      experience_id: slot.slotId,
    });
    document.getElementById(slot.sectionId)?.scrollIntoView({ behavior: "smooth", block: "start" });
    (returnButtonRef.current || rootRef.current)?.focus({ preventScroll: true });
  }, [service, slot.sectionId, slot.slotId]);

  const articleContext = { title: content.title, question: content.primaryQuestion, intent: slot.intent };

  if (!isInteractive) {
    return (
      <div ref={rootRef}>
        <p className="whitespace-pre-wrap leading-7 text-secondary-text">{slot.staticFallback ?? ""}</p>
      </div>
    );
  }

  if (slot.moduleType === "tutors_embed" && slot.serviceKey === "tutors") {
    return (
      <div ref={rootRef} tabIndex={-1} data-amu-embedded-tutors="true" data-persona={slot.contextKey}>
        <TutorsMagazineComposer
          embedSessionId=""
          personaId={slot.contextKey || ""}
          articleQuestion={content.primaryQuestion}
          onQuestion={() => {}}
          onAnswer={() => {}}
          onReturn={returnToSection}
        />
      </div>
    );
  }

  if (slot.moduleType === "content_embed" && slot.serviceKey === "gen-studio" && slot.templateKey) {
    return (
      <div ref={rootRef} data-amu-embedded-content-editor="true">
        <ContentStudioEditor
          mode="user"
          surface="embedded"
          articleContext={articleContext}
          initialTemplateKey={slot.templateKey}
          allowedTemplateKeys={[slot.templateKey]}
          allowedTemplateVariableKeys={vars}
          requiredTemplateVariableKeys={[]}
          lockedTemplateVariableKeys={[]}
          initialOutputVisibility="private"
          detailPresentation="embedded"
          allowCustomPrompt={false}
          onGenerationStarted={() => {}}
          onDone={() => {}}
          onGenerationFailed={() => {}}
        />
        <button ref={returnButtonRef} type="button" data-amu-magazine-return onClick={returnToSection} className="mt-5 rounded-xl border border-border bg-surface px-4 py-3 text-sm font-semibold text-primary-text transition hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
          <Lang text={{ ko: "기사로 돌아가기", en: "Back to article" }} />
        </button>
      </div>
    );
  }

  if (slot.moduleType === "image_embed" && slot.serviceKey === "gen-studio" && slot.templateKey) {
    return (
      <div ref={rootRef} data-amu-embedded-image-editor="true" data-template-key={slot.templateKey}>
        <div className="mb-5 rounded-2xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-950 dark:text-amber-100" data-amu-coin-notice role="note" aria-label="코인 사용 안내">
          <p className="font-semibold">코인 사용 안내</p>
          <p className="mt-1 leading-6">이미지 생성 버튼을 누르면 AMU 코인이 차감됩니다. 생성 전에 예상 차감량과 현재 잔액을 확인하세요.</p>
        </div>
        <ImageStudioEditor
          mode="user"
          surface="embedded"
          initialTemplateKey={slot.templateKey}
          allowedTemplateKeys={[slot.templateKey]}
          allowedTemplateVariableKeys={vars}
          requiredTemplateVariableKeys={[]}
          lockedTemplateVariableKeys={[]}
          initialOutputVisibility="private"
          detailPresentation="embedded"
          allowCustomPrompt={false}
          onGenerationStarted={() => {}}
          onDone={() => {}}
          onGenerationFailed={() => {}}
        />
        <button ref={returnButtonRef} type="button" data-amu-magazine-return onClick={returnToSection} className="mt-5 rounded-xl border border-border bg-surface px-4 py-3 text-sm font-semibold text-primary-text transition hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
          <Lang text={{ ko: "기사로 돌아가기", en: "Back to article" }} />
        </button>
      </div>
    );
  }

  return (
    <div ref={rootRef}>
      <p className="whitespace-pre-wrap leading-7 text-secondary-text">{slot.staticFallback ?? ""}</p>
    </div>
  );
}
