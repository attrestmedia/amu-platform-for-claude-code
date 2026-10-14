import { AdminOperationPage } from "components/module/admin/operations/AdminOperationPage";
import { SpeechRuntimeControlsPanel } from "components/module/admin/system";

export default function SpeechRuntimePage() {
  return (
    <AdminOperationPage title={{ ko: "음성 런타임 제어", en: "Speech Runtime Controls" }}>
      <SpeechRuntimeControlsPanel />
    </AdminOperationPage>
  );
}
