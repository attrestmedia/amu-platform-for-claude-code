"use client";

import { ImageDropzone } from "@amu-labs/ui";
import { Lang } from "components/module/i18n";

export function MethodUpload({
  previewUrl,
  uploading,
  disabled,
  onPick,
  onClear,
}: {
  previewUrl?: string;
  uploading: boolean;
  disabled: boolean;
  onPick: (file: File) => void;
  onClear: () => void;
}) {
  return (
    <div className="space-y-4 rounded-xl border border-border bg-background p-4 sm:p-5">
      <div>
        <h3 className="text-sm font-semibold"><Lang text={{ ko: "캐릭터 이미지 업로드", en: "Upload a character image" }} /></h3>
        <p className="mt-1 text-xs leading-5 text-secondary-text"><Lang text={{ ko: "전신에 가까운 정면 이미지와 단순한 배경을 권장합니다. 업로드 원본은 비공개로 저장되고 캐릭터 생성에만 사용됩니다.", en: "A front-facing full-body image with a simple background works best. Uploads stay private and are used only for character creation." }} /></p>
      </div>
      <ImageDropzone
        size="lg"
        label={<Lang text={{ ko: "이미지 파일", en: "Image file" }} />}
        addText={<Lang text={{ ko: "이미지 선택", en: "Choose image" }} />}
        hintText={<Lang text={{ ko: "이미지를 끌어 놓거나 선택하세요.", en: "Drop or choose an image." }} />}
        accept="image/png,image/jpeg,image/webp"
        previewUrl={previewUrl || undefined}
        uploading={uploading}
        disabled={disabled}
        onPick={onPick}
        onClear={onClear}
      />
      <div className="space-y-2 text-xs leading-5 text-secondary-text">
        <p><Lang text={{ ko: "PNG, JPG, WEBP만 지원하며 서버에서 형식·크기·R2 무결성을 다시 확인합니다.", en: "PNG, JPG, and WEBP are supported. The server rechecks type, size, and R2 integrity." }} /></p>
        <p className="rounded-lg border border-primary/20 bg-primary/5 px-3 py-2"><Lang text={{ ko: "본인 또는 사용 권한이 있는 이미지만 업로드하세요. 타인의 초상·미성년자 식별 가능 이미지·권리를 침해하는 이미지는 업로드하지 마세요. 업로드 캐릭터는 검토 대기 상태이며 승인 전 공개 플레이에 사용할 수 없습니다.", en: "Upload only images you own or are authorized to use. Do not upload identifiable minors, another person's likeness, or infringing content. Uploaded characters remain pending review and cannot be used in public play until approved." }} /></p>
      </div>
    </div>
  );
}
