# QA, 성능과 릴리스 준비

## 목차

- [결정적 검증](#결정적-검증)
- [실제 플레이 행렬](#실제-플레이-행렬)
- [성능](#성능)
- [접근성과 모바일](#접근성과-모바일)
- [릴리스와 변경 이력](#릴리스와-변경-이력)

## 결정적 검증

긴 캠페인 진행 없이 핵심 상태를 직접 재현한다.

- 진입 전, 로딩, 첫 입력, active play, pause, 성공, 실패, retry, 결과 제출, settled, 월드 복귀
- 전투 phase 경계, 잘못된 거리·방향, interruption, 다중 target, 적 target 상실과 path 실패
- inventory full/empty, pickup 중복, save migration, network timeout, 제출 재시도
- Pixi/Three 재진입, StrictMode, route 이탈, background 복귀와 dispose

fixture는 seed, fixture ID 또는 test 전용 builder로 제공한다. production 공개 query가 권한이나 내부 상태를 우회하지 않게 한다. 새 회귀와 기존 baseline 실패를 구분한다.

## 실제 플레이 행렬

자동 테스트 뒤 다음 경로를 실제 브라우저에서 짧게 완료한다.

`launch -> start/continue -> movement/input -> core action -> success/failure -> retry/result -> return`

최소 변형:

- 데스크톱 keyboard/mouse
- 375px touch portrait와 가능한 landscape
- 768/1024/1440px 레이아웃
- reduced motion
- mute, 첫 audio unlock, tab background/return
- low quality tier와 representative encounter

각 의미 있는 입력 뒤 화면 피드백, 시뮬레이션 상태, 서버 결과가 일치하는지 확인한다. UI 변경은 `ui-ux-pro-max` 계약을 적용하고, 사용 가능한 경우 `visual-check`로 캡처한다. MCP 호출 전 `/home/attrest-samsung-linux/Project/{{AGENT_ROOT}}/skills/amu-custom-mcp/SKILL.md`를 읽는다.

## 성능

변경 전에 반복 가능한 대표 scene을 정한다. 다음을 함께 기록한다.

- 기기/브라우저, viewport, DPR, quality tier
- stage/mission ID, player 위치, actor/effect 수와 seed
- CPU/GPU frame time 또는 FPS 분포, long frame
- draw calls, triangles, texture/render target 수
- JS heap과 GPU 자원 대리 지표, 장시간 증감
- console warning/error

60fps 목표면 프레임 예산은 약 16.7ms, 30fps fallback이면 약 33.3ms다. 단일 고정 수치로 모든 장면을 합격시키지 말고 대상 기기와 대표 scene의 예산을 작업 계약으로 먼저 고정한다.

CPU 병목은 per-frame scan, allocation, React render, pathfinding과 simulation actor 증가를 조사한다. GPU 병목은 DPR, overdraw, shadow, post-processing, transparency, draw call, geometry와 texture bandwidth를 조사한다. geometry/material 재사용, pooling, culling, 낮은 빈도 시스템 throttle부터 적용하고 입력·telegraph·판독성을 희생하지 않는다.

최적화 후 같은 seed와 scene으로 재측정하고 collision, timing, visual correctness, memory 안정성을 함께 회귀 검증한다.

## 접근성과 모바일

- DOM HUD와 dialog에 keyboard focus, visible label, i18n과 충분한 대비를 제공한다.
- drag-only, color-only, audio-only 상호작용을 만들지 않는다.
- touch target, safe area, multi-touch 충돌, orientation 변경을 검증한다.
- reduced motion에서는 shake, rapid flash, 긴 camera tween과 particle 밀도를 완화한다.
- HUD가 목표, 위험, 주요 actor와 touch control을 가리지 않게 한다.
- WebGL canvas 실패 시 오류 설명과 retry 또는 월드 복귀 버튼을 DOM으로 제공한다.

## 릴리스와 변경 이력

명령 실행 전 `package.json`의 현재 script를 확인하고 관련 테스트, 수정 파일 lint, 전체 `pnpm run typecheck`를 실행한다. ISO/StageDoc 변경은 현재 제공되는 isometric·coordinate·render·movement·viewport·editor·stage release 계약 테스트 중 영향 범위를 선택한다. 릴리스 범위라면 전체 lint와 production build를 추가한다.

변경 이력은 성공적으로 배포되어 사용자가 받은 release를 기준으로 작성한다.

- commit마다 version을 만들지 않는다.
- package version, 게임 UI, changelog가 서로 다른 정본을 갖지 않게 한다.
- 버전 체계와 시작 번호를 임의로 `0.9.0`에 고정하지 않는다.
- player-facing 결과만 적고 source hash/deployment ID는 내부 provenance로 둔다.
- 배포가 요청되지 않았으면 `local ready`와 `released`를 구분해 보고한다.

배포 요청이 있을 때만 다음 순서를 실행한다.

1. 검증한 exact revision 확인
2. dry-run 또는 production build
3. 배포
4. 헬스체크와 실제 게임 smoke play
5. 배포 version/asset/save 호환성 read-back
6. 실패 시 사전에 기록한 rollback target으로 복구

임시 dev server, benchmark와 QA page는 작업 후 정리하되 다른 활성 작업의 자원은 종료하지 않는다.
