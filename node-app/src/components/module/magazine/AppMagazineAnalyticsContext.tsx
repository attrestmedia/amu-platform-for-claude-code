"use client";

import { useEffect } from "react";
import { setAppMagazineEventContext, type AppMagazineEventContext } from "utils/analytics/ga4";

/**
 * @docHint
 * @purpose /magazine/{slug} 표면에서 발화하는 모든 GA4 이벤트에 표면 구분자·콘텐츠 namespace를 싣는다
 * @process 렌더 시점에 모듈 컨텍스트를 등록해 자식(관계 바·E3 슬롯·직접 임포트된 편집기)의
 *          첫 이벤트보다 먼저 준비되게 하고, 언마운트 시 해제해 다른 표면으로 새지 않게 한다.
 * @domain magazine-content-experience
 * @scope article-surface
 */

type Props = AppMagazineEventContext;

export default function AppMagazineAnalyticsContext(props: Props) {
  // 자식 effect가 부모 effect보다 먼저 실행되므로 등록은 렌더 단계에서 한다(모듈 변수 대입, 멱등).
  if (typeof window !== "undefined") setAppMagazineEventContext(props);

  useEffect(() => {
    setAppMagazineEventContext(props);
    return () => setAppMagazineEventContext(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.contentId, props.contentSlug, props.experienceLevel, props.primaryService, props.sourcePostId, props.sourceRelationship]);

  return null;
}
