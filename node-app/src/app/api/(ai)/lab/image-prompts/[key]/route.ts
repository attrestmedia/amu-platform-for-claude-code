import { NextRequest, NextResponse } from "next/server";
import { getImagePromptByKey } from "libs/database/lab";

/**
 * @docHint
 * @purpose 이미지 프롬프트 템플릿 단건 조회
 * @process key 기반 조회  결과 반환
 * @domain lab
 * @scope global
 */

export const runtime = "nodejs";

export async function GET(_req: NextRequest, { params }: { params: { key: string } | Promise<{ key: string }> }) {
  const { key } = await Promise.resolve(params);
  const decodedKey = decodeURIComponent(key); // path 에서 넘어오는 key 디코딩

  const doc = await getImagePromptByKey(decodedKey);
  if (!doc) {
    return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  }

  return NextResponse.json({ ok: true, data: doc });
}
