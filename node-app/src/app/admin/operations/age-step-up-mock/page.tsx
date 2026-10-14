import { AdminOperationPage } from "components/module/admin/operations/AdminOperationPage";
import { AgeStepUpMockPanel, AgeStepUpTossPanel } from "components/module/admin/system";

/**
 * @docHint
 * @purpose 관리자 모의 step-up 작업 페이지
 * @process 관리자 operation shell에 synthetic 흐름 패널 배치
 * @domain identity-mock
 * @scope admin-page
 */
export default function AgeStepUpMockPage() {
  return (
    <AdminOperationPage title={{ ko: "성인 확인 모의 흐름", en: "Age Step-up Mock" }}>
      <AgeStepUpMockPanel />
      <AgeStepUpTossPanel />
    </AdminOperationPage>
  );
}
