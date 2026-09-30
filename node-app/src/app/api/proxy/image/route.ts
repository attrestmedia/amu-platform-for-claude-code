import { NextRequest, NextResponse } from "next/server";
import sharp from "sharp";
import { logger } from "utils/log";
import { isDomainAllowed, getImageProxyConfig, isHttpOrHttps } from "libs/server-utils/api/imageProxyPolicy";

import { toErrorLike } from "utils/common";

function safeImageLogTarget(value: string) {
  try {
    const url = new URL(value);
    return `${url.protocol}//${url.hostname}`;
  } catch {
    return "invalid-image-url";
  }
}
/**
 * @docHint
 * @purpose API 라우트(proxy / image) 기능 요청 처리
 * @process GET 요청 파싱  입력 검증  핵심 처리  JSON 응답 반환
 * @domain proxy.image
 * @scope public_api
 */

// Node 런타임 보장
export const runtime = "nodejs";

// 정적 캐시 무력화 필요시 주석 해제
// export const dynamic = "force-dynamic";

// CORS Preflight 대응
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Max-Age": "86400",
    },
  });
}

// 외부 이미지 프록시 API
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const imageUrl = searchParams.get("url");
    const thumbnailWidthValue = searchParams.get("thumbnailWidth");
    const thumbnailWidth = thumbnailWidthValue ? Number(thumbnailWidthValue) : 0;

    if (!imageUrl) {
      return new NextResponse("Image URL is required", { status: 400 });
    }
    if (
      thumbnailWidthValue &&
      (!Number.isInteger(thumbnailWidth) || thumbnailWidth < 64 || thumbnailWidth > 512)
    ) {
      return new NextResponse("Invalid thumbnail width", { status: 400 });
    }

    // URL + 스킴 검증
    const imageLogTarget = safeImageLogTarget(imageUrl);
    let url: URL;
    try {
      url = new URL(imageUrl);
    } catch {
      logger.warn(`잘못된 이미지 URL: ${imageLogTarget}`);
      return new NextResponse("Invalid image URL", { status: 400 });
    }
    const config = getImageProxyConfig();

    if (!config.enabled) {
      logger.warn("이미지 프록시가 비활성화됨");
      return new NextResponse("Image proxy is disabled", { status: 503 });
    }

    if (!isHttpOrHttps(url)) {
      return new NextResponse("Unsupported protocol", { status: 400 });
    }

    // 엄격 검증 모드일 때 화이트리스트 체크
    if (config.strictValidation && !isDomainAllowed(url.hostname)) {
      logger.warn(`허용되지 않은 도메인: ${url.hostname}`);
      return new NextResponse("Domain not allowed", { status: 403 });
    }

    // 안정적인 UA/Referer
    const UA =
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123 Safari/537.36";

    // 원격 이미지 가져오기 (arrayBuffer) - redirect 수동 처리(SSRF 방지)
    const fetchWithRedirectGuard = async (startUrl: URL) => {
      const maxRedirects = 3;
      let current = startUrl;

      for (let i = 0; i <= maxRedirects; i++) {
        const controller = new AbortController();
        const t = setTimeout(() => controller.abort(), 15_000);

        const res = await fetch(current.toString(), {
          method: "GET",
          redirect: "manual",
          cache: "no-store",
          credentials: "omit",
          signal: controller.signal,
          headers: {
            "User-Agent": UA,
            Accept: "image/*,*/*;q=0.8",
            "Cache-Control": "no-cache",
            Referer: current.origin,
          },
        });

        clearTimeout(t);

        // 3xx redirect
        if (res.status >= 300 && res.status < 400) {
          const loc = res.headers.get("location");
          if (!loc) throw new Error("Redirect without Location");
          const next = new URL(loc, current);

          if (!isHttpOrHttps(next)) throw new Error("Unsupported protocol after redirect");
          if (config.strictValidation && !isDomainAllowed(next.hostname)) {
            throw new Error(`Redirected domain not allowed: ${next.hostname}`);
          }

          current = next;
          continue;
        }

        if (!res.ok) {
          throw Object.assign(new Error(`HTTP ${res.status}`), { status: res.status });
        }

        const buf = await res.arrayBuffer();
        return { buffer: buf, headers: res.headers };
      }

      throw new Error("Too many redirects");
    };

    let imageBuffer: ArrayBuffer;
    let remoteHeaders: Headers;
    try {
      const r = await fetchWithRedirectGuard(url);
      imageBuffer = r.buffer;
      remoteHeaders = r.headers;
    } catch (err) {
      const errLike = toErrorLike(err);
      logger.error(`외부 이미지 fetch 실패: ${imageLogTarget}`, err);
      // AbortController timeout
      if (errLike.code === "ABORT_ERR" || String((errLike as { name?: unknown }).name) === "AbortError") {
        return new NextResponse("Image fetch timeout", { status: 408 });
      }
      const status = Number(errLike.status) || 502;
      if (status === 404) return new NextResponse("Image not found", { status: 404 });
      if (status === 403) return new NextResponse("Access forbidden", { status: 403 });
      return new NextResponse(`Failed to fetch image: ${status}`, { status });
    }

    // MIME 검증(+ SVG 차단)
    const contentType = remoteHeaders.get("content-type") || "";
    if (!contentType.startsWith("image/")) {
      logger.warn(`잘못된 Content-Type: ${contentType} for ${imageLogTarget}`);
      return new NextResponse("Invalid content type", { status: 400 });
    }
    // Next 설정(dangerouslyAllowSVG: false)와 보안 일관성을 위해 SVG 차단
    if (contentType === "image/svg+xml") {
      logger.warn(`SVG 차단: ${imageLogTarget}`);
      return new NextResponse("SVG not allowed", { status: 415 });
    }

    // 크기 제한(헤더 기반 1차)
    const contentLength = remoteHeaders.get("content-length");
    if (contentLength && parseInt(contentLength, 10) > config.maxSize) {
      logger.warn(`이미지 크기 초과(헤더): ${contentLength} bytes for ${imageLogTarget}`);
      return new NextResponse("Image too large", { status: 413 });
    }

    // 실제 크기 제한(헤더 미제공 대비)
    if (imageBuffer.byteLength > config.maxSize) {
      logger.warn(`이미지 크기 초과(실측): ${imageBuffer.byteLength} bytes for ${imageLogTarget}`);
      return new NextResponse("Image too large", { status: 413 });
    }

    // 최소 크기(손상 방지)
    if (imageBuffer.byteLength < 100) {
      logger.warn(`이미지 너무 작음(손상 가능): ${imageBuffer.byteLength} bytes for ${imageLogTarget}`);
      return new NextResponse("Image appears to be corrupted", { status: 422 });
    }

    let responseBody: ArrayBuffer = imageBuffer;
    let responseContentType = contentType;
    if (thumbnailWidth) {
      try {
        const transformed = await sharp(Buffer.from(imageBuffer))
          .rotate()
          .resize({
            width: thumbnailWidth,
            height: thumbnailWidth,
            fit: "inside",
            withoutEnlargement: true,
          })
          .webp({ quality: 72, effort: 3 })
          .toBuffer();
        const transformedBytes = new Uint8Array(transformed.byteLength);
        transformedBytes.set(transformed);
        responseBody = transformedBytes.buffer;
        responseContentType = "image/webp";
      } catch (error) {
        logger.warn(`이미지 썸네일 변환 실패: ${imageLogTarget}`, error);
        return new NextResponse("Image transform failed", { status: 422 });
      }
    }

    // 응답 헤더(라우트 레벨에서도 캐시 명시)
    const cacheTTL = String(config.cacheTTL ?? 3600);
    const headers = new Headers({
      "Content-Type": responseContentType,
      "Cache-Control": `public, max-age=${cacheTTL}, s-maxage=${cacheTTL}`,
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "X-Content-Type-Options": "nosniff",
      // Content-Length를 명시하려면 주석 해제
      // "Content-Length": String(imageBuffer.byteLength),
    });

    logger.log(
      `✅ 이미지 프록시 성공: ${url.hostname} (${imageBuffer.byteLength} → ${responseBody.byteLength} bytes)`,
    );

    return new NextResponse(responseBody, { status: 200, headers });
  } catch (error) {
    logger.error("이미지 프록시 처리 중 예외:", error);
    return new NextResponse("Internal server error", { status: 500 });
  }
}
