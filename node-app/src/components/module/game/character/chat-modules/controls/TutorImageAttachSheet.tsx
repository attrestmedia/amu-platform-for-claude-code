"use client";

import { useRef } from "react";
import { Camera, Images } from "lucide-react";
import { BottomSheetDialog, Button } from "@amu-labs/ui";
import { Lang, lang } from "components/module/i18n";
import type { ChatImageInputType } from "types/ai";

type TutorImageAttachSheetProps = {
  open: boolean;
  disabled: boolean;
  onOpenChange: (open: boolean) => void;
  onPick: (file: File, source: ChatImageInputType["source"]) => void | Promise<void>;
};

export function TutorImageAttachSheet({
  open,
  disabled,
  onOpenChange,
  onPick,
}: TutorImageAttachSheetProps) {
  const cameraRef = useRef<HTMLInputElement>(null);
  const libraryRef = useRef<HTMLInputElement>(null);

  const openInput = (input: HTMLInputElement | null) => {
    if (!input || disabled) return;
    input.value = "";
    input.click();
  };

  const handlePick = async (
    event: React.ChangeEvent<HTMLInputElement>,
    source: ChatImageInputType["source"],
  ) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      await onPick(file, source);
      onOpenChange(false);
    } catch {
      // 상위 콜백에서 사용자용 오류 메시지를 표시하며, 실패 시 선택 시트는 유지한다.
    }
  };

  return (
    <BottomSheetDialog
      open={open}
      onClose={() => onOpenChange(false)}
      title={lang({ ko: "사진 보내기", en: "Send a photo" })}
      description={lang({
        ko: "선택한 사진은 현재 답변 생성을 위해 AI 제공자에게 전송됩니다.",
        en: "The selected photo is sent to the AI provider to generate this reply.",
      })}
      panelClassName="md:max-w-sm"
      bodyClassName="p-4"
    >
      <div className="grid grid-cols-2 gap-3">
        <Button
          variant="outline"
          className="h-24 flex-col gap-2"
          disabled={disabled}
          onClick={() => openInput(cameraRef.current)}
        >
          <Camera aria-hidden="true" />
          <Lang text={{ ko: "카메라로 촬영", en: "Take a photo" }} />
        </Button>
        <Button
          variant="outline"
          className="h-24 flex-col gap-2"
          disabled={disabled}
          onClick={() => openInput(libraryRef.current)}
        >
          <Images aria-hidden="true" />
          <Lang text={{ ko: "사진 보관함", en: "Photo library" }} />
        </Button>
      </div>
      <input
        ref={cameraRef}
        hidden
        type="file"
        accept="image/png,image/jpeg,image/webp"
        capture="environment"
        onChange={(event) => void handlePick(event, "camera")}
      />
      <input
        ref={libraryRef}
        hidden
        type="file"
        accept="image/png,image/jpeg,image/webp"
        onChange={(event) => void handlePick(event, "library")}
      />
    </BottomSheetDialog>
  );
}
