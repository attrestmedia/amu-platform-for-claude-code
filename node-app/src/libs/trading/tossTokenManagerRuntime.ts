/**
 * @docHint
 * @purpose Private Trade Lab — Toss 토큰 관리자 실제 Redis 배선(싱글턴)
 * @domain trading
 * @scope private-trade-lab
 *
 * tradingTokenManager.ts는 Redis에 직접 붙지 않는다(테스트 교체 목적). 여기서 실제 ioredis 클라이언트를
 * TossTokenStore 어댑터로 감싸 싱글턴 tradeTokenManager를 만든다.
 *
 * trade-worker(TL-104)와 platformCredentialVerifier(TL-102 결합점)가 이 싱글턴을 공유한다.
 */

import { getRedisClient } from "libs/cache/redisClient";
import { createTossTokenManager, requestTossAccessToken } from "libs/trading/tradingTokenManager";
import type { TossTokenStore } from "libs/trading/tradingTokenManager";

const redisTokenStore: TossTokenStore = {
  async get(key) {
    const client = await getRedisClient();
    return client.get(key);
  },
  async set(key, value, opts) {
    const client = await getRedisClient();
    if (opts.px) {
      if (opts.nx) {
        return client.set(key, value, "PX", opts.px, "NX");
      }
      return client.set(key, value, "PX", opts.px);
    }
    return client.set(key, value);
  },
  async del(key) {
    const client = await getRedisClient();
    return client.del(key);
  },
};

export const tradeTokenManager = createTossTokenManager({
  store: redisTokenStore,
  // 운영에서는 trade-worker가 TRADE_WORKER_ID를 주입한다. 미주입 시 프로세스 id로 식별한다.
  workerId: process.env.TRADE_WORKER_ID || `trade-token-manager-${process.pid}`,
  requestToken: requestTossAccessToken,
});
