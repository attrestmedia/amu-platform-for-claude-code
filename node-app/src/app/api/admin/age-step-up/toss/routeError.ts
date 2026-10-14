import { NextResponse } from "next/server";
import { AgeAssuranceServiceError } from "libs/server-utils/identity/ageAssurance/ageAssuranceService";
import type { AgeAssuranceErrorResponse } from "types/identity/ageAssurance";

export function ageAssuranceErrorResponse(error: unknown) {
  if (error instanceof AgeAssuranceServiceError) {
    const body: AgeAssuranceErrorResponse = {
      ok: false,
      errorCode: error.errorCode,
      message: error.message,
    };
    return NextResponse.json(body, { status: error.status });
  }

  // Keep provider and storage details out of the admin response.
  const body: AgeAssuranceErrorResponse = {
    ok: false,
    errorCode: "AGE_ASSURANCE_PROVIDER_ERROR",
    message: "연령 확인 요청을 처리하지 못했습니다.",
  };
  return NextResponse.json(body, { status: 502 });
}
