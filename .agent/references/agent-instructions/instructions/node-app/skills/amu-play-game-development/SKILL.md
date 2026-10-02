---
name: amu-play-game-development
description: AMU Play의 게임을 설계·구현·개선·리뷰·테스트하는 통합 라우팅 스킬. `/play`, `src/**/game/**`, PixiJS 2D 아이소메트릭 월드, Three.js 3D 미션·미니게임, 스테이지/카메라/전투/적 AI/인벤토리/에셋/VFX/오디오/모바일 조작/성능/플레이테스트/출시 증거 작업에서 사용한다. 제작 목적에 맞는 PixiJS·Three.js·React DOM 책임을 고르고 엔진 간 세션, 서버 권위 보상, 자원 수명주기와 AMU 정책을 함께 적용한다.
---

# AMU Play 게임 개발

AMU Play를 하나의 엔진으로 재구축하지 말고, 기존 플랫폼 계약 위에서 목적별 런타임을 선택한다. 기본 월드와 지속형 상호작용은 PixiJS 2D 아이소메트릭으로 유지하고, 깊이·공간 추론·3D 카메라·물리 표현이 게임성의 핵심인 독립 미션이나 미니게임에만 Three.js를 사용한다.

## 규칙 우선순위

다음 순서로 현재 정본과 코드를 확인한다.

1. `{{AGENT_ROOT}}/rules/amu-play.md`, 워크스페이스 `/home/attrest-samsung-linux/Project/.agent/amu-platform-guide/play/GUIDE.md`
2. 비용·보상·재화가 있으면 `{{AGENT_ROOT}}/rules/server-economy-security.md`와 `/home/attrest-samsung-linux/Project/{{AGENT_ROOT}}/rules/compliance-guardrails.md`
3. 렌더링은 `{{AGENT_ROOT}}/rules/game-pixi.md`, 미디어는 `{{AGENT_ROOT}}/rules/media-storage.md`
4. 현재 `package.json`, Play 엔트리, `StageDoc`, 게임 store/hook/API와 테스트
5. 이 스킬의 목적별 참조 문서

정본과 이 스킬이 다르면 정본과 실제 코드가 우선한다. 확정되지 않은 로드맵을 현재 기능으로 가정하지 않는다.

## 런타임 선택

| 제작 목적 | 기본 선택 | 판단 기준 |
| --- | --- | --- |
| 지속형 월드 이동, NPC 대화, 상점·건물·포털, 아이소메트릭 스테이지 | PixiJS | 기존 `StageDoc` v2와 월드 루프를 재사용한다. |
| 오목·체스·바둑·보드 전략, 평면 퍼즐, 짧은 터치 아케이드 | PixiJS 우선 | 3D 깊이가 규칙이나 판독성에 실질적으로 필요하지 않으면 2D를 유지한다. |
| 공간 퍼즐, 3D 아케이드, 3D 전투·보스·물리 기반 미션 | Three.js | 월드와 분리된 세션으로 실행하고 결과만 서버 계약으로 합류시킨다. |
| HUD, 메뉴, 대화상자, 설정, 접근 가능한 인벤토리 | React DOM | 읽기·포커스·i18n이 필요한 UI를 WebGL 텍스트로 대체하지 않는다. |
| 스테이지/에셋 제작·검수 도구 | 결과 런타임과 동일한 프리뷰 + React DOM | 운영 정본에서 파생한 draft를 검증해 제안하며 별도 데이터 정본을 만들지 않는다. |

Three.js가 시각적으로 화려하다는 이유만으로 선택하지 않는다. 기존 PixiJS 월드를 Three.js로 교체하거나 두 엔진의 렌더 루프를 상시 동시에 돌리는 변경은 사용자의 명시적 범위 없이 진행하지 않는다. Three.js 작업 전 실제 의존성을 확인하고, 없으면 새 의존성의 필요성·대안·번들 영향을 먼저 제시한다.

## 참조 문서 라우팅

작업에 필요한 문서만 읽는다.

- 모든 게임 작업: [engine-routing-and-session-contracts.md](references/engine-routing-and-session-contracts.md)
- PixiJS 월드·스테이지·2D 게임·맵 에디터: [pixi-world-and-2d.md](references/pixi-world-and-2d.md)
- Three.js 미션·미니게임·3D 카메라·모바일 3D: [three-missions-and-3d.md](references/three-missions-and-3d.md)
- 전투·적·AI·인벤토리·VFX·오디오·에셋: [gameplay-systems.md](references/gameplay-systems.md)
- 성능 진단·플레이테스트·릴리스 준비·변경 이력: [qa-performance-release.md](references/qa-performance-release.md)

## 구현 워크플로우

### 1. 실제 기준선 고정

- 요청을 월드, 독립 세션, 공통 게임 시스템, 제작 도구, QA·릴리스 중 하나 이상으로 분류한다.
- 현재 진입점, 렌더 루프, 입력 소유자, 콘텐츠 정의, 런타임 상태, 저장·보상 API와 테스트를 찾는다.
- 기존 계약과 새 계약의 경계를 먼저 기록한다. 특히 PixiJS 월드와 Three.js 세션 사이의 입력 잠금, 일시정지, 복귀, 저장, 실패 처리를 확정한다.
- 관련 파일이 과대 책임이면 `split-implementation.md`에 따라 현재 요청과 직접 관련된 경계만 분리한다.

### 2. 엔진 중립 계약 정의

다음을 렌더러와 분리한다.

- 불변 콘텐츠: 게임/미션 ID, 규칙 버전, 레벨·적·아이템 정의, 에셋 provenance
- 세션 상태: 서버가 발급한 세션 ID와 seed, 시작 시각, checkpoint, 상태 전이
- 시뮬레이션 결과: 입력/이벤트, 판정, 점수·완료 claim, 실패·중단 사유
- 표현 어댑터: PixiJS 또는 Three.js scene, DOM HUD, VFX·오디오
- 서버 결과: 검증된 완료 상태, 보상, 멱등 키, 다음 월드 상태

클라이언트 점수·완료·획득량을 보상의 정본으로 쓰지 않는다. 서버가 세션과 규칙 버전을 검증하고 보상을 계산하도록 한다.

### 3. 한 개의 플레이 가능한 세로 조각 구현

다음 경로를 먼저 완성한다.

`진입 → 조작 이해 → 핵심 행동 1회 → 성공 또는 실패 → 결과 확인 → 월드 복귀`

첫 조각에 두 번째 전투 체계, 다수 레벨, 복잡한 성장, 실시간 소켓을 함께 넣지 않는다. 중요한 상태는 seed 또는 fixture로 직접 재현할 수 있게 한다.

### 4. 피드백과 실패 경계 연결

- 입력 수락, 위험 예고, 접촉, 성공, 실패, 보상 상태를 시각·오디오·DOM 중 적합한 채널로 구분한다.
- reset, retry, pause, background 복귀와 scene dispose를 멱등하게 만든다.
- 에셋 생성은 Gen Studio 프로세스, 저장은 R2 계약, 라이선스와 생성 provenance 기록을 따른다.
- 보상·코인·확률형 결과가 있으면 서버 경제와 규제 게이트를 같은 세로 조각에서 검증한다.

### 5. 실제 플레이로 증명

자동 테스트만으로 완료 처리하지 않는다. 결정적 fixture와 짧은 실제 플레이를 결합해 데스크톱, 터치, reduced motion, 재시도, 저장·복귀, 콘솔, 자원 해제를 확인한다. 검증과 릴리스 절차는 `qa-performance-release.md`를 따른다.

## 완료 보고

다음을 구분해 보고한다.

- 선택한 런타임과 선택 이유
- 보존한 AMU 계약과 새로 추가한 계약
- 클라이언트 시뮬레이션과 서버 권위 판정의 경계
- 성능 fixture, 기기/viewport, 프레임·메모리·draw call 관찰 결과
- 자동 테스트와 실제 플레이 결과
- 미실행 항목, 기존 baseline 문제, 롤백 경로

배포는 별도 사용자 요청이 있을 때만 dry-run, 헬스체크, 롤백을 세트로 실행한다.
