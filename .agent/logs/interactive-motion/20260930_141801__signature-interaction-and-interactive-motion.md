# 작업 로그 — 시그니처 인터랙션 & 인터랙티브 아티클 모션 (node-app)

- 작성일: 2026-09-30 14:18 KST
- 브랜치: `claude/laughing-ptolemy-7wmxou`
- 대상 독자: 이 결과를 실제 로컬 `node-app`에 적용하는 에이전트와 운영자
- 한 줄 요약: 인터랙티브 아티클 전용 리소스 계약 `interactive-article.v1`과, 그 리소스를 node-app에서 재생하는 모션 런타임을 **새 폴더로만** 추가했다. 런타임은 `t`의 순수 함수로 동작하며, 여기에 시그니처 제스처 컨트롤러와 React 표면 3종(Story 플레이어 · Hero · 홈 카드)이 붙는다. 기존 앱 소스는 한 줄도 바꾸지 않았다. 새 의존성도 없다.

---

## 0. 확정된 범위 (작업 중 사용자 결정)

| 결정 | 내용 | 반영 |
| --- | --- | --- |
| 실행 환경 | **모두 node-app 기준.** WordPress와는 무관하다 | 설계 문서의 WP 항목을 전부 제외했다: vanilla WAAPI 런타임, amu24 테마 카드, `story-surfaces` HMAC API, WP embed |
| 리소스 정의 | 인터랙티브 아티클은 `/magazine/{slug}` 기사를 그대로 쓰지 않는다. 특정 기사를 **기반으로 인터랙티브 전용으로 완전히 재구성한 리소스**를 쓴다 | `interactive-article.v1` 계약을 새로 만들었다. 원문은 `source` 메타데이터로만 추적한다. 기존 `editorialStory.ts`·`AppMagazineStoryMode`·`AppMagazineMotionCover`는 건드리지 않았다 |
| 라우트 | 이번 범위 밖 | 페이지·라우트는 만들지 않았다. 컴포넌트는 `href`와 `onClose`를 소비자에게서 받는다 |
| 저장·공급 | 정적 파일로 번들 | `src/interactive-articles/` 레지스트리를 두었다. Mongo 모델과 스키마 변경은 없다 |
| 홈(/) 카드 | 인터랙티브 아티클 리소스를 보여준다 | `homeCard` 표면과 `InteractiveArticleHomeDeck`를 만들었다. `HomePageClient`에 실제로 연결하는 일은 라우트 확정 후로 미뤘다(§7) |

---

## 1. 참고(입력) 문서

| 문서 | 위치 | 이번 작업에서의 용도 |
| --- | --- | --- |
| Motion Story 설계·구현 계획 | `.agent/references/NODE_APP/signature_interaction_and_interactive_motion/20260929_065533__motion-story-runtime-design-and-implementation-plan.md` | 주 설계 근거. §4.1 v2 계약 초안, §4.2 토큰, §4.3 표면별 재생 규칙, §4.4 결정성, §6 UI 계약 10항목 |
| 홈 리뉴얼 원장 | `…/todo-allmyuniverse-home-renewal.json` | HOM-03 제스처 언어의 출처: 방향 락, edge 보호, 인터랙티브 요소 예외, 좌/우 스와이프·더블 탭 의미, 키보드 대체, reduced-motion |
| 인터랙티브 아티클 원장 | `…/todo-character-interactive-article.json` | 경계 조건: 게스트 비허용, 스키마 무변경, 새 GA4 이벤트 금지, 외부 발행 금지 |
| Three.js 경험 계획 | `…/amu_threejs_experience_plan.md` | Story Beat(의미)와 Scene(표현)의 분리. 카드 등급 standard/motion/signature. 하나의 Beat를 여러 표면으로 재사용 |
| Motion Content UI 시스템 | `…/motion-content-ui-system.md` | 결정성 원칙과 Motion Design System 분류(Entrance/Emphasis/Exit/Camera/Transition) |
| Interactive Episode System · Knowledge-Grounded Narrative Engine | `…/AMU_Interactive_Episode_System.md`, `…/Knowledge-Grounded_Narrative_Engine.md` | 배경 참고: Hook → Conflict → … 구조, Fact/Interpretation 분리. claimStatus 필터의 근거 |
| 기존 텍스트 모션 로그 | `.agent/logs/text-motion-library/20260930_041213__text-motions-library.md` | 폴더 추가 방식과 로그 형식. `text-motions/core/easing`을 재사용했다 |

---

## 2. 적용 에이전트용 체크리스트

1. 아래 §3의 **신규 파일 20개**를 로컬 `node-app`의 같은 경로로 복사한다.
2. 기존 파일은 **수정할 필요가 없다.** `package.json`도 바꾸지 않는다.
3. 로컬에서 검증한다.
   - `pnpm run lint`: 이 저장소에서 `eslint-plugin-react-hooks@7` 권장 규칙과 `@next/eslint-plugin-next` 권장 규칙으로 통과를 확인했다(§6). 앱의 전체 설정으로는 아직 돌리지 않았다.
   - `pnpm run typecheck`: `tsconfig.build.json`의 include에 `src/motion-story`, `src/interactive-articles`, `src/components/module/magazine/story`가 들어가는지 확인한다.
4. 모든 import는 **상대 경로**다. baseUrl이나 alias 설정에 의존하지 않는다.
5. 리소스를 추가할 때는 `src/interactive-articles/resources/<slug>.ts`를 만들고 `index.ts`의 `RESOURCES`에 등록한다. `status: "published"`로 바꾸는 것은 공개 행위이므로 사용자 승인 대상이다(G-CIA-02).
6. §7의 연결 작업은 라우트가 확정된 뒤에 한다.

---

## 3. 추가된 파일 (20개, 모두 신규)

### 3.1 코어 — `node-app/src/motion-story/` (프레임워크 중립, 서버에서도 import 가능)

| 파일 | 줄 | 역할 | 주요 export |
| --- | --- | --- | --- |
| `tokens.ts` | 80 | `motion-tokens.v1` 단일 소스: duration(fast 160 · base 240 · slow 420 · line 520 · count 1200), easing, stagger(line 380 · word 90), readingPace(초당 9자 · 줄당 최소 1400ms), 장면 기본값, 카드 루프 예산(2장면 · 8000ms · 2회 · 가시 비율 0.6), a11y(5초 규칙 · 동시 모션 2) | `MOTION_TOKENS` `MOTION_TOKENS_VERSION` `cubicBezierCss` |
| `presets.ts` | 294 | 프리셋 19종을 구조화된 채널(opacity · translate · scale · clip · underline)로 정의한다. 순수 샘플러, CSS 변환, WAAPI 키프레임, number-count를 제공한다 | `MOTION_PRESETS` `samplePreset` `channelsToCss` `toWaapiKeyframes` `sampleNumberCount` `combineChannels` |
| `contract.ts` | 492 | `interactive-article.v1` 타입과 엄격 검증기, 조회 헬퍼, 텍스트 지문 | `parseInteractiveArticle` `getSurfaceScenes` `computeStoryTextHash` `InteractiveArticleResource` 등 |
| `compiler.ts` | 147 | 결정론적 표현 컴파일러: 역할 → layout·프리셋 매핑, readingPace 타이밍, 표면 초안 | `draftScenesFromBeats` `draftSurfaces` `computeSceneDurationMs` `ROLE_PRESENTATION` |
| `timeline.ts` | 347 | 리소스 → 표면별 절대 시간표 → 임의 시점 샘플링. 루프 해석과 내레이션 cue를 처리한다 | `buildStoryTimeline` `sampleStoryTimeline` `sampleSceneStyles` `resolvePlayback` `getSceneRestTimeMs` |
| `clock.ts` | 85 | rAF 클럭. `getMasterTimeMs`로 외부 마스터 클럭(오디오)을 쓸 수 있다 | `createStoryClock` |
| `guards.ts` | 111 | reduced-motion·탭 숨김 구독, 뷰포트당 active 표면 1개를 고르는 arbiter | `getSharedSurfaceArbiter` `subscribeReducedMotion` `subscribeDocumentHidden` |
| `gesture.ts` | 320 | 시그니처 인터랙션: 순수 상태 머신, DOM 바인딩, 표면별 의미 매핑, 키보드 맵 | `reduceGesture` `bindGestures` `toStoryAction` `toDeckAction` `STORY_KEYMAP` `DECK_KEYMAP` `DEFAULT_GESTURE_CONFIG` |
| `index.ts` | 130 | 공개 API 배럴 | — |
| `README.md` | — | 사용법, 불변식, 결정성 ESLint 규칙 스니펫 | — |

### 3.2 리소스 — `node-app/src/interactive-articles/`

| 파일 | 줄 | 역할 |
| --- | --- | --- |
| `index.ts` | 67 | 정적 레지스트리. 등록된 리소스를 모두 검증한다. 실패하거나 slug가 중복된 리소스는 제외하고 사유를 보고한다(fail-closed). 조회 함수: `getInteractiveArticle`, `listPublishedInteractiveArticles`, `listHomeCardInteractiveArticles`. **현재 등록된 리소스는 0건**이다 |
| `fixtures/sampleInteractiveArticle.ts` | 113 | 계약과 런타임을 검증하기 위한 샘플이다. 실제 기사가 아니므로 공개하지 않는다(`status: draft`, 레지스트리에 등록하지 않음). 수치는 예시값이다. layout 6종, reveal 3종, 강조 2종, 카메라·전환을 모두 한 번씩 쓴다 |

### 3.3 React 표면 — `node-app/src/components/module/magazine/story/`

| 파일 | 줄 | 역할 |
| --- | --- | --- |
| `useStoryTimeline.ts` | 233 | 재생 훅. SSR과 초기 렌더는 정지 프레임이다. 재생 조건은 마운트됨 · active · 재생 의도 · reduced-motion 아님 · 탭 표시 · hold 아님이다. 루프, 장면 이동, 일시정지, hold, 완료 콜백을 다룬다 |
| `useSurfaceVisibility.ts` | 62 | `useActiveSurface`(공유 arbiter), `useSurfaceImpression`(60% 이상 가시 상태가 1초 유지되면 1회) |
| `scenes/StorySceneView.tsx` | 270 | **결정적 장면 렌더러.** `(scene, localMs, isStatic, assets)`를 DOM으로 그린다. layout 7종(cover · statement · image_text · quote · data · comparison · outro)을 지원한다 |
| `scenes/NumberCount.tsx` | 32 | number-count. 시각 숫자는 `aria-hidden`으로 두고, 스크린리더에는 최종값만 노출한다 |
| `InteractiveStoryPlayer.tsx` | 225 | 9:16 Story 플레이어. 장면별 세그먼트 진행 바, 탭·스와이프·롱프레스, 키보드(← → Space Esc Home End), 일시정지 버튼(`aria-pressed`)을 갖춘다 |
| `InteractiveArticleHero.tsx` | 71 | 진입부 Hero. `hero` 표면을 1회 재생한 뒤 멈춘다. 5초를 넘으면 일시정지 버튼을 둔다 |
| `InteractiveArticleCard.tsx` | 229 | 홈 시그니처 카드와 `InteractiveArticleHomeDeck`, `resolveDeckTiers`(signature는 1장만). 카드는 2회 루프, 덱 제스처, 노출 계측을 담당한다 |
| `index.ts` | 15 | 배럴 |

### 3.4 로그·검증 자료 — `.agent/logs/interactive-motion/`

| 경로 | 내용 |
| --- | --- |
| 이 문서 | 작업 로그 |
| `verification/` | §6 검증에 쓴 스크립트 원본: core 테스트, 브라우저 하네스·실행기, tsconfig, eslint 설정 |
| `screenshots/` | Chromium 렌더 캡처 6장 (375px · 1440px) |

### 의존 방향 (순환 없음)

```
components/module/magazine/story/*  →  motion-story/index  →  gesture · clock · guards · timeline → compiler → contract → presets → tokens
                                                                                                        presets → text-motions/core/easing
interactive-articles/*              →  motion-story/index
```

- 외부 패키지 import는 React 표면의 `react`와 `lucide-react`뿐이며, 둘 다 앱에 이미 설치돼 있다.
- 번들 비용(측정): React 표면과 코어 전체를 minify하면 **12.0 KB gzip**이다. 코어만은 11.5 KB gzip이다. lazy runtime 예산 180 KB와 비교하면 약 7%다.

---

## 4. 설계 요약

### 4.1 리소스 계약 `interactive-article.v1`

```text
InteractiveArticleResource
├─ source { kind: app_content | wp_post, ref, title }   ← 기반 원문 (추적용 메타데이터일 뿐, 렌더 입력이 아님)
├─ title · summary · slug · status(draft|ready|published|retired) · revision · createdAt/updatedAt
├─ motionTokensVersion: "motion-tokens.v1"
├─ assets[]  { assetId, src(/… 또는 https), alt, width, height }
├─ beats[]   { beatId, role(9종), headline?, body[], importance 1~5, sourceRefs[] }     ← 의미
├─ scenes[]  { sceneId, beatIds, layout(7종), visual?{assetId|primitiveKey+fallbackAssetId, camera},
│              data?{figures[]}, text{reveal, enter?, emphasis?, maxLines?},
│              timing{preRollMs, durationMs, holdMs}, transitionOut? }                  ← 표현
├─ sceneOrder[]
└─ surfaces { story, hero?, homeCard?{tier}, short?{format:"9:16", maxDurationMs} }      ← 표면별 장면 선택
```

검증 규칙은 모두 `parseInteractiveArticle`에 있다.
- 알 수 없는 필드는 모든 깊이에서 거부한다. 리소스에 코드나 CSS를 섞을 수 없다.
- 이미지는 `assets`의 assetId로만 참조한다. Scene에서 URL을 직접 쓰는 것과 프로토콜 상대 URL은 금지한다. `primitiveKey`를 쓰려면 `fallbackAssetId`가 필수다.
- 프리셋은 카테고리에 맞아야 한다: `text.enter`는 `enter.*`, `emphasis`는 `emph.*`, `camera`는 `camera.*`, `transitionOut`은 `trans.*`만 허용한다.
- `data`·`comparison` layout에서는 수치의 `claimStatus`가 **measured 또는 sourced**여야 하고 `sourceRefs`가 필수다. hypothesis와 prohibited는 거부한다. `comparison`은 수치 2개가 필요하고, `number-count`는 이 두 layout에서만 쓸 수 있다.
- `homeCard`와 `hero`는 장면 2개 이하, `durationMs + holdMs` 합계 8,000ms 이하다(설계 §4.1의 루프 피로 방지).
- `short`는 `status=published`인 리소스만 가질 수 있고, 총 길이가 `maxDurationMs`(45,000 이하)를 넘으면 안 된다.
- ID 중복, 깨진 beat·scene 참조, 빠진 `sceneOrder`, 형식이 틀린 slug·ISO 날짜는 거부한다.

### 4.2 Motion Design System (프리셋 19종)

| 분류 | 프리셋 | 비고 |
| --- | --- | --- |
| Entrance | `enter.fade` `enter.fade-up` `enter.scale-in` `enter.mask-reveal` `enter.slide-left` | spring은 제외했다. 결정적인 곡선만 쓴다 |
| Emphasis | `emph.pulse` `emph.underline` `emph.number-count` | number-count는 키프레임이 아니라 `t`의 순수 함수로 계산한다 |
| Exit | `exit.fade` `exit.slide-up` | blur는 채널 제한(opacity·transform·clip-path) 때문에 제외했다 |
| Camera | `camera.still` `camera.push` `camera.pull` `camera.pan-left` `camera.pan-right` | 장면 전체 길이 동안 linear로 움직인다(Ken Burns). orbit은 3D라서 제외했다 |
| Transition | `trans.cut` `trans.fade` `trans.wipe` `trans.zoom` | morph는 제외했다 |

같은 정의에서 두 가지를 만든다.
- `samplePreset(key, t)`: 순수 계산. React, 스크럽, export가 쓴다.
- `toWaapiKeyframes(key)`: 컴포지터 재생이나 export driver용 WAAPI 키프레임.

두 결과가 같은지는 Chromium에서 실측으로 확인했다(§6).

### 4.3 타임라인 · 결정성

- 장면 로컬 시간은 `preRoll → reveal(durationMs) → hold → transitionOut`으로 흐른다. 퇴장 전환은 장면 끝의 hold 구간 안에서 재생되므로 장면끼리 겹치지 않는다.
- reveal 단위
  - `line`: 줄마다 380ms stagger
  - `word`: 어절마다 90ms stagger. 한국어는 공백 기준이며 조사가 붙은 어절을 한 단위로 본다
  - `fade`: 블록 전체가 하나로 등장
  - `none`: 정적
- 내레이션 cue(`sceneId → [{startMs,endMs}]`)가 있고 `word` reveal의 어절 수와 같으면 cue 시각을 쓴다. 다르면 readingPace 타이밍으로 fallback한다. 이것이 향후 ElevenLabs `with-timestamps` 연동 지점이다.
- **정지 프레임**(`restLocalMs`)은 텍스트가 모두 보이고 퇴장 전인 시점이다. 다음 상황에서 이 프레임을 쓴다.
  - SSR과 초기 렌더
  - reduced-motion
  - 일시정지 상태에서 장면 이동
  - 재생 완료 후
- 루프: `resolvePlayback(timeline, elapsed, loops)`. 루프 횟수를 채우면 마지막 정지 프레임에서 멈춘다.
- 시간 소유권: 웹에서는 `useStoryTimeline`과 `createStoryClock`만 시간을 진행한다. 장면 컴포넌트는 시간을 읽지 않는다. 향후 export driver는 `t = frame / fps * 1000`을 직접 넘기면 된다.

### 4.4 시그니처 인터랙션 (제스처)

| 규칙 | 구현 |
| --- | --- |
| 방향 락 | 이동량이 10px 이상이고 한 축의 이동이 다른 축의 1.2배 이상이면 그 축으로 고정한다. 홈 카드(`axes: "x"`)에서 세로로 락되면 네이티브 스크롤에 넘긴다(`touch-action: pan-y`). Story stage는 `axes: "both"`에 `touch-action: none`이다 |
| edge 보호 | 화면 양끝 24px 안에서 시작한 포인터는 처리하지 않는다(브라우저 뒤로가기 제스처 보호) |
| 인터랙티브 요소 예외 | 링크·버튼·입력·`[data-gesture-ignore]` 위에서 시작한 포인터는 처리하지 않는다 |
| 스와이프 판정 | 64px 이상 이동하거나, 24px 이상이면서 속도가 0.45px/ms 이상(fling)이면 스와이프다 |
| 탭 · 더블 탭 · 롱프레스 | 탭은 이동 10px 이하·300ms 이하. 더블 탭은 280ms·24px 안. 더블 탭 판정을 켜면 단일 탭은 판정 창이 지난 뒤 발행한다. 롱프레스는 450ms |
| 홈 Deck 의미 | 오른쪽 스와이프 = 읽기, 왼쪽 스와이프 = 카테고리 탐색, 더블 탭 = 좋아요, 단일 탭 = 액션 없음. 키보드 ← → 로도 같은 동작을 한다. 좋아요는 `onDeckAction`이 넘어올 때만 켜진다. 저장 백엔드가 없으면 연결하지 않는다(HOM-03 규칙) |
| Story 의미 | 탭 왼쪽 1/3 = 이전, 나머지 = 다음. 스와이프 좌 = 다음, 우 = 이전, 아래 = 닫기. 롱프레스는 누르는 동안만 정지한다(사용자 정지 상태는 바꾸지 않는다). 키보드는 ← → Space Esc Home End이고, 같은 기능을 하단 버튼으로도 쓸 수 있다 |

> **잠정값 주의**: 위 임계값은 `DEFAULT_GESTURE_CONFIG`에 모아 둔 **잠정값**이다. 원장이 정본으로 지목한 Interaction Language v2 문서(`.agent/references/AMU-MAGAZINE/amu_renewel_idea_development.md` §16–18)가 이 저장소에 없어 대조하지 못했다. 정본 수치를 확인하면 이 객체만 바꾸면 된다(§8-1).

### 4.5 표면별 재생 규칙 (설계 §4.3 · §6 반영)

| 표면 | 재생 | 정지·접근성 |
| --- | --- | --- |
| 홈 카드 | 가시 비율 0.6 이상인 카드 중 가장 많이 보이는 1장만 재생한다. 2회 루프 뒤 마지막 정지 프레임에서 멈춘다. 등급은 standard(정적), motion(Ken Burns + 텍스트), signature(motion + `signatureLayer`, 페이지당 1장) | 44×44 일시정지 버튼(`aria-pressed`)과 하단 루프 진행선을 둔다. 첫 카드 이미지는 `fetchPriority=high`와 `loading=eager`, 나머지는 lazy다. `aspect-[4/5]`로 CLS를 막는다 |
| Hero | 1회 재생 후 정지한다. 루프는 없다. h1은 Hero 밖(소비자)에 둔다 | 5초를 넘으면 일시정지 버튼을 둔다 |
| Story 플레이어 | 전체 장면을 자동으로 진행하고, 끝나면 `onComplete`를 호출한다. 마지막 outro 장면에 `outroAction`(예: 원문 기사 보기)을 둔다 | reduced-motion이면 자동 재생을 끄고 그 사실을 안내한다. 수동 이동은 가능하다 |
| 공통 | 탭이 숨겨지면 정지한다. SSR에서도 텍스트가 모두 보이고, 모션은 hydration 뒤에 시작한다. 이미지 위 텍스트에는 중립 토큰 scrim(`from-background`)을 깐다 | 색은 기존 토큰(`background` · `surface` · `muted` · `border` · `primary` · `primary-text` · `secondary-text`)만 쓴다. 새 폰트나 색은 없다 |

---

## 5. 기존 코드와의 관계

| 대상 | 관계 |
| --- | --- |
| `libs/server-utils/magazine/editorialStory.ts` (editorial-story.v1) | **변경 없음.** `/magazine/{slug}` 기사의 Story Mode용 결정론적 변환기다. 인터랙티브 아티클은 별도 리소스를 쓰므로 소비하지 않는다. Beat 역할 enum(9종)과 layout 이름은 v1 계약과 맞췄다 |
| `AppMagazineStoryMode.tsx` · `AppMagazineMotionCover.tsx` | **변경 없음.** 원한다면 기존 Story Mode도 이 런타임으로 옮길 수 있다(§9-3) |
| `HomePageClient.tsx` | **변경 없음.** 연결 방법은 §7에 적었다 |
| `text-motions/` | `core/easing`의 `resolveEasing`(CSS와 같은 cubic-bezier 계산)을 재사용한다. 텍스트 모션 프리셋과 연결하는 것은 후속 후보다(§9-4) |
| Mongoose 스키마 · 정책 문서 · GA4 이벤트 정의 | **변경 없음.** 노출 계측은 콜백(`onImpression`)으로만 제공하고, 기존 `article_experience_impression`에 `surface` 속성을 싣는 방식을 권한다 |

---

## 6. 검증 (이 저장소에서 수행 · 모두 통과)

앱의 `node_modules`와 `tsconfig`가 이 저장소에 없어서 스크래치 환경에서 검증했다. 사용한 버전은 TypeScript 5.8, React 19, @types/react 19.2.7, lucide-react 1.28.0, esbuild, Tailwind v4.1.11, Chromium 1194, eslint 9 + eslint-plugin-react-hooks 7 + @next/eslint-plugin-next 16이다. 스크립트 원본은 `verification/`에 있다.

| 검증 | 결과 |
| --- | --- |
| `tsc --strict --noUncheckedIndexedAccess` | 통과 |
| 같은 설정 + `--exactOptionalPropertyTypes` | 통과 (선택 prop에 `\| undefined`를 명시했다) |
| ESLint: react-hooks v7 권장(React Compiler 규칙 `refs` · `set-state-in-effect` · `immutability` 포함) + next 권장 + `reportUnusedDisableDirectives` | 통과. 처음 돌렸을 때 오류 9건이 나와 **규칙을 끄지 않고 코드를 고쳤다**. latest-ref 대입을 effect로 옮겼고, 외부 상태는 `useSyncExternalStore`로 읽게 했고, 타임라인이 바뀔 때의 초기화를 렌더 중 조정 패턴으로 바꿨고, 덱 등급 계산은 순수 함수로 분리했다 |
| 결정성 grep: `scenes/**`와 순수 코어 5개 파일에서 `Math.random` · `Date` · `performance.now` · `fetch` · `setTimeout` · `setInterval` · `window.scroll` 사용 | 0건 (주석만 일치) |
| **core 테스트 44건** (node) | 통과. 계약 거부 사례 17종(알 수 없는 필드 · URL assetId · 없는 asset · hypothesis claim · comparison 개수 · data 위치 · 프리셋 카테고리 · number-count 위치 · 카드 예산 · 카드 장면 수 · short 상태 · 깨진 참조 · sceneOrder · primitive fallback · ID 중복 · 프로토콜 상대 URL 등), 레지스트리 fail-closed, 컴파일러 초안 검증 통과·결정성, readingPace, 프리셋 19종 전 시점 NaN 없음, 끝점 값, 타임라인 연속성·구간, 시작 전 숨김·정지 프레임 표시·동일 입력 동일 출력, 어절 stagger, cue 적용과 fallback, 카드 루프·완료, 제스처 상태 머신 16개 시나리오, 표면 의미 매핑, SSR 마크업(정지 프레임, 첫 이미지만 high priority, signature 1장 제한) |
| **Chromium 브라우저 테스트 7개 묶음** | 통과. 콘솔 error와 warning 모두 0건 |
| └ WAAPI 동등성 | 프리셋 전체(cut·counter 제외)를 6개 시점에서 비교했다. `element.animate(toWaapiKeyframes)` + `currentTime` seek의 computed style과 순수 샘플러의 결과가 opacity · transform · clip-path · background-size 모두 **차이 0** |
| └ Story 플레이어 | 자동 재생으로 장면이 넘어간다. ← → End Home, 일시정지 버튼과 `aria-pressed`, 정지 중 이동 시 정지 프레임 텍스트 opacity 1, 탭 좌·우, 마우스 스와이프 좌, 아래 스와이프로 닫기, 롱프레스 중 정지 후 해제 시 재개(장면 이동 없음), Esc 닫기를 확인했다 |
| └ 완주 | 7개 장면 순서대로 `onSceneChange`가 호출되고 `onComplete` 이후 마지막 장면에서 멈춘다 (1440px) |
| └ reduced-motion | 자동 재생 버튼이 없고 안내 문구가 보인다. 모든 텍스트 opacity 1, 마스크 없음. 수동 이동 가능 |
| └ 홈 덱 | 카드 2장 중 active는 1장뿐이고, 스크롤하면 active가 넘어간다. 노출 콜백은 1초 뒤 발생한다. 수동 정지는 유지된다. 오른쪽 스와이프 = read, 더블 탭 = like, 단일 탭 = 없음, edge 24px 안에서 시작한 스와이프는 무시, 키보드 ← = explore-category |
| └ Hero | 1회 재생 후 `aria-pressed=false`가 되고 두 번째 장면의 정지 프레임에서 멈춘다 |
| └ SSR → hydration | 세 표면 모두 hydration mismatch 경고가 0건이고, 서버 마크업에 `opacity:0`이 없다(텍스트가 보인다) |
| 스크린샷 | `screenshots/`: Story 375px(Hook 프리롤·비교 수치·인용), 1440px(중앙 9:16), 홈 덱 375px, Hero 1440px |

### 검증 중 발견해서 고친 결함

1. **데스크톱 마우스 스와이프가 동작하지 않았다.** 카드 이미지 위에서 드래그하면 브라우저의 네이티브 이미지 드래그가 시작되고 `pointercancel`이 발생했다. 장면 이미지에 `draggable={false}`, 카드 미디어에 `select-none`을 줘서 고쳤다.
2. 일시정지를 누른 뒤 `aria-pressed` 반영이 한 프레임 늦었다. `pause()`가 같은 렌더에서 클럭을 멈추도록 바꿨다.
3. 가독성: 이미지 위 장면 카운터의 대비가 낮아 배경 pill을 추가했다. cover 장면의 Hook을 headline 굵기로 바꿨다.

### 알려진 테스트 환경 한계

- headless Chromium에서 포인터가 캡처된 채 화면 변화가 없으면 CDP 마우스 이동의 응답(ack)이 지연되는 현상이 있다. 이것은 테스트 도구 쪽 한계이고, long task가 0건이라 앱이 원인이 아님을 확인했다. 그래서 세로 스와이프와 롱프레스 검증은 합성 touch `PointerEvent`로 했다. 탭과 가로 스와이프는 실제 마우스 입력으로 검증했다.
- 실제 터치 기기에서 제스처가 어떻게 느껴지는지는 확인하지 못했다(§8-4).

---

## 7. 연결 가이드 (라우트 확정 후)

### 7.1 인터랙티브 아티클 페이지 (예: `/interactive/[slug]`, 경로는 미정)

```tsx
// app/interactive/[slug]/page.tsx (서버 컴포넌트) — 예시
import { notFound } from "next/navigation";
import { getInteractiveArticle } from "../../../interactive-articles";
import InteractiveArticleClient from "./InteractiveArticleClient"; // "use client": Hero + Dialog(StoryPlayer)

export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const resource = getInteractiveArticle((await params).slug); // published 만. 아니면 null
  if (!resource) notFound();
  return <InteractiveArticleClient resource={resource} />;
}
```

- Story 플레이어는 기존 `@amu-labs/ui`의 `Dialog`로 감싼다(`AppMagazineStoryMode`와 같은 패턴). 이때 지킬 것:
  - `hideClose`로 기본 닫기를 숨기고 `onClose`로 다이얼로그를 닫는다.
  - 닫은 뒤 포커스를 트리거 버튼으로 되돌린다.
  - 플레이어 안에서 다른 Dialog를 열지 않는다(중첩 풀스크린 금지).
- 버튼 문구는 "스토리로 보기"를 권한다(OD-MS-05 권고안).

### 7.2 홈(/) 카드

`HomePageClient.tsx`의 매거진 섹션 위에 다음 한 블록을 넣으면 된다. published 리소스가 0건이면 아무것도 렌더하지 않는다.

```tsx
import { listHomeCardInteractiveArticles } from "../../../interactive-articles";
import { InteractiveArticleHomeDeck } from "../../module/magazine/story";

<InteractiveArticleHomeDeck
  resources={listHomeCardInteractiveArticles(5)}
  hrefFor={(r) => `/interactive/${r.slug}`}
  onDeckAction={(action, r) => { if (action === "read") handleNavigate(`/interactive/${r.slug}`); /* explore-category: 카테고리 목적지 확정 후. like: 저장 백엔드 생기기 전에는 연결 금지 */ }}
  onImpression={(r) => trackGaEvent("article_experience_impression", { stage: "entry", surface: "home_card", experience_id: r.articleId, story_revision: r.revision })}
/>
```

- 홈과 아카이브에 넓게 적용하는 것은 설계 문서의 **G-AIR-10 게이트**(파일럿 판정 전 확대 금지)와 **OD-MS-01**에 해당한다. 공개 리소스를 3~5건으로 제한해 파일럿으로 시작하기를 권한다.
- signature 등급의 `signatureLayer`에는 기존 `AppMagazineMotionCoverCanvas`(R3F, `dynamic ssr:false`)를 넘길 수 있다. 카드는 active이고 reduced-motion이 아닐 때만 이 레이어를 렌더한다. WebGL2 지원과 저사양 판정은 기존 `AppMagazineMotionCover`의 `useSignatureRuntimeEligibility` 로직을 재사용하기를 권한다.

---

## 8. 미검증 · 사용자 확인 필요

1. **제스처 임계값의 정본 대조**: Interaction Language v2(§16 방향 락, §17 상태 머신, §18 임계값)가 이 저장소에 없다. 확인되면 `DEFAULT_GESTURE_CONFIG`만 바꾸면 된다.
2. 앱의 실제 `eslint.config`와 `tsconfig.build.json`으로 `pnpm run lint`·`pnpm run typecheck`를 돌리지 않았다. 앱 고유 규칙(import 순서, 파일명 규칙 등)이 더 있을 수 있다.
3. Next 16 App Router 실제 페이지에서 렌더하는 것(RSC 경계, `"use client"` 배치)은 라우트가 확정된 뒤 확인해야 한다.
4. 실기기(iOS Safari·Android Chrome)에서 터치 제스처 체감, 뒤로가기 edge 제스처와의 충돌 여부, CWV(LCP 2.5초 이하·INP 200ms 이하·CLS 0.1 이하)를 확인하지 않았다.
5. 스크린리더 실기 테스트(VoiceOver·TalkBack)의 읽기 순서와 장면 알림 빈도를 확인하지 않았다.
6. `readingPace`(초당 9자·줄당 최소 1400ms)는 설계 문서의 추정값이다. 파일럿의 완주율과 이탈 지점으로 보정해야 한다.

## 9. 후속 작업 후보

1. 인터랙티브 아티클 라우트와 페이지 셸, 홈 연결(§7). 파일럿 리소스 3~5건을 저작하고 공개 승인을 받는다.
2. 내레이션(P4): ElevenLabs `with-timestamps` 사양을 확인하고, 문자 alignment를 어절 cue로 접은 뒤 `cues`와 `getMasterTimeMs`에 넘긴다. `computeStoryTextHash`로 텍스트 불일치를 차단한다.
3. 기존 `/magazine/{slug}` Story Mode(`AppMagazineStoryMode`)의 `setTimeout` 체인을 이 런타임으로 옮긴다. v1 manifest를 이 리소스 형태로 바꾸는 어댑터가 필요하다.
4. `text-motions` 프리셋을 장면의 `text.enter` 확장으로 연결한다. 예: signature Hero에 `blur-in`.
5. 영상 export driver(P5): headless로 `sampleSceneStyles`에 frame 시각을 넘겨 캡처한다. 엔진은 bake-off로 고른다(OD-MS-02).
6. 저작 UI(admin 미리보기·편집): `draftScenesFromBeats`, `parseInteractiveArticle`, `InteractiveStoryPlayer`를 재사용한다.
7. 테스트 러너를 도입하면 `verification/core.test.tsx`를 저장소 테스트로 편입한다.

## 10. 커밋 이력

| 커밋 | 내용 |
| --- | --- |
| `c9f79dc` | WIP: `motion-tokens.v1` 초안 (범위 재조정 전) |
| `4d63bdc` | WIP: 프리셋, node-app 범위로 토큰 정정 |
| (이 로그 커밋) | 계약·컴파일러·타임라인·클럭·가드·제스처, 리소스 레지스트리·샘플, React 표면, README, 작업 로그·검증 자료 |
