import "server-only";

import { promises as fs } from "fs";
import path from "path";

const PUBLIC_ROOT = path.join(process.cwd(), "public");
const PERSONA_LIBRARY_URL_ROOT = "/persona-image-library/";

/**
 * R2 전환 이전 상대 URL을 위한 읽기 호환 전용 경계다.
 * 신규 파일 생성에는 사용하지 않는다.
 */
export function resolveLegacyPublicMediaPath(url: string) {
  const clean = decodeURIComponent(String(url || "").trim());
  if (!clean.startsWith("/") || clean.includes("\0")) return "";
  const target = path.resolve(PUBLIC_ROOT, clean.replace(/^\/+/, ""));
  return target.startsWith(`${PUBLIC_ROOT}${path.sep}`) ? target : "";
}

export async function readLegacyPublicMedia(url: string) {
  const filePath = resolveLegacyPublicMediaPath(url);
  // public은 배포 스크립트가 별도 동기화하므로 동적 legacy 경로를 NFT 입력으로 확장하지 않는다.
  return filePath ? await fs.readFile(/* turbopackIgnore: true */ filePath) : null;
}

/** 사용자 삭제 요청에서만 호출하며 persona-image-library 범위 밖은 삭제하지 않는다. */
export async function deleteLegacyPersonaImage(url: string) {
  const clean = decodeURIComponent(String(url || "").trim());
  if (!clean.startsWith(PERSONA_LIBRARY_URL_ROOT)) return false;
  const filePath = resolveLegacyPublicMediaPath(clean);
  if (!filePath) return false;
  try {
    await fs.unlink(/* turbopackIgnore: true */ filePath);
    return true;
  } catch {
    return false;
  }
}
