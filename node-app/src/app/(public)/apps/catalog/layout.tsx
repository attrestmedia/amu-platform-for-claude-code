import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "All My Universe Catalog",
  description: "나만의 멋진 제품 카탈로그와 온라인 매거진을 쉽게 만드세요",
  keywords: ["catalog", "online magazine", "products"],
};

export default function EditorLayout({ children }: { children: React.ReactNode }) {
  return (
    <div id="catalogBody" style={{ background: "#21272C", color: "#fff", overflow: "hidden" }}>
      {children}
    </div>
  );
}
