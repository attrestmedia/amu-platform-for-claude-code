import fetchClient from "libs/api/fetchClient";
import { logger } from "utils/log";
import { toErrorLike, toErrorMessage, toUnknownRecord } from "utils/common/typeUtils";

/**
 * @docHint
 * @purpose 클라이언트 API 호출 래핑
 * @process 엔드포인트(/game/stage-assets/upload) 호출 구성  응답/에러 정리 반환
 * @domain game
 * @scope client
 */

export async function uploadStageImage(params: {
  universeId: string;
  stageId: string;
  stageName: string;
  file: File;
  preferredFileName?: string;
}): Promise<{
  fileName: string;
  url: string;
  storage: {
    driver: "r2";
    access: "public";
    bucket: string;
    key: string;
    mimeType: string;
    bytes: number;
    sha256: string;
  };
}> {
  const { universeId, stageId, stageName, file, preferredFileName } = params;

  const form = new FormData();
  form.append("universeId", universeId);
  form.append("stageId", stageId);
  form.append("stageName", stageName);
  form.append("file", file);
  if (preferredFileName) form.append("preferredFileName", preferredFileName);

  try {
    const res = await fetchClient.post<{
      success: boolean;
      data?: {
        fileName: string;
        url: string;
        storage: {
          driver: "r2";
          access: "public";
          bucket: string;
          key: string;
          mimeType: string;
          bytes: number;
          sha256: string;
        };
      };
      message?: string;
    }>("/game/stage-assets/upload", form, { loading: "global" });

    if (!res.data.success || !res.data.data) {
      throw new Error(res.data.message || "이미지 업로드에 실패했습니다.");
    }

    return res.data.data;
  } catch (e: unknown) {
    const err = toErrorLike(e);
    logger.error("[uploadStageImage] failed:", toUnknownRecord(err.response).data || toErrorMessage(e));
    throw e;
  }
}
