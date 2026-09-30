import { createWpCacheModels } from "models/wp";
import type { ITagCache } from "models/wp";
import { getCategories, getPostTag, getAllPostTags } from "libs/api/wp";
import fetchClient from "libs/api/fetchClient";
import type { IWpPost, IWpCategory, IWpPostsResponse, WpPostOrderbyType } from "types/thirdparty";
import { logger } from "utils/log";
import { WP_CONSTANTS as WC } from "consts/thirdparty/wp";
import { wpApiUri } from "consts/env/runtime";
import { CacheKeyManager } from "libs/cache/cacheKeyManager";
import { redisCache } from "libs/cache/redisCacheService";
import { MONGODB_AMU_URL } from "consts/env/server";
import { toUnknownRecord } from "utils/common/typeUtils";
import { extractMarketingPostImageFields } from "libs/marketing/sourceImageFields";
import { resolvePlatformCredential } from "libs/server-utils/secure/platformCredentialResolver";
import { buildWordPressRequestHeaders } from "libs/server-utils/wordpressRequestHeaders";

/**
 * @docHint
 * @purpose 모듈 기능 제공
 * @process 핵심 로직 수행  필요한 값 노출
 * @domain thirdparty_wp_cache
 * @scope server_global
 */

// 캐시 설정 타입
interface CacheOptions {
  forceRefresh?: boolean; // 강제 새로고침 여부
}

const WP_DETAIL_FIELDS = [
  "id",
  "date",
  "date_gmt",
  "guid",
  "modified",
  "modified_gmt",
  "slug",
  "status",
  "type",
  "link",
  "title",
  "content",
  "excerpt",
  "author",
  "featured_media",
  "comment_status",
  "ping_status",
  "sticky",
  "template",
  "format",
  "meta",
  "categories",
  "tags",
  "class_list",
  "acf",
  "yoast_head_json",
  "_embedded",
].join(",");

const NO_CACHE_REQUEST_HEADERS = {
  "Cache-Control": "no-cache, no-store, max-age=0",
  Pragma: "no-cache",
};

type WpPostsApiOptions = {
  page?: number;
  perPage?: number;
  orderby?: WpPostOrderbyType;
  order?: "asc" | "desc";
  categories?: number | number[];
  search?: string;
  forceRefresh?: boolean;
};

type WpCacheModels = Awaited<ReturnType<typeof createWpCacheModels>>;
type MongoQuery = Record<string, unknown>;
type RequestParams = Record<string, string | number | boolean | undefined>;
type WpTag = Pick<ITagCache, "id" | "name" | "slug" | "description" | "count">;
type SearchPostsResult = { posts: IWpPost[]; totalCount: number; totalPages: number };
type MongoIndexInfo = { name?: string; key?: Record<string, unknown> };
type WpPostDetailOptions = { postId?: number; slug?: string; forceRefresh?: boolean; includeUnpublished?: boolean };

function toSafeString(value: unknown) {
  return String(value || "").trim();
}

async function buildWpEditRequestHeaders() {
  try {
    const { payload } = await resolvePlatformCredential("integration.wordpress.rest");
    const username = toSafeString(payload.username);
    const password = toSafeString(payload.applicationPassword);
    if (!username || !password) return null;
    return buildWordPressRequestHeaders(wpApiUri(), {
      Authorization: `Basic ${Buffer.from(`${username}:${password}`).toString("base64")}`,
    });
  } catch {
    return null;
  }
}

function isPublishedPost(post: IWpPost | null | undefined) {
  return toSafeString(post?.status).toLowerCase() === "publish";
}

function withMarketingImageFields(post: IWpPost): IWpPost {
  const imageFields = extractMarketingPostImageFields(post);

  return {
    ...post,
    featured_media_url: imageFields.imageUrl,
    featured_media_alt: imageFields.imageAlt,
    featured_media_source: imageFields.imageSource as IWpPost["featured_media_source"],
    genstudio_thumbnail_asset_id: imageFields.genStudioImageAssetId || undefined,
  };
}

/**
 * MongoDB 메타데이터 정제 헬퍼 함수
 */
function cleanMongoDocument<T extends object>(doc: T): Omit<T, "_id" | "__v"> {
  const cleanDoc = { ...doc } as Record<string, unknown>;
  delete cleanDoc._id;
  delete cleanDoc.__v;
  return cleanDoc as Omit<T, "_id" | "__v">;
}

/**
 * 배열 데이터 정제 헬퍼
 */
function cleanMongoDocuments<T extends object>(docs: T[]) {
  return docs.map(cleanMongoDocument);
}

/**
 * WordPress 캐싱 서비스 클래스
 * WP API 데이터를 MongoDB에 캐싱하고 관리하는 기능 제공
 */
class WpCacheService {
  private models: WpCacheModels | null = null;
  private initPromise: Promise<WpCacheModels> | null = null;

  /**
   * MongoDB 연결 및 모델 초기화
   */
  private async initialize() {
    // 이미 초기화 중이면 진행 중인 Promise 반환
    if (this.initPromise) {
      return this.initPromise;
    }

    // 이미 초기화 완료되었다면 모델 반환
    if (this.models) {
      return this.models;
    }

    // 초기화 Promise 생성
    this.initPromise = (async () => {
      try {
        logger.log("WpCacheService: MongoDB 연결 시작");

        this.models = await createWpCacheModels(MONGODB_AMU_URL);

        logger.log("WpCacheService: MongoDB 연결 및 모델 초기화 완료");

        // 캐시 설정 초기화 - 미리 CacheConfig 문서들 생성
        await this.initializeCacheConfigs();

        return this.models;
      } catch (error) {
        logger.error("WpCacheService: MongoDB 연결 실패", error);

        // 실패 시 Promise와 models 초기화하여 재시도 가능하게 함
        this.initPromise = null;
        this.models = null;
        throw error;
      }
    })();

    return this.initPromise;
  }

  private async fetchPostsFromWordPressAPI(options: WpPostsApiOptions = {}): Promise<IWpPostsResponse> {
    const {
      page = 1,
      perPage = 10,
      orderby = "date",
      order = "desc",
      categories,
      search,
      forceRefresh = false,
    } = options;

    const params: RequestParams = {
      page,
      per_page: perPage,
      _fields: WP_DETAIL_FIELDS,
    };

    const trimmedSearch = String(search || "").trim();
    if (trimmedSearch) {
      params.search = trimmedSearch;
      params.orderby = orderby;
      if (orderby !== "relevance" && order) params.order = order;
    } else {
      params.orderby = orderby === "relevance" ? "date" : orderby;
      if (order) params.order = order;
    }

    if (categories !== undefined) {
      params.categories = Array.isArray(categories) ? categories.join(",") : categories;
    }

    if (forceRefresh) {
      params._cb = Date.now();
    }

    const response = await fetchClient.get<IWpPost[]>(`${wpApiUri()}/posts`, {
      params,
      timeout: 15000,
      credentials: "omit",
      cache: forceRefresh ? "no-store" : undefined,
      headers: forceRefresh ? NO_CACHE_REQUEST_HEADERS : undefined,
    });

    return {
      totalPosts: Number(response.headers.get("x-wp-total") || 0),
      totalPages: Number(response.headers.get("x-wp-totalpages") || 0),
      data: Array.isArray(response.data) ? response.data : [],
    };
  }

  /**
   * 캐시 설정 초기화 - 필요한 CacheConfig 문서들 생성
   */
  private async initializeCacheConfigs() {
    if (!this.models) return;

    const cacheTypes = ["posts", "categories", "tags"];

    for (const type of cacheTypes) {
      // 기존 설정 확인
      const existingConfig = await this.models.CacheConfig.findOne({ type });

      if (!existingConfig) {
        // 기본 설정 생성
        const defaultExpiration = type === "posts" ? 1440 : type === "categories" ? 1440 : 2880; // 포스트/카테고리 1일, 태그 2일
        const defaultInterval = type === "posts" ? 30 : type === "categories" ? 60 : 120; // 포스트 30분, 카테고리 1시간, 태그 2시간

        const newConfig = new this.models.CacheConfig({
          type,
          updateInterval: defaultInterval,
          cacheExpiration: defaultExpiration,
          lastUpdated: new Date(),
          isUpdating: false,
        });

        await newConfig.save();
        logger.log(`WpCacheService: ${type} 캐시 기본 설정 생성 완료`);
      }
    }
  }

  /**
   * 연결 오류 처리
   */
  private async handleConnectionError(error: unknown): Promise<void> {
    logger.error("WpCacheService: 연결 오류 처리", error);
    const err = toUnknownRecord(error);

    // MongoDB 연결 오류인 경우 연결 재설정
    if (
      err.name === "MongooseError" ||
      err.name === "MongoError" ||
      String(err.message || "").includes("buffering timed out")
    ) {
      logger.log("WpCacheService: MongoDB 연결 재설정 시도");
      this.models = null;
      this.initPromise = null;
    }
  }

  /**
   * 작업 실행 함수 (오류 처리 래퍼)
   */
  private async executeWithRetry<T>(operation: () => Promise<T>, retries = 1): Promise<T> {
    try {
      return await operation();
    } catch (error: unknown) {
      const err = toUnknownRecord(error);
      // 마지막 재시도인 경우 오류 전파
      if (retries <= 0) {
        await this.handleConnectionError(error);
        throw error;
      }

      // 타임아웃 오류인 경우 연결 재설정 후 재시도
      if (String(err.message || "").includes("buffering timed out")) {
        logger.log(`WpCacheService: 타임아웃 오류 발생, 재시도 (남은 재시도: ${retries})`);
        await this.handleConnectionError(error);
        // 잠시 대기 후 재시도
        await new Promise((resolve) => setTimeout(resolve, 1000));
        return this.executeWithRetry(operation, retries - 1);
      }

      // 기타 오류는 그대로 전파
      throw error;
    }
  }

  /**
   * 카테고리 캐싱 및 조회
   */
  async getCategories(options: CacheOptions = {}): Promise<IWpCategory[]> {
    const { forceRefresh = false } = options;

    return this.executeWithRetry(async () => {
      const models = await this.initialize();

      // 캐시 설정 가져오기
      let cacheConfig = await models.CacheConfig.findOne({ type: "categories" });
      if (!cacheConfig) {
        cacheConfig = new models.CacheConfig({
          type: "categories",
          updateInterval: 60, // 기본 1시간
        });
        await cacheConfig.save();
      }

      // 캐시된 데이터 확인 (강제 새로고침이 아닌 경우)
      if (!forceRefresh) {
        const cachedCategories = await models.CategoryCache.find({}).sort({ id: 1 }).lean().exec();

        // 유효한 캐시가 있으면 반환
        if (cachedCategories.length > 0) {
          logger.log(`WpCacheService: ${cachedCategories.length}개의 캐시된 카테고리 데이터 반환`);
          return cleanMongoDocuments(cachedCategories) as unknown as IWpCategory[];
        }
      }

      // 캐시 업데이트 중인지 확인
      if (cacheConfig.isUpdating) {
        logger.log("WpCacheService: 카테고리 캐시 업데이트가 이미 진행 중입니다.");
        // 업데이트 중이면 기존 캐시 데이터 반환 (만료되었더라도)
        const existingCache = await models.CategoryCache.find().sort({ id: 1 }).lean().exec();
        if (existingCache.length > 0) {
          return existingCache as unknown as IWpCategory[];
        }
      }

      // 캐시 업데이트 시작
      cacheConfig.isUpdating = true;
      await cacheConfig.save();

      try {
        // WordPress API에서 카테고리 데이터 가져오기
        logger.log("WpCacheService: WordPress API에서 카테고리 데이터 가져오기");
        const { data: wpCategories } = await getCategories();

        // 새 데이터 저장
        if (wpCategories && wpCategories.length > 0) {
          const categoryDocs = wpCategories.map((cat: IWpCategory) => ({
            id: cat.id,
            name: cat.name,
            slug: cat.slug,
            description: cat.description,
            parent: cat.parent,
            count: cat.count,
            cachedAt: new Date(),
          }));

          // 1. 현재 WP 카테고리 id 목록
          const ids = wpCategories.map((cat: IWpCategory) => cat.id);

          // 2. DB에 남아있는 불필요한 카테고리 제거
          await models.CategoryCache.deleteMany({ id: { $nin: ids } });

          // 3. upsert 방식으로 중복 key 오류 방지
          const bulkOps = categoryDocs.map((doc) => ({
            updateOne: {
              filter: { id: doc.id },
              update: doc,
              upsert: true,
            },
          }));
          await models.CategoryCache.bulkWrite(bulkOps, { ordered: false });

          logger.log(`WpCacheService: ${categoryDocs.length}개의 카테고리 데이터 캐싱 완료`);
        }

        // 캐시 설정 업데이트
        cacheConfig.lastUpdated = new Date();
        cacheConfig.isUpdating = false;
        await cacheConfig.save();

        // 캐시된 데이터 반환
        const updatedCache = await models.CategoryCache.find().sort({ id: 1 }).lean().exec();
        return updatedCache as unknown as IWpCategory[];
      } catch (error) {
        // 오류 발생 시 isUpdating 플래그 초기화
        cacheConfig.isUpdating = false;
        await cacheConfig.save();
        logger.error("WpCacheService: 카테고리 캐싱 중 오류 발생", error);
        throw error;
      }
    });
  }

  /**
   * 포스트 캐싱 및 조회
   * @param options 포스트 조회 옵션 및 캐시 설정
   */
  async getPosts(options: WpPostsApiOptions & { expirationMinutes?: number } = {}) {
    const { page = 1, perPage = 10, categories, forceRefresh = false, expirationMinutes = 1440 } = options;

    logger.log("WpCacheService.getPosts 호출됨:", {
      page,
      perPage,
      categories,
      forceRefresh,
    });

    return this.executeWithRetry(async () => {
      const models = await this.initialize();

      // 캐시 설정 가져오기
      let cacheConfig = await models.CacheConfig.findOne({ type: "posts" });
      if (!cacheConfig) {
        cacheConfig = new models.CacheConfig({
          type: "posts",
          updateInterval: 30, // 기본 30분
          cacheExpiration: expirationMinutes,
        });
        await cacheConfig.save();
      }

      // 쿼리 빌드
      const query: MongoQuery = {};

      // 카테고리 필터 적용
      if (categories) {
        if (Array.isArray(categories)) {
          const validCategories = categories.filter((id) => Number.isInteger(id) && id > 0);
          if (validCategories.length > 0) {
            query.categories = { $in: validCategories };
          }
          logger.log(`WpCacheService: 배열 카테고리 필터 적용 ${categories.join(", ")}`);
        } else {
          query.categories = { $in: [categories] };
          logger.log(`WpCacheService: 단일 카테고리 필터 적용 ${categories}`);
        }
      }

      logger.log("MongoDB 쿼리:", JSON.stringify(query));

      // 캐시된 데이터 확인 (강제 새로고침이 아닌 경우)
      if (!forceRefresh) {
        // 총 문서 수 계산
        const totalCached = await models.PostCache.countDocuments(query).exec();
        logger.log(`WpCacheService: 쿼리에 일치하는 캐시 문서 수: ${totalCached}`);

        // 만약 데이터가 없으면 강제 새로고침
        if (totalCached === 0) {
          logger.log("WpCacheService: 캐시에 데이터가 없어 강제 새로고침 수행");
          // 캐시에 데이터가 없으면 아래로 계속 진행하여 WordPress API에서 데이터 가져오기
        } else {
          // 페이지네이션 적용
          const skip = (page - 1) * perPage;

          // 캐시된 포스트 조회
          const cachedPosts = await models.PostCache.find(query)
            .sort({ date: -1 })
            .skip(skip)
            .limit(perPage)
            .lean()
            .exec();

          logger.log(`WpCacheService: 캐시에서 ${cachedPosts.length}개의 포스트 찾음`);

          // 데이터 샘플 로깅 (첫 번째 포스트의 일부 정보)
          if (cachedPosts.length > 0) {
            const samplePost = cachedPosts[0];
            logger.log("샘플 포스트 정보:", {
              id: samplePost.id,
              title: samplePost.title?.rendered,
              categories: samplePost.categories,
            });
          }

          // 유효한 캐시가 있으면 반환
          if (cachedPosts.length > 0) {
            logger.log(`WpCacheService: ${cachedPosts.length}개의 캐시된 포스트 데이터 반환`);

            return {
              totalPosts: totalCached,
              totalPages: Math.ceil(totalCached / perPage),
              data: cleanMongoDocuments(cachedPosts) as unknown as IWpPost[], // 일관된 정제 및 타입 안전성
            };
          }
        }
      } else {
        logger.log("WpCacheService: 강제 새로고침 옵션으로 캐시 무시");
      }

      // WordPress API에서 포스트 데이터 가져오기
      logger.log("WpCacheService: WordPress API에서 포스트 데이터 가져오기", {
        page,
        perPage,
        categories,
      });

      const wpPostsResponse = await this.fetchPostsFromWordPressAPI({
        page,
        perPage,
        categories,
        forceRefresh,
      });

      // 데이터 유효성 검증
      if (!wpPostsResponse?.data?.length) {
        return {
          totalPosts: 0,
          totalPages: 0,
          data: [],
        };
      }

      logger.log(
        `WordPress API 응답: 총 ${wpPostsResponse.totalPosts}개 포스트, ${wpPostsResponse.data.length}개 데이터`,
      );

      // 첫 번째 포스트 샘플 로깅
      if (wpPostsResponse.data.length > 0) {
        const samplePost = wpPostsResponse.data[0];
        logger.log("WP API 샘플 포스트:", {
          id: samplePost.id,
          title: samplePost.title?.rendered,
          categories: samplePost.categories,
        });
      }

      // 가져온 데이터 캐싱
      if (wpPostsResponse.data && wpPostsResponse.data.length > 0) {
        // 각 포스트를 캐시 형식으로 변환
        const postDocs = wpPostsResponse.data.map((post: IWpPost) => {
          const imageFields = extractMarketingPostImageFields(post);
          return {
          id: post.id,
          date: post.date,
          modified: post.modified,
          slug: post.slug,
          link: post.link,
          title: post.title,
          content: post.content,
          excerpt: post.excerpt,
          author: post.author,
          categories: post.categories,
          tags: post.tags,
          acf: post.acf || {},
          guid: post.guid,
          featured_media_url: imageFields.imageUrl,
          featured_media_alt: imageFields.imageAlt,
          featured_media_source: imageFields.imageSource,
          genstudio_thumbnail_asset_id: imageFields.genStudioImageAssetId,
          yoast_head_json: post.yoast_head_json || {},
          cachedAt: new Date(),
          };
        });

        // 배치 처리로 포스트 저장 (upsert), 작은 단위로 분할 처리
        const batchSize = 50;
        for (let i = 0; i < postDocs.length; i += batchSize) {
          const batch = postDocs.slice(i, i + batchSize);
          const bulkOps = batch.map((doc) => ({
            updateOne: {
              filter: { id: doc.id },
              update: doc,
              upsert: true,
            },
          }));
          await models.PostCache.bulkWrite(bulkOps, { ordered: false });
        }

        logger.log(`WpCacheService: ${postDocs.length}개의 포스트 데이터 캐싱 완료`);
      } else {
        logger.log("WpCacheService: WordPress API에서 포스트를 찾지 못함");
      }

      // 캐시 설정 업데이트
      cacheConfig.lastUpdated = new Date();
      await cacheConfig.save();

      // WordPress API 응답 그대로 반환
      return {
        ...wpPostsResponse,
        data: wpPostsResponse.data.map(withMarketingImageFields),
      };
    });
  }

  /**
   * 태그 캐싱 및 조회
   * @param tagId 태그 ID
   * @param onlyName 이름만 반환 여부
   * @param options 캐시 옵션
   */
  async getPostTag(tagId: number, onlyName?: boolean, options: CacheOptions = {}) {
    const { forceRefresh = false } = options;

    return this.executeWithRetry(async () => {
      const models = await this.initialize();

      // 캐시 설정 가져오기
      let cacheConfig = await models.CacheConfig.findOne({ type: "tags" });
      if (!cacheConfig) {
        cacheConfig = new models.CacheConfig({
          type: "tags",
          updateInterval: 120, // 기본 2시간
        });
        await cacheConfig.save();
      }

      // 캐시된 데이터 확인 (강제 새로고침이 아닌 경우)
      if (!forceRefresh) {
        const cachedTag = await models.TagCache.findOne({
          id: tagId,
          // expiresAt: { $gt: new Date() }, // 이 줄 제거
        })
          .lean()
          .exec();

        if (cachedTag) {
          logger.log(`WpCacheService: 캐시된 태그 데이터 반환 (ID: ${tagId})`);
          if (onlyName) {
            return cachedTag.name;
          }
          return cachedTag;
        }
      }

      // WordPress API에서 태그 데이터 가져오기
      logger.log(`WpCacheService: WordPress API에서 태그 데이터 가져오기 (ID: ${tagId})`);
      const wpTagRaw = await getPostTag(tagId);
      const wpTag: WpTag =
        typeof wpTagRaw === "string"
          ? { id: tagId, name: wpTagRaw, slug: "", description: "", count: 0 }
          : {
              id: Number(wpTagRaw.id || tagId),
              name: String(wpTagRaw.name || ""),
              slug: String(wpTagRaw.slug || ""),
              description: String(wpTagRaw.description || ""),
              count: Number(wpTagRaw.count || 0),
            };

      // 태그 데이터 캐싱
      await models.TagCache.updateOne(
        { id: tagId },
        {
          id: tagId,
          name: wpTag.name,
          slug: wpTag.slug,
          description: wpTag.description || "",
          count: wpTag.count || 0,
          cachedAt: new Date(),
        },
        { upsert: true },
      );

      logger.log(`WpCacheService: 태그 데이터 캐싱 완료 (ID: ${tagId})`);

      // 요청에 따라 태그 이름 또는 전체 데이터 반환
      if (onlyName) {
        return wpTag.name;
      }
      return wpTag;
    });
  }

  /**
   * 여러 태그 캐싱 및 조회
   * @param tags 태그 ID 배열
   * @param onlyNames 이름만 반환 여부
   * @param options 캐시 옵션
   */
  async getAllPostTags(tags: number[], onlyNames?: boolean, options: CacheOptions = {}) {
    const { forceRefresh = false } = options;

    if (!tags || tags.length === 0) return [];

    return this.executeWithRetry(async () => {
      const models = await this.initialize();

      // 캐시 설정 가져오기
      let cacheConfig = await models.CacheConfig.findOne({ type: "tags" });
      if (!cacheConfig) {
        cacheConfig = new models.CacheConfig({
          type: "tags",
          updateInterval: 120, // 기본 2시간
        });
        await cacheConfig.save();
      }

      // 캐시에서 태그 찾기
      const cachedTags = !forceRefresh
        ? await models.TagCache.find({
            id: { $in: tags },
          })
            .lean()
            .exec()
        : [];

      // 모든 태그가 캐시에 있는지 확인
      const cachedTagIds = cachedTags.map((tag: WpTag) => tag.id);
      const missingTagIds = tags.filter((id: number) => !cachedTagIds.includes(id));

      // 모든 태그가 캐시에 있고 유효하면 캐시 데이터 반환
      if (missingTagIds.length === 0 && cachedTags.length === tags.length) {
        logger.log(`WpCacheService: ${cachedTags.length}개의 캐시된 태그 데이터 반환`);

        if (onlyNames) {
          return cachedTags.map((tag: WpTag) => tag.name);
        }

        return cachedTags.map((tag: WpTag) => ({
          ...tag,
          id: tag.id,
        }));
      }

      // 누락된 태그가 있으면 WordPress API에서 모든 태그 가져오기
      logger.log(`WpCacheService: WordPress API에서 ${tags.length}개의 태그 데이터 가져오기`);
      const wpTags = await getAllPostTags(tags);

      // 태그 데이터 캐싱
      if (wpTags && wpTags.length > 0) {
        const tagDocs: (WpTag & { cachedAt: Date })[] = (wpTags as WpTag[]).map((tag) => ({
          id: tag.id,
          name: tag.name,
          slug: tag.slug,
          description: tag.description || "",
          count: tag.count || 0,
          cachedAt: new Date(),
        }));

        // 배치 처리로 태그 저장 (upsert)
        const bulkOps = tagDocs.map((doc) => ({
          updateOne: {
            filter: { id: doc.id },
            update: doc,
            upsert: true,
          },
        }));

        await models.TagCache.bulkWrite(bulkOps, { ordered: false });
        logger.log(`WpCacheService: ${tagDocs.length}개의 태그 데이터 캐싱 완료`);
      }

      // 요청에 따라 태그 이름 또는 전체 데이터 반환
      if (onlyNames) {
        return (wpTags as WpTag[]).map((tag) => tag.name);
      }
      return wpTags;
    });
  }

  /**
   * 백그라운드에서 캐시 데이터 업데이트
   * @param type 데이터 타입 ('posts', 'categories', 'tags')
   */
  async updateCache(type: "posts" | "categories" | "tags") {
    try {
      const models = await this.initialize();

      // 캐시 설정 가져오기
      const cacheConfig = await models.CacheConfig.findOne({ type });
      if (!cacheConfig) {
        logger.log(`WpCacheService: ${type} 타입의 캐시 설정이 없습니다.`);
        return;
      }

      // 이미 업데이트 중이면 중복 실행 방지
      if (cacheConfig.isUpdating) {
        logger.log(`WpCacheService: ${type} 캐시 업데이트가 이미 진행 중입니다.`);
        return;
      }

      // 마지막 업데이트 시간 확인
      const now = new Date();
      const lastUpdated = cacheConfig.lastUpdated;
      const updateIntervalMs = cacheConfig.updateInterval * 60 * 1000;

      // 업데이트 주기가 지났는지 확인
      if (now.getTime() - lastUpdated.getTime() < updateIntervalMs) {
        logger.log(`WpCacheService: ${type} 캐시 업데이트 주기가 지나지 않았습니다.`);
        return;
      }

      // 업데이트 시작
      cacheConfig.isUpdating = true;
      await cacheConfig.save();

      try {
        logger.log(`WpCacheService: ${type} 캐시 백그라운드 업데이트 시작`);

        switch (type) {
          case "categories":
            await this.getCategories({ forceRefresh: true });
            break;
          case "posts":
            // 전체 포스트 업데이트 (기본값으로 최신 10개)
            await this.getPosts({ forceRefresh: true });
            break;
          case "tags":
            // 태그는 개별적으로 요청될 때만 캐싱되므로 여기서는 처리하지 않음
            break;
        }

        logger.log(`WpCacheService: ${type} 캐시 백그라운드 업데이트 완료`);
      } finally {
        // 업데이트 완료 표시
        cacheConfig.isUpdating = false;
        cacheConfig.lastUpdated = new Date();
        await cacheConfig.save();
      }
    } catch (error) {
      logger.error(`WpCacheService: ${type} 캐시 업데이트 오류`, error);

      try {
        // 오류 발생 시에도 isUpdating 플래그 초기화
        const models = await this.initialize();
        const cacheConfig = await models.CacheConfig.findOne({ type });
        if (cacheConfig) {
          cacheConfig.isUpdating = false;
          await cacheConfig.save();
        }
      } catch (resetError) {
        logger.error(`WpCacheService: 업데이트 상태 리셋 중 오류`, resetError);
      }
    }
  }

  /**
   * 캐시 서비스 준비 - 초기화 및 캐시 설정 생성
   */
  async prepareCache() {
    try {
      // 모델 초기화 및 캐시 설정 문서 생성
      await this.initialize();

      // 🔧 텍스트 인덱스 생성을 최우선으로 처리
      logger.log("텍스트 인덱스 초기 설정 시작...");
      const indexCreated = await this.ensureTextIndex();

      if (!indexCreated) {
        logger.warn("⚠️ 텍스트 인덱스 생성 실패 - 정규식 검색 모드로 동작");
        // 실패해도 계속 진행 (정규식 검색으로 대체)
      }

      // 캐시 데이터 유효성 검사
      await this.validateCacheData();

      return true;
    } catch (error) {
      logger.error("WpCacheService: 캐시 서비스 준비 중 오류", error);
      throw error;
    }
  }

  /**
   * 캐시 데이터 유효성 검사 및 필요시 초기 데이터 로드
   */
  private async validateCacheData() {
    try {
      const models = await this.initialize();

      // 카테고리 캐시 확인
      const categoriesCount = await models.CategoryCache.countDocuments();
      if (categoriesCount === 0) {
        logger.log("WpCacheService: 카테고리 캐시 데이터 초기 로드 시작");
        await this.getCategories({ forceRefresh: true });
      }

      // 포스트 캐시 확인 (점진적 로딩)
      const postsCount = await models.PostCache.countDocuments();
      if (postsCount === 0) {
        logger.log("WpCacheService: 포스트 캐시 데이터 초기 로드 시작 (100개)");

        // 초기에는 최신 100개만 로드
        await this.getPosts({
          page: 1,
          perPage: WC.MIN_INITIAL_POSTS,
          forceRefresh: true,
          orderby: "date",
          order: "desc",
        });

        logger.log("WpCacheService: 초기 포스트 캐싱 완료 (100개)");

        // 5분 후에 추가로 200개 더 로드 (점진적 확장)
        this.scheduleProgressiveLoading();
      }

      return true;
    } catch (error) {
      logger.error("WpCacheService: 캐시 데이터 유효성 검사 중 오류", error);
      throw error;
    }
  }

  /**
   * 점진적 캐시 로딩 스케줄러
   */
  private scheduleProgressiveLoading() {
    // 5분 후부터 점진적으로 더 많은 데이터 로드
    setTimeout(
      async () => {
        try {
          logger.log("WpCacheService: 점진적 캐시 로딩 시작");

          // 2-3페이지 로드 (총 200개 추가)
          for (let page = 2; page <= 3; page++) {
            await this.getPosts({
              page,
              perPage: 100,
              forceRefresh: true,
              orderby: "date",
              order: "desc",
            });

            // 각 페이지 로드 후 3초 대기 (서버 부하 방지)
            await new Promise((resolve) => setTimeout(resolve, 3000));
          }

          logger.log("WpCacheService: 점진적 캐시 로딩 완료 (총 300개)");

          // 필요시 더 많은 데이터를 위한 확장 로딩 (선택적)
          this.scheduleExtendedLoading();
        } catch (error) {
          logger.error("WpCacheService: 점진적 캐시 로딩 실패", error);
        }
      },
      5 * 60 * 1000,
    ); // 5분 후
  }

  /**
   * 확장 캐시 로딩 (필요시에만)
   */
  private scheduleExtendedLoading() {
    setTimeout(
      async () => {
        try {
          logger.log("WpCacheService: 확장 캐시 로딩 시작");

          // 4-5페이지 로드 (총 200개 추가)
          for (let page = 4; page <= 5; page++) {
            await this.getPosts({
              page,
              perPage: 100,
              forceRefresh: true,
              orderby: "date",
              order: "desc",
            });

            await new Promise((resolve) => setTimeout(resolve, 5000)); // 5초 대기
          }

          logger.log("WpCacheService: 확장 캐시 로딩 완료 (총 500개)");
        } catch (error) {
          logger.error("WpCacheService: 확장 캐시 로딩 실패", error);
        }
      },
      15 * 60 * 1000,
    ); // 15분 후
  }

  /**
   * 캐시 상태 정보 반환 (성능 모니터링용)
   */
  async getCacheStats(): Promise<{
    posts: { total: number; latest: Date | null };
    categories: { total: number; latest: Date | null };
    isLoading: boolean;
  }> {
    try {
      const models = await this.initialize();

      const [postsCount, categoriesCount] = await Promise.all([
        models.PostCache.countDocuments({}), // expiresAt 조건 제거
        models.CategoryCache.countDocuments({}), // expiresAt 조건 제거
      ]);

      const [latestPost, latestCategory] = await Promise.all([
        models.PostCache.findOne({}, { cachedAt: 1 }).sort({ cachedAt: -1 }), // expiresAt 조건 제거
        models.CategoryCache.findOne({}, { cachedAt: 1 }).sort({ cachedAt: -1 }), // expiresAt 조건 제거
      ]);

      // 현재 로딩 중인지 확인
      const loadingConfig = await models.CacheConfig.findOne({
        type: "posts",
        isUpdating: true,
      });

      return {
        posts: {
          total: postsCount,
          latest: latestPost?.cachedAt || null,
        },
        categories: {
          total: categoriesCount,
          latest: latestCategory?.cachedAt || null,
        },
        isLoading: !!loadingConfig,
      };
    } catch (error) {
      logger.error("캐시 상태 조회 실패:", error);
      throw error;
    }
  }

  /**
   * 랜덤 포스트 목록 가져오기
   */
  async getRandomPosts(options: { count?: number; categoryId?: number; forceRefresh?: boolean }): Promise<IWpPost[]> {
    const { count = 5, categoryId, forceRefresh = false } = options;

    if (count < 1 || count > 50) {
      throw new Error("랜덤 포스트 개수는 1-50 사이여야 합니다.");
    }

    const cacheKey = CacheKeyManager.content.randomPosts(count, categoryId);

    if (!forceRefresh) {
      const cached = await redisCache.get<IWpPost[]>(cacheKey);
      if (cached) {
        logger.debug(`랜덤 포스트 Redis 캐시 히트: ${cacheKey}`);
        return cached;
      }
    }

    try {
      const models = await this.initialize();

      // 단순하게 만료 조건 없이 조회
      const matchStage: MongoQuery = {};
      if (categoryId) {
        matchStage.categories = categoryId;
      }

      const pipeline = [{ $match: matchStage }, { $sample: { size: count } }, { $project: this.getProjectionFields() }];

      const randomPosts = await models.PostCache.aggregate(pipeline);
      const cleanPosts = cleanMongoDocuments(randomPosts) as unknown as IWpPost[];

      // Redis에만 단기 캐시 (5분)
      try {
        await redisCache.set(cacheKey, cleanPosts, CacheKeyManager.ttl.RANDOM_POSTS);
      } catch (cacheError) {
        logger.warn(`Redis 캐시 저장 실패: ${cacheKey}`, cacheError);
      }

      logger.info(`랜덤 포스트 조회 완료: ${randomPosts.length}개`);
      return cleanPosts;
    } catch (error) {
      logger.error("랜덤 포스트 조회 실패:", error);
      throw new Error("랜덤 포스트를 가져오는데 실패했습니다.");
    }
  }

  /**
   * 최신 포스트 목록 가져오기
   */
  async getLatestPosts(options: { count?: number; categoryId?: number; forceRefresh?: boolean }): Promise<IWpPost[]> {
    const { count = 10, categoryId, forceRefresh = false } = options;

    const cacheKey = CacheKeyManager.content.latestPosts(count, categoryId);

    if (forceRefresh) {
      const liveResponse = await this.getPosts({
        page: 1,
        perPage: count,
        categories: categoryId,
        forceRefresh: true,
      });

      const liveRows = Array.isArray(liveResponse?.data) ? liveResponse.data : [];

      try {
        await redisCache.set(cacheKey, liveRows, CacheKeyManager.ttl.LATEST_POSTS);
      } catch (cacheError) {
        logger.warn(`최신 포스트 캐시 저장 실패: ${cacheKey}`, cacheError);
      }

      logger.info(`최신 포스트 live 조회 완료: ${liveRows.length}개`);
      return liveRows;
    }

    if (!forceRefresh) {
      const cached = await redisCache.get<IWpPost[]>(cacheKey);
      if (cached) {
        logger.debug(`최신 포스트 캐시 히트: ${cacheKey}`);
        return cached;
      }
    }

    try {
      const models = await this.initialize();

      // 단순하게 만료 조건 없이 조회
      const filter: MongoQuery = {};
      if (categoryId) {
        filter.categories = categoryId;
      }

      const latestPosts = await models.PostCache.find(filter, this.getProjectionFields())
        .sort({ date: -1 })
        .limit(count)
        .lean();

      const formattedPosts = latestPosts.map((post) => ({
        ...post,
        id: post.id,
      })) as unknown as IWpPost[];

      await redisCache.set(cacheKey, formattedPosts, CacheKeyManager.ttl.LATEST_POSTS);

      logger.info(`최신 포스트 조회 완료: ${formattedPosts.length}개`);
      return formattedPosts;
    } catch (error) {
      logger.error("최신 포스트 조회 실패:", error);
      throw new Error("최신 포스트를 가져오는데 실패했습니다.");
    }
  }

  /**
   * 포스트 검색 (캐시 + WordPress API)
   */
  async searchPosts(options: {
    query: string;
    page?: number;
    perPage?: number;
    categoryId?: number;
    forceRefresh?: boolean;
  }): Promise<SearchPostsResult> {
    const { query, page = 1, perPage = 10, categoryId, forceRefresh = false } = options;

    // 엄격한 검색어 검증
    const trimmedQuery = query?.trim();
    if (!trimmedQuery || trimmedQuery.length < 2) {
      throw new Error("검색어는 최소 2글자 이상이어야 합니다.");
    }

    // 페이지네이션 검증
    if (page < 1 || perPage < 1 || perPage > 50) {
      throw new Error("잘못된 페이지네이션 파라미터입니다.");
    }

    const cacheKey = CacheKeyManager.content.searchPosts(query, page, perPage);

    if (!forceRefresh) {
      const cached = await redisCache.get<SearchPostsResult>(cacheKey);
      if (cached) {
        logger.debug(`검색 결과 캐시 히트: ${cacheKey}`);
        return cached;
      }
    }

    try {
      await this.initialize();
      let finalResults;

      if (forceRefresh) {
        logger.info(`WordPress API 강제 검색 시작: "${trimmedQuery}"`);
        finalResults = await this.searchFromWordPressAPI({
          query: trimmedQuery,
          page,
          perPage,
          categoryId,
          forceRefresh: true,
        });

        if (finalResults.posts.length > 0) {
          await this.cacheNewPosts(finalResults.posts);
        }
      } else {
        // 1단계: 캐싱된 데이터에서 검색
        const cachedResults = await this.searchInCachedData({
          query: trimmedQuery,
          page,
          perPage,
          categoryId,
        });

        logger.info(`캐싱된 데이터 검색 결과: ${cachedResults.posts.length}/${cachedResults.totalCount}개`);

        // 2단계: 캐싱된 결과가 부족하거나 0개일 때 즉시 WordPress API 호출
        finalResults = cachedResults;

        // 결과가 요청한 개수의 절반보다 적거나 0개일 때
        const shouldCallAPI = cachedResults.totalCount === 0 || cachedResults.posts.length < Math.ceil(perPage / 2);

        if (shouldCallAPI) {
          logger.info(`WordPress API에서 즉시 검색 시작 (캐시 결과: ${cachedResults.totalCount}개)`);

          try {
            const wpResults = await this.searchFromWordPressAPI({
              query: trimmedQuery,
              page,
              perPage,
              categoryId,
            });

            if (wpResults.posts.length > 0) {
              // 새로운 포스트들을 즉시 캐시에 저장
              await this.cacheNewPosts(wpResults.posts);

              // 캐싱된 결과가 없으면 API 결과만 사용, 있으면 병합
              if (cachedResults.totalCount === 0) {
                finalResults = wpResults;
              } else {
                // 병합: 캐싱된 결과 + API 결과
                const mergedPosts = this.deduplicatePosts([...cachedResults.posts, ...wpResults.posts]);
                finalResults = {
                  posts: mergedPosts.slice(0, perPage),
                  totalCount: Math.max(cachedResults.totalCount, wpResults.totalCount),
                  totalPages: Math.max(cachedResults.totalPages, wpResults.totalPages),
                };
              }

              logger.info(`하이브리드 검색 완료: 최종 ${finalResults.posts.length}개 결과 반환`);
            } else {
              logger.info("WordPress API에서도 검색 결과가 없음");
            }
          } catch (wpError) {
            logger.warn("WordPress API 검색 실패, 캐싱된 결과만 반환:", wpError);
          }
        }
      }

      // 검색어 저장 (백그라운드)
      this.saveSearchQuery(trimmedQuery, categoryId, finalResults.totalCount).catch((error) => {
        logger.warn("검색어 저장 실패:", error);
      });

      // Redis 캐시 저장 (짧은 TTL)
      const ttl = Math.min(CacheKeyManager.ttl.wp.dynamic.searchResults(finalResults.totalCount), 5 * 60); // 최대 5분
      try {
        await redisCache.set(cacheKey, finalResults, ttl);
      } catch (cacheError) {
        logger.warn(`Redis 검색 캐시 저장 실패: ${cacheKey}`, cacheError);
      }

      return finalResults;
    } catch (error) {
      logger.error("포스트 검색 실패:", error);
      throw error;
    }
  }

  /**
   * 포스트 배열에서 중복 제거 (ID 기준)
   */
  private deduplicatePosts(posts: IWpPost[]): IWpPost[] {
    const seen = new Set();
    return posts.filter((post) => {
      if (seen.has(post.id)) {
        return false;
      }
      seen.add(post.id);
      return true;
    });
  }

  // 검색어 저장
  private async saveSearchQuery(query: string, categoryId?: number, resultCount: number = 0): Promise<void> {
    try {
      const models = await this.initialize();

      await models.SearchQuery.findOneAndUpdate(
        {
          query: query.toLowerCase().trim(),
          ...(categoryId && { categoryId }),
        },
        {
          $inc: { searchCount: 1 },
          $set: {
            lastSearched: new Date(),
            resultCount,
          },
        },
        { upsert: true },
      );
    } catch (error) {
      logger.error("검색어 저장 실패:", error);
    }
  }

  // 검색어 자동완성
  async getSearchSuggestions(prefix: string, categoryId?: number, limit: number = 10): Promise<string[]> {
    try {
      const models = await this.initialize();

      const filter: MongoQuery = {
        query: { $regex: `^${prefix.toLowerCase().trim()}`, $options: "i" },
      };

      if (categoryId) {
        filter.categoryId = categoryId;
      }

      const suggestions = await models.SearchQuery.find(filter)
        .sort({ searchCount: -1, lastSearched: -1 })
        .limit(limit)
        .select("query")
        .lean();

      return suggestions.map((s: { query: string }) => s.query);
    } catch (error) {
      logger.error("검색어 자동완성 조회 실패:", error);
      return [];
    }
  }

  /**
   * 캐싱된 데이터에서 검색
   */
  private async searchInCachedData(options: {
    query: string;
    page: number;
    perPage: number;
    categoryId?: number;
  }): Promise<SearchPostsResult> {
    const { query, page, perPage, categoryId } = options;
    const models = await this.initialize();

    const hasTextIndex = await this.checkTextIndexExists();
    logger.log(`검색 실행: "${query}", 텍스트 인덱스: ${hasTextIndex ? "있음" : "없음"}`);

    let searchFilter: MongoQuery;
    let posts: IWpPost[];
    let totalCount: number;

    if (hasTextIndex) {
      // 텍스트 인덱스 검색 - expiresAt 조건 제거
      searchFilter = {
        $text: {
          $search: query,
          $caseSensitive: false,
          $diacriticSensitive: false,
        },
      };

      if (categoryId) {
        searchFilter.categories = categoryId;
      }

      totalCount = await models.PostCache.countDocuments(searchFilter);
      posts = (await models.PostCache.find(searchFilter, {
        ...this.getProjectionFields(),
        score: { $meta: "textScore" },
      })
        .sort({ score: { $meta: "textScore" }, date: -1 })
        .skip((page - 1) * perPage)
        .limit(perPage)
        .lean()) as unknown as IWpPost[];
    } else {
      // 정규식 검색 - expiresAt 조건 제거
      const cleanQuery = query.trim();
      const keywords = cleanQuery.split(/\s+/).filter((keyword) => keyword.length > 0);
      const regexOptions = "i";

      searchFilter = {
        $or: [
          { "title.rendered": { $regex: cleanQuery, $options: regexOptions } },
          { "excerpt.rendered": { $regex: cleanQuery, $options: regexOptions } },
          { slug: { $regex: cleanQuery, $options: regexOptions } },
          ...keywords.map((keyword) => ({
            $or: [
              { "title.rendered": { $regex: keyword, $options: regexOptions } },
              { "excerpt.rendered": { $regex: keyword, $options: regexOptions } },
            ],
          })),
        ],
      };

      // 카테고리 필터 추가
      if (categoryId) {
        searchFilter.categories = categoryId;
      }

      totalCount = await models.PostCache.countDocuments(searchFilter);
      posts = (await models.PostCache.find(searchFilter, this.getProjectionFields())
        .sort({ "title.rendered": 1, date: -1 })
        .skip((page - 1) * perPage)
        .limit(perPage)
        .lean()) as unknown as IWpPost[];
    }

    const cleanPosts = cleanMongoDocuments(posts) as IWpPost[];

    logger.log(`캐싱된 데이터 검색 완료: "${query}" - ${cleanPosts.length}/${totalCount}개`);

    return {
      posts: cleanPosts,
      totalCount,
      totalPages: Math.ceil(totalCount / perPage),
    };
  }

  /**
   * WordPress API에서 직접 검색
   */
  private async searchFromWordPressAPI(options: {
    query: string;
    page: number;
    perPage: number;
    categoryId?: number;
    forceRefresh?: boolean;
  }): Promise<SearchPostsResult> {
    const { query, page, perPage, categoryId, forceRefresh = false } = options;

    try {
      // WordPress API 검색 파라미터 구성
      const searchParams = {
        search: query,
        page,
        perPage,
        orderby: "relevance" as WpPostOrderbyType,
        forceRefresh,
        ...(categoryId && { categories: categoryId }),
      };

      logger.info(`WordPress API 검색 파라미터:`, searchParams);

      const wpResponse = await this.fetchPostsFromWordPressAPI(searchParams);

      if (!wpResponse?.data) {
        return { posts: [], totalCount: 0, totalPages: 0 };
      }

      logger.info(`WordPress API 검색 성공: "${query}" - ${wpResponse.data.length}/${wpResponse.totalPosts}개`);

      return {
        posts: wpResponse.data,
        totalCount: wpResponse.totalPosts,
        totalPages: wpResponse.totalPages,
      };
    } catch (error) {
      logger.error("WordPress API 검색 실패:", error);
      throw new Error("WordPress API 검색에 실패했습니다.");
    }
  }

  /**
   * 새로운 포스트들을 캐시에 저장
   */
  private async cacheNewPosts(posts: IWpPost[]): Promise<void> {
    if (!posts || posts.length === 0) return;

    try {
      const models = await this.initialize();

      const postDocs = posts.map((post) => {
        const imageFields = extractMarketingPostImageFields(post);
        return {
        id: post.id,
        date: post.date,
        modified: post.modified,
        slug: post.slug,
        link: post.link || "",
        title: post.title,
        content: post.content,
        excerpt: post.excerpt,
        author: post.author,
        categories: post.categories || [],
        tags: post.tags || [],
        acf: post.acf || {},
        guid: post.guid,
        featured_media_url: imageFields.imageUrl,
        featured_media_alt: imageFields.imageAlt,
        featured_media_source: imageFields.imageSource,
        genstudio_thumbnail_asset_id: imageFields.genStudioImageAssetId,
        yoast_head_json: post.yoast_head_json || {},
        cachedAt: new Date(),
        };
      });

      // 배치 처리로 포스트 저장 (upsert)
      const batchSize = 20; // 작은 배치로 처리
      for (let i = 0; i < postDocs.length; i += batchSize) {
        const batch = postDocs.slice(i, i + batchSize);
        const bulkOps = batch.map((doc) => ({
          updateOne: {
            filter: { id: doc.id },
            update: doc,
            upsert: true,
          },
        }));

        await models.PostCache.bulkWrite(bulkOps, { ordered: false });
      }

      logger.info(`새로운 포스트 ${postDocs.length}개 캐싱 완료`);
    } catch (error) {
      logger.error("새로운 포스트 캐싱 실패:", error);
      // 캐싱 실패해도 검색 결과는 반환하도록 에러를 던지지 않음
    }
  }

  private async fetchPostDetailFromWordPressAPI(options: {
    postId?: number;
    slug?: string;
    forceRefresh?: boolean;
    includeUnpublished?: boolean;
  }): Promise<IWpPost | null> {
    const { postId, slug, forceRefresh = false, includeUnpublished = false } = options;

    const params: RequestParams = {
      per_page: 1,
      _fields: WP_DETAIL_FIELDS,
      _embed: "wp:featuredmedia",
      status: includeUnpublished ? "publish,future,draft,pending,private" : "publish",
    };

    if (postId) {
      params.include = String(postId);
    } else if (slug) {
      params.slug = slug;
    }

    if (forceRefresh) {
      params._cb = Date.now();
    }

    const editHeaders = includeUnpublished ? await buildWpEditRequestHeaders() : null;
    if (includeUnpublished && !editHeaders) {
      logger.warn("WordPress 미발행 포스트 조회 인증 정보가 없어 공개 상태만 조회합니다.");
      params.status = "publish";
    } else if (editHeaders) {
      params.context = "edit";
    }

    const response = await fetchClient.get<IWpPost[]>(`${wpApiUri()}/posts`, {
      params,
      timeout: 15000,
      credentials: "omit",
      cache: forceRefresh ? "no-store" : undefined,
      headers: {
        ...(forceRefresh ? NO_CACHE_REQUEST_HEADERS : {}),
        ...(editHeaders || {}),
      },
    });

    const rows = Array.isArray(response.data) ? response.data : [];
    return rows.length > 0 ? withMarketingImageFields(rows[0]) : null;
  }

  /**
   * 텍스트 인덱스 존재 여부 확인
   */
  private async checkTextIndexExists(): Promise<boolean> {
    try {
      const models = await this.initialize();
      // 더 정확한 인덱스 목록 조회
      const indexesArray = await models.PostCache.collection.listIndexes().toArray();

      logger.log(
        "전체 인덱스 목록:",
        indexesArray.map((idx: MongoIndexInfo) => ({
          name: idx.name,
          key: idx.key,
          hasText: Object.values(idx.key || {}).includes("text"),
        })),
      );

      const hasTextIndex = indexesArray.some((index: MongoIndexInfo) => {
        const hasTextValue = Object.values(index.key || {}).includes("text");
        const isValidName =
          index.name &&
          (index.name.includes("text") ||
            index.name === "optimized_text_search_v2" ||
            index.name === "comprehensive_text_search_index");

        return hasTextValue && isValidName;
      });

      if (hasTextIndex) {
        logger.log("✅ 텍스트 인덱스 확인됨");

        // 인덱스 통계 확인 (선택적)
        try {
          const stats = toUnknownRecord(
            await (models.PostCache.collection as unknown as { stats: () => Promise<unknown> }).stats(),
          );
          logger.log("컬렉션 통계:", {
            documents: stats.count,
            totalIndexes: stats.nindexes,
            avgObjSize: Math.round(Number(stats.avgObjSize || 0)),
          });
        } catch {
          // 통계 조회 실패는 무시
        }
      } else {
        logger.warn("❌ 텍스트 인덱스가 존재하지 않음");
      }

      return hasTextIndex;
    } catch (error) {
      logger.error("인덱스 확인 실패:", error);
      return false;
    }
  }

  /**
   * 텍스트 인덱스 강제 생성
   */
  async ensureTextIndex(): Promise<boolean> {
    try {
      const models = await this.initialize();

      // 기존 텍스트 인덱스들 확인 및 정리
      const existingIndexes = await models.PostCache.collection.getIndexes();
      logger.log("기존 인덱스 목록:", Object.keys(existingIndexes));

      // 기존 텍스트 인덱스 삭제 (충돌 방지)
      for (const indexName of Object.keys(existingIndexes)) {
        if (indexName.includes("text") || indexName === "comprehensive_text_search_index") {
          try {
            await models.PostCache.collection.dropIndex(indexName);
            logger.log(`기존 텍스트 인덱스 삭제: ${indexName}`);
          } catch (error) {
            logger.warn(`인덱스 삭제 실패: ${indexName}`, error);
          }
        }
      }

      logger.log("개선된 텍스트 인덱스 생성 시작...");

      // MongoDB 4.4 최적화된 텍스트 인덱스 생성
      const indexResult = await models.PostCache.collection.createIndex(
        {
          "title.rendered": "text",
          "content.rendered": "text",
          "excerpt.rendered": "text",
          slug: "text",
        },
        {
          name: "optimized_text_search_v2",
          background: false, // 즉시 생성 (작은 데이터셋이므로)
          weights: {
            "title.rendered": 10, // 제목 최우선
            "excerpt.rendered": 5, // 요약 중간 우선순위
            "content.rendered": 1, // 내용 기본 우선순위
            slug: 3, // 슬러그 중간 우선순위
          },
          default_language: "none", // 언어 감지 비활성화 (다국어 지원)
          textIndexVersion: 3, // 최신 텍스트 인덱스 버전 사용
        },
      );

      logger.log("텍스트 인덱스 생성 완료:", indexResult);

      // 인덱스 생성 확인
      const verification = await this.checkTextIndexExists();
      if (verification) {
        logger.log("✅ 텍스트 인덱스 생성 및 확인 완료");
        return true;
      } else {
        logger.error("❌ 텍스트 인덱스 생성 실패 - 확인되지 않음");
        return false;
      }
    } catch (error: unknown) {
      const err = toUnknownRecord(error);
      logger.error("텍스트 인덱스 생성 실패:", {
        message: err.message,
        errorCode: err.errorCode,
      });

      // 특정 오류 타입별 처리
      if (err.errorCode === 85) {
        // IndexOptionsConflict
        logger.warn("인덱스 옵션 충돌 감지, 전체 재생성 시도");
        return this.forceRecreateTextIndex();
      }

      return false;
    }
  }

  /**
   * 텍스트 인덱스 강제 재생성
   */
  private async forceRecreateTextIndex(): Promise<boolean> {
    try {
      // 모든 인덱스 목록 가져오기
      const models = await this.initialize();
      const indexes = await models.PostCache.collection.listIndexes().toArray();

      // 텍스트 인덱스만 찾아서 삭제
      for (const index of indexes) {
        const hasTextIndex = Object.values(index.key || {}).includes("text");
        if (hasTextIndex && index.name !== "_id_") {
          await models.PostCache.collection.dropIndex(index.name);
          logger.log(`강제 삭제된 텍스트 인덱스: ${index.name}`);
        }
      }

      // 잠시 대기 후 재생성
      await new Promise((resolve) => setTimeout(resolve, 1000));

      return this.ensureTextIndex();
    } catch (error) {
      logger.error("텍스트 인덱스 강제 재생성 실패:", error);
      return false;
    }
  }

  /**
   * 포스트 상세 정보 가져오기
   */
  async getPostDetail(options: WpPostDetailOptions): Promise<IWpPost | null> {
    const { postId, slug, forceRefresh = false, includeUnpublished = false } = options;

    // 입력 값 검증
    if (!postId && !slug) {
      throw new Error("포스트 ID 또는 슬러그를 제공해주세요.");
    }

    if (postId && (!Number.isInteger(postId) || postId < 1)) {
      throw new Error("유효한 포스트 ID를 제공해주세요.");
    }

    if (slug && (typeof slug !== "string" || slug.trim().length === 0)) {
      throw new Error("유효한 슬러그를 제공해주세요.");
    }

    const cacheKey = postId ? CacheKeyManager.content.postDetail(postId) : CacheKeyManager.content.postBySlug(slug!);

    if (forceRefresh) {
      const livePost = await this.fetchPostDetailFromWordPressAPI({ postId, slug, forceRefresh: true, includeUnpublished });
      if (!livePost) {
        logger.warn(`WordPress live 상세 조회 결과 없음: ${postId ? `ID ${postId}` : `slug ${slug}`}`);
        return null;
      }

      if (isPublishedPost(livePost)) {
        await this.cacheNewPosts([livePost]);

        try {
          await redisCache.set(cacheKey, livePost, CacheKeyManager.ttl.POST_DETAIL);
        } catch (cacheError) {
          logger.warn(`Redis 포스트 상세 캐시 저장 실패: ${cacheKey}`, cacheError);
        }
      }

      logger.info(`WordPress live 상세 조회 완료: ${livePost.title?.rendered || "Unknown"}`);
      return livePost;
    }

    if (!forceRefresh) {
      const cached = await redisCache.get<IWpPost>(cacheKey);
      if (cached) {
        logger.debug(`포스트 상세 캐시 히트: ${cacheKey}`);
        return cached;
      }
    }

    try {
      const models = await this.initialize();
      const filter: MongoQuery = {};

      if (postId) {
        filter.id = postId;
      } else {
        filter.slug = slug;
      }

      logger.log("포스트 상세 조회 쿼리:", JSON.stringify(filter, null, 2));

      const post = await models.PostCache.findOne(filter).lean();

      if (!post) {
        logger.warn(`캐시에서 포스트를 찾지 못함, WordPress API fallback 시도: ${postId ? `ID ${postId}` : `slug ${slug}`}`);

        const livePost = await this.fetchPostDetailFromWordPressAPI({ postId, slug, includeUnpublished });
        if (!livePost) {
          logger.warn(`포스트를 찾을 수 없음: ${postId ? `ID ${postId}` : `slug ${slug}`}`);
          return null;
        }

        if (isPublishedPost(livePost)) {
          await this.cacheNewPosts([livePost]);

          try {
            await redisCache.set(cacheKey, livePost, CacheKeyManager.ttl.POST_DETAIL);
          } catch (cacheError) {
            logger.warn(`Redis 포스트 상세 캐시 저장 실패: ${cacheKey}`, cacheError);
          }
        }

        logger.info(`WordPress live fallback 상세 조회 완료: ${livePost.title?.rendered || "Unknown"}`);
        return livePost;
      }

      const cleanPost = cleanMongoDocument(post) as unknown as IWpPost;

      try {
        await redisCache.set(cacheKey, cleanPost, CacheKeyManager.ttl.POST_DETAIL);
      } catch (cacheError) {
        logger.warn(`Redis 포스트 상세 캐시 저장 실패: ${cacheKey}`, cacheError);
      }

      logger.info(`포스트 상세 조회 완료: ${cleanPost.title?.rendered || "Unknown"}`);
      return cleanPost;
    } catch (error) {
      logger.error("포스트 상세 조회 실패:", error);
      throw new Error("포스트 상세 정보를 가져오는데 실패했습니다.");
    }
  }

  /**
   * 포스트 캐시 무효화 (WP 저장 webhook 수신용)
   *
   * Redis 상세/슬러그 키를 삭제하고, Mongo `PostCache` 미러 문서를 삭제한다.
   * 재생성은 하지 않는다 — 다음 실제 조회 시 `getPostDetail`의 기본 분기가
   * 미러 miss를 감지해 WordPress authoritative fetch 후 캐시를 다시 적재한다.
   */
  async invalidatePostCache(input: { postId?: number; slug?: string; previousSlug?: string }): Promise<{
    ok: boolean;
    postId?: number;
    deleted: number;
  }> {
    const postId = Number(input.postId) > 0 ? Math.floor(Number(input.postId)) : undefined;
    const slug = toSafeString(input.slug) || undefined;
    const previousSlug = toSafeString(input.previousSlug) || undefined;

    if (!postId && !slug && !previousSlug) {
      logger.warn("포스트 캐시 무효화 스킵: postId/slug 모두 없음");
      return { ok: false, deleted: 0 };
    }

    try {
      const models = await this.initialize();

      // 1) Mongo PostCache 미러 문서 삭제 — id 또는 slug로 매칭되는 문서를 제거
      //    (슬러그 변경 시 이전 슬러그 문서가 잔존하지 않도록 previousSlug 포함)
      const mongoFilter: MongoQuery = {
        $or: [
          ...(postId ? [{ id: postId }] : []),
          ...(slug ? [{ slug }] : []),
          ...(previousSlug ? [{ slug: previousSlug }] : []),
        ],
      };
      const mongoResult = await models.PostCache.deleteMany(mongoFilter);

      // 2) Redis 키 삭제 — postId 상세 키 + 현재/이전 슬러그 키
      const redisKeys: string[] = [];
      if (postId) redisKeys.push(CacheKeyManager.content.postDetail(postId));
      for (const s of [slug, previousSlug]) {
        if (s) redisKeys.push(CacheKeyManager.content.postBySlug(s));
      }
      const redisDeleted = await redisCache.del(redisKeys);

      const deleted = (mongoResult?.deletedCount || 0) + redisDeleted;
      logger.info(
        `포스트 캐시 무효화 완료: postId=${postId ?? "-"} slug=${slug ?? "-"} previousSlug=${previousSlug ?? "-"} (mongo=${mongoResult?.deletedCount || 0}, redis=${redisDeleted})`,
      );
      return { ok: true, postId, deleted };
    } catch (error) {
      logger.error("포스트 캐시 무효화 실패:", error);
      return { ok: false, postId, deleted: 0 };
    }
  }

  /**
   * 프로젝션 필드 정의 (공통 사용)
   */
  private getProjectionFields() {
    return {
      id: 1,
      date: 1,
      modified: 1,
      slug: 1,
      link: 1,
      title: 1,
      content: 1,
      excerpt: 1,
      author: 1,
      categories: 1,
      tags: 1,
      acf: 1,
      guid: 1,
      featured_media_url: 1,
      featured_media_alt: 1,
      featured_media_source: 1,
      genstudio_thumbnail_asset_id: 1,
      yoast_head_json: 1,
      _id: 0, // MongoDB _id 제외
    };
  }
}

// 싱글톤 인스턴스 생성 및 내보내기
const wpCacheService = new WpCacheService();
export default wpCacheService;
