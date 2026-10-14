import type { ReactNode } from "react";
import { StoreWorkspaceFrame } from "components/module/store/workspace-shell";

export default function StoreManageLayout({ children }: { children: ReactNode }) {
  return <StoreWorkspaceFrame>{children}</StoreWorkspaceFrame>;
}
