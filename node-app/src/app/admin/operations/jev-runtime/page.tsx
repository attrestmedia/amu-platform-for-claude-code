import { AdminOperationPage } from "components/module/admin/operations/AdminOperationPage";
import { JevRuntimeControlsPanel } from "components/module/admin/system";

export default function JevRuntimePage() {
  return (
    <AdminOperationPage title={{ ko: "JEV 판단 런타임 제어", en: "JEV Decision Runtime Controls" }}>
      <JevRuntimeControlsPanel />
    </AdminOperationPage>
  );
}
