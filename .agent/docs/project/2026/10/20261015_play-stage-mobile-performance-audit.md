# Play 스테이지 렌더링 — 모바일 성능 점검

- 작성일: 2026-10-15
- 대상: `node-app/` Play 스테이지 런타임 (pixi.js 8 아이소메트릭)
- 성격: 정적 코드 분석. 실기기 측정 전이므로 각 항목의 영향은 **구조 근거**로만 판정했다. 실측은 §4 계획을 따른다.
- 범위: `hooks/game/core/useGameInit.ts`, `useGameLoop.ts`, `hooks/game/npc/useNpcMovement.ts`, `hooks/game/input/useJoypadControls.ts`, `store/game/gameStore.ts`, `components/template/game-stage/*`, `components/module/game/game-ui/InteractionController.tsx`, `utils/game/pixi/TextureManager.ts`, 스프라이트 시트 합성 정책

---

## 0. 요약

가장 큰 문제는 GPU가 아니라 **메인 스레드(JS·React)**다. 모바일에서 끊김을 만드는 원인은 세 가지다.

1. **매 프레임 Zustand 스토어 갱신이 React 리렌더를 일으킨다.** 카메라는 매 RAF마다, 주인공은 30ms마다, NPC는 **NPC 수 × 30ms마다** 스토어에 쓴다. 이 값을 구독하는 HUD 컴포넌트가 그때마다 다시 렌더된다(P0-1).
2. **움직임이 렌더 주기와 맞지 않는다.** 이동은 30ms 고정 틱으로 보간 없이 처리하고, 카메라는 매 프레임 lerp한다. 그래서 60Hz와 120Hz 화면에서 캐릭터가 카메라 대비 떨려 보인다. NPC는 별도 `setInterval`로 움직인다(P0-2).
3. **텍스처 메모리가 모바일 예산을 넘는다.** 캐릭터 시트 1장이 최대 2048×2048(GPU 약 16MB)이다. 텍스처 캐시 상한은 256MB이고, WebGL context 손실 복구 경로가 없다. iOS Safari에서 탭이 죽거나 화면이 검게 변할 위험이 크다(P0-3).

이 셋을 고치면 ARPG로 확장할 때(몬스터 수 증가, 이펙트 추가)도 같은 구조를 쓸 수 있다. 그대로 두면 엔티티 수에 비례해 바로 무너진다.

---

## 1. 발견 사항

### P0 — 모바일 체감에 직접 영향, 수정 범위 작음

**P0-1. 매 프레임 스토어 쓰기로 인한 React 리렌더 폭주**

| 쓰기 | 빈도 | 위치 |
|---|---|---|
| `setCameraState(cam)` | 매 RAF 프레임 (60~120회/s) | `useGameLoop.ts` `updateCameraFollow` |
| `setProtagonist(...)` | 이동 틱마다 (≈33회/s) | `useGameLoop.ts` 이동 분기 |
| `updateNpcPosition(id, …)` | **NPC마다** 30ms (NPC 10명이면 ≈330회/s) | `useNpcMovement.ts:175`, `gameStore.ts:488` (immer + `npcs.find`) |

이 값을 구독하는 컴포넌트:
- `StageNavigationControls`가 `camera` 전체와 `protagonist`를 구독한다. **매 프레임 리렌더된다.**
- `InteractionController`가 `npcs`와 `protagonist`를 구독한다. 리렌더될 때마다 `useMemo`로 모든 NPC에 대해 투영과 거리를 다시 계산한다. 이 컴포넌트는 대화·상품 다이얼로그를 소유한 큰 트리다.
- `CharacterViewMode`가 `npcs`를 구독한다.

수정:
- 런타임 좌표(카메라, 주인공, NPC 위치)는 **ref나 `getState()` 전용 비반응 저장소**로 옮긴다. React에는 의미 있는 상태만 이벤트처럼 알린다. 예: 카메라 모드 변경, 주인공이 뷰포트 밖으로 나감, 가장 가까운 NPC가 바뀜.
- `StageNavigationControls`는 `showReturnToProtagonist` boolean 하나만 셀렉터로 구독한다(값이 바뀔 때만 리렌더).
- `InteractionController`의 가장 가까운 NPC 계산은 게임 루프의 NPC 근접 판정(이미 5프레임마다 실행)으로 옮긴다. 결과 id가 바뀔 때만 스토어에 쓴다.
- `updateNpcPosition`은 NPC 이동 틱마다 호출하지 말고, 이동 루프 끝에 **변경된 NPC를 한 번의 `set`으로 묶어** 쓴다. 이 값을 쓰는 곳이 상호작용 판정뿐이라면 아예 제거한다.

**P0-2. 고정 틱 이동 + 매 프레임 카메라 = 떨림, 그리고 RAF 루프 3개**
- 주인공 이동은 `GC.INTERVALS.MOVEMENT = 30ms` 틱마다 `step`만큼 움직이고 보간하지 않는다. 화면 주사율에 따라 이렇게 된다.
  - 60Hz: 2프레임에 1번 움직이고 카메라는 매 프레임 따라간다 → 캐릭터가 카메라 대비 떨린다.
  - 120Hz(ProMotion 아이폰, 고주사율 안드로이드): 4프레임에 1번 움직여 떨림이 더 심하다.
  - 기기가 30fps로 떨어지면 틱 판정이 프레임 경계에 걸려 체감 속도가 흔들린다.
- 동시에 도는 루프가 3개다.
  - `useGameLoop`의 자체 `requestAnimationFrame`
  - Pixi `app.ticker`(렌더, `app.start()`)
  - NPC 이동 `setInterval(30ms)`(`useNpcMovement.ts:85`)

  세 루프의 순서가 보장되지 않아 업데이트와 렌더가 1프레임씩 어긋날 수 있다. `setInterval`은 백그라운드 탭에서 throttling되면서도 계속 돈다.
- 수정:
  - 게임 업데이트를 **`app.ticker.add(update, null, UPDATE_PRIORITY.HIGH)` 하나로 통합**한다(렌더 직전에 업데이트 실행).
  - 이동은 deltaMS 기반으로 바꾼다(`speedPxPerSec × delta`). 또는 고정 시뮬레이션 틱을 유지하고 렌더 시 이전·현재 위치를 보간한다.
  - 애니메이션 프레임 진행도 `deltaMS` 누적으로 바꾼다. 지금은 `now - lastRenderTime >= 16` 판정이라 120Hz 화면에서 애니메이션 속도가 주사율에 묶인다.
  - ARPG로 확장할 때 전투 판정은 **고정 시뮬레이션 틱 + 렌더 보간** 구조가 필요하다. 지금 이 구조로 정리해 두면 그대로 쓸 수 있다.

**P0-3. 텍스처 메모리와 context 손실**
- 스프라이트 시트 정책은 셀 높이 256px × 8방향 행으로 시트 높이 2048, 폭 1024~2048이다(`gameAssetTemplates.ts:62-83`). RGBA로 풀면 **장당 8~16MB GPU 메모리**다. 화면에 그려지는 캐릭터 크기는 모바일에서 대략 64~120px이라, 대부분의 픽셀이 쓰이지 않는다.
- `TextureManager` 기본 상한은 256MB다(`TextureManager.ts:21`). iOS Safari 탭 전체 메모리 예산을 고려하면 너무 크다.
- `webglcontextlost`·`webglcontextrestored` 처리가 없다. iOS가 백그라운드 복귀나 메모리 압박 시 context를 회수하면 검은 화면으로 남는다.
- 수정:
  - 시트 합성 단계(`spriteSheetComposer.ts`)에서 **모바일 변형(셀 128px, 0.5배)**도 함께 생성한다. 클라이언트는 기기 등급에 따라 고른다. GPU 메모리가 1/4로 줄어든다.
  - 모바일 텍스처 캐시 상한을 96~128MB로 내리고, 스테이지를 떠날 때 비우는 정책을 명시한다.
  - canvas에 context lost/restored 리스너를 단다. 손실 시 루프를 멈추고 오버레이를 띄우며, 복구 시 텍스처를 다시 로드하고 루프를 재개한다.

### P1 — 품질·안정성, 수정 범위 작음

**P1-1. 렌더러 초기화 옵션** (`useGameInit.ts` `app.init`)
- `resolution`을 지정하지 않아 기본값 1이 쓰인다. 고해상도 폰에서 CSS 확대로 **흐릿하게** 보인다. 반대로 dpr 3을 그대로 쓰면 픽셀 수가 9배가 된다.
  → `resolution: Math.min(devicePixelRatio, deviceTier === "low" ? 1.5 : 2)`, `autoDensity: true`로 바꾼다.
- `antialias: true`는 2D 스프라이트 게임에서 얻는 것이 거의 없고 모바일 GPU에서는 MSAA 비용이 든다.
  → `false`로 바꾸고, 필요하면 스프라이트 텍스처에 `scaleMode` 정책을 따로 정한다.
- `powerPreference: "high-performance"`, `preference: "webgl"`을 명시한다. WebGPU는 iOS 지원 상황을 확인한 뒤 옵션으로만 둔다.

**P1-2. 백그라운드 전환 처리 없음**
- `visibilitychange`(앱 전환, 화면 잠금) 때 ticker와 NPC interval을 멈추지 않는다. 배터리와 발열에 영향을 준다. 복귀할 때 `lastFrameTimeRef`를 초기화하지 않으면 첫 delta가 수 초가 되어 카메라가 튄다.
  → 숨김 시 `app.ticker.stop()`, 복귀 시 delta를 리셋하고 재시작한다.

**P1-3. 깊이 정렬 매 이동 프레임 전체 재계산**
- 주인공이 움직이는 틱마다 장애물 전체와 NPC 전체로 `depthEntries`를 만들고(filter·map 배열 할당) `assignStableIsometricZ`로 정렬한다. 엔티티 수에 대해 O(n log n)이고 GC 부담을 만든다.
  → 장애물 depth key는 스테이지 로드 시 한 번만 계산한다. 이동한 엔티티만 key를 갱신하고, 정렬은 key가 바뀐 프레임에만 수행한다. 장애물이 많은 맵에서는 정적 레이어와 동적 레이어를 나누는 것도 검토한다.

**P1-4. 이동 틱마다 `stageDataRef` 순회 + runtime resolve**
- `Object.values(stageDataRef.current).find(resolveIsometricMovementRuntime)`가 이동 틱과 NPC 근접 판정, 컬링에서 반복 호출된다.
  → 스테이지 전환 시 runtime을 한 번 resolve해 ref에 캐시한다.

**P1-5. 이름표 `Text` 객체**
- 캐릭터마다 pixi `Text`를 만든다(`characterDisplayUtils.ts:156`). Text는 각자 텍스처를 가진다. 몬스터와 펫이 늘면 텍스처 수와 업로드 비용이 함께 늘어난다.
  → 한글 글리프 범위를 정해 `BitmapText`(동적 BitmapFont)로 바꾼다. ARPG에 데미지 숫자를 넣으려면 사실상 필수다.

**P1-6. 조이스틱 입력**
- `touchmove`마다 `getBoundingClientRect()`로 레이아웃을 읽는다(`useJoypadControls.ts:90`). 터치 시작 시 한 번만 측정하고 캐시한다.
- 입력이 8방향 + 30% 임계값으로 양자화되어 아날로그 감도가 없다. 시뮬레이션 장르에서는 괜찮지만, ARPG로 확장하면 각도와 크기를 그대로 쓰는 아날로그 벡터 입력이 필요하다.
- `touch` 이벤트 대신 Pointer Events로 통합하면 멀티터치(이동 + 스킬 버튼 동시 입력)를 관리하기 쉽다.

### P2 — 확장 대비

- 컬링이 15프레임마다 `worldContainer.children` 전체를 순회하고 일부 자식에 `getBounds()`를 호출한다. 엔티티가 수백 개가 되면 SpatialGrid의 뷰포트 질의로 바꾼다.
- 디버그 로그(`[useGameLoop][input-observed]`, `movement-diagnostic`)는 방향이 바뀔 때만 찍지만 객체를 크게 만든다. 프로덕션 빌드에서는 제거되는지 확인한다(`utils/log`의 레벨 정책).
- 텍스처 로딩은 `fetch → blob → createImageBitmap`이다. 맞는 방식이지만, 시트 여러 장을 한 아틀라스로 묶으면 draw call이 줄어든다. 펫과 몬스터가 늘어나는 시점에 검토한다.

---

## 2. 바로 고칠 수 있는 항목 (권장 순서)

| 순서 | 항목 | 예상 변경 범위 | 위험 |
|---|---|---|---|
| 1 | P1-1 렌더러 옵션 (resolution cap·autoDensity·antialias off) | `useGameInit.ts` 1곳 | 낮음 — 화질·성능 즉시 확인 가능 |
| 2 | P1-2 `visibilitychange` 일시정지 + delta 리셋 | `useGameLoop.ts`, `useNpcMovement.ts` | 낮음 |
| 3 | P0-3 context lost/restored 처리 + 모바일 캐시 상한 | `useGameInit.ts`, `TextureManager.ts` | 낮음 |
| 4 | P0-1 스토어 고빈도 쓰기 제거 (카메라·주인공·NPC 위치를 비반응 저장으로, 셀렉터 축소) | `gameStore.ts`, `useGameLoop.ts`, `useNpcMovement.ts`, `StageNavigationControls.tsx`, `InteractionController.tsx` | 중간 — 이 값을 읽는 곳 전수 확인 필요 |
| 5 | P0-2 루프 통합(ticker 하나) + delta 기반 이동·애니메이션 | `useGameLoop.ts`, `useNpcMovement.ts`, `gameLoopProtagonistAnimation.ts` | 중간 — 이동 속도 튜닝값(`step`, `MOVEMENT_STEPS`) 재조정 필요 |
| 6 | P1-3·P1-4 깊이 정렬·runtime 캐시 | `useGameLoop.ts` | 낮음 |
| 7 | P0-3 모바일 시트 변형(128px 셀) | `spriteSheetComposer.ts` + 텍스처 선택 로직 + 기존 에셋 재생성 배치 | 중간 — 에셋 파이프라인 변경 |
| 8 | P1-5·P1-6 BitmapText·아날로그 입력 | 표시·입력 계층 | ARPG 수직 슬라이스와 함께 |

1~3은 동작을 바꾸지 않는 안전한 개선이다. 4~5가 체감 차이가 가장 크다.

---

## 3. ARPG 확장 시 이 구조가 갖춰야 할 것

- **시뮬레이션과 렌더 분리**: 고정 틱(예: 20~30Hz)으로 전투·이동·충돌을 계산하고, 렌더는 보간한다. 서버가 보상을 검증할 때도 같은 틱 단위를 쓸 수 있다.
- **React는 HUD만**: HP·MP·쿨다운 같은 HUD 갱신은 초당 수 회로 throttle하거나, 변경된 값만 이벤트로 받는다. 엔티티 상태를 React 상태로 두지 않는다.
- **엔티티 풀링**: 몬스터, 투사체, 데미지 숫자 스프라이트는 만들고 버리지 않고 재사용한다.
- **텍스처 예산표**: 기기 등급별 GPU 메모리 예산(예: low 64MB / mid 128MB)과 맵당 엔티티 종류 상한을 정한다.

---

## 4. 실측 계획

1. **기기**: 중저가 안드로이드(예: Galaxy A 시리즈) 1대, iPhone(비 ProMotion) 1대, ProMotion iPhone 1대.
2. **시나리오**: Play 스테이지 진입 → 조이스틱 30초 연속 이동 → NPC 근접·대화 열기/닫기 → 백그라운드 전환 후 복귀.
3. **지표**: 평균 fps와 1% low fps, long task(50ms 초과) 횟수, JS heap, GPU 텍스처 메모리(Pixi `textureManager` 통계), 초기 로딩 시간. React DevTools Profiler로 이동 중 리렌더 수도 함께 본다.
4. 기준선을 잡은 뒤 §2 순서대로 하나씩 적용하며 비교한다.
