import { AdminOperationPage } from "components/module/admin/operations/AdminOperationPage";
import { TtsPreviewModerationPanel } from "components/module/admin/system";

export default function TtsReviewPage() {
  return (
    <AdminOperationPage title={{ ko: "TTS 미리듣기 공개 검수", en: "TTS Preview Moderation" }}>
      <TtsPreviewModerationPanel />
    </AdminOperationPage>
  );
}
