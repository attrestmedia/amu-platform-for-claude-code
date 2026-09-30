import "server-only";

import { isNarrativeRuntimeEnabled } from "./narrativeRuntimePolicy";
import {
  aggregatePilotDashboard,
  type PlayPilotDashboard,
} from "libs/server-utils/play/playPilotMetrics";
import {
  aggregateTutorPilotDashboard,
  type TutorPilotDashboard,
} from "libs/server-utils/tutors/tutorPilotMetrics";

/**
 * @docHint
 * @purpose Narrative Runtime 운영 관측성·kill switch 통합 스냅샷 (OOC-071)
 * @process global flag  Play/Tutors 서비스별 kill switch  학습 guardrail  Play·Tutors 대시보드 집계
 * @domain narrative-operations
 * @scope server
 */

export type NarrativeOperationalStatus = {
  runtimeEnabled: boolean;
  killSwitch: {
    globalRuntimeEnabled: boolean;
    play: { narrativeEnabled: boolean; degradedWhenOff: string };
    tutors: { narrativeModeDefault: "off"; degradedWhenOff: string; pauseNarrativeRecommended: boolean };
  };
  play: PlayPilotDashboard;
  tutors: TutorPilotDashboard;
  note: string;
};

/**
 * Play/Tutors 독립 kill switch + 파일럿 계측·guardrail을 한 응답으로 통합한다.
 * duplicate roll·canon violation·reducer failure·persona fallback·budget exhaustion·reconciliation backlog
 * 신호의 소스·경보 조건·대응은 docs/pilot/narrative-observability-runbook.md에 매핑한다.
 */
export async function aggregateNarrativeOperationalStatus(universeId: string): Promise<NarrativeOperationalStatus> {
  const runtimeEnabled = isNarrativeRuntimeEnabled();
  const [play, tutors] = await Promise.all([
    aggregatePilotDashboard(universeId),
    aggregateTutorPilotDashboard(universeId),
  ]);
  return {
    runtimeEnabled,
    killSwitch: {
      globalRuntimeEnabled: runtimeEnabled,
      play: {
        narrativeEnabled: runtimeEnabled,
        degradedWhenOff: "NARRATIVE_RUNTIME_ENABLED=false → Play narrative adapter가 static fallback으로 강등(발견/보상 중단)",
      },
      tutors: {
        narrativeModeDefault: "off",
        degradedWhenOff: "narrativeMode off → 기존 Tutors 학습 유지, story context 미포함(학습 무영향)",
        pauseNarrativeRecommended: tutors.guardrail.recommendPauseNarrative,
      },
    },
    play,
    tutors,
    note: "운영 신호(duplicate roll·canon violation·reducer failure·persona fallback·budget exhaustion·reconciliation backlog)는 docs/pilot/narrative-observability-runbook.md에 소스·경보·대응을 매핑한다.",
  };
}
