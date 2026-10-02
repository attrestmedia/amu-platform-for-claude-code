# 엔진 라우팅과 세션 계약

## 목차

- [책임 경계](#책임-경계)
- [PixiJS와 Three.js 전환](#pixijs와-threejs-전환)
- [세션 상태 기계](#세션-상태-기계)
- [서버 권위 결과](#서버-권위-결과)
- [좌표와 저장](#좌표와-저장)
- [React 통합과 수명주기](#react-통합과-수명주기)

## 책임 경계

하나의 기능을 다음 다섯 층으로 나눈다.

1. **콘텐츠 정의**: 불변 ID, 규칙 버전, 레벨·아이템·적·보상 정책 참조
2. **시뮬레이션**: seed와 입력에서 상태 전이를 계산하는 엔진 중립 로직
3. **렌더 어댑터**: PixiJS 또는 Three.js가 시뮬레이션 snapshot/event를 표현
4. **플랫폼 shell**: React가 인증, 로딩, DOM HUD, i18n, 오류, 라우팅을 소유
5. **서버 판정**: 세션 발급, 완료 검증, 보상·재화, 저장과 감사 로그를 소유

렌더 객체, geometry, texture, camera를 콘텐츠 정의나 서버 payload에 넣지 않는다. React 상태에는 직렬화 가능한 UI·도메인 상태만 두고 엔진 객체는 ref와 전용 runtime owner가 관리한다.

## PixiJS와 Three.js 전환

Three.js 미션은 PixiJS 월드의 자식 scene graph가 아니라 독립된 게임 세션으로 취급한다.

1. 월드가 진입 조건과 서버 세션 시작을 요청한다.
2. 세션 ID, 규칙/콘텐츠 버전, seed, 시작 checkpoint를 받은 뒤 월드 입력을 잠근다.
3. PixiJS ticker를 일시정지하거나 저빈도 정적 배경으로 전환하고 월드 오디오 우선순위를 낮춘다.
4. Three.js renderer와 입력 context를 한 번만 생성한다.
5. 성공·실패·중단 결과를 서버에 제출하고 서버 응답을 받은 뒤 Three.js 자원을 해제한다.
6. PixiJS 월드 checkpoint를 갱신하고 입력·오디오·ticker를 복구한다.

GPU·배터리 예산이 확인되지 않은 상태에서 두 renderer를 60fps로 동시에 실행하지 않는다. 전환 중 오류가 나도 입력 잠금과 renderer 소유권을 원상복구할 수 있게 `enter`, `active`, `submitting`, `leaving` 정리를 멱등하게 만든다.

## 세션 상태 기계

기본 상태를 명시적으로 둔다.

```text
idle -> starting -> ready -> playing -> paused
                         \-> completed|failed|aborted
completed|failed -> submitting -> settled -> leaving -> idle
```

- 각 전이는 진입 조건, 종료 조건, timeout, 취소 가능 여부를 가진다.
- 동일 start/submit 요청은 멱등 키로 중복 세션이나 중복 보상을 만들지 않는다.
- 탭 background, 네트워크 단절, route 이탈, 새로고침의 복구 정책을 정한다.
- `paused` 동안 시뮬레이션 clock, 공격 window, 타이머가 진행되지 않게 한 clock source를 사용한다.
- 난수는 서버 발급 seed 또는 기록 가능한 seed를 사용하고 재현 테스트에서 같은 결과를 만든다.

## 서버 권위 결과

클라이언트 payload는 claim과 증거이며 판정 결과가 아니다.

- 서버가 `sessionId`, 사용자, 게임/미션 ID, 규칙 버전, seed, 만료와 현재 상태를 대조한다.
- 점수, 완료, 획득 아이템, 피해량, 보상량을 그대로 저장하지 않는다.
- 결정적 게임은 seed와 요약 입력/event digest를 재검증하고, 비결정적 게임은 서버가 허용 범위·진행 checkpoint·서명된 이벤트를 검증한다.
- 보상은 서버 정책에서 계산하고 `(uid, sessionId, rewardPolicyVersion)`과 같은 멱등 키로 한 번만 확정한다.
- 실패·중단도 세션 상태를 종결해 재사용 공격을 막는다.
- 비용 발생 AI 호출은 preflight 이후 실행하고, 생성 결과를 게임에 자동 적용하지 않는다.

API 형식은 기존 AMU route middleware와 error format을 재사용한다. 새로운 실시간 전송은 S0 게이트가 해제되기 전 설계에 포함하지 않는다.

## 좌표와 저장

- PixiJS 월드 좌표는 `StageDoc` v2의 논리 grid와 2:1 projection을 정본으로 삼는다.
- Three.js scene은 일반적으로 meters, `+Y` up, `+Z` forward를 사용하되 미션 내부 계약으로 제한한다.
- Three.js transform을 `StageDoc`의 `x/y`에 직접 저장하지 않는다. 월드 포털이나 진입점은 명시적 adapter와 stable anchor ID로 연결한다.
- gameplay collision/navigation과 시각 mesh/sprite를 분리한다.
- 저장에는 콘텐츠 ID와 직렬화 가능한 상태만 넣고 엔진 객체, 임시 VFX, interpolation 상태를 제외한다.
- schema version과 migration을 두고 구버전 save를 무손실로 거부하거나 변환한다.

## React 통합과 수명주기

- client component 경계를 캔버스 host까지 최소화한다.
- StrictMode 이중 초기화, async asset load 후 unmount, route 전환을 generation/abort guard로 방어한다.
- renderer, ticker/rAF, resize observer, pointer/keyboard listener, audio node, worker를 한 runtime owner가 소유한다.
- teardown에서 animation loop를 먼저 멈추고 listener와 scene child를 해제한 뒤 renderer/canvas를 제거한다.
- 공유 texture/material/geometry는 ref count 또는 asset manager 소유권을 확인하고 개별 scene이 임의 destroy하지 않는다.
- 오류 fallback은 DOM으로 제공하고 재시도 또는 안전한 월드 복귀 경로를 유지한다.
