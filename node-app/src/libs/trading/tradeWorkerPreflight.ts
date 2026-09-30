/**
 * @docHint
 * @purpose Private Trade Lab — trade-worker/trade-stream-worker 기동 preflight (egress IP 검증)
 * @process AWS IMDSv2  공용 에코 폴백  기대 IP 비교  fail-closed
 * @domain trading
 * @scope private-trade-lab
 *
 * 설계 정본: .agent/docs/project/2026/08/20260807_132711__tl000-upbit-overseas-ip-smoke-test-result.md
 *
 * 토스·업비트 allowlist에는 egress IP(운영 44.201.189.13)가 등록되어 있다. 배포 인스턴스의
 * 실제 egress IP가 기대값과 다르면 인증(토스 403 / 업비트 no_authorization)이 통째로 실패한다.
 * 발견되는 즉시 로그가 아니라 **기동 전에** 차단해 잘못된 allowlist로 한참 삽질하는 것을 막는다.
 *
 * 기대 IP는 env TRADE_WORKER_IP(쉼표 구분)로 주입한다. 미설정이면 운영 기본값을 쓰되,
 * 기본값과 다르면 명시적으로 설정했는지 경고한다. 검출 실패 시(로컬 등) 하드 실패하지 않고
 * 경고만 남긴다 — allowlist 환경인 프로덕션에서의 확실한 정합성 검증이 목적이기 때문이다.
 */

export type TradeWorkerPreflightOptions = {
  workerName: string;
  /** 기대 egress IP 목록(쉼표로 split된 env 값). 비면 DEFAULT_EXPECTED_IP */
  expectedIps?: string[];
  /** 테스트 주입용 IP 검출기 */
  detectIp?: () => Promise<string | null>;
};

export type TradeWorkerPreflightResult = {
  workerName: string;
  detectedIp: string | null;
  expectedIps: string[];
  /** 검출된 IP가 기대 목록에 있는지 (검출 실패 시 false) */
  matched: boolean;
  /** 프로덕션에서 차단해야 하는지 — 검출 성공 + 기대 목록 존재 + 불일치 */
  hardFail: boolean;
};

export const DEFAULT_EXPECTED_IP = "44.201.189.13";

/** 프로덕션 EC2 운영 IP — IMDSv2 우선, 공용 에코 폴백 */
export async function detectEgressIp(): Promise<string | null> {
  // AWS IMDSv2 (http://169.254.169.254/latest/meta-data/public-ipv4)
  try {
    const tokenRes = await fetch("http://169.254.169.254/latest/api/token", {
      method: "PUT",
      headers: { "X-aws-ec2-metadata-token-ttl-seconds": "60" },
      signal: AbortSignal.timeout(1500),
    });
    if (tokenRes.ok) {
      const token = (await tokenRes.text()).trim();
      const metaRes = await fetch("http://169.254.169.254/latest/meta-data/public-ipv4", {
        headers: { "X-aws-ec2-metadata-token": token },
        signal: AbortSignal.timeout(1500),
      });
      if (metaRes.ok) {
        const ip = (await metaRes.text()).trim();
        if (ip) return ip;
      }
    }
  } catch {
    // IMDS 사용 불가(로컬 등) — 폴백으로 진행
  }

  // 공용 에코 폴백 (checkip.amazonaws.com — IPv4 반환)
  try {
    const res = await fetch("https://checkip.amazonaws.com/", { signal: AbortSignal.timeout(3000) });
    if (res.ok) {
      const ip = (await res.text()).trim();
      if (ip) return ip;
    }
  } catch {
    // 오프라인/방화벽 — null 반환(검출 불가로 처리)
  }

  return null;
}

export async function runTradeWorkerPreflight(
  opts: TradeWorkerPreflightOptions,
): Promise<TradeWorkerPreflightResult> {
  const detect = opts.detectIp ?? detectEgressIp;
  const expectedIps = opts.expectedIps && opts.expectedIps.length > 0 ? opts.expectedIps : [DEFAULT_EXPECTED_IP];

  const detectedIp = await detect();
  const matched = detectedIp != null && expectedIps.includes(detectedIp);
  const hardFail = detectedIp != null && !matched;

  return { workerName: opts.workerName, detectedIp, expectedIps, matched, hardFail };
}
