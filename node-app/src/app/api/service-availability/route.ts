import { NextResponse } from "next/server";
import { getServiceAvailability } from "libs/server-utils/system/serviceAvailability";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  const services = await getServiceAvailability();
  return NextResponse.json(
    { services },
    { headers: { "Cache-Control": "no-store, max-age=0" } },
  );
}
