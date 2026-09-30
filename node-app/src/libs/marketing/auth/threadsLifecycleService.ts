import "server-only";

import { deleteMarketingChannelProviderData } from "libs/database/marketing";
import {
  deleteOAuthConnectionsByProviderUserId,
  disconnectOAuthConnectionsByProviderUserId,
  listOAuthConnectionOwnerIdsByProviderUserId,
} from "libs/database/secure/oauthConnections";
import { createCompletedMetaDataDeletionReceipt } from "libs/database/secure/metaDataDeletionReceipts";

/**
 * @docHint
 * @purpose Threads 앱 제거·데이터 삭제 lifecycle 요청 처리
 * @process 검증된 provider user id 기준 토큰 폐기 또는 OAuth/성과/발행 데이터 삭제 후 확인증 생성
 * @domain marketing-auth
 * @scope server
 */

export async function handleThreadsDeauthorization(providerUserId: string) {
  return await disconnectOAuthConnectionsByProviderUserId({
    provider: "threads",
    providerUserId,
    actor: "meta:threads:deauthorize",
  });
}

export async function handleThreadsDataDeletion(providerUserId: string) {
  const universeIds = await listOAuthConnectionOwnerIdsByProviderUserId({
    provider: "threads",
    providerUserId,
  });
  const providerData = await deleteMarketingChannelProviderData({ universeIds, channel: "threads" });
  const oauthConnections = await deleteOAuthConnectionsByProviderUserId({
    provider: "threads",
    providerUserId,
  });
  const receipt = await createCompletedMetaDataDeletionReceipt();

  return { receipt, providerData, oauthConnections };
}
