import { NextResponse } from "next/server";
import { ELEVENLABS_APPROVED_VOICE_CATALOG } from "consts/ai/voiceCatalog";
import { withAuth } from "libs/server-utils/api/apiMiddleware";
import { aggregateTutorPilotDashboard } from "libs/server-utils/tutors/tutorPilotMetrics";
import {
  loadTutorsVoicePilotConfig,
  resolveTutorsVoicePilotBaselineFromConfig,
  resolveTutorsVoicePilotPolicyFromConfig,
  resolveTutorsVoicePilotRuntimePolicy,
} from "libs/server-utils/tutors/tutorsVoicePilotContract";

export const runtime = "nodejs";

/**
 * @docHint
 * @purpose Tutors 파일럿 내부 allowlist cohort 대시보드 (관리자 전용)
 * @process 관리자 인증  학습 완료율·교정 품질·서사 계속·opt-out 집계  학습 guardrail 판정
 * @domain tutors-narrative
 * @scope admin-api
 */

export const GET = withAuth(
  async (_body, _user, request) => {
    const universeId = new URL(request.url).searchParams.get("universeId")?.trim() || "the-universe";
    const dashboard = await aggregateTutorPilotDashboard(universeId);
    // EL-P6-ACTIVATION Stream B: PILOT-VALUES를 서버 설정에서 읽는다. 미설정/장애 시 닫힘(default deny).
    const pilotConfig = await loadTutorsVoicePilotConfig();
    const pilotPolicy = resolveTutorsVoicePilotPolicyFromConfig(pilotConfig);
    const pilotRuntime = resolveTutorsVoicePilotRuntimePolicy(pilotConfig, ELEVENLABS_APPROVED_VOICE_CATALOG);
    const pilotBaseline = resolveTutorsVoicePilotBaselineFromConfig(pilotConfig);
    return NextResponse.json(
      {
        ok: true,
        data: {
          ...dashboard,
          goNoGo: {
            note: "공개 확대는 OOC-072 판정 전 금지. 학습 guardrail(스토리로 인한 성과 저하) 기준 이하 cohort는 자동 확대 금지.",
            guardrailPauseNarrative: dashboard.guardrail.recommendPauseNarrative,
            observationFirstAt: dashboard.observation.firstAt,
            observationLastAt: dashboard.observation.lastAt,
          },
          voicePilot: {
            note: "EL-603 Voice 파일럿 노출은 G-EL-PILOT 사용자 결정 전 금지. 설정 미비 시 default deny이며 baseline이 incomplete이면 확대하지 않는다.",
            capabilityEnabled: pilotPolicy.capabilityEnabled === true,
            cohortUniverseCount: (pilotPolicy.cohortUniverseIds ?? []).length,
            cohortUidCount: (pilotPolicy.approvedCohortUids ?? []).length,
            rolloutRatio: pilotPolicy.rolloutRatio ?? 0,
            exposableVoices: pilotRuntime.exposableVoices,
            ttsModel: pilotRuntime.ttsModel,
            recordingEnabled: pilotRuntime.recordingEnabled,
            metricsRecordingEnabled: pilotRuntime.metricsRecordingEnabled,
            baselineStatus: pilotBaseline.status,
            keys: dashboard.voicePilot.keys,
          },
        },
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  },
  undefined,
  "admin/tutors/pilot-dashboard:read",
  { requireAdmin: true, bodyParser: "none" },
);
