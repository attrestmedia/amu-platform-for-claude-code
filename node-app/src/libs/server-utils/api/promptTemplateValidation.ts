import "server-only";
import { NextResponse } from "next/server";
import {
  findMissingRequiredPromptVariables,
  validatePromptTemplateFields,
  type PromptTemplateVariableIssue,
} from "utils/lab";

/**
 * @docHint
 * @purpose Gen Studio 프롬프트 템플릿 변수 문법과 생성 필수값 검증
 * @process 템플릿 필드 문법 검사  저장 API 오류 응답 생성  생성 전 필수 변수 누락 반환
 * @domain ai-prompt
 * @scope server
 */

export function rejectInvalidPromptTemplate(fields: {
  templateText: string;
  sceneTemplate?: string;
}): NextResponse | null {
  const issues = validatePromptTemplateFields(fields);
  if (!issues.length) return null;

  return NextResponse.json(
    {
      ok: false,
      error: "invalid_template_variables",
      errorCode: "INVALID_INPUT",
      issues,
    },
    { status: 400 },
  );
}

export function getRequiredPromptVariableError(
  templateText: string,
  variables: Record<string, unknown>,
): {
  ok: false;
  error: "prompt_required_variable_missing";
  errorCode: "PROMPT_REQUIRED_VARIABLE_MISSING";
  issues: Array<{
    code: "required_variable_missing";
    key: string;
    message: string;
  }>;
} | null {
  const missing = findMissingRequiredPromptVariables(templateText, variables);
  if (!missing.length) return null;

  return {
    ok: false,
    error: "prompt_required_variable_missing",
    errorCode: "PROMPT_REQUIRED_VARIABLE_MISSING",
    issues: missing.map((spec) => ({
      code: "required_variable_missing",
      key: spec.key,
      message: `${spec.key} is required`,
    })),
  };
}

export type { PromptTemplateVariableIssue };
