"use client";

import { useEffect, useRef } from "react";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@amu-labs/ui";
import { Coins } from "lucide-react";
import { Lang, lang } from "components/module/i18n";
import { useUserData } from "hooks/auth";

type CostConfirmDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: { ko: string; en: string };
  description: { ko: string; en: string };
  actionLabel?: { ko: string; en: string };
  quotedCoins?: number | null;
  count?: number;
  variant?: "cost" | "safety";
  loading?: boolean;
  onConfirm: () => void | Promise<void>;
  onCancel?: () => void;
};

/** 비용 발생 작업의 공통 확인 UI. 견적을 모르면 추정값을 만들지 않고 서버 확인 상태를 표시한다. */
export function CostConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  actionLabel = { ko: "생성하기", en: "Generate" },
  quotedCoins,
  count = 1,
  variant = "cost",
  loading = false,
  onConfirm,
  onCancel,
}: CostConfirmDialogProps) {
  const cancelRef = useRef<HTMLButtonElement>(null);
  const { userData } = useUserData();
  const currentBalance =
    Number(userData?.wallet?.bonus?.coins || 0) + Number(userData?.wallet?.charged?.coins || 0);
  const hasQuote = typeof quotedCoins === "number" && Number.isFinite(quotedCoins);
  const nextBalance = hasQuote ? currentBalance - Number(quotedCoins) : null;

  useEffect(() => {
    if (open) cancelRef.current?.focus();
  }, [open]);

  const cancel = () => {
    onCancel?.();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => !nextOpen && cancel()}>
      <DialogContent
        className="w-[calc(100vw-2rem)] max-w-md"
        innerWrapClassName="p-5 sm:p-6"
        disableOutsideClick={loading}
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          cancelRef.current?.focus();
        }}
      >
        <DialogHeader className="pr-8">
          <DialogTitle><Lang text={title} /></DialogTitle>
          <DialogDescription className="leading-6"><Lang text={description} /></DialogDescription>
        </DialogHeader>

        {variant === "cost" ? (
          <dl className="grid grid-cols-2 gap-3 rounded-xl border border-border bg-background p-4 text-sm">
            <div>
              <dt className="text-xs text-secondary-text"><Lang text={{ ko: "생성 수량", en: "Quantity" }} /></dt>
              <dd className="mt-1 font-semibold tabular-nums">{count.toLocaleString()}</dd>
            </div>
            <div>
              <dt className="text-xs text-secondary-text"><Lang text={{ ko: "서버 견적", en: "Server quote" }} /></dt>
              <dd className="mt-1 flex items-center gap-1 font-semibold tabular-nums">
                <Coins className="size-4 text-[color:var(--coin)]" aria-hidden />
                {hasQuote ? `${Number(quotedCoins).toLocaleString()} 코인` : lang({ ko: "실행 직전 확인", en: "Checked before run" })}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-secondary-text"><Lang text={{ ko: "현재 잔액", en: "Current balance" }} /></dt>
              <dd className="mt-1 font-semibold tabular-nums">{currentBalance.toLocaleString()} 코인</dd>
            </div>
            <div>
              <dt className="text-xs text-secondary-text"><Lang text={{ ko: "실행 후 잔액", en: "After run" }} /></dt>
              <dd className="mt-1 font-semibold tabular-nums">
                {nextBalance === null ? lang({ ko: "서버 판정", en: "Server decides" }) : `${Math.max(0, nextBalance).toLocaleString()} 코인`}
              </dd>
            </div>
          </dl>
        ) : null}

        <p className="text-xs leading-5 text-secondary-text">
          <Lang
            text={{
              ko: variant === "cost"
                ? "서버 견적·잔액 확인이 통과된 경우에만 실행됩니다. 실패한 생성은 서버 과금 원장 기준으로 처리됩니다."
                : "신고하면 캐릭터가 즉시 비활성화됩니다. 이 작업은 되돌릴 수 없습니다.",
              en: variant === "cost"
                ? "The action runs only after the server accepts the quote and balance check. Failed generations follow the server billing ledger."
                : "Reporting immediately disables the character. This action cannot be undone.",
            }}
          />
        </p>

        <DialogFooter className="flex flex-col gap-2 sm:flex-row sm:justify-end">
          <Button ref={cancelRef} variant="outline" className="min-h-11" onClick={cancel} disabled={loading}>
            <Lang text={{ ko: "취소", en: "Cancel" }} />
          </Button>
          <Button className="min-h-11" onClick={() => void onConfirm()} loading={loading}>
            <Lang text={actionLabel} />
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
