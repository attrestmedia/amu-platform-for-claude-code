import { NextRequest, NextResponse } from "next/server";
import { getModel } from "libs/database/modelCache";
import { PersonaSchema } from "models/universe";
import type { IPersonaDocument } from "models/universe";
import { logger } from "utils/log";
import { dbConnect } from "libs/database/mongoose";
import { removePersonasByPid } from "libs/database/universe";
import { getUniverseById } from "libs/database/universe";
import { withAuth } from "libs/server-utils/api/apiMiddleware";
import { getUserRole, canEditUniverse } from "libs/server-utils/auth/userRoleUtils";
import { USER_ROLES } from "consts/auth";
import { resolvePersonaBinaryGenderValue } from "consts/ai";
import { DEFAULT_FANTASY_UNIVERSE } from "consts/app";
import { MONGODB_PERSONA_URL } from "consts/env/server";
import { normalizePersonaVoiceProfileForGender } from "libs/server-utils/audio";
import { normalizeProfiles, normalizeSprite } from "libs/server-utils/api/apiSafetyHelper";
import { reserveExistingPid, generateGlobalPid } from "libs/server-utils/persona/pidRegistry";
import {
  getPersonaActorId,
  normalizePersonaEditPolicy,
  normalizePersonaForkPolicy,
  normalizePersonaStatus,
  normalizePersonaVisibility,
} from "libs/server-utils/persona/personaPolicy";
import type { AuthenticatedUserType } from "libs/server-utils/api/_helpers";
import { toUnknownRecord, type UnknownRecord } from "utils/common";
import { isControllablePersona } from "utils/game";
import type { PipelineStage } from "mongoose";

/**
 * @docHint
 * @purpose API 라우트(universe / persona) 기능 요청 처리
 * @process 요청 요청 파싱  인증/권한 검증  핵심 처리  JSON 응답 반환
 * @domain persona
 * @scope universe
 */

export const runtime = "nodejs";

// 전역 PID 레지스트리 설정
const PID_REGISTRY_COLLECTION = "persona_pid_registry";
const PERSONA_LIMIT = 200;

// DB 도큐먼트를 클라이언트 응답 형태로 변환
function toClientPersona(doc: IPersonaDocument | UnknownRecord | null | undefined): UnknownRecord | null {
  if (!doc) return null;

  const base: UnknownRecord = {
    _id: doc._id ? String(doc._id) : undefined,
    pid: doc.pid,
    personaType: doc.personaType,
    name: doc.name,
    age: doc.age,
    appearance: doc.appearance,
    background: doc.background,
    personality: doc.personality,
    speechStyle: doc.speechStyle,
    summary: doc.summary,
    universeId: doc.universeId,
    systemPersonaKey: doc.systemPersonaKey,
    ownerId: doc.ownerId ?? "",
    instanceOwnerId: doc.instanceOwnerId ?? "",
    visibility: doc.visibility ?? "private",
    editPolicy: doc.editPolicy ?? "owner-only",
    forkPolicy: doc.forkPolicy ?? "fork-on-use",
    status: doc.status ?? "active",
    version: typeof doc.version === "number" ? doc.version : 1,
    isTemplate: !!doc.isTemplate,
    sourcePersonaId: doc.sourcePersonaId ?? "",
    sourceVersion: typeof doc.sourceVersion === "number" ? doc.sourceVersion : undefined,
    sourceOwnerId: doc.sourceOwnerId ?? "",
    derivedFromSystemPersonaKey: doc.derivedFromSystemPersonaKey ?? "",
    lastSyncedAt: doc.lastSyncedAt ?? "",
    credits: doc.credits ?? null,
    voiceProfile: doc.voiceProfile ?? null,

    profiles: normalizeProfiles(doc.profiles),
    sprite: normalizeSprite(doc.sprite),
  };

  if (doc.personaType === "human") {
    base.gender = doc.gender;
    base.nationality = doc.nationality;
    base.job = doc.job;
    base.values = doc.values;
    base.preferences = doc.preferences;
    base.language = doc.language;
  } else if (doc.personaType === "monster") {
    base.gender = doc.gender;
    base.species = doc.species;
    base.habitat = doc.habitat;
    base.threatLevel = doc.threatLevel;
    base.specialAbilities = doc.specialAbilities;
    base.artifact = doc.artifact;
  }

  return base;
}

// GET: 페르소나 조회
async function handleGET(_data: unknown, user: AuthenticatedUserType, request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const collectionName = searchParams.get("collectionName");
  const action = searchParams.get("action");
  const letter = searchParams.get("letter");
  const all = searchParams.get("all") === "true";
  const pids = searchParams.get("pids");

  const cn = String(collectionName).trim();
  logger.log("[API] persona 요청 파라미터:", { cn, action, letter, all, pids });

  // 0) 컬렉션 목록 반환: collectionName 없을 때: 관리자만 허용
  if (!collectionName) {
    const roles = getUserRole(user);
    const isAdmin = roles.includes(USER_ROLES.ADMINISTRATOR);
    if (!isAdmin) {
      return NextResponse.json({ error: "관리자 권한이 필요합니다" }, { status: 403 });
    }

    try {
      const connection = await dbConnect(MONGODB_PERSONA_URL);
      if (!connection.db) throw new Error("데이터베이스 연결이 완료되지 않았습니다.");

      const collections = await connection.db.listCollections().toArray();
      const collectionNames = collections
        .map((col) => col.name)
        .filter((name) => !name.startsWith("system.") && name !== PID_REGISTRY_COLLECTION)
        .sort();

      logger.log("[API] 사용 가능한 컬렉션 목록:", collectionNames);
      return NextResponse.json(collectionNames);
    } catch (error) {
      logger.error("[API] 컬렉션 목록 조회 오류:", error);
      const fallbackCollections = [DEFAULT_FANTASY_UNIVERSE];
      return NextResponse.json(fallbackCollections);
    }
  } else {
    if (cn.startsWith("system.") || cn === PID_REGISTRY_COLLECTION) {
      return NextResponse.json({ error: "허용되지 않은 collectionName 입니다." }, { status: 403 });
    }

    const universe = await getUniverseById(cn);
    if (!universe) return NextResponse.json({ error: "유니버스를 찾을 수 없습니다." }, { status: 404 });

    if (!canEditUniverse(user, universe)) {
      return NextResponse.json({ error: "해당 유니버스에 대한 조회 권한이 없습니다." }, { status: 403 });
    }
  }

  // 1) Mongo 연결 및 모델 생성
  const PersonaModel = await getModel<IPersonaDocument>(MONGODB_PERSONA_URL, cn, PersonaSchema, cn);

  logger.log("[API] PersonaModel 생성 완료");

  // 2) action === "pids" : pid 목록만 페이징 조회
  if (action === "pids") {
    const limit = Math.min(parseInt(searchParams.get("limit") || "10", 10), 100);
    const after = (searchParams.get("after") || "").trim();

    const filter: Record<string, unknown> = {};
    if (after) filter.pid = { $gt: after };

    const docs = await PersonaModel.find(filter).sort({ pid: 1 }).limit(limit).select({ pid: 1, _id: 0 }).lean();

    const items = docs.map((d) => d.pid);
    const nextCursor = docs.length === limit ? items[items.length - 1] : null;

    return NextResponse.json({ items, nextCursor });
  }

  // 3) action === "selectable" : 카드 선택용 최소 데이터 + 랜덤 샘플
  if (action === "selectable") {
    const limit = Math.min(parseInt(searchParams.get("limit") || "10", 10), 50);
    const ownedPids = (searchParams.get("ownedPids") || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, PERSONA_LIMIT);
    const excludePids = (searchParams.get("excludePids") || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, PERSONA_LIMIT);

    // 3-1) 보유 캐릭터 우선
    const controllableMatch = {
      status: { $ne: "disabled" },
      "sprite.url": { $type: "string", $ne: "" },
      "sprite.directionCount": 8,
    };
    const ownedDocs = ownedPids.length
      ? await PersonaModel.find({ pid: { $in: ownedPids }, ...controllableMatch })
          .select({
            pid: 1,
            personaType: 1,
            name: 1,
            job: 1,
            sprite: 1,
            summary: 1,
            gender: 1,
            nationality: 1,
            language: 1,
          })
          .lean()
      : [];

    if (ownedDocs.length) {
      const orderMap = new Map(ownedPids.map((pid, i) => [pid, i]));
      ownedDocs.sort((a, b) => (orderMap.get(String(a.pid)) ?? 0) - (orderMap.get(String(b.pid)) ?? 0));
    }

    // 3-2) 랜덤 보충
    const need = Math.max(0, limit - ownedDocs.length);
    const excludeSet = new Set([...ownedPids, ...excludePids]);

    const pipeline: PipelineStage[] = [{ $match: controllableMatch }];
    if (excludeSet.size) {
      pipeline.push({ $match: { pid: { $nin: Array.from(excludeSet) } } });
    }
    if (need > 0) {
      pipeline.push({ $sample: { size: need } });
      pipeline.push({
        $project: {
          pid: 1,
          personaType: 1,
          name: 1,
          job: 1,
          profiles: 1,
          sprite: 1,
          summary: 1,
          gender: 1,
          nationality: 1,
          language: 1,
        },
      });
    }

    const sampledDocs = need > 0 ? await PersonaModel.aggregate(pipeline) : [];
    const merged = [...ownedDocs, ...sampledDocs].slice(0, limit);

    const transformed = merged
      .map((doc) => toClientPersona(doc as UnknownRecord))
      .filter((persona) => isControllablePersona(persona));
    return NextResponse.json(transformed);
  }

  // 4) 특정 PID들만 조회
  if (pids) {
    const pidArray = pids
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, PERSONA_LIMIT); // 상한 설정

    if (!pidArray.length) return NextResponse.json([]);
    const personas = await PersonaModel.find({ pid: { $in: pidArray } }).lean();
    logger.log(`[API] PID 필터링 결과: ${personas.length}개 발견`);

    const transformed = personas.map((p) => toClientPersona(p));
    return NextResponse.json(transformed);
  }

  // 5) 알파벳별 그룹화
  const personaSelectSchema = {
    pid: 1,
    personaType: 1,
    name: 1,
    job: 1,
    profiles: 1,
    sprite: 1,
    summary: 1,
  };

  if (action === "letters") {
    const personas = await PersonaModel.find({})
      .select(personaSelectSchema)
      .limit(all ? 0 : 50)
      .lean();
    logger.log(`[API] 알파벳 그룹화: ${personas.length}개 페르소나 발견`);

    const groupedByLetter: { [letter: string]: UnknownRecord[] } = {};

    personas.forEach((p) => {
      const transformed = toClientPersona(p as UnknownRecord);
      const name = typeof transformed?.name === "string" ? transformed.name : "";
      if (!transformed || !name) return;
      const firstLetter = name.charAt(0).toUpperCase();
      if (!groupedByLetter[firstLetter]) groupedByLetter[firstLetter] = [];
      groupedByLetter[firstLetter].push(transformed);
    });

    return NextResponse.json(groupedByLetter);
  }

  // 6) 특정 문자로 시작하는 페르소나들
  if (letter) {
    const personas = await PersonaModel.find({})
      .select(personaSelectSchema)
      .limit(all ? 0 : 50)
      .lean();
    logger.log(`[API] 문자 필터링 전: ${personas.length}개 페르소나`);

    const filtered = personas
      .map((p) => toClientPersona(p as UnknownRecord))
      .filter((p) => typeof p?.name === "string" && p.name.charAt(0).toUpperCase() === letter.toUpperCase());

    logger.log(`[API] 문자 '${letter}' 필터링 후: ${filtered.length}개 페르소나`);
    return NextResponse.json(filtered);
  }

  // 7) 기본: 전체 또는 일부 목록
  let query = PersonaModel.find({});
  if (!all) query = query.limit(50);

  const personas = await query.lean();
  logger.log(`[API] 최종 조회 결과: ${personas.length}개 페르소나 발견`);

  const transformed = personas
    .map((p) => {
      const record = p as UnknownRecord;
      try {
        return toClientPersona(record);
      } catch (e) {
        logger.error("[API] toClientPersona 변환 오류:", e, record?.pid);
        return null;
      }
    })
    .filter(Boolean);

  logger.log(`[API] 변환 완료: ${transformed.length}개 페르소나`);
  return NextResponse.json(transformed);
}
export const GET = withAuth(handleGET, undefined, "universe/persona:get");

// POST: 페르소나 저장/업데이트
async function handlePOST(body: unknown, _user: unknown, _request: NextRequest) {
  const bodyRecord = toUnknownRecord(body);
  const collectionName = bodyRecord.collectionName;
  const data = toUnknownRecord(bodyRecord.data);
  const cn = String(collectionName ?? "").trim();

  if (!cn || !data || !Object.keys(data).length) {
    return NextResponse.json({ error: "컬렉션명과 데이터가 필요합니다." }, { status: 400 });
  }

  const PersonaModel = await getModel<IPersonaDocument>(MONGODB_PERSONA_URL, cn, PersonaSchema, cn);

  const personaType = String(data.personaType || "").trim() as "human" | "monster";
  const name = String(data.name || "").trim();
  const universeId = String(cn);

  if (data.universeId && String(data.universeId) !== universeId) {
    return NextResponse.json({ error: "universeId는 collectionName과 일치해야 합니다." }, { status: 400 });
  }

  let pid = typeof data.pid === "string" ? data.pid.trim() : "";
  if (!personaType || !name) {
    return NextResponse.json({ error: "personaType, name은 필수입니다." }, { status: 400 });
  }

  // 생성 제한 체크
  const isNewPersona = !pid; // pid가 없으면 신규 생성

  if (isNewPersona) {
    try {
      // 1) 유니버스 정보 조회
      const universe = await getUniverseById(universeId);
      const limits = toUnknownRecord(universe).personaLimits as
        | { maxTotal?: number; dailyCreateLimit?: number }
        | undefined;

      // 커머스 유니버스 + personaLimits가 있을 때만 적용
      if (universe?.type === "commerce" && limits) {
        // 2) 전체 개수 제한
        if (typeof limits.maxTotal === "number" && limits.maxTotal >= 0) {
          const totalCount = await PersonaModel.countDocuments({});
          if (totalCount >= limits.maxTotal) {
            return NextResponse.json(
              {
                error: `이 커머스 유니버스에서 생성 가능한 페르소나 수(${limits.maxTotal}명)를 초과했습니다.`,
                errorCode: "PERSONA_LIMIT_TOTAL",
              },
              { status: 403 },
            );
          }
        }

        // 3) 일일 생성 제한
        if (typeof limits.dailyCreateLimit === "number" && limits.dailyCreateLimit > 0) {
          const startOfDay = new Date();
          startOfDay.setHours(0, 0, 0, 0);

          const todayCount = await PersonaModel.countDocuments({
            createdAt: { $gte: startOfDay },
          });

          if (todayCount >= limits.dailyCreateLimit) {
            return NextResponse.json(
              {
                error: `오늘 생성 가능한 페르소나 수(${limits.dailyCreateLimit}명)에 도달했습니다. 내일 다시 시도해 주세요.`,
                errorCode: "PERSONA_LIMIT_DAILY",
              },
              { status: 429 },
            );
          }
        }
      }
    } catch (err) {
      logger.error("[API] 페르소나 생성 제한 조회 오류:", err); // 실패해도 생성 자체를 막지는 않음
    }
  }

  // PID 자동 생성/전역 유니크 검증
  try {
    if (!pid) {
      // 새 캐릭터: pid 자동 발급
      pid = await generateGlobalPid(universeId, cn, name);
    } else {
      // 기존/직접 입력 pid: 전역 레지스트리에 등록 & 충돌 검사
      await reserveExistingPid(pid, universeId, cn);
    }
  } catch (err) {
    if (err instanceof Error && err.message === "PID_CONFLICT") {
      return NextResponse.json(
        {
          error: "이미 다른 유니버스에서 사용 중인 PID입니다. 다른 PID를 사용해주세요.",
          errorCode: "PID_CONFLICT",
        },
        { status: 409 },
      );
    }

    logger.error("[API] PID 생성/검증 오류:", err);
    return NextResponse.json(
      {
        error: "전역 PID를 생성/검증하는 중 오류가 발생했습니다.",
        errorCode: "PID_ERROR",
      },
      { status: 500 },
    );
  }

  const existing = await PersonaModel.findOne({ pid }).lean();
  const hasVoiceProfileField = data && typeof data === "object" && Object.prototype.hasOwnProperty.call(data, "voiceProfile");
  const pickString = (value: unknown) => (value == null ? "" : String(value).trim());
  const pickOptionalString = (value: unknown): string | undefined =>
    typeof value === "string" && value ? value : undefined;

  // 공통 필드 정규화
  const payload: Partial<IPersonaDocument> = {
    pid,
    personaType,
    name,
    age: pickString(data.age),
    appearance: pickString(data.appearance),
    background: pickString(data.background),
    personality: pickString(data.personality),
    speechStyle: pickString(data.speechStyle).slice(0, 800),
    summary: pickString(data.summary),
    universeId,
    systemPersonaKey: pickOptionalString(data.systemPersonaKey),
    ownerId: existing?.ownerId || getPersonaActorId(_user),
    instanceOwnerId: existing?.instanceOwnerId || "",
    visibility: normalizePersonaVisibility(data.visibility, existing?.visibility || "public"),
    editPolicy: normalizePersonaEditPolicy(data.editPolicy, existing?.editPolicy || "owner-only"),
    forkPolicy: normalizePersonaForkPolicy(data.forkPolicy, existing?.forkPolicy || "fork-on-use"),
    status: normalizePersonaStatus(data.status, existing?.status || "active"),
    version: existing ? Number(existing.version || 1) + 1 : Number(data.version || 1),
    isTemplate: typeof data.isTemplate === "boolean" ? data.isTemplate : !!existing?.isTemplate,
    sourcePersonaId: pickOptionalString(data.sourcePersonaId) || existing?.sourcePersonaId || undefined,
    sourceVersion:
      typeof data.sourceVersion === "number"
        ? data.sourceVersion
        : typeof existing?.sourceVersion === "number"
          ? existing.sourceVersion
          : undefined,
    sourceOwnerId: pickOptionalString(data.sourceOwnerId) || existing?.sourceOwnerId || undefined,
    derivedFromSystemPersonaKey:
      pickOptionalString(data.derivedFromSystemPersonaKey) || existing?.derivedFromSystemPersonaKey || undefined,
    lastSyncedAt: pickOptionalString(data.lastSyncedAt) || existing?.lastSyncedAt || undefined,
    credits: (data.credits as Partial<IPersonaDocument>["credits"]) || existing?.credits || undefined,
    voiceProfile: hasVoiceProfileField
      ? normalizePersonaVoiceProfileForGender(data.voiceProfile, data.gender) || undefined
      : existing?.voiceProfile || undefined,
    profiles: normalizeProfiles(data.profiles),
    sprite: normalizeSprite(data.sprite),
  };

  if (personaType === "human") {
    payload.gender = resolvePersonaBinaryGenderValue(data.gender);
    payload.nationality = pickString(data.nationality);
    payload.job = pickString(data.job);
    payload.language = pickString(data.language);
    payload.values = pickString(data.values);
    payload.preferences = pickString(data.preferences);
  } else if (personaType === "monster") {
    payload.gender = resolvePersonaBinaryGenderValue(data.gender);
    payload.species = pickString(data.species);
    payload.habitat = pickString(data.habitat);
    payload.threatLevel = pickString(data.threatLevel);
    payload.specialAbilities = pickString(data.specialAbilities);
    payload.artifact = pickString(data.artifact);
  }

  // upsert by pid (컬렉션 내에서는 여전히 pid 유니크)
  let result: UnknownRecord | null;

  if (existing) {
    result = await PersonaModel.findOneAndUpdate({ pid }, { $set: payload }, { new: true }).lean();
  } else {
    const created = await PersonaModel.create(payload as IPersonaDocument);
    result = created.toObject() as unknown as UnknownRecord;
  }

  const client = toClientPersona(result);
  return NextResponse.json({ success: true, data: client });
}
export const POST = withAuth(handlePOST, undefined, "universe/persona:write", {
  bodyParser: "json",
  checkUniversePermission: {
    universeIdParam: "collectionName", // query의 collectionName을 universeId로 간주
    requireEdit: true, // 편집 권한 필요
  },
});

// DELETE: 페르소나 삭제 (+ 연결된 system persona 정리)
async function handleDELETE(_data: unknown, _user: unknown, request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const collectionName = searchParams.get("collectionName");
  const pid = searchParams.get("pid");
  const cn = String(collectionName).trim();

  if (!cn || !pid) {
    return NextResponse.json({ success: false, error: "collectionName과 pid는 필수입니다." }, { status: 400 });
  }

  const PersonaModel = await getModel<IPersonaDocument>(MONGODB_PERSONA_URL, cn, PersonaSchema, cn);

  // 1) 페르소나 도큐먼트 삭제
  const doc = await PersonaModel.findOneAndDelete({ pid }).lean();

  if (!doc) {
    return NextResponse.json({ success: false, error: "not_found" }, { status: 404 });
  }

  // 2) 연결된 system_personas 정리 (personaPid 기준)
  try {
    await removePersonasByPid(pid);
  } catch (err) {
    logger.error("[API] 연결된 시스템 페르소나 삭제 중 오류:", err);
    // **실패해도 페르소나 삭제 자체는 성공 처리**
  }

  return NextResponse.json({ success: true });
}

export const DELETE = withAuth(handleDELETE, undefined, "universe/persona:delete", {
  bodyParser: "none",
  checkUniversePermission: {
    universeIdParam: "collectionName",
    requireEdit: true,
  },
});
