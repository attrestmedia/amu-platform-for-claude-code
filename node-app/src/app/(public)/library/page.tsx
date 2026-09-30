import type { Metadata } from "next";
import { UserCreationLibrary } from "components/template/library/UserCreationLibrary";

export const metadata: Metadata = {
  title: "내 라이브러리 | All My Universe",
  description: "서비스별 생성 이미지와 즐겨찾기 템플릿을 한곳에서 관리합니다.",
  robots: { index: false, follow: false },
};

export default function LibraryPage() {
  return <UserCreationLibrary />;
}
