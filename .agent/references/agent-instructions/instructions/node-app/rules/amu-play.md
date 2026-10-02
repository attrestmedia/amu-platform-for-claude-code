# AMU Play Rules Index (게임 경제/Play 작업 참조 허브)

## 목적

AMU Play(`/play`, 게임 경제, 페르소나 거래, `amu-realtime`) 관련 작업이 참조해야 할 규칙을 한곳에 모은다.
**Play는 새 게임이 아니라 기존 플랫폼 위의 레이어다** — 신규 대형 아키텍처 발명보다 기존 계약 재사용을 우선한다.

## 착수 전 필수 참조 (순서대로)

1. **경제/보안 계약**: `{{AGENT_ROOT}}/rules/server-economy-security.md`
   - fail-closed, cost-preflight, 서버 판정 + 멱등 키, 이원 원장 + 단방향 환전 + 에스크로, agent 키 스코프
2. **규제 게이트**: 워크스페이스 `project` 스코프 `compliance-guardrails.md` (`/home/attrest-samsung-linux/Project/{{AGENT_ROOT}}/rules/compliance-guardrails.md`)
   - 환전/사행성, 확률형 보상 확률 공시, 가상자산 보류, 음성 정책 (미성년 게이트는 §3-1에 따라 `pass` — 2026-09-23)
3. **실시간 게이트**: S0(HTTP 계약 안정화) 완료 전 S1(소켓/`amu-realtime`) 착수 금지
   - 근거: `~/Project/.agent/docs/node-app/2026/07/20260706_170235__socket-communication-readiness-review.md`
4. **확정 결정 원장**: 워크스페이스 `project` 스코프 `overview/roadmap-and-decisions.md`
   - death-model 완화안은 **제안 상태**(사용자 확정 대기) — 확정 전 mission.md 기준으로 새 설계를 고정하지 말 것
5. **게임 구현 라우팅**: `{{AGENT_ROOT}}/skills/amu-play-game-development/SKILL.md`
   - PixiJS 2D 아이소메트릭 월드와 Three.js 3D 미션·미니게임의 책임, 엔진 간 세션·수명주기·QA 계약을 제작 목적에 맞게 선택

## 작업 원칙

- 맵·건물·캐릭터 스프라이트·음성·영상 등 Play 미디어는 `{{AGENT_ROOT}}/rules/media-storage.md`의 R2 단일 저장소 계약을 따른다.
- 조작 캐릭터는 공개 가능한 R2 스프라이트 URL과 8방향별 유효한 걷기 프레임 메타가 모두 있을 때만 선택·스테이지 진입을 허용한다.
- `Universe.enabled=false`인 게임 유니버스는 공개 런타임 스테이지 API와 `/play/{universeId}` 진입을 fail-closed로 차단한다.
- 보상/재화 변동 API는 결제 confirm의 `applied/applying` 멱등 패턴을 재사용한다.
- 클라이언트 신뢰 금지: 점수/획득량/달성 판정은 항상 서버에서.
- 게임 경제 수치(획득률/소각처/환전비)는 코드에 하드코딩하지 않고 정책 상수/DB로 분리해 제안한다.
- 지속형 월드·NPC·스테이지는 PixiJS를 기본으로 유지하고, Three.js는 공간성·3D 카메라·물리가 게임 규칙에 필요한 독립 미션/미니게임에 사용한다. 단순한 시각적 화려함을 이유로 엔진을 바꾸지 않는다.
- PixiJS 월드와 Three.js 세션은 입력·ticker/render loop·오디오·checkpoint·결과 제출의 소유권을 명시한다. 검증되지 않은 상태에서 두 엔진을 상시 동시 구동하지 않는다.
- HUD·메뉴·대화상자·설정·접근 가능한 인벤토리는 React DOM을 기본으로 하고 WebGL 텍스트/UI로 대체하지 않는다.
