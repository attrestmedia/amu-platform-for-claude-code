import { AdminOperationPage } from "components/module/admin/operations/AdminOperationPage";
import { SystemControlBox } from "components/module/admin/system";

export default function SystemControlsPage() {
  return (
    <AdminOperationPage title={{ ko: "시스템 컨트롤", en: "System Controls" }}>
      <SystemControlBox />
    </AdminOperationPage>
  );
}
