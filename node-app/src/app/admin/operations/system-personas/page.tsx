import { AdminOperationPage } from "components/module/admin/operations/AdminOperationPage";
import { SystemPersonaManager } from "components/module/admin/persona";

export default function SystemPersonasPage() {
  return (
    <AdminOperationPage title={{ ko: "공통 시스템 페르소나 관리", en: "Common System-Persona Management" }}>
      <SystemPersonaManager />
    </AdminOperationPage>
  );
}
