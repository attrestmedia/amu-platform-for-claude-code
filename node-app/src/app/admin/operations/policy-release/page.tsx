import { AdminOperationPage } from "components/module/admin/operations/AdminOperationPage";
import { PolicyReleaseOpsPanel } from "components/module/admin/legal";

export default function PolicyReleasePage() {
  return (
    <AdminOperationPage
      title={{ ko: "정책 릴리스 검증", en: "Policy Release Verification" }}
      description={{
        ko: "정책 공고·시행 검증과 보류 상태를 확인합니다.",
        en: "Review policy notice and activation checks and hold status.",
      }}
    >
      <PolicyReleaseOpsPanel />
    </AdminOperationPage>
  );
}
