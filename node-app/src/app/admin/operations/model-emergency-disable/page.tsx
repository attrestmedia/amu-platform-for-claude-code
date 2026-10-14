import { AdminOperationPage } from "components/module/admin/operations/AdminOperationPage";
import { ModelEmergencyDisablePanel } from "components/module/admin/system";

export default function ModelEmergencyDisablePage() {
  return (
    <AdminOperationPage title={{ ko: "모델 비상 차단", en: "Model Emergency Disable" }}>
      <ModelEmergencyDisablePanel />
    </AdminOperationPage>
  );
}
