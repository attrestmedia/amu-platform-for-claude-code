"use client";

import { AlertTriangle } from "lucide-react";
import { Badge } from "@amu-labs/ui";
import { Lang } from "components/module/i18n";
import {
  SMARTSTORE_IMAGE_VARIANT_REFERENCE_ERROR_TEXT,
  type SmartstoreImagePreflightType,
} from "./smartstoreImageVariants";

/**
 * 참조 계약 판정 + 실제 첨부 현황 (SSM-203).
 *
 * 서버 판정("몇 장이 조건을 만족하는가")과 실제 첨부("몇 장이 에디터에 붙었는가")를 **함께** 보여준다.
 * 둘이 어긋난 채 생성이 열리면 사용자는 통과 배지를 보고 코인을 쓰지만 참조 없는 결과를 받는다.
 */

export type SmartstoreVariantReferenceStatusProps = {
  loading: boolean;
  preflight: SmartstoreImagePreflightType | null;
  /** 실제로 base64까지 준비된 상품 사진 장수. */
  attachedProductCount: number;
  /** 실제로 준비된 모델·포즈 참조 장수. */
  attachedModelCount: number;
  attachLoading: boolean;
  attachFailedCount: number;
  /** 참조 판정과 첨부가 모두 충족돼 생성 화면을 열 수 있는가. */
  generationReady: boolean;
  /** 같은 조건 재요청의 재사용 보장이 걸린 단계인가. 멱등 seed가 없는 단계에서는 고지하지 않는다. */
  reuseGuaranteed: boolean;
};

export function SmartstoreVariantReferenceStatus({
  loading,
  preflight,
  attachedProductCount,
  attachedModelCount,
  attachLoading,
  attachFailedCount,
  generationReady,
  reuseGuaranteed,
}: SmartstoreVariantReferenceStatusProps) {
  if (loading) {
    return (
      <div className="rounded-2xl border border-border p-3 text-xs leading-5 text-secondary-text">
        <Lang text={{ ko: "참고 이미지를 확인하는 중입니다.", en: "Checking references." }} />
      </div>
    );
  }

  if (!preflight) {
    return (
      <div className="rounded-2xl border border-destructive/40 bg-destructive/5 p-3 text-xs leading-5 text-secondary-text">
        <Lang text={{ ko: "사전 검사 결과를 불러오지 못했습니다.", en: "Could not load the preflight result." }} />
      </div>
    );
  }

  const referenceValid = Boolean(preflight.reference.valid);

  return (
    <div
      className={`rounded-2xl border p-3 text-xs leading-5 ${
        generationReady ? "border-primary/25 bg-primary/5" : "border-destructive/40 bg-destructive/5"
      }`}
    >
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={generationReady ? "primary" : "destructive"}>
          {generationReady ? (
            <Lang text={{ ko: "생성 가능", en: "Ready" }} />
          ) : (
            <Lang text={{ ko: "참고 이미지 부족", en: "References missing" }} />
          )}
        </Badge>
        <span className="text-secondary-text">
          <Lang
            text={{
              ko: `상품 사진 ${preflight.reference.productPhotoCount}장 · 모델 참조 ${preflight.reference.modelReferenceCount}장${
                preflight.reference.poseProxyCount > 0 ? ` · 포즈 참조 ${preflight.reference.poseProxyCount}장` : ""
              } · 권장 비율 ${preflight.spec.aspectRatio}`,
              en: `${preflight.reference.productPhotoCount} product · ${preflight.reference.modelReferenceCount} model${
                preflight.reference.poseProxyCount > 0 ? ` · ${preflight.reference.poseProxyCount} pose` : ""
              } · ${preflight.spec.aspectRatio}`,
            }}
          />
        </span>
      </div>

      {!referenceValid ? (
        <ul className="mt-2 space-y-1">
          {preflight.reference.errors.map((code) => (
            <li key={code} className="flex items-start gap-1.5 text-destructive">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <Lang text={SMARTSTORE_IMAGE_VARIANT_REFERENCE_ERROR_TEXT[code] || { ko: code, en: code }} />
            </li>
          ))}
        </ul>
      ) : null}

      {/* 판정은 통과했는데 첨부가 못 따라간 경우. 코인을 쓰기 전에 반드시 보여야 하는 상태다. */}
      {referenceValid ? (
        <p className="mt-1 text-secondary-text">
          {attachLoading ? (
            <Lang text={{ ko: "참고 이미지를 생성 화면에 붙이는 중입니다.", en: "Attaching references to the editor." }} />
          ) : (
            <Lang
              text={{
                ko: `생성에 실제로 붙는 이미지: 상품 ${attachedProductCount}장 · 모델/포즈 ${attachedModelCount}장`,
                en: `Attached to the generation: ${attachedProductCount} product · ${attachedModelCount} model/pose`,
              }}
            />
          )}
        </p>
      ) : null}

      {attachFailedCount > 0 ? (
        <p className="mt-1 flex items-start gap-1.5 text-destructive">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <Lang
            text={{
              ko: `참고 이미지 ${attachFailedCount}장을 불러오지 못해 첨부되지 않았습니다.`,
              en: `${attachFailedCount} reference image(s) could not be loaded and were not attached.`,
            }}
          />
        </p>
      ) : null}

      {preflight.reference.droppedCount > 0 ? (
        <p className="mt-1 text-secondary-text">
          <Lang
            text={{
              ko: `상한을 넘은 참고 이미지 ${preflight.reference.droppedCount}장은 이번 생성에서 제외됩니다.`,
              en: `${preflight.reference.droppedCount} reference(s) over the limit are excluded.`,
            }}
          />
        </p>
      ) : null}

      {preflight.blockedKits.length > 0 ? (
        <p className="mt-1 text-secondary-text">
          <Lang
            text={{
              ko: `품질 검사를 통과하지 못한 모델 ${preflight.blockedKits.map((kit) => kit.name).join(", ")}은 참조에서 제외됩니다.`,
              en: `Models that failed the readiness check are excluded: ${preflight.blockedKits
                .map((kit) => kit.name)
                .join(", ")}.`,
            }}
          />
        </p>
      ) : null}

      <p className="mt-2 font-semibold text-primary-text">
        <Lang
          text={{
            ko: "생성은 코인을 사용합니다. 템플릿을 고르면 실행 전에 차감량이 표시됩니다.",
            en: "Generation costs coins. The exact amount is shown before you run it.",
          }}
        />
      </p>
      {reuseGuaranteed ? (
        <p className="mt-1 text-secondary-text">
          <Lang
            text={{
              ko: "같은 조건·같은 설정으로 다시 요청하면 하루 안에 만든 결과를 다시 쓰고 코인을 다시 쓰지 않습니다. 실패한 생성은 다시 만들 수 있습니다.",
              en: "Re-requesting the same setup reuses a result made within the last day instead of spending coins again. Failed generations can be retried.",
            }}
          />
        </p>
      ) : null}
    </div>
  );
}
