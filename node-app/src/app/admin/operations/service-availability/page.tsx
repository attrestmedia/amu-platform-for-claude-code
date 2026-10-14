import { AdminOperationPage } from "components/module/admin/operations/AdminOperationPage";
import { ServiceAvailabilityPanel } from "components/module/admin/system";

export default function ServiceAvailabilityPage() {
  return (
    <AdminOperationPage title={{ ko: "서비스 공개 관리", en: "Service Availability" }}>
      <ServiceAvailabilityPanel />
    </AdminOperationPage>
  );
}
