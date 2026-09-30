import "server-only";

import { promises as fs } from "fs";
import path from "path";
import { IMAGE_STUDIO_DATA_ROOT } from "consts/app";

const GEN_STUDIO_PUBLIC_ROOT = path.resolve(process.cwd(), "public", "apps", "gen-studio");

/** R2 전환 전 Gen Studio 상대 URL을 위한 읽기/삭제 전용 경계다. 신규 쓰기는 금지한다. */
export function resolveLegacyGenStudioImagePath(url: string) {
  const clean = String(url || "").trim();
  if (!clean.startsWith(`${IMAGE_STUDIO_DATA_ROOT}/`) || clean.includes("\0")) return "";
  const relative = clean.slice(IMAGE_STUDIO_DATA_ROOT.length).replace(/^\/+/, "");
  const target = path.resolve(GEN_STUDIO_PUBLIC_ROOT, relative);
  return target.startsWith(`${GEN_STUDIO_PUBLIC_ROOT}${path.sep}`) ? target : "";
}

export async function readLegacyGenStudioImage(url: string) {
  const filePath = resolveLegacyGenStudioImagePath(url);
  // public은 배포 스크립트가 별도 동기화하므로 동적 legacy 경로를 NFT 입력으로 확장하지 않는다.
  return filePath ? await fs.readFile(/* turbopackIgnore: true */ filePath) : null;
}

export async function deleteLegacyGenStudioImage(url: string) {
  const filePath = resolveLegacyGenStudioImagePath(url);
  if (!filePath) return false;
  try {
    await fs.unlink(/* turbopackIgnore: true */ filePath);
    return true;
  } catch {
    return false;
  }
}
