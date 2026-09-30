import type { Metadata } from "next";
import { GenStudioCustomRoute } from "components/template/gen-studio/GenStudioCustomRoute";

export const metadata: Metadata = {
  title: "커스텀 이미지 생성 | Gen Studio",
  description: "Gen Studio에서 원하는 프롬프트로 이미지 생성을 시작하세요.",
  robots: { index: false, follow: false },
};

export default function GenStudioCustomImagePage() {
  return <GenStudioCustomRoute mode="image" />;
}
