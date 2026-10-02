# Server Economy & Security Contracts (서버 경제/비용 엔지니어링 계약)

## 목적

비용 발생·코인 변동·보상 지급 코드에서 매번 재도출되던 계약을 고정한다.
**비용/경제 관련 API 신규 작성·수정 시 이 문서를 필수 참조한다** (`api-route` 스킬 선행 참조 대상).

## 1. Fail-Closed 원칙

- 비용 발생·코인 변동·보상 지급 엔드포인트는 rate limit/잔액 저장소 장애 시 **fail-closed가 기본**이다.
  저장소 오류를 "통과"로 처리하지 않는다.
- 대상 엔드포인트는 env allowlist로 제어하고, 롤백은 env 항목 제거로 수행한다.

## 2. Cost-Preflight (외부 유료 호출 사전 차단)

- 외부 유료 API 호출은 **preflight 잔액/과금 검증 통과 후에만** 실행한다
  (`assertPricingPreflightOrThrow` 패턴). **호출 후 과금(사후 차감) 금지** — TTS 과금 사고 재발 방지.

## 3. 서버 판정 + 멱등 키

- 모든 보상/차감은 **서버가 판정**한다. 클라이언트가 보낸 점수/획득량/달성 여부를 신뢰하지 않는다.
- 행동/보상 지급은 **멱등 키**(예: `(uid, missionId, day)`)로 중복 지급을 차단한다.
  결제 confirm의 `applied/applying` 상태 전이 패턴을 재사용한다.

## 4. 이원 원장 + 단방향 환전 + 에스크로

- **충전 코인(유상)과 게임/보상 코인(무상)은 원장을 분리**한다.
- 환전은 **단방향만 허용**(유상 → 무상 방향 소비). 무상 재화를 유상 재화·현금성 가치로 되돌리는 역방향 환전 금지.
- 유저 간 거래는 **에스크로 절차**(소유 검증 → 잠금 → 이체 → 해제)로만 처리한다. 직접 이체 금지.

## 5. Agent 키 스코프/로테이션

- agent 키는 **키별 스코프 + 로테이션 가능 구조**를 전제로 설계한다.
  단일 전역 키/단일 UID 구조의 신규 확장(특히 MCP 도구 추가) 전에 스코프 분리를 선행한다.

## 관련 문서

- 규제 게이트: 워크스페이스 `project` 스코프의 `compliance-guardrails.md` (`/home/attrest-samsung-linux/Project/{{AGENT_ROOT}}/rules/compliance-guardrails.md`) — Play/거래/확률형 기능은 착수 전 필수 확인
- AMU Play 관점 인덱스: `{{AGENT_ROOT}}/rules/amu-play.md`
