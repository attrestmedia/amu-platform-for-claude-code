import type { Metadata } from "next";
import { GenStudioCustomRoute } from "components/template/gen-studio/GenStudioCustomRoute";

export const metadata: Metadata = {
  title: "커스텀 음성 생성 | Gen Studio",
  description: "Gen Studio에서 원하는 텍스트로 음성 생성을 시작하세요.",
  robots: { index: false, follow: false },
};

export default function GenStudioCustomAudioPage() {
  return <GenStudioCustomRoute mode="audio" />;
}
