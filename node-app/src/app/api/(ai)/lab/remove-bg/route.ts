import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { withAuth } from "libs/server-utils/api/apiMiddleware";
import {
  getBackgroundRemovalProviderOrder,
  removeBackground,
  type BackgroundRemovalOptions,
} from "libs/services/backgroundRemoval/removeBackground";
import { billAIUsageOrThrow, refundAIUsageOrThrow } from "libs/services/aiUsageBilling";
import { getPerImageCost } from "utils/payment/coinUtils";
import { AI_GEN_IMAGE_LIMIT } from "consts/ai";
import { MAX_BASE_FILE_BYTES } from "consts/app";
import { formatBytes } from "utils/normalize";
import { logger } from "utils/log";

import { toUnknownRecord, toErrorLike } from "utils/common";

export const runtime = "nodejs";

/**
 * @docHint
 * @purpose 이미지 배경 제거 요청 처리
 * @process 입력 이미지 검증  인증/권한 검증  외부 제거 API 호출  결과 반환
 * @domain ai
 * @scope global
 */

function parseRemoveBgOptions(form: FormData): BackgroundRemovalOptions {
  const opt: BackgroundRemovalOptions = {};

  const format = form.get("format");
  if (typeof format === "string" && format) {
    if (format !== "png" && format !== "jpg" && format !== "webp") {
      throw Object.assign(new Error("format 값이 올바르지 않습니다. (png|jpg|webp)"), { status: 400 });
    }
    opt.format = format;
  }

  const size = form.get("size");
  if (typeof size === "string" && size) {
    if (size !== "preview" && size !== "medium" && size !== "hd" && size !== "full") {
      throw Object.assign(new Error("size 값이 올바르지 않습니다. (preview|medium|hd|full)"), { status: 400 });
    }
    opt.size = size;
  }

  const crop = form.get("crop");
  if (typeof crop === "string" && crop) {
    if (crop !== "true" && crop !== "false") {
      throw Object.assign(new Error("crop 값이 올바르지 않습니다. (true|false)"), { status: 400 });
    }
    opt.crop = crop;
  }

  const bg = form.get("bg_color");
  if (typeof bg === "string" && bg) {
    // 과도한 입력 방어(길이만이라도)
    if (bg.length > 32) throw Object.assign(new Error("bg_color 값이 너무 깁니다."), { status: 400 });
    opt.bg_color = bg;
  }

  const channels = form.get("channels");
  if (typeof channels === "string" && channels) {
    if (channels !== "rgba" && channels !== "alpha") {
      throw Object.assign(new Error("channels 값이 올바르지 않습니다. (rgba|alpha)"), { status: 400 });
    }
    opt.channels = channels;
  }

  return opt;
}

// 동시성 제한
async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  worker: (item: T, idx: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;

  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const i = next++;
      if (i >= items.length) break;
      results[i] = await worker(items[i], i);
    }
  });

  await Promise.all(runners);
  return results;
}

const handlePOST = async (_body: unknown, _user: unknown, req: NextRequest) => {
  // 선차감 후 실패 시 환불을 위해 상태 보관
  const requestId = randomUUID();
  let uid = "";
  let chargedCoins = 0;
  let chargedImages = 0;
  let refundedCoins = 0;
  const providerOrder = getBackgroundRemovalProviderOrder();
  const billingProvider = providerOrder[0];

  try {
    const form = await req.formData();

    // 다중 이미지 지원: 같은 키로 여러 번 append된 file들을 모두 받음
    const primary = form.getAll("image_file").filter((v): v is File => v instanceof File);
    const legacy = form.getAll("file").filter((v): v is File => v instanceof File);
    const files = primary.length ? primary : legacy;
    if (!files.length) {
      return NextResponse.json({ ok: false, message: "image_file(또는 file) 업로드가 필요합니다." }, { status: 400 });
    }
    if (files.length > AI_GEN_IMAGE_LIMIT) {
      return NextResponse.json(
        { ok: false, message: `이미지는 최대 ${AI_GEN_IMAGE_LIMIT}장까지 처리할 수 있습니다.` },
        { status: 400 },
      );
    }

    // 장당 용량 제한(3MB) - 과금 전에 fail-fast
    const tooBig = files.find((f) => (f?.size || 0) > MAX_BASE_FILE_BYTES);
    if (tooBig) {
      return NextResponse.json(
        { ok: false, message: `파일 용량이 너무 큽니다. (장당 최대 ${formatBytes(MAX_BASE_FILE_BYTES)})` },
        { status: 413 },
      );
    }

    // 1) 코인 선차감(고정 과금): 외부 유료 API 호출 전 차감하여 비용 누수 방지
    uid = String(toUnknownRecord(_user)?.uid || toUnknownRecord(_user)?.ID || "").trim();
    if (!uid) {
      return NextResponse.json({ ok: false, message: "인증 정보(uid)가 없습니다." }, { status: 401 });
    }

    chargedImages = files.length;

    // 멀티 응답 base64 폭탄 방지
    const totalBytes = files.reduce((sum, f) => sum + (f?.size || 0), 0);
    if (files.length > 1 && totalBytes > 15 * 1024 * 1024) {
      return NextResponse.json(
        { ok: false, message: "여러 장 처리 시 총 파일 용량이 너무 큽니다. (최대 15MB)" },
        { status: 413 },
      );
    }

    const billRes = await billAIUsageOrThrow({
      uid,
      app: "ai_lab_remove_bg", // resolveUserWalletPolicy: ai_* => charged
      provider: billingProvider,
      modelName: "remove-bg",
      modality: "image",
      fixed: { images: chargedImages },
      meta: {
        kind: "charge",
        requestId,
        endpoint: "ai/lab/remove-bg",
        route: req.nextUrl?.pathname || "ai/lab/remove-bg",
        files: files.map((f) => ({ name: f.name, size: f.size, type: f.type })),
        images: chargedImages,
        providerOrder,
      },
    });
    chargedCoins = Number(toUnknownRecord(billRes)?.coins || 0) || 0;

    const options = parseRemoveBgOptions(form);

    // 1장일 땐 바이너리 응답 유지
    if (files.length === 1) {
      const f = files[0];
      const { buffer, contentType, uncertaintyScore, provider, attemptedProviders, fallbackUsed, providerCredits } =
        await removeBackground({
        file: f,
        options,
      });

      const headers = new Headers();
      headers.set("Content-Type", contentType);
      headers.set("Cache-Control", "no-store");
      headers.set("x-amu-request-id", requestId);
      if (chargedCoins > 0) headers.set("x-amu-charged-coins", String(chargedCoins));
      if (uncertaintyScore) headers.set("x-uncertainty-score", uncertaintyScore);
      headers.set("x-amu-bg-provider", provider);
      headers.set("x-amu-bg-attempted-providers", attemptedProviders.join(","));
      headers.set("x-amu-bg-fallback-used", String(fallbackUsed));
      if (providerCredits) headers.set("x-amu-provider-credits", providerCredits);
      return new NextResponse(buffer, { status: 200, headers });
    }

    // 다중 처리: 결과 배열 반환 (부분 실패 허용)
    const results = await mapWithConcurrency(files, 2, async (f, i) => {
      try {
        const { buffer, contentType, uncertaintyScore, provider, attemptedProviders, fallbackUsed, providerCredits } =
          await removeBackground({
          file: f,
          options,
        });
        return {
          index: i,
          ok: true,
          file: { name: f.name, size: f.size, type: f.type },
          contentType,
          dataBase64: Buffer.from(buffer).toString("base64"),
          uncertaintyScore,
          provider,
          attemptedProviders,
          fallbackUsed,
          providerCredits,
        };
      } catch (err) {
        const e = toErrorLike(err);
        return {
          index: i,
          ok: false,
          file: { name: f.name, size: f.size, type: f.type },
          error: typeof e.message === "string" ? e.message : "upstream_failed",
          status: typeof e.status === "number" ? e.status : undefined,
        };
      }
    });

    // 부분 환불: 실패한 장수만큼 환불
    const failedCount = results.filter((r) => !r.ok).length;
    if (failedCount > 0 && chargedCoins > 0 && uid) {
      // perImage × failedCount로 환불
      const perImage = getPerImageCost(billingProvider, "remove-bg", "image") ?? 0;
      const refundCoinsWanted =
        perImage > 0
          ? Math.min(chargedCoins, perImage * failedCount)
          : chargedImages > 0
            ? Math.min(chargedCoins, Math.ceil((chargedCoins * failedCount) / chargedImages))
            : 0;

      if (refundCoinsWanted > 0) {
        try {
          await refundAIUsageOrThrow({
            uid,
            app: "ai_lab_remove_bg",
            provider: billingProvider,
            modelName: "remove-bg",
            modality: "image",
            fixed: { images: failedCount },
            coins: refundCoinsWanted,
            meta: {
              kind: "refund",
              requestId,
              reason: "partial_upstream_failed",
              failedCount,
              chargedImages,
            },
          });
          refundedCoins = refundCoinsWanted;
        } catch (refundErr) {
          const re = toErrorLike(refundErr);
          logger.error("remove-bg 부분 환불 실패", {
            requestId,
            uid,
            chargedCoins,
            failedCount,
            refundError: (typeof re.message === "string" && re.message) || String(refundErr),
          });
        }
      }
    }

    return NextResponse.json(
      {
        ok: true,
        requestId,
        images: { charged: chargedImages, failed: results.filter((r) => !r.ok).length },
        billing: { chargedCoins, refundedCoins, netCoins: chargedCoins - refundedCoins },
        results,
      },
      { status: 200, headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    const eLike = toErrorLike(e);
    // 2) 실패 시 환불(보상 트랜잭션)
    // - 선차감이 실제로 된 경우에만 환불 시도 / requestId 기반 idempotency로 중복 환불 방지
    if (chargedCoins > 0 && uid && eLike.errorCode !== "COIN_INSUFFICIENT") {
      try {
        await refundAIUsageOrThrow({
          uid,
          app: "ai_lab_remove_bg",
          provider: billingProvider,
          modelName: "remove-bg",
          modality: "image",
          fixed: { images: chargedImages || 1 },
          coins: chargedCoins,
          meta: {
            kind: "refund",
            requestId,
            reason: "upstream_failed",
            upstreamStatus: typeof eLike.status === "number" ? eLike.status : undefined,
            chargedImages: chargedImages || 1,
          },
        });
      } catch (refundErr) {
        const re = toErrorLike(refundErr);
        // 환불 실패는 원인 에러를 덮지 않도록 로그만 남김
        logger.error("remove-bg 환불 실패", {
          requestId,
          uid,
          chargedCoins,
          refundError: (typeof re.message === "string" && re.message) || String(refundErr),
        });
      }
    }

    const status =
      typeof eLike.status === "number" ? eLike.status : eLike.errorCode === "COIN_INSUFFICIENT" ? 402 : 500;
    const message =
      eLike.errorCode === "COIN_INSUFFICIENT"
        ? "코인이 부족합니다."
        : typeof eLike.message === "string" && eLike.message.trim()
          ? eLike.message
          : "remove-bg 처리 중 오류가 발생했습니다.";

    return NextResponse.json({ ok: false, message }, { status });
  }
};

// multipart를 직접 처리해야 하므로 bodyParser: "none"
export const POST = withAuth(handlePOST, undefined, "ai/lab/remove-bg", { bodyParser: "none" });
