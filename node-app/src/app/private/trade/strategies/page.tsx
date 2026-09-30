"use client";

import { useState } from "react";
import Link from "next/link";
import { Badge, Button } from "@amu-labs/ui";
import StrategyEditorWizard, { type StrategyDraft } from "components/trading/StrategyEditorWizard";

/**
 * Private Trade Lab — 전략 목록 + 신규 전략 편집.
 *
 * TL-504: 8단계 wizard + 검증 상태 표시.
 * broker_test 미지원 provider는 해당 검증 항목이 비노출된다.
 */

type StrategyListItem = {
  id: string;
  name: string;
  provider: string;
  assetClass: string;
  kind: string;
  status: string;
  executionMode: string;
  version: number;
};

export default function StrategiesPage() {
  const [showEditor, setShowEditor] = useState(false);
  const [strategies] = useState<StrategyListItem[]>([]);

  function providerLabel(p: string) {
    return p === "upbit" ? "업비트" : p === "toss_securities" ? "토스증권" : p;
  }

  function assetLabel(a: string) {
    return a === "crypto" ? "가상자산" : a === "equity" ? "주식" : a;
  }

  function statusBadge(status: string) {
    const m: Record<string, { variant: "primary" | "muted" | "destructive" | "outlineMuted"; label: string }> = {
      draft: { variant: "muted", label: "초안" },
      active: { variant: "primary", label: "활성" },
      paused: { variant: "outlineMuted", label: "일시정지" },
      archived: { variant: "muted", label: "보관" },
    };
    const s = m[status] ?? { variant: "muted" as const, label: status };
    return <Badge variant={s.variant} size="sm">{s.label}</Badge>;
  }

  function handleSave(draft: StrategyDraft) {
    // TODO: POST /api/private/trading/strategies
    alert(`전략 "${draft.name}" 저장 요청 (API 미구현)`);
    setShowEditor(false);
  }

  return (
    <main className="mx-auto max-w-4xl px-4 py-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">전략 관리</h1>
          <p className="text-sm text-muted-foreground">
            신호 기반·리밸런싱 전략을 정의하고 Paper Trading으로 검증하세요.
          </p>
        </div>
        <Button onClick={() => setShowEditor(true)}>+ 새 전략</Button>
      </div>

      {showEditor && (
        <div className="mb-8 rounded-lg border border-border bg-card p-6">
          <StrategyEditorWizard
            providerCapabilities={{ orderTest: true, conditionalOrder: false, timeInForce: ["ioc", "fok"] }}
            onSave={handleSave}
            onCancel={() => setShowEditor(false)}
          />
        </div>
      )}

      {strategies.length === 0 && !showEditor && (
        <div className="rounded-lg border border-dashed border-border p-12 text-center">
          <p className="text-muted-foreground">등록된 전략이 없습니다.</p>
          <p className="mt-1 text-xs text-muted-foreground">
            &quot;새 전략&quot; 버튼을 눌러 첫 전략을 만들어보세요.
          </p>
        </div>
      )}

      {strategies.length > 0 && (
        <div className="space-y-3">
          {strategies.map((s) => (
            <Link
              key={s.id}
              href={`/private/trade/strategies/${s.id}`}
              className="flex items-center justify-between rounded-lg border border-border bg-card p-4 transition-colors hover:bg-muted/50"
            >
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-medium">{s.name}</span>
                  {statusBadge(s.status)}
                </div>
                <div className="mt-1 flex gap-2 text-xs text-muted-foreground">
                  <span>{providerLabel(s.provider)}</span>
                  <span>·</span>
                  <span>{assetLabel(s.assetClass)}</span>
                  <span>·</span>
                  <span>{s.kind === "signal" ? "신호" : "리밸런싱"}</span>
                  <span>·</span>
                  <span>v{s.version}</span>
                </div>
              </div>
              <Badge variant="muted" size="sm">{s.executionMode}</Badge>
            </Link>
          ))}
        </div>
      )}
    </main>
  );
}
