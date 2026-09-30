import type { Metadata } from "next";
import { AudioStudioEditor } from "components/template/gen-studio/AudioStudioEditor";

export const metadata: Metadata = {
  title: "음성 템플릿 생성 | Gen Studio",
  description: "Gen Studio에서 승인된 Voice로 음성 내레이션을 생성하세요.",
  robots: { index: false, follow: false },
};

export default function GenStudioAudioTemplateListPage() {
  return <AudioStudioEditor />;
}
