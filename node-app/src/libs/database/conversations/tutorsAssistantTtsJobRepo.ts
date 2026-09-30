import "server-only";
import { MONGODB_AI_URL } from "consts/env/server";
import { getModel } from "libs/database/modelCache";
import { getConversationMessageModel } from "./conversations";
import { normalizeMessageAudioMeta } from "libs/server-utils/chat/conversationMessageUtils";
import {
  TutorsAssistantTtsJobSchema,
  type ITutorsAssistantTtsJobDocument,
  type TutorsAssistantTtsJobStatusType,
} from "models/game/TutorsAssistantTtsJobSchema";
import {
  resolveTutorsAssistantTtsContentHash,
  type TutorsAssistantTtsJobRecord,
  type TutorsAssistantTtsJobStatus,
  type TutorsAssistantTtsMessageRef,
} from "libs/server-utils/tutors/assistantTtsJobContract";

/**
 * @docHint
 * @purpose EL-602 Tutors Assistant TTS job 저장소 + Assistant 메시지 소유권/revision CAS
 * @process create(upsert) → atomic lease claim → status transition → content CAS audioMeta attach
 * @domain tutors-tts
 * @scope db
 */

const JOB_COLLECTION = "tutors_assistant_tts_jobs";
const JOB_MODEL_NAME = "TutorsAssistantTtsJob";

async function getJobModel() {
  return await getModel<ITutorsAssistantTtsJobDocument>(
    MONGODB_AI_URL,
    JOB_MODEL_NAME,
    TutorsAssistantTtsJobSchema,
    JOB_COLLECTION,
  );
}

function toIsoDate(value: unknown) {
  const date = value instanceof Date ? value : new Date(String(value || ""));
  return Number.isNaN(date.getTime()) ? new Date(0) : date;
}

function toJobRecord(doc: ITutorsAssistantTtsJobDocument): TutorsAssistantTtsJobRecord {
  return {
    jobId: String(doc.jobId || ""),
    uid: String(doc.uid || ""),
    ownerUserId: String(doc.ownerUserId || doc.messageRef?.userId || ""),
    operationKey: String(doc.operationKey || ""),
    format: "mp3",
    status: String(doc.status || "queued") as TutorsAssistantTtsJobStatus,
    attempt: Number(doc.attempt || 0),
    lease: null,
    messageRef: {
      userId: String(doc.messageRef?.userId || ""),
      personaId: String(doc.messageRef?.personaId || ""),
      userPersonaId: doc.messageRef?.userPersonaId,
      universeId: doc.messageRef?.universeId,
      sessionId: String(doc.messageRef?.sessionId || ""),
      assistantClientId: String(doc.messageRef?.assistantClientId || ""),
    },
    contentHash: String(doc.contentHash || ""),
    voice: doc.voice
      ? {
          provider: "elevenlabs",
          voiceId: String(doc.voice.voiceId || ""),
          modelName: String(doc.voice.modelName || ""),
          locale: String(doc.voice.locale || ""),
          voiceRevision: String(doc.voice.voiceRevision || ""),
          voiceFingerprint: String(doc.voice.voiceFingerprint || ""),
        }
      : null,
    stageOperationId: String(doc.stageOperationId || ""),
    consentVersion: String(doc.consentVersion || ""),
    priceSnapshot: (doc.priceSnapshot as Record<string, unknown> | null) || null,
    providerRequestId: null,
    billingRef: null,
    expiresAt: toIsoDate(doc.expiresAt),
  };
}

/** KST 자정 기준 일 시작 시각. 일일 상한 카운트 구간에 사용한다. */
export function resolveTutorsAssistantTtsKstDayStart(now: Date = new Date()) {
  const shifted = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const dayStartShiftedMs = Math.floor(shifted.getTime() / 86_400_000) * 86_400_000;
  return new Date(dayStartShiftedMs - 9 * 60 * 60 * 1000);
}

export async function findTutorsAssistantTtsJobByOperationKey(
  operationKey: string,
): Promise<TutorsAssistantTtsJobRecord | null> {
  if (!operationKey) return null;
  const model = await getJobModel();
  const doc = await model.findOne({ operationKey }).lean<ITutorsAssistantTtsJobDocument | null>();
  return doc ? toJobRecord(doc) : null;
}

export async function findTutorsAssistantTtsJobById(jobId: string): Promise<TutorsAssistantTtsJobRecord | null> {
  if (!jobId) return null;
  const model = await getJobModel();
  const doc = await model.findOne({ jobId }).lean<ITutorsAssistantTtsJobDocument | null>();
  return doc ? toJobRecord(doc) : null;
}

export async function countTutorsAssistantTtsJobsForUidDay(args: { uid: string; now: Date }) {
  const uid = String(args.uid || "").trim();
  if (!uid) return 0;
  const model = await getJobModel();
  return await model.countDocuments({ uid, createdAt: { $gte: resolveTutorsAssistantTtsKstDayStart(args.now) } });
}

/**
 * job 생성. operationKey unique 제약으로 동일 uid·메시지 revision·voice 요청을 하나로 수렴시킨다.
 * duplicate key면 기존 job을 반환한다.
 */
export async function createTutorsAssistantTtsJobRecord(record: TutorsAssistantTtsJobRecord) {
  const model = await getJobModel();
  try {
    const created = await model.create({
      jobId: record.jobId,
      uid: record.uid,
      ownerUserId: record.ownerUserId || record.messageRef.userId,
      operationKey: record.operationKey || buildOperationKeyForRecord(record),
      status: record.status,
      attempt: record.attempt,
      lease: null,
      messageRef: record.messageRef,
      contentHash: record.contentHash,
      voice: record.voice,
      stageOperationId: record.stageOperationId,
      consentVersion: record.consentVersion,
      priceSnapshot: record.priceSnapshot,
      providerRequestId: null,
      billingRef: null,
      expiresAt: record.expiresAt,
    });
    return { created: true, job: toJobRecord(created) };
  } catch (error) {
    if ((error as { code?: number })?.code !== 11000) throw error;
    const existing = await model.findOne({ jobId: record.jobId }).lean<ITutorsAssistantTtsJobDocument | null>();
    if (!existing) throw error;
    return { created: false, job: toJobRecord(existing) };
  }
}

function buildOperationKeyForRecord(record: TutorsAssistantTtsJobRecord) {
  // jobId는 operationKey 해시에서 파생되며(순수 계약), 저장 시 결정적 키로 재구성한다.
  return [
    record.uid,
    record.messageRef.userId,
    record.messageRef.personaId,
    record.messageRef.sessionId,
    record.messageRef.assistantClientId,
    record.contentHash,
    record.voice?.voiceId || "",
    record.voice?.modelName || "",
    // H5: 하드코딩 대신 record의 실제 format을 사용한다.
    record.format || "mp3",
  ].join("|");
}

const TRANSITION_SOURCES: Record<TutorsAssistantTtsJobStatusType, readonly TutorsAssistantTtsJobStatusType[]> = {
  queued: [],
  running: ["queued"],
  succeeded: ["running"],
  failed: ["running", "queued"],
  cancelled: ["queued"],
  unknown_outcome: ["running"],
};

/** 원자적 lease claim. queued이고 lease가 없거나 만료된 job만 running으로 전이한다. */
export async function claimTutorsAssistantTtsJob(args: {
  jobId?: string;
  leaseMs: number;
  now: Date;
  token?: string;
}): Promise<TutorsAssistantTtsJobRecord | null> {
  const model = await getJobModel();
  const token = String(args.token || `${process.pid}-${args.now.getTime()}-${Math.random().toString(36).slice(2)}`);
  const leaseExpiresAt = new Date(args.now.getTime() + Math.max(1, args.leaseMs));
  const filter: Record<string, unknown> = {
    status: "queued",
    $or: [{ lease: null }, { "lease.expiresAt": { $lt: args.now } }],
  };
  if (args.jobId) filter.jobId = args.jobId;
  const doc = await model
    .findOneAndUpdate(
      filter,
      { $set: { status: "running", lease: { token, expiresAt: leaseExpiresAt } }, $inc: { attempt: 1 } },
      { new: true, sort: { createdAt: 1 } },
    )
    .lean<ITutorsAssistantTtsJobDocument | null>();
  return doc ? toJobRecord(doc) : null;
}

/**
 * worker kill/lease 상실 복구. running이고 lease가 없거나 만료된 job을 unknown_outcome으로 남긴다.
 * provider 호출이 시작됐을 수 있으므로 자동 재시도하지 않는다.
 */
export async function recoverStaleRunningTutorsAssistantTtsJobs(args: {
  now: Date;
  limit?: number;
}): Promise<number> {
  const model = await getJobModel();
  const result = await model.updateMany(
    {
      status: "running",
      $or: [{ lease: null }, { "lease.expiresAt": { $lt: args.now } }],
    },
    { $set: { status: "unknown_outcome", lease: null } },
  );
  return Number(result.modifiedCount || 0);
}

/** 상태 전이. 허용된 source 상태에서만 갱신한다(unknown_outcome 나가는 전이 없음). */
export async function markTutorsAssistantTtsJobStatus(args: {
  jobId: string;
  status: TutorsAssistantTtsJobStatusType;
  patch?: Record<string, unknown>;
}) {
  const sources = TRANSITION_SOURCES[args.status] || [];
  if (sources.length === 0) return { matched: 0 };
  const model = await getJobModel();
  const result = await model.updateOne(
    { jobId: args.jobId, status: { $in: sources } },
    { $set: { status: args.status, lease: null, ...(args.patch || {}) } },
  );
  return { matched: Number(result.matchedCount || 0) };
}

export type TutorsAssistantTtsMessageDoc = {
  _id: unknown;
  role?: unknown;
  content?: unknown;
  clientId?: unknown;
  personaId?: unknown;
  sessionId?: unknown;
  userId?: unknown;
  audioMeta?: Record<string, unknown>;
};

function buildMessageFilter(ref: TutorsAssistantTtsMessageRef) {
  const filter: Record<string, unknown> = {
    userId: ref.userId,
    personaId: ref.personaId,
    sessionId: ref.sessionId,
    clientId: ref.assistantClientId,
    role: "assistant",
  };
  if (ref.userPersonaId) filter.userPersonaId = ref.userPersonaId;
  if (ref.universeId) filter.universeId = ref.universeId;
  return filter;
}

/** 인증 uid가 소유한 Assistant 메시지를 읽는다. 소유권·revision은 서버가 판정한다. */
export async function loadTutorsAssistantMessageForTts(
  ref: TutorsAssistantTtsMessageRef,
): Promise<TutorsAssistantTtsMessageDoc | null> {
  if (!ref.userId || !ref.personaId || !ref.sessionId || !ref.assistantClientId) return null;
  const model = await getConversationMessageModel(ref.userId);
  const doc = await model.findOne(buildMessageFilter(ref)).lean<TutorsAssistantTtsMessageDoc | null>();
  return doc || null;
}

/**
 * R2 HEAD 검증 후 메시지 content revision을 조건에 포함한 CAS로 audioMeta를 연결한다.
 * content가 바뀌었거나(오래된 메시지) 소유권이 다르면 0을 반환한다.
 */
export async function attachTutorsAssistantMessageAudioMetaCas(args: {
  ref: TutorsAssistantTtsMessageRef;
  contentHash: string;
  audioMeta: Record<string, unknown>;
}): Promise<number> {
  const message = await loadTutorsAssistantMessageForTts(args.ref);
  if (!message) return 0;
  const currentHash = resolveTutorsAssistantTtsContentHash(message.content);
  if (!currentHash || currentHash !== String(args.contentHash || "")) return 0;

  const model = await getConversationMessageModel(args.ref.userId);
  const audioMeta = normalizeMessageAudioMeta(args.audioMeta) as Record<string, unknown> | undefined;
  if (!audioMeta) return 0;
  const result = await model.updateOne(
    { ...buildMessageFilter(args.ref), _id: message._id, content: message.content },
    { $set: { audioMeta } },
  );
  return Number(result.matchedCount || 0);
}

export const TUTORS_ASSISTANT_TTS_JOB_COLLECTION = JOB_COLLECTION;
