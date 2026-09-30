import wpCacheService from "./services/wpCacheService";
import { isDev } from "utils/common";
import { logger } from "utils/log";

/**
 * @docHint
 * @purpose 모듈 기능 제공
 * @process 핵심 로직 수행  필요한 값 노출
 * @domain bootstrap
 * @scope server_global
 */

// 서버 초기화 함수
export async function initializeServer() {
  try {
    logger.log("서버 초기화 시작...");

    // 개발 환경에서 실행 중인지 확인
    if (isDev) {
      logger.log("개발 환경에서 서버 초기화 중...");
    }

    // WordPress 캐시 서비스 초기화 - 실제 DB 연결
    // 이 시점에 캐시 모델 초기화 및 설정 문서 생성
    try {
      await wpCacheService.prepareCache();
    } catch (error) {
      logger.error("WP 캐시 서비스 초기화 중 오류:", error);
      // 초기화 오류가 있어도 서버는 계속 작동
    }

    logger.log("서버 초기화 완료");
    return true;
  } catch (error) {
    logger.error("서버 초기화 중 오류 발생:", error);
    throw error;
  }
}
