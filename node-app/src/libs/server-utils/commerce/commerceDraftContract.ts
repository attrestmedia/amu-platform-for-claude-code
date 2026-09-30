import "server-only";

import { NextResponse } from "next/server";
import { toErrorMessage, toErrorLike, toUnknownRecord } from "utils/common";
import { buildCommerceApiError } from "./commerceWorkflowContract";

export const COMMERCE_DRAFT_ERROR_CODES = {
  REVISION_CONFLICT: "draft_revision_conflict",
  NOT_READY: "draft_not_ready",
  PUBLISH_IN_PROGRESS: "publish_in_progress",
  PIPELINE_STEP_NOT_SKIPPABLE: "pipeline_step_not_skippable",
  PIPELINE_STEP_REVISION_REQUIRED: "pipeline_step_revision_required",
} as const;

export type CommerceDraftErrorCode =
  | (typeof COMMERCE_DRAFT_ERROR_CODES)[keyof typeof COMMERCE_DRAFT_ERROR_CODES]
  | "commerce_draft_operation_failed";

export class CommerceDraftRevisionConflictError extends Error {
  readonly errorCode = COMMERCE_DRAFT_ERROR_CODES.REVISION_CONFLICT;
  readonly status = 409;
  readonly details: { expectedRevision: number; currentRevision: number };

  constructor(expectedRevision: number, currentRevision: number) {
    super("상품 초안이 다른 화면에서 변경되었습니다. 최신 내용을 확인한 뒤 다시 시도해 주세요.");
    this.name = "CommerceDraftRevisionConflictError";
    this.details = { expectedRevision, currentRevision };
  }
}

export class CommerceDraftPublishInProgressError extends Error {
  readonly errorCode = COMMERCE_DRAFT_ERROR_CODES.PUBLISH_IN_PROGRESS;
  readonly status = 409;

  constructor() {
    super("이 상품 초안의 등록 작업이 이미 진행 중입니다. 등록 이력을 확인해 주세요.");
    this.name = "CommerceDraftPublishInProgressError";
  }
}

export function normalizeCommerceDraftRevision(value: unknown, fallback = 1) {
  const revision = Number(value);
  return Number.isSafeInteger(revision) && revision > 0 ? revision : fallback;
}

export function assertCommerceDraftExpectedRevision(args: { draft: { revision?: unknown } | null | undefined; expectedRevision: unknown }) {
  const expectedRevision = normalizeCommerceDraftRevision(args.expectedRevision, 0);
  const currentRevision = normalizeCommerceDraftRevision(args.draft?.revision);
  if (!expectedRevision || expectedRevision !== currentRevision) {
    throw new CommerceDraftRevisionConflictError(expectedRevision, currentRevision);
  }
  return currentRevision;
}

function readThrownError(error: unknown) {
  const meta = toErrorLike(error);
  const record = toUnknownRecord(error);
  const errorCode = String(meta.errorCode || meta.code || "commerce_draft_operation_failed");
  const status = typeof meta.status === "number" ? meta.status : 500;
  const details = record.details && typeof record.details === "object" ? toUnknownRecord(record.details) : undefined;
  return {
    errorCode: errorCode as CommerceDraftErrorCode,
    status,
    message: toErrorMessage(error, "상품 초안 처리 중 오류가 발생했습니다."),
    details,
  };
}

export function commerceDraftErrorResponse(error: unknown, fallbackMessage = "상품 초안 처리 중 오류가 발생했습니다.") {
  const normalized = readThrownError(error);
  const message = normalized.status >= 500 ? fallbackMessage : normalized.message;
  return NextResponse.json(
    buildCommerceApiError({
      code: normalized.errorCode,
      message,
      details: normalized.details,
      retryable: normalized.status >= 500 || normalized.status === 429,
    }),
    { status: normalized.status },
  );
}

export function commerceDraftErrorResponseForCode(args: {
  code: CommerceDraftErrorCode;
  message: string;
  status: number;
  details?: Record<string, unknown>;
}) {
  return NextResponse.json(
    buildCommerceApiError({
      code: args.code,
      message: args.message,
      details: args.details,
      retryable: args.status >= 500 || args.status === 429,
    }),
    { status: args.status },
  );
}
