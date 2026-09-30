"use client";

import React, { useState } from "react";
import { Button, Dialog, DialogContent, DialogTitle } from "@amu-labs/ui";
import { Lang } from "components/module/i18n";

/**
 * 커머스 유니버스 전용 환영 팝업
 */
interface CommerceWelcomeProps {
  universeName: string; // ko/en 공용 네이밍에 사용
  message?: { ko?: string; en?: string }; // 커스텀 메시지
  onClose: () => void; // 확인 클릭/닫힘 처리
}

function CommerceWelcome({ universeName, message, onClose }: CommerceWelcomeProps) {
  const [open, setOpen] = useState(true);

  // 기본 환영 문구
  const ko = message?.ko ?? `어서오세요. ${universeName} 유니버스에 오신 것을 환영합니다`;
  const en = message?.en ?? `Welcome! You are now in the ${universeName} universe`;

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) {
          setOpen(false);
          onClose();
        }
      }}
    >
      <DialogTitle className="sr-only">
        <Lang text={{ ko: `${universeName} 유니버스 환영 팝업`, en: `${universeName} universe welcome` }} />
      </DialogTitle>
      <DialogContent
        disableOutsideClick
        hideOverlay
        hideClose
        className="max-w-[20rem] w-full p-1 rounded-2xl backdrop-blur-md"
      >
        <div className="text-center space-y-4">
          <p className="text-base leading-relaxed text-black">
            <Lang text={{ ko, en }} />
          </p>
          <Button
            size="lg"
            className="w-full"
            onClick={() => {
              setOpen(false);
              onClose();
            }}
          >
            <Lang text={{ ko: "확인", en: "OK" }} />
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default CommerceWelcome;
