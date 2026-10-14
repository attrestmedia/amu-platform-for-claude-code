import "server-only";
import type mongoose from "mongoose";
import type { IUserIndexDocument } from "models/user/UserIndexSchema";

/**
 * @docHint
 * @purpose 처리자별 국외 이전 거부·철회 이력(users_index.overseasTransferRefusalEvents) 저장과 거부 여부 서버 판정
 * @process 처리자 키 allowlist 검증 → users_index 조회 → 처리자별 최신 이벤트 판정 → (변경 시) 길이 조건부 $push → 실패는 OVERSEAS_TRANSFER_REFUSAL_UNAVAILABLE throw(fail-closed)
 * @domain privacy
 * @scope server-service
 */
export const OVERSEAS_TRANSFER_REFUSAL_PROCESSOR_KEYS = ["ai.elevenlabs.default"] as const;

type OverseasTransferRefusalProcessorKey = (typeof OVERSEAS_TRANSFER_REFUSAL_PROCESSOR_KEYS)[number];
type OverseasTransferRefusalAction = "refusal_recorded" | "refusal_withdrawn";
type OverseasTransferRefusalEvent = {
  processorKey: string;
  action: OverseasTransferRefusalAction;
  occurredAt: Date;
  disclosureVersion?: string;
};

export class OverseasTransferRefusalUnavailableError extends Error {
  readonly errorCode = "OVERSEAS_TRANSFER_REFUSAL_UNAVAILABLE";
  readonly status = 503;

  constructor() {
    super("ElevenLabs 국외 이전 거부 상태를 확인할 수 없습니다.");
    this.name = "OverseasTransferRefusalUnavailableError";
  }
}

type OverseasTransferRefusalStatus = {
  processorKey: string;
  refused: boolean;
  updatedAt: string | null;
};

function normalizeUid(uid: unknown) {
  return String(uid || "").trim();
}

function isAllowedProcessorKey(value: unknown): value is OverseasTransferRefusalProcessorKey {
  return typeof value === "string" && OVERSEAS_TRANSFER_REFUSAL_PROCESSOR_KEYS.includes(value as OverseasTransferRefusalProcessorKey);
}

function requireProcessorKey(value: unknown): OverseasTransferRefusalProcessorKey {
  if (!isAllowedProcessorKey(value)) throw new OverseasTransferRefusalUnavailableError();
  return value;
}

function readEvents(value: unknown): OverseasTransferRefusalEvent[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) throw new OverseasTransferRefusalUnavailableError();
  return value as OverseasTransferRefusalEvent[];
}

function latestEvent(events: readonly OverseasTransferRefusalEvent[], processorKey: string) {
  let latest: OverseasTransferRefusalEvent | undefined;
  let latestTime = Number.NEGATIVE_INFINITY;

  for (const event of events) {
    if (event?.processorKey !== processorKey) continue;
    const occurredAt = new Date(event.occurredAt).getTime();
    if (
      !Number.isFinite(occurredAt) ||
      (event.action !== "refusal_recorded" && event.action !== "refusal_withdrawn")
    ) {
      throw new OverseasTransferRefusalUnavailableError();
    }
    // Array order breaks ties when two server events share a millisecond.
    if (occurredAt >= latestTime) {
      latest = event;
      latestTime = occurredAt;
    }
  }

  return latest;
}

function statusFromEvents(processorKey: string, events: readonly OverseasTransferRefusalEvent[]): OverseasTransferRefusalStatus {
  const latest = latestEvent(events, processorKey);
  return {
    processorKey,
    refused: latest?.action === "refusal_recorded",
    updatedAt: latest ? new Date(latest.occurredAt).toISOString() : null,
  };
}

async function getUserIndexModel() {
  const [{ MONGODB_USERS_URL }, { dbConnect }] = await Promise.all([
    import("consts/env/server"),
    import("libs/database/mongoose"),
  ]);
  const connection = await dbConnect(MONGODB_USERS_URL);
  const existingModel = connection.models.UserIndex as mongoose.Model<IUserIndexDocument> | undefined;
  if (existingModel) return existingModel;

  const { UserIndexSchema } = await import("models/user/UserIndexSchema");
  return connection.model<IUserIndexDocument>("UserIndex", UserIndexSchema, "users_index");
}

async function readUserEvents(uid: string, processorKey: OverseasTransferRefusalProcessorKey) {
  const UserIndexModel = await getUserIndexModel();
  const userIndex = await UserIndexModel.findOne(
    { uid },
    { uid: 1, overseasTransferRefusalEvents: 1 },
  ).lean();
  if (!userIndex) throw new OverseasTransferRefusalUnavailableError();

  const events = readEvents(userIndex.overseasTransferRefusalEvents);
  return { UserIndexModel, events, status: statusFromEvents(processorKey, events) };
}

async function getStatus(args: { uid: unknown; processorKey: unknown }): Promise<OverseasTransferRefusalStatus> {
  const uid = normalizeUid(args.uid);
  const processorKey = requireProcessorKey(args.processorKey);
  if (!uid) throw new OverseasTransferRefusalUnavailableError();

  try {
    const { status } = await readUserEvents(uid, processorKey);
    return status;
  } catch {
    throw new OverseasTransferRefusalUnavailableError();
  }
}

export async function isOverseasTransferRefused(args: { uid: unknown; processorKey: string }): Promise<boolean> {
  return (await getStatus(args)).refused;
}

export async function getOverseasTransferRefusalStatus(args: {
  uid: unknown;
  processorKey: string;
}): Promise<OverseasTransferRefusalStatus> {
  return getStatus(args);
}

async function changeRefusalStatus(args: {
  uid: unknown;
  processorKey: string;
  action: OverseasTransferRefusalAction;
}): Promise<OverseasTransferRefusalStatus> {
  const uid = normalizeUid(args.uid);
  const processorKey = requireProcessorKey(args.processorKey);
  if (!uid) throw new OverseasTransferRefusalUnavailableError();

  try {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const { UserIndexModel, events, status } = await readUserEvents(uid, processorKey);
      const shouldRefuse = args.action === "refusal_recorded";
      if (status.refused === shouldRefuse) return status;

      const latest = latestEvent(events, processorKey);
      const latestTime = latest ? new Date(latest.occurredAt).getTime() : 0;
      const occurredAt = new Date(Math.max(Date.now(), latestTime + 1));
      const nextEvent: OverseasTransferRefusalEvent = {
        processorKey,
        action: args.action,
        occurredAt,
      };
      const filter: mongoose.FilterQuery<IUserIndexDocument> = {
        uid,
        $expr: {
          $eq: [
            { $size: { $ifNull: ["$overseasTransferRefusalEvents", []] } },
            events.length,
          ],
        },
      };
      const updated = await UserIndexModel.findOneAndUpdate(
        filter,
        { $push: { overseasTransferRefusalEvents: nextEvent } },
        { new: true, projection: { uid: 1, overseasTransferRefusalEvents: 1 } },
      ).lean();
      if (updated) {
        return statusFromEvents(processorKey, readEvents(updated.overseasTransferRefusalEvents));
      }
    }
    throw new OverseasTransferRefusalUnavailableError();
  } catch {
    throw new OverseasTransferRefusalUnavailableError();
  }
}

export function recordOverseasTransferRefusal(args: { uid: unknown; processorKey: string }) {
  return changeRefusalStatus({ ...args, action: "refusal_recorded" });
}

export function withdrawOverseasTransferRefusal(args: { uid: unknown; processorKey: string }) {
  return changeRefusalStatus({ ...args, action: "refusal_withdrawn" });
}
