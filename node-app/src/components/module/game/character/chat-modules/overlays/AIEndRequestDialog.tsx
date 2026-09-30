"use client";

import { Button } from "@amu-labs/ui";
import { Lang } from "components/module/i18n";
import { AlertTriangle } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { cn } from "utils/common";

interface AIEndRequestDialogProps {
  open: boolean; // 다이얼로그 표시 여부
  message: string; // AI가 보낸 마지막 경고/종료 메시지
  canContinue?: boolean; // '계속하기' 버튼 노출 여부 (ex: warningCount < 3)
  onEnd: () => void; // '종료하기' 클릭 시 호출
  onContinue?: () => void; // '계속하기' 클릭 시 호출
  className?: string; // 외부에서 클래스 제어가 필요할 때
}

/**
 * AI 종료 요청 다이얼로그
 */
const AIEndRequestDialog = ({
  open,
  message,
  canContinue = false,
  onEnd,
  onContinue,
  className,
}: AIEndRequestDialogProps) => {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0, y: 20, scale: 0.9 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -20, scale: 0.9 }}
          className={cn(
            "fixed inset-0 z-[80] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4",
            className,
          )}
        >
          <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-6 w-full max-w-sm mx-auto border border-white/20 text-center">
            <div className="flex flex-col items-center gap-4">
              {/* 아이콘 */}
              <div
                className={cn(
                  "w-12 h-12 rounded-full flex items-center justify-center",
                  canContinue ? "bg-yellow-500/20" : "bg-red-500/20",
                )}
              >
                <AlertTriangle size={24} className={cn(canContinue ? "text-yellow-400" : "text-red-400")} />
              </div>

              {/* 제목 */}
              <div className="flex flex-col  mb-2 text-white">
                <h3 className="font-semibold text-lg">
                  {!canContinue ? (
                    <Lang text={{ ko: "대화 종료", en: "End Conversation" }} />
                  ) : (
                    <Lang text={{ ko: "대화 종료 경고", en: "End Conversation Warning" }} />
                  )}
                </h3>
                {!canContinue && (
                  <span className="text-red-500 text-sm">
                    <Lang
                      text={{ ko: "부적절한 대화가 감지되어 종료합니다", en: "Inappropriate conversation detected" }}
                    />
                  </span>
                )}
              </div>

              {/* AI 메시지 */}
              <div className="bg-black/20 rounded-lg p-3 max-w-full text-left w-full">
                <p className="text-sm text-white/90 leading-relaxed break-words">{message}</p>
              </div>

              {/* 버튼 그룹 */}
              <div className="flex gap-3 w-full">
                <Button
                  variant="destructive"
                  onClick={onEnd}
                  className="flex-1 bg-red-500/80 hover:bg-red-500 text-white"
                >
                  <Lang text={{ ko: "종료하기", en: "End Chat" }} />
                </Button>

                {canContinue && onContinue && (
                  <Button
                    variant="neutral"
                    onClick={onContinue}
                    className="flex-1 bg-white/10 hover:bg-white/20 text-white border-white/20"
                  >
                    <Lang text={{ ko: "계속하기", en: "Continue" }} />
                  </Button>
                )}
              </div>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default AIEndRequestDialog;
