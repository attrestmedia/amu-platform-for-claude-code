import type { Metadata } from "next";
import SchoolLunchFoodMapMiniApp from "./SchoolLunchFoodMapMiniApp";

export const metadata: Metadata = {
  title: "오늘 급식 푸드맵 | 식판 이미지로 보고 음식 설명까지 확인",
  description:
    "학교를 검색하면 오늘 급식을 식판형 푸드맵으로 보여주고, 음식마다 어디에 좋고 왜 먹으면 좋은지 쉽게 알려주는 미니앱.",
  keywords: ["오늘 급식", "학교 급식", "급식 식판", "급식 음식 설명", "학교 급식 앱"],
  openGraph: {
    title: "오늘 급식 푸드맵",
    description: "학교 급식을 식판 이미지와 클릭형 음식 설명으로 확인하세요.",
    type: "website",
  },
};

export default function SchoolLunchFoodMapPage() {
  return <SchoolLunchFoodMapMiniApp />;
}
