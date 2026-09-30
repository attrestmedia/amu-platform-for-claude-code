import type { ReactNode } from "react";
import MiniAppLayoutClient from "./MiniAppLayoutClient";

export default function AppsLayout({ children }: { children: ReactNode }) {
  return <MiniAppLayoutClient>{children}</MiniAppLayoutClient>;
}
