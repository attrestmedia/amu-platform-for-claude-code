"use client";

import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@amu-labs/ui";
import { Lang } from "components/module/i18n";
import { AiCostMonitorSection } from "./system-control/AiCostMonitorSection";
import { ChangeHistorySection } from "./system-control/ChangeHistorySection";
import { ModelStatusSection } from "./system-control/ModelStatusSection";
import { PricingPreviewSection } from "./system-control/PricingPreviewSection";

export function SystemControlBox() {
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-4">
      <Tabs defaultValue="monitor" className="w-full">
        <TabsList className="w-full" scrollable>
          <TabsTrigger value="monitor">
            <Lang text={{ ko: "모니터", en: "Monitor" }} />
          </TabsTrigger>
          <TabsTrigger value="models">
            <Lang text={{ ko: "모델 상태", en: "Model status" }} />
          </TabsTrigger>
          <TabsTrigger value="pricing">
            <Lang text={{ ko: "가격 미리보기", en: "Pricing preview" }} />
          </TabsTrigger>
          <TabsTrigger value="history">
            <Lang text={{ ko: "변경 이력", en: "Change history" }} />
          </TabsTrigger>
        </TabsList>
        <TabsContent value="monitor" className="mt-4">
          <AiCostMonitorSection />
        </TabsContent>
        <TabsContent value="models" className="mt-4">
          <ModelStatusSection />
        </TabsContent>
        <TabsContent value="pricing" className="mt-4">
          <PricingPreviewSection />
        </TabsContent>
        <TabsContent value="history" className="mt-4">
          <ChangeHistorySection />
        </TabsContent>
      </Tabs>
      <div className="text-xs text-muted-foreground">
        <Lang
          text={{
            ko: "모델·가격 정책 변경은 승인된 배포로 반영됩니다. 이 화면은 현재 설정, 변경 이력, 서버 가격 견적과 비용 집계를 읽기 전용으로 보여 줍니다.",
            en: "Model and pricing policy changes are applied through approved deployments. This page provides read-only model status, change history, server pricing previews, and cost reports.",
          }}
        />
      </div>
    </div>
  );
}
