import "server-only";

import {
  isNarrativeDirectorConsumerEnabled,
  isNarrativeRuntimeEnabled,
} from "./narrativeRuntimePolicy";
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
    play: { chatConsumerEnabled: boolean; relationshipProposalConsumerEnabled: boolean; degradedWhenOff: string };
    tutors: {
      narrativeModeDefault: "off";
      usesChatConsumer: true;
      chatConsumerEnabled: boolean;
      degradedWhenOff: string;
      pauseNarrativeRecommended: boolean;
    };
  };
  play: PlayPilotDashboard;
  tutors: TutorPilotDashboard;
  note: string;
};

/**
 * Director consumer별 kill switch + 파일럿 계측·guardrail을 한 응답으로 통합한다.
 * duplicate roll·canon violation·reducer failure·persona fallback·budget exhaustion·reconciliation backlog
 * 신호의 소스·경보 조건·대응은 docs/pilot/narrative-observability-runbook.md에 매핑한다.
 */
export async function aggregateNarrativeOperationalStatus(universeId: string): Promise<NarrativeOperationalStatus> {
  const runtimeEnabled = isNarrativeRuntimeEnabled();
  const chatConsumerEnabled = isNarrativeDirectorConsumerEnabled("chat");
  const relationshipProposalConsumerEnabled = isNarrativeDirectorConsumerEnabled("relationship_proposal");
  const [play, tutors] = await Promise.all([
    aggregatePilotDashboard(universeId),
    aggregateTutorPilotDashboard(universeId),
  ]);
  return {
    runtimeEnabled,
    killSwitch: {
      globalRuntimeEnabled: runtimeEnabled,
      play: {
        chatConsumerEnabled,
        relationshipProposalConsumerEnabled,
        degradedWhenOff: "NARRATIVE_RUNTIME_ENABLED=false 또는 해당 consumer flag=false → 해당 consumer만 provider 호출 없이 static/manual fallback",
      },
      tutors: {
        narrativeModeDefault: "off",
        usesChatConsumer: true,
        chatConsumerEnabled,
        degradedWhenOff: "Tutors는 chat consumer를 공유하며 독립 kill switch는 없음; chat consumer off면 story context가 static fallback으로 강등되고 학습은 유지",
        pauseNarrativeRecommended: tutors.guardrail.recommendPauseNarrative,
      },
    },
    play,
    tutors,
    note: "운영 신호(duplicate roll·canon violation·reducer failure·persona fallback·budget exhaustion·reconciliation backlog)는 docs/pilot/narrative-observability-runbook.md에 소스·경보·대응을 매핑한다.",
  };
}
