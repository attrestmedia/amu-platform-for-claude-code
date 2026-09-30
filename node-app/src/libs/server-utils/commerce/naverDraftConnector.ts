import "server-only";

import { getDecryptedCredential } from "libs/database/secure/credentials";
import { NaverCommerceApiClient } from "libs/api/thirdparty/naver/naverClient";

function toSafeString(value: unknown) {
  return value == null ? "" : String(value).trim();
}

export async function getNaverDraftConnector(universeId: string) {
  const credential = await getDecryptedCredential(universeId, "naver");
  if (!credential?.clientId || !credential?.clientSecret) {
    throw new Error("네이버 커머스 자격증명이 설정되어 있지 않습니다.");
  }

  return {
    credential,
    storeId: toSafeString(credential.extras?.storeId),
    client: new NaverCommerceApiClient({
      applicationId: credential.clientId,
      applicationSecret: credential.clientSecret,
      cacheScope: universeId,
    }),
  };
}
