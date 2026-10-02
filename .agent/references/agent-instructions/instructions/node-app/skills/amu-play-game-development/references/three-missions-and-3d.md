# Three.js 미션과 3D 미니게임

## 목차

- [도입 게이트](#도입-게이트)
- [세로 조각](#세로-조각)
- [씬과 카메라](#씬과-카메라)
- [모바일과 적응형 품질](#모바일과-적응형-품질)
- [자원 수명주기](#자원-수명주기)

## 도입 게이트

- 현재 `package.json`과 lockfile에서 Three.js 및 보조 라이브러리 존재 여부를 확인한다.
- Three.js가 없다면 바닐라 Three.js로 충족 가능한지 먼저 판단한다. React renderer, 물리 엔진, 후처리 라이브러리를 한꺼번에 추가하지 않는다.
- 3D가 핵심 규칙, 공간 판독, 카메라 또는 물리 상호작용을 개선하는 근거를 기록한다.
- 기본 PixiJS 월드를 3D로 옮기지 않고 독립 mission session 경계를 만든다.

## 세로 조각

다음 한 경로를 먼저 완성한다.

1. 월드에서 미션 진입과 서버 세션 발급
2. 로딩·첫 입력·카메라 이해
3. 한 개 핵심 행동 또는 퍼즐 규칙
4. 성공/실패와 즉시 피드백
5. 결과 제출·검증·월드 복귀

레벨, 플레이어, 적, 아이템 정의를 immutable data로 두고 scene object와 분리한다. 어려운 상태에는 `seed`, fixture ID 또는 안전한 review query를 제공한다. production에서 debug 권한과 내부 데이터를 노출하지 않는다.

## 씬과 카메라

- renderer는 canvas container의 실제 크기를 사용하고 device pixel ratio를 품질 tier에 따라 제한한다.
- rAF 또는 `renderer.setAnimationLoop` 한 개만 사용하고 delta time을 프레임당 한 번 계산한다.
- simulation fixed step과 render interpolation이 필요하면 분리하고 catch-up step에 상한을 둔다.
- 카메라는 한 authoritative target, pitch/orbit/zoom bound와 occlusion 정책을 가진다.
- cinematic, lock-on, shake는 기본 카메라 위의 일시적 modifier로 구현하고 reduced motion에서 제거·완화한다.
- visual mesh에서 충돌이나 hit를 추정하지 말고 단순 collider와 authoritative contact event를 사용한다.
- 레벨 고도는 게임 규칙에 필요한 경우에만 사용한다. 모든 3D 미션을 단일 평면으로 강제하지 않되, 이동 가능 surface와 navigation link를 명시한다.

## 모바일과 적응형 품질

- 이동, 주요 행동, 취소·reset, 카메라 제스처 영역을 분리한다.
- portrait와 landscape 전환 시 세션을 초기화하지 않고 HUD safe area와 touch target을 재배치한다.
- 장식 품질부터 줄이고 telegraph, collider 판독, 입력 응답, 목표 표시는 유지한다.
- shadow, post-processing, 투명 particle, pixel ratio, animation update, LOD를 명시적 quality tier로 제어한다.
- 저성능 tier에서도 성공/실패 규칙과 입력 timing이 달라지지 않게 한다.

## 자원 수명주기

scene owner가 다음 자원을 추적한다.

- geometry, material, texture, render target, composer pass
- animation mixer/action, skeleton clone, LOD child
- rAF/animation loop, clock, resize observer, event listener
- audio node, worker, loader request와 object URL

종료 순서는 입력 차단 → loop 정지 → pending async 무효화 → mixer/listener 해제 → scene graph 분리 → scene 전용 GPU 자원 dispose → renderer/context/canvas 제거로 고정한다. 공유 asset cache는 소유권 계약에 따라 해제한다. 재진입과 StrictMode에서 renderer 또는 canvas가 중복 생성되지 않는 fixture를 둔다.
