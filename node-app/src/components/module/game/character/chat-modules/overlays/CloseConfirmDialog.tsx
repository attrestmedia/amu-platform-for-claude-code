"use client";

import { Button, Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@amu-labs/ui";
import { Lang } from "../../../../i18n";
import { AlertTriangle } from "lucide-react";

interface CloseConfirmDialogProps {
  open: boolean; // 다이얼로그 표시 여부
  onOpenChange: (open: boolean) => void; // 외부 제어를 위해 onOpenChange 전달
  onConfirm: () => void; // '종료하기' 클릭 시 호출
  onCancel: () => void; // '취소' 클릭 시 호출
}

/**
 * 닫기 확인 다이얼로그
 */
const CloseConfirmDialog = ({ open, onOpenChange, onConfirm, onCancel }: CloseConfirmDialogProps) => {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent hideClose className="min-w-[20rem]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle size={20} className="text-yellow-500" />
            <Lang text={{ ko: "대화 종료 확인", en: "Confirm end of conversation" }} />
          </DialogTitle>
          <DialogDescription className="text-left text-base">
            <Lang text={{ ko: "대화를 종료하시겠습니까?", en: "Are you sure you want to end the conversation?" }} />
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="flex gap-2 justify-end">
          <Button variant="neutral" onClick={onCancel}>
            <Lang text={{ ko: "취소", en: "Cancel" }} />
          </Button>
          <Button variant="destructive" onClick={onConfirm} className="bg-red-500 hover:bg-red-600">
            <Lang text={{ ko: "종료하기", en: "To exit" }} />
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default CloseConfirmDialog;
