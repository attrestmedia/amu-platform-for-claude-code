import { NextRequest, NextResponse } from "next/server";
import { Schema, Document } from "mongoose";
import { getModel } from "libs/database/modelCache";
import { getUniverseById } from "libs/database/universe";
import { withAuth } from "libs/server-utils/api/apiMiddleware";
import { canEditUniverse } from "libs/server-utils/auth/userRoleUtils";
import { MONGODB_BILLING_URL } from "consts/env/server";
import type { DateLike } from "types/ai";

import { toErrorMessage } from "utils/common";
import { toUnknownRecord } from "utils/common/typeUtils";
/**
 * @docHint
 * @purpose API 라우트(admin / payments / usage) 기능 요청 처리
 * @process 요청 요청 파싱  인증/권한 검증  핵심 처리  JSON 응답 반환
 * @domain payment
 * @scope admin-api
 */

type ICoinUsageDoc = Document & {
  uid?: string; // 'universe:{id}'
  universeId?: string;
  userId?: string;
  app?: string;
  provider?: string;
  modelName?: string;
  billingKey?: string;
  coins: number; // 사용 코인
  reason?: string;
  meta?: Record<string, unknown>;
  createdAt: DateLike;
};
const CoinUsageSchema = new Schema({}, { strict: false, collection: "coin_usages", timestamps: true });

export const GET = withAuth(
  async (_data, user, request) => {
    try {
      const req = request as NextRequest; // NextRequest로 안전 캐스팅
      const searchParams = req.nextUrl.searchParams;
      const universeId = searchParams.get("universeId") || "";
      const limit = Math.max(1, Math.min(100, Number(searchParams.get("limit") || 10)));

      if (!universeId) {
        return NextResponse.json({ error: "universeId는 필수입니다." }, { status: 400 });
      }

      // 쿼리스트링 기반 권한 강제(최고관리자면 통과, 에디터는 해당 유니버스만)
      const universe = await getUniverseById(universeId);
      if (!universe) {
        return NextResponse.json({ error: "유니버스를 찾을 수 없습니다." }, { status: 404 });
      }
      const userRecord = toUnknownRecord(user);
      const isAdmin = Array.isArray(userRecord.roles) && userRecord.roles.includes("administrator");
      if (!isAdmin && !canEditUniverse(user, universe)) {
        return NextResponse.json({ error: "해당 유니버스에 대한 편집 권한이 없습니다." }, { status: 403 });
      }

      const CoinUsage = await getModel<ICoinUsageDoc>(MONGODB_BILLING_URL, "CoinUsage", CoinUsageSchema, "coin_usages");
      const list = await CoinUsage.find({
        $and: [
          { $or: [{ universeId }, { uid: `universe:${universeId}` }] },
          { $or: [{ state: "applied" }, { state: { $exists: false } }] },
        ],
      })
        .sort({ createdAt: -1 })
        .limit(limit)
        .lean();

      const mapped = (list || []).map((d) => {
        const title =
          d.reason ||
          d.meta?.route ||
          [d.app, [d.provider, d.modelName].filter(Boolean).join("/")].filter(Boolean).join(":") ||
          "usage";

        return {
          _id: String(d._id),
          universeId: d.universeId || (d.uid || "").split(":")[1] || universeId,
          userId: d.userId,
          amount: d.coins > 0 ? -Math.abs(d.coins) : d.coins,
          reason: title,
          createdAt: d.createdAt,
        };
      });

      return NextResponse.json({ list: mapped });
    } catch (e) {
      return NextResponse.json({ error: toErrorMessage(e, "usage 조회 실패") }, { status: 500 });
    }
  },
  undefined,
  "admin_coin_usage_list",
);
