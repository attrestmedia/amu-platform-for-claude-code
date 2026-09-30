import { NextRequest, NextResponse } from "next/server";
import { getModel } from "libs/database/modelCache";
import { UserSchema, PersonasSchema } from "models/user";
import type { IUserDocument, IPersonasDocument } from "models/user";
import {
  MONGODB_USER_MODEL_PREFIX,
  MONGODB_PERSONAS_MODEL_PREFIX,
  MONGODB_USER_PERSONAS_MODEL_PREFIX,
} from "consts/db";
import { logger } from "utils/log";
import { redisCache } from "libs/cache/redisCacheService";
import CacheKeyManager from "libs/cache/cacheKeyManager";
import type { IPersonaItem } from "types/ai";
import { withApiTimeout } from "libs/server-utils/api/withApiTimeout";
import { syncUserMetaOnProfileUpdate } from "libs/server-utils/auth/accountLinker";
import { withAuth } from "libs/server-utils/api/apiMiddleware";
import { USER_ROLES, type UserRoles } from "consts/auth/userRoles";
import { coerceUserRoles } from "libs/server-utils/auth/roleCoercion";
import { MONGODB_USERS_URL } from "consts/env/server";
import { toErrorMessage, toUnknownRecord, type UnknownRecord } from "utils/common";
import { safeSeg } from "libs/server-utils/file/fileUploadHandler";
import { isOwnedUploadedMediaUrl } from "libs/server-utils/file/uploadedMediaStorage";

/**
 * @docHint
 * @purpose API 라우트(user) 기능 요청 처리
 * @process 요청 요청 파싱  인증/권한 검증  핵심 처리  JSON 응답 반환
 * @domain user
 * @scope global
 */

const toUserRoles = (input: unknown): UserRoles[] => coerceUserRoles(input, []);

const SERVER_AUTHORITATIVE_PERSONA_FIELDS = new Set([
  "level",
  "xp",
  "hp",
  "mp",
  "iq",
  "eq",
  "luck",
  "mood",
  "intimacy",
  "totalInteractions",
  "lastInteraction",
]);

function containsServerAuthoritativePersonaField(input: unknown) {
  if (!input || typeof input !== "object") return false;
  for (const value of Object.values(input as Record<string, unknown>)) {
    if (!Array.isArray(value)) continue;
    for (const item of value) {
      if (!item || typeof item !== "object") continue;
      if (Object.keys(item as Record<string, unknown>).some((key) => SERVER_AUTHORITATIVE_PERSONA_FIELDS.has(key))) {
        return true;
      }
    }
  }
  return false;
}

async function normalizeOwnedProfileImageUrl(raw: unknown, authUser: unknown) {
  const value = typeof raw === "string" ? raw.trim() : "";
  if (!value) return "";
  if (value.length > 1000) return null;

  const authRecord = toUnknownRecord(authUser);
  const userKey = safeSeg(String(authRecord.ID || authRecord.uid || ""));
  if (!userKey) return null;

  const legacyPrefix = `/uploads/user/${encodeURIComponent(userKey)}/profile/avatar/`;
  if (value.startsWith(legacyPrefix)) return value;
  const ownerId = String(authRecord.ID || authRecord.uid || "");
  return (await isOwnedUploadedMediaUrl({ url: value, scope: "user", ownerId, kind: "profile" })) ? value : null;
}

// POST: 사용자가 로그인 시 또는 데이터 업데이트 요청 시 호출
// - withAuth 적용: 로그인 필수 / 기본은 "본인 uid"만 수정 가능 / 관리자(administrator)만 다른 uid 및 roles 수정 가능
export const POST = withAuth(
  async (parsedBody, user, request?: NextRequest) => {
    return withApiTimeout(async () => {
      if (!request) {
        logger.error("[USER API][POST] NextRequest 객체가 전달되지 않았습니다.");
        return NextResponse.json({ error: "내부 서버 오류가 발생했습니다. (request 누락)" }, { status: 500 });
      }

      try {
        // withAuth가 파싱해준 body 사용
        type UserUpdateBody = {
          uid?: string;
          userEmail?: string;
          loginStats?: {
            firstLogin?: Date | string;
            lastLogin?: Date | string;
            totalLogins?: number;
            lastIp?: string;
            lastUserAgent?: string;
            lastDevice?: string;
            consecutiveDays?: number;
            lastLoginDate?: Date | string;
            recentLoginDates?: Array<Date | string>;
          };
          userInfo?: {
            name?: string;
            age?: number;
            birthdate?: string;
            gender?: string;
            interests?: string;
            language?: "ko" | "en";
            profileImageUrl?: string;
          };
          selectedPersonas?: UnknownRecord;
          personas?: Record<string, IPersonaItem[]>;
          userPersonas?: Record<string, IPersonaItem[]>;
          inventory?: { coins?: number; diamonds?: number; items?: Array<{ itemId: string; quantity: number }> };
          gameStats?: Record<string, UnknownRecord>;
          accountType?: unknown;
          npcStats?: { totalInteractions?: number; uniqueNpcsInteracted?: number; lastInteractedNpcId?: string };
          update?: boolean;
          lastAccessedUniverse?: string;
          roles?: unknown;
        };
        const body = (toUnknownRecord(parsedBody) as UserUpdateBody) || ({} as UserUpdateBody);

        const {
          uid: requestUid,
          userEmail,
          loginStats,
          userInfo,
          selectedPersonas,
          personas,
          userPersonas,
          inventory,
          gameStats,
          accountType: _accountType,
          npcStats,
          update,
          lastAccessedUniverse,
          roles,
        } = body || {};

        const sessionUid = user?.uid as string | undefined;
        const currentUserRoles: UserRoles[] = Array.isArray(user?.roles) ? toUserRoles(user.roles) : [];

        if (!sessionUid) {
          return NextResponse.json({ error: "인증 정보가 없습니다." }, { status: 401 });
        }

        if (userInfo && Object.prototype.hasOwnProperty.call(userInfo, "profileImageUrl")) {
          const profileImageUrl = await normalizeOwnedProfileImageUrl(userInfo.profileImageUrl, user);
          if (profileImageUrl === null) {
            return NextResponse.json({ error: "유효하지 않은 프로필 이미지 경로입니다." }, { status: 400 });
          }
          userInfo.profileImageUrl = profileImageUrl;
        }

        const isAdmin = currentUserRoles.includes(USER_ROLES.ADMINISTRATOR);

        if (
          !isAdmin &&
          (containsServerAuthoritativePersonaField(personas) || containsServerAuthoritativePersonaField(userPersonas))
        ) {
          return NextResponse.json(
            {
              error: "페르소나 핵심 능력치와 진행 상태는 전용 서버 명령으로만 변경할 수 있습니다.",
              errorCode: "SERVER_AUTHORITATIVE_WRITE_REQUIRED",
            },
            { status: 422 },
          );
        }

        // self-only 기본, 관리자만 다른 uid 허용
        const uid: string = isAdmin && typeof requestUid === "string" && requestUid.trim() ? requestUid : sessionUid;

        if (!uid) {
          return NextResponse.json({ error: "uid를 확인할 수 없습니다." }, { status: 400 });
        }

        if (!isAdmin && requestUid && requestUid !== sessionUid) {
          logger.warn("[USER API] 비관리자가 다른 uid로 업데이트 시도", {
            sessionUid,
            requestUid,
          });
        }

        logger.log("[USER API] 받은 데이터:", { uid, roles, update });

        const modelName = `${MONGODB_USER_MODEL_PREFIX}${uid}`;
        const UserModel = await getModel<IUserDocument>(MONGODB_USERS_URL, modelName, UserSchema, modelName);

        // 기존 데이터 확인 (uid는 유니크하므로 단일 문서를 대상으로 함)
        const existingUser = await UserModel.findOne({ uid });

        if (existingUser) {
          // 업데이트 요청인 경우, 각 필드 업데이트
          if (update) {
            // userEmail / userEmailLower 업데이트 (제공된 경우)
            if (userEmail && existingUser.userEmail !== userEmail) {
              const lower = userEmail.toLowerCase();
              existingUser.userEmail = userEmail;
              (existingUser as unknown as { userEmailLower?: string }).userEmailLower = lower;
              existingUser.markModified("userEmail");
              existingUser.markModified("userEmailLower");
            }

            // loginStats 객체 업데이트
            if (loginStats) {
              const toDate = (value: Date | string | undefined) => (value ? new Date(value) : new Date());
              const toDateArray = (value: Array<Date | string> | undefined) =>
                Array.isArray(value) ? value.map((v) => new Date(v)) : [new Date()];
              if (!existingUser.loginStats) {
                existingUser.loginStats = {
                  firstLogin: toDate(loginStats.firstLogin),
                  lastLogin: toDate(loginStats.lastLogin),
                  totalLogins: loginStats.totalLogins || 1,
                  lastIp: loginStats.lastIp || "unknown",
                  lastUserAgent: loginStats.lastUserAgent || "",
                  lastDevice: loginStats.lastDevice || "unknown",
                  consecutiveDays: loginStats.consecutiveDays || 1,
                  lastLoginDate: toDate(loginStats.lastLoginDate),
                  recentLoginDates: toDateArray(loginStats.recentLoginDates),
                };
              } else {
                // 이미 존재하는 loginStats 객체에 새 값 병합
                const mergedLoginStats = { ...existingUser.loginStats };
                if (loginStats.firstLogin) mergedLoginStats.firstLogin = new Date(loginStats.firstLogin);
                if (loginStats.lastLogin) mergedLoginStats.lastLogin = new Date(loginStats.lastLogin);
                if (loginStats.lastLoginDate) mergedLoginStats.lastLoginDate = new Date(loginStats.lastLoginDate);
                if (loginStats.totalLogins !== undefined) mergedLoginStats.totalLogins = loginStats.totalLogins;
                if (loginStats.lastIp !== undefined) mergedLoginStats.lastIp = loginStats.lastIp;
                if (loginStats.lastUserAgent !== undefined) mergedLoginStats.lastUserAgent = loginStats.lastUserAgent;
                if (loginStats.lastDevice !== undefined) mergedLoginStats.lastDevice = loginStats.lastDevice;
                if (loginStats.consecutiveDays !== undefined) mergedLoginStats.consecutiveDays = loginStats.consecutiveDays;
                if (Array.isArray(loginStats.recentLoginDates)) {
                  mergedLoginStats.recentLoginDates = loginStats.recentLoginDates.map((v) => new Date(v));
                }
                existingUser.loginStats = mergedLoginStats;
              }
              existingUser.markModified("loginStats");
            }

            // userInfo 객체 업데이트
            if (userInfo) {
              if (!existingUser.userInfo) {
                // 기본값으로 초기화
                existingUser.userInfo = {
                  name: "",
                  age: 0,
                  birthdate: "",
                  gender: "",
                };
              }

              existingUser.userInfo = {
                ...existingUser.userInfo,
                ...userInfo,
              };

              existingUser.markModified("userInfo");
            }

            // 선택된 페르소나 정보 업데이트
            if (selectedPersonas) {
              const existingSelectedPersonas = toUnknownRecord(existingUser.selectedPersonas);
              const mutableUser = existingUser as unknown as { selectedPersonas: UnknownRecord };
              mutableUser.selectedPersonas = existingSelectedPersonas;

              // tutors 네임스페이스는 전용 API(/api/tutors/*)에서만 수정되도록 차단
              // - lock/5명 제한 우회 방지 / 관리자는 예외 허용
              const incoming: UnknownRecord = { ...(selectedPersonas || {}) };
              if (!isAdmin && incoming?.tutors !== undefined) {
                delete incoming.tutors;
              }

              Object.keys(incoming).forEach((universe) => {
                if (universe.startsWith("$")) return; // $로 시작하는 키는 방어적으로 무시
                if (universe.includes(".")) return; // mongo path injection 방어
                existingSelectedPersonas[universe] = incoming[universe];
              });

              existingUser.markModified("selectedPersonas");
            }

            // inventory 객체 업데이트 (현재는 self-update 허용)
            if (inventory) {
              if (!existingUser.inventory) {
                existingUser.inventory = {
                  coins: 0,
                  diamonds: 0,
                  items: [],
                };
              }

              if (inventory.coins !== undefined) {
                existingUser.inventory.coins = inventory.coins;
              }

              if (inventory.diamonds !== undefined) {
                existingUser.inventory.diamonds = inventory.diamonds;
              }

              if (inventory.items && Array.isArray(inventory.items)) {
                existingUser.inventory.items = inventory.items;
              }

              existingUser.markModified("inventory");
            }

            // npcStats 객체 업데이트
            if (npcStats) {
              if (!existingUser.npcStats) {
                existingUser.npcStats = {
                  totalInteractions: 0,
                  uniqueNpcsInteracted: 0,
                  lastInteractedNpcId: "",
                };
              }

              if (npcStats.totalInteractions !== undefined) {
                existingUser.npcStats.totalInteractions = npcStats.totalInteractions;
              }

              if (npcStats.uniqueNpcsInteracted !== undefined) {
                existingUser.npcStats.uniqueNpcsInteracted = npcStats.uniqueNpcsInteracted;
              }

              if (npcStats.lastInteractedNpcId !== undefined) {
                existingUser.npcStats.lastInteractedNpcId = npcStats.lastInteractedNpcId;
              }

              existingUser.markModified("npcStats");
            }

            // 마지막 접속 유니버스 업데이트
            if (lastAccessedUniverse !== undefined) {
              existingUser.lastAccessedUniverse = lastAccessedUniverse;
              existingUser.markModified("lastAccessedUniverse");
            }

            // roles 업데이트: 관리자만 직접 변경 가능
            if (roles !== undefined) {
              if (isAdmin) {
                const nextRoles = toUserRoles(roles);
                existingUser.roles = nextRoles;
                existingUser.markModified("roles");
              } else {
                logger.warn("[USER API] 일반 유저가 roles 변경 시도", {
                  uid,
                  roles,
                });
              }
            }

            // personas 객체 업데이트 - 각 유니버스별로 병합
            if (personas) {
              for (const [universe, personaList] of Object.entries(personas)) {
                if (universe.startsWith("$")) continue;

                const personaModelName = `${MONGODB_PERSONAS_MODEL_PREFIX}${uid}_${universe}`;
                const PersonasModel = await getModel<IPersonasDocument>(
                  MONGODB_USERS_URL,
                  personaModelName,
                  PersonasSchema,
                  personaModelName,
                );

                const existingDoc = await PersonasModel.findOne({ uid, universe });
                const existingPersonas = existingDoc?.personas || [];

                const mergedPersonas = [...existingPersonas];

                for (const newPersona of personaList as IPersonaItem[]) {
                  const existingIndex = mergedPersonas.findIndex(
                    (existing: IPersonaItem) => existing.pid === newPersona.pid,
                  );

                  if (existingIndex >= 0) {
                    mergedPersonas[existingIndex] = {
                      ...mergedPersonas[existingIndex],
                      ...newPersona,
                    };
                  } else {
                    mergedPersonas.push(newPersona);
                  }
                }

                await PersonasModel.findOneAndUpdate(
                  { uid, universe },
                  {
                    uid,
                    universe,
                    personas: mergedPersonas,
                  },
                  { upsert: true, new: true },
                );

                await redisCache.del(CacheKeyManager.userPersonas.personasByUniverse(uid, universe));
              }
            }

            // userPersonas 객체 업데이트 - 각 유니버스별로 병합
            if (userPersonas) {
              for (const [universe, personaList] of Object.entries(userPersonas)) {
                if (universe.startsWith("$")) continue;

                const userPersonaModelName = `${MONGODB_USER_PERSONAS_MODEL_PREFIX}${uid}_${universe}`;
                const UserPersonasModel = await getModel<IPersonasDocument>(
                  MONGODB_USERS_URL,
                  userPersonaModelName,
                  PersonasSchema,
                  userPersonaModelName,
                );

                const existingDoc = await UserPersonasModel.findOne({ uid, universe });
                const existingUserPersonas = existingDoc?.personas || [];

                const mergedUserPersonas = [...existingUserPersonas];

                for (const newPersona of personaList as IPersonaItem[]) {
                  const existingIndex = mergedUserPersonas.findIndex(
                    (existing: IPersonaItem) => existing.pid === newPersona.pid,
                  );

                  if (existingIndex >= 0) {
                    mergedUserPersonas[existingIndex] = {
                      ...mergedUserPersonas[existingIndex],
                      ...newPersona,
                    };
                  } else {
                    mergedUserPersonas.push(newPersona);
                  }
                }

                await UserPersonasModel.findOneAndUpdate(
                  { uid, universe },
                  {
                    uid,
                    universe,
                    personas: mergedUserPersonas,
                  },
                  { upsert: true, new: true },
                );

                await redisCache.del(CacheKeyManager.userPersonas.byUniverse(uid, universe));
              }
            }

            // gameStats 객체 업데이트 - 각 유니버스별로 병합
            if (gameStats) {
              const existingGameStats = existingUser.gameStats || {};
              existingUser.gameStats = existingGameStats;

              Object.keys(gameStats).forEach((universe) => {
                if (universe.startsWith("$")) return;

                existingGameStats[universe] = {
                  ...(existingGameStats[universe] || { level: 1, xp: 0, intimacy: 0 }),
                  ...gameStats[universe],
                };
              });

              existingUser.markModified("gameStats");
            }

            // 이메일/이름 변경 시 메타도 동기화
            const emailForMeta = userEmail || existingUser.userEmail;
            const nameForMeta = userInfo?.name !== undefined ? userInfo.name : existingUser.userInfo?.name;

            if (emailForMeta) {
              await syncUserMetaOnProfileUpdate({
                uid,
                email: emailForMeta,
                name: nameForMeta,
              });
            }

            try {
              await existingUser.save();
              logger.log("# MongoDB save 완료, 최종 상태:", existingUser.selectedPersonas);

              // accountType 제거 안내 로그
              if (_accountType !== undefined) {
                logger.warn("[USER API] accountType 필드는 결제/지갑 로직 전용으로 user API에서 제거됨");
              }

              return NextResponse.json(
                { message: "유저 데이터가 성공적으로 업데이트되었습니다.", user: existingUser },
                { status: 200 },
              );
            } catch (saveError) {
              logger.error("# MongoDB 저장 오류:", saveError);
              return NextResponse.json(
                { error: `데이터 저장 중 오류 발생: ${toErrorMessage(saveError)}` },
                { status: 500 },
              );
            }
          } else {
            return NextResponse.json(
              {
                warning: "이미 존재하는 유저 데이터입니다. 업데이트를 원하시면 'update' 프로퍼티를 true로 설정하세요.",
              },
              { status: 409 },
            );
          }
        } else {
          // 새 유저 데이터 생성
          if (!userEmail) {
            return NextResponse.json({ error: "새 유저 생성 시 userEmail은 필수입니다." }, { status: 400 });
          }

          const userEmailLower = userEmail.toLowerCase();

          // 초기 roles: 관리자면 body.roles를, 아니면 현재 사용자 roles 또는 [SUBSCRIBER]
          const initialRoles: UserRoles[] =
            isAdmin && roles !== undefined
              ? toUserRoles(roles)
              : currentUserRoles.length > 0
                ? currentUserRoles
                : [USER_ROLES.SUBSCRIBER];

          const newUser = new UserModel({
            uid,
            userEmail,
            userEmailLower,
            loginStats: loginStats || {},
            personas: personas || {},
            userPersonas: userPersonas || {},
            gameStats: gameStats || {},
            lastAccessedUniverse: lastAccessedUniverse || "",
            roles: initialRoles,
            userInfo: userInfo || {},
          });

          await newUser.save();

          await syncUserMetaOnProfileUpdate({
            uid,
            email: userEmail,
            name: userInfo?.name,
          });

          return NextResponse.json(
            { message: "유저 데이터가 성공적으로 생성되었습니다.", user: newUser },
            { status: 201 },
          );
        }
      } catch (error) {
        logger.error("유저 데이터 관리 중 오류 발생:", error);
        return NextResponse.json(
          { error: `유저 데이터 관리 중 오류가 발생했습니다: ${toErrorMessage(error)}` },
          { status: 500 },
        );
      }
    }, 20000);
  },
  // allowedRoles: undefined → "로그인만 되어 있으면" 통과
  undefined,
  "user_post",
);

/**
 * GET: uid 파라미터를 통해 해당 유저의 데이터를 조회
 * - 기본은 본인(uid)만 조회 가능
 * - 관리자(administrator)는 다른 uid도 조회 가능
 */
export const GET = withAuth(
  async (_data, user, request?: NextRequest) => {
    return withApiTimeout(async () => {
      if (!request) {
        logger.error("[USER API][GET] NextRequest 객체가 전달되지 않았습니다.");
        return NextResponse.json({ error: "내부 서버 오류가 발생했습니다. (request 누락)" }, { status: 500 });
      }

      try {
        const { searchParams } = new URL(request.url);
        const paramUid = searchParams.get("uid");
        const includePersonas = searchParams.get("includePersonas") === "true";

        const sessionUid = user?.uid as string | undefined;
        const currentUserRoles: UserRoles[] = Array.isArray(user?.roles) ? toUserRoles(user.roles) : [];
        const isAdmin = currentUserRoles.includes(USER_ROLES.ADMINISTRATOR);

        if (!sessionUid) {
          return NextResponse.json({ error: "인증 정보가 없습니다." }, { status: 401 });
        }

        const uid = paramUid || sessionUid;

        if (!uid) {
          return NextResponse.json({ error: "uid 파라미터는 필수입니다." }, { status: 400 });
        }

        if (!isAdmin && uid !== sessionUid) {
          logger.warn("[USER API] 비관리자가 다른 유저 데이터 조회 시도", {
            sessionUid,
            paramUid,
          });
          return NextResponse.json({ error: "다른 사용자의 데이터를 조회할 수 없습니다." }, { status: 403 });
        }

        const modelName = `${MONGODB_USER_MODEL_PREFIX}${uid}`;
        const UserModel = await getModel<IUserDocument>(MONGODB_USERS_URL, modelName, UserSchema, modelName);

        const userData = await UserModel.findOne({ uid });
        if (!userData) {
          return NextResponse.json({ error: "유저 데이터를 찾을 수 없습니다." }, { status: 404 });
        }

        const responseData = userData.toObject() as unknown as UnknownRecord;

        if (includePersonas) {
          responseData.personas = {};
          responseData.userPersonas = {};
        } else {
          delete responseData.personas;
          delete responseData.userPersonas;
        }

        return NextResponse.json({ user: responseData }, { status: 200 });
      } catch (error) {
        logger.error("유저 데이터 조회 중 오류 발생:", error);
        return NextResponse.json(
          { error: `유저 데이터 조회 중 오류가 발생했습니다: ${toErrorMessage(error)}` },
          { status: 500 },
        );
      }
    }, 20000);
  },
  undefined,
  "user_get",
);
