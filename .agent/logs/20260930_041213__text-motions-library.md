# 작업 로그 — AMU Text Motion Library (`node-app/src/text-motions`)

- 작성일: 2026-09-30
- 기준 브랜치: `claude/amu-interactive-works`
- 대상: 실제 로컬 소스(`node-app`)에 텍스트 모션 라이브러리를 적용하는 에이전트
- 한 줄 요약: 독립 HTML 100개였던 텍스트 모션을 **공통 엔진 1개 + 프리셋 데이터 99개**로 재구성한 라이브러리를 `node-app/src/text-motions/`에 **새 폴더로만 추가**했다. 기존 앱 소스는 한 줄도 수정하지 않았고, 새 의존성도 없다.

---

## 1. 적용 에이전트용 체크리스트 (요약)

1. 이 저장소의 `node-app/src/text-motions/` 폴더 **전체(17개 파일)** 를 로컬 `node-app/src/text-motions/`로 그대로 복사한다. (§3 목록 참조)
2. 로컬의 기존 파일은 **수정할 필요가 없다.** (§4 참조)
3. `package.json`은 변경하지 않는다. 추가 의존성 없음 (`react` 만 사용, 로컬에 `react ^19.2.6` 이미 존재).
4. 로컬에서 검증한다.
   - `pnpm run lint` (eslint 대상이 `src` 전체이므로 새 폴더도 포함됨)
   - `pnpm run typecheck` (`tsconfig.build.json` 의 include 범위에 `src/text-motions` 가 포함되는지 확인)
5. 사용처에서는 **상대 경로**로 import 한다. 이 앱은 `@/` 별칭을 쓰지 않는다.
   - 예: `src/app/**/page.tsx` → `import { TextMotion } from '../../text-motions';`
6. §8 "미검증 항목"을 로컬에서 확인하고, 문제가 있으면 §9 대응 가이드를 따른다.

---

## 2. 참고(입력) 문서

| 문서 | 현재 위치 | 용도 |
| --- | --- | --- |
| 원본 텍스트 모션 100개 (독립 HTML) | `.agent/references/NODE_APP/text-motion-library/amu_text_motion_library.md` | 프리셋 키프레임/타이밍의 원본 |
| Motion Content UI 시스템 설계 | `.agent/references/NODE_APP/text-motion-library/motion-content-ui-system.md` | 결정성, JSON 계약, 디자인 토큰, Entrance/Emphasis/Exit 분류 원칙 |
| 앱 의존성 기준 | `node-app/package.json` | React 19 / Next 16 / TS 5.8 환경 확인 |

> 참고 문서는 작업 이후 `.agent/` 루트에서 `.agent/references/NODE_APP/...` 로 이동되었다. 소스 주석/README 의 경로도 이 위치로 갱신했다.

---

## 3. 추가된 파일 (17개, 모두 신규)

경로는 저장소 루트 기준. 줄 수는 참고용.

| # | 파일 | 줄 | 역할 | 주요 export |
| --- | --- | --- | --- | --- |
| 1 | `node-app/src/text-motions/index.ts` | 66 | 공개 API 배럴 (외부는 이 파일만 import) | 아래 모든 공개 심볼 재export |
| 2 | `node-app/src/text-motions/README.md` | 249 | 사용법, 스펙 필드, 원본 001–100 ↔ 프리셋 id 매핑표 | — |
| 3 | `node-app/src/text-motions/core/types.ts` | 216 | 공통 타입 (프리셋 6종 union, 키프레임 채널, 프레임) | `TextSplit` `StaggerFrom` `TextMotionCategory` `TextMotionTag` `MotionKeyframe` `MotionChannel` `MotionEasing` `TextMotionPreset` `TextMotionFrame` `MotionContext` 등 |
| 4 | `node-app/src/text-motions/core/tokens.ts` | 65 | 디자인 토큰 단일 소스 (duration/stagger/perspective/color/limits, 이징 곡선) | `AMU_TEXT_MOTION_TOKENS` `AMU_EASINGS` |
| 5 | `node-app/src/text-motions/core/easing.ts` | 75 | CSS 동일 cubic-bezier 계산, 이징 검증 | `resolveEasing` `isMotionEasing` `EasingFn` |
| 6 | `node-app/src/text-motions/core/random.ts` | 22 | 시드 기반 결정적 난수 (Math.random 대체) | `hash01` `seededPermutation` |
| 7 | `node-app/src/text-motions/core/segment.ts` | 85 | 텍스트 분할 (Intl.Segmenter grapheme / 단어 / 줄 / 전체) + 레이아웃 트리 | `segmentText` `TextLayoutNode` `TextSegmentation` |
| 8 | `node-app/src/text-motions/core/keyframes.ts` | 112 | CSS `@keyframes` 의미론을 순수 함수로 재현 (구간별 easing, 그룹 채널) | `compileKeyframes` `sampleKeyframes` `CompiledKeyframes` |
| 9 | `node-app/src/text-motions/core/style.ts` | 176 | 채널 값 → CSS 합성 (transform/filter/text-shadow/fill/stroke/letter-spacing) | `composeStyle` `NEUTRAL` `channelGroup` `mixColor` `num` 등 |
| 10 | `node-app/src/text-motions/core/layout.ts` | 73 | React/DOM 공통 정적 마크업 스타일, data 속성, kebab→React 스타일 변환 | `TEXT_MOTION_DATA_ATTR` `unitBaseStyle` `WORD_STYLE` `SR_ONLY_STYLE` `OVERLAY_BASE_STYLE` `CURSOR_BASE_STYLE` `toReactStyle` |
| 11 | `node-app/src/text-motions/presets/define.ts` | 74 | 프리셋 정의 헬퍼 (공통 기본값 상속, id 리터럴 보존) | `keyframes` `type` `scramble` `shuffleOrder` `block` `sweep` |
| 12 | `node-app/src/text-motions/presets/catalog.ts` | 782 | 프리셋 99개 데이터 (원본 001–100 매핑, 026·029 통합) | `TEXT_MOTION_PRESET_LIST` `TextMotionPresetId` |
| 13 | `node-app/src/text-motions/presets/registry.ts` | 42 | 프리셋 조회/필터 | `TEXT_MOTION_PRESETS` `TEXT_MOTION_PRESET_IDS` `getTextMotionPreset` `getTextMotionPresetByLegacyId` `isTextMotionPresetId` `listTextMotionPresets` |
| 14 | `node-app/src/text-motions/spec.ts` | 91 | 렌더러 중립 JSON 계약 + 엄격 검증 (LLM 출력용) | `TextMotionSpec` `TextMotionOptions` `parseTextMotionSpec` `TEXT_SPLITS` `STAGGER_FROMS` |
| 15 | `node-app/src/text-motions/timeline.ts` | 247 | 공통 타임라인 엔진: 해석 → 임의 시점 샘플링 (순수) | `resolveTextMotion` `sampleTextMotion` `sampleTextMotionAtProgress` `getStaticTextMotionFrame` `getTextMotionDurationMs` `getTextMotionCycleMs` `getRootStyle` |
| 16 | `node-app/src/text-motions/runtime.ts` | 300 | 브라우저 런타임: 프레임→DOM 반영, rAF 플레이어, reduced-motion/in-view 트리거, 바닐라 mount | `applyTextMotionFrame` `createTextMotionPlayer` `mountTextMotion` `prefersReducedMotion` `observeInView` `TextMotionHandle` 등 |
| 17 | `node-app/src/text-motions/react/TextMotion.tsx` | 212 | React 어댑터 (`'use client'`), interactive / 제어형(render) 모드 | `TextMotion` `TextMotionProps` |

### 의존 방향 (순환 없음)

```
react/TextMotion.tsx → runtime.ts → timeline.ts, spec.ts → presets/* → core/*
```

- 외부 패키지 import 는 `react/TextMotion.tsx` 의 `react` 하나뿐.
- 나머지는 모두 폴더 내부 상대 import (확장자 없는 경로, `moduleResolution: bundler` 전제).

---

## 4. 수정·이동·삭제된 파일

| 구분 | 경로 | 내용 | 로컬 적용 시 필요 여부 |
| --- | --- | --- | --- |
| 수정 | (기존 앱 소스) | **없음.** `node-app/src` 의 기존 파일은 전혀 건드리지 않았다. | 불필요 |
| 이동 | `.agent/package.json` → `node-app/package.json` | 참고용 package.json 을 앱 폴더로 이동. 이후 병합된 실제 `node-app/package.json` 과 **내용이 완전히 동일**. | 불필요 (로컬 package.json 변경 없음) |
| 이동(작업 중) | `src/lib/motion/text-motion/*` → `node-app/src/text-motions/*` | 최초 작성 위치에서 최종 위치로 이동. 내부 상대 import 는 그대로 유효. | 최종 위치만 사용 |
| 수정(문서) | `node-app/src/text-motions/README.md` | import 예시를 `@/…` → 상대 경로로, 참고 문서 경로를 `.agent/references/NODE_APP/text-motion-library/…` 로 갱신 | §3 파일에 이미 반영 |
| 수정(주석) | `node-app/src/text-motions/presets/catalog.ts` | 원본 문서 경로 주석 갱신 | §3 파일에 이미 반영 |

---

## 5. 공개 API 사용 요약

```tsx
import { TextMotion, parseTextMotionSpec, getTextMotionDurationMs, mountTextMotion } from '../text-motions';

// 웹(interactive): 마운트/뷰포트 진입 시 자동 재생
<TextMotion as="h1" preset="blur-in" text="일의 단위를 바꾸고 있다" trigger="in-view" />

// 영상/스크럽(render 모드): 타이머 없이 해당 시점만 순수 렌더 → 웹과 결과 동일
<TextMotion preset="spotlight" text="가격은 비교의 문제" timeMs={(frame / fps) * 1000} />
<TextMotion preset="fade-in" text="스크롤 연동" progress={scrollProgress} />

// AI/DB JSON → 검증 → 렌더
const r = parseTextMotionSpec(json); // 알 수 없는 필드·범위 초과 거부
if (r.ok) <TextMotion {...r.spec} />;
getTextMotionDurationMs(spec); // 씬/자막 타이밍 배치용 길이(ms)

// React 밖 (매거진 HTML 등)
const m = mountTextMotion(el, { preset: 'glitch-rgb', text: 'Cyber 404' }, { trigger: 'in-view' });
m.destroy(); // 원래 내용 복원
```

`TextMotionSpec` 필드: `preset`(필수), `text`(필수, ≤500자), `split`, `durationMs`, `staggerMs`, `delayMs`, `staggerFrom`, `easing`, `seed`, `loop`, `loopDelayMs`.
`TextMotion` 추가 props: `as`, `className`, `style`, `trigger('mount'|'in-view'|'manual')`, `reducedMotion('user'|'always'|'never')`, `timeMs`, `progress`, `onComplete`, `ref(TextMotionHandle: play/pause/restart/seek/timeMs/playing/durationMs)`.

---

## 6. 설계 결정 (왜 이렇게 했는가)

| 결정 | 근거 (motion-content-ui-system.md) |
| --- | --- |
| 원본 100개의 중복 로직(분할·스태거·총 길이·루프·setTimeout)을 공통 엔진 하나로 통합, 프리셋은 데이터만 보유 | 사용자 요구: "공통 로직·요소는 반드시 공통화 및 정합화" |
| `TextMotionSpec` JSON 을 SSOT 로, LLM 은 코드가 아닌 JSON 만 생성 | §9–10 Renderer 가 아닌 의미 구조를 SSOT 로 |
| `sampleTextMotion(resolved, timeMs)` 순수 함수, 시드 난수 | "렌더 가능한 콘텐츠는 결정적이어야 한다" |
| interactive(rAF) / render(timeMs·progress) 두 모드가 같은 샘플러 사용 | `MotionContext { progress, mode }` |
| 토큰 단일 소스 `AMU_TEXT_MOTION_TOKENS` | "디자인 시스템은 공유할 수 있다" |
| 카테고리 `entrance / emphasis / exit / transient / reveal` + 태그 | Motion Design System (Entrance / Emphasis / Exit) |
| DOM 쓰기 경로는 `applyTextMotionFrame` 하나 (React·바닐라 공유) | 공통화 |

### 원본 대비 정합화·보정 내역

- 026 과 029 는 동일 모션 → `roll-in` 으로 통합 (`legacyIds: [26, 29]`). 그래서 프리셋 수는 99개, 원본 번호 1–100 은 `getTextMotionPresetByLegacyId` 로 모두 조회 가능.
- 018/019(shake): 원본 100% 프레임이 `opacity: 0` 이라 흔들린 뒤 사라지던 버그 → 끝 상태 보이도록 보정.
- 054/055: 원본에 `@keyframes spotlightSweep`, `blinkCursor` 정의 누락 → 엔진(`sweep`, `type` 커서)에서 구현.
- 3D 계열 perspective 를 토큰(near 400 / normal 500 / far 800)으로 통일. 원본에서 perspective 가 없어 `translateZ` 가 무효였던 072·094·095·097 도 입체적으로 동작.
- `letter-spacing` 은 기준 트래킹 `--amu-text-motion-tracking` 대비 증분(em) → 타이포 토큰 자간을 덮어쓰지 않음.
- `#fff`/`#0ff` 하드코딩 → `currentColor` + CSS 변수 (`--amu-text-motion-accent`, `--amu-text-motion-split-a`, `--amu-text-motion-split-b`, `--amu-text-motion-extrude`). 라이트/다크 자동 대응.
- 글자 분할 시 단어를 nowrap 그룹으로 묶어 단어 중간 줄바꿈 방지, `Intl.Segmenter` 로 한글·이모지 안전.
- 접근성: 원문은 스크린리더 전용 span, 애니메이션 글자는 `aria-hidden`. `prefers-reduced-motion` 시 정지 프레임 (`transient` 는 읽을 수 있는 모습으로).

---

## 7. 이 저장소에서 수행한 검증 (통과)

앱의 `node_modules`/`tsconfig` 가 없어 **임시 환경**(TypeScript 5.8, @types/react 19.2.7, React 19, esbuild, Chromium)에서 검증했다.

| 검증 | 결과 |
| --- | --- |
| `tsc --strict` (+ `noUncheckedIndexedAccess`) | 통과 |
| 동작 테스트 (esbuild 번들, node): 원본 1–100 전부 매핑 / 99개 프리셋 전 시점 NaN 없음 / 프레임 간 CSS 키 일관 / 시작 전 숨김 / 종료 상태 정상 / 같은 시드 = 같은 결과 / 원본 타이밍 공식 일치 / 루프 / 한글·이모지 분할 / 스펙 검증 오류 메시지 | 통과 |
| 실제 Chromium 에서 99개 프리셋 갤러리 렌더 (바닐라 mount + React createRoot) | 콘솔 에러 0 |
| React `renderToString` (제어형 `timeMs`) | 정상 마크업 출력 |

> 테스트 스크립트는 저장소에 커밋하지 않았다 (앱 `package.json` 에 테스트 러너가 없음).

---

## 8. 미검증 항목 (로컬 적용 시 확인 필요)

1. **앱 실제 설정으로 lint/typecheck 미실행** — `pnpm run lint`, `pnpm run typecheck` 를 로컬에서 실행.
2. `tsconfig.build.json` 의 `include` 가 `src/text-motions` 를 포함하는지.
3. `exactOptionalPropertyTypes` 가 켜져 있으면 타입 오류가 날 수 있음 (현재 코드는 이 옵션 미대응, §9 참고).
4. eslint 규칙(import 순서, `react-hooks`, 파일명 규칙 등)과 코드 스타일 차이.
5. 실제 페이지(Next 16 App Router)에서 `'use client'` 컴포넌트로 SSR → hydration 경고 없는지.

---

## 9. 문제 발생 시 대응 가이드

| 증상 | 대응 |
| --- | --- |
| `exactOptionalPropertyTypes` 관련 오류 | 해당 선택 속성 타입에 `| undefined` 추가 (`StyleContext.perspective/transformOrigin`, `ResolvedTextMotion.compiled`, `TextMotionUnitFrame.text`, `createTextMotionPlayer` options.onComplete) 또는 객체 생성 시 undefined 키 생략. `presets/catalog.ts` 의 `glitch` 프리셋은 `[x, y]` 구조분해를 `as const` 튜플로 바꾸면 해결 |
| eslint import 순서/스타일 경고 | 로직 변경 없이 자동 수정(`eslint --fix`) 범위에서만 정리 |
| `src/text-motions` 가 typecheck 범위 밖 | `tsconfig.build.json` include 에 추가 (앱 설정 변경이므로 사용자 확인 후) |
| hydration 경고 | interactive 모드 초기 렌더는 t=0 프레임(숨김)으로 고정되어 있음. 경고 시 해당 사용처를 `trigger="in-view"` 로 두거나 클라이언트 전용 렌더로 감싼다 |

---

## 10. 커밋 이력 (참고)

| 커밋 | 내용 |
| --- | --- |
| `708703c` | Add AMU text motion library (최초 작성, `src/lib/motion/text-motion`) |
| `b849e9f` | Move text motion library into `node-app/src/text-motions`, `.agent/package.json` → `node-app/package.json` |
| `4f5fadc` | Merge `claude/lucid-newton-lvd5uc` → `claude/amu-interactive-works` |
| `8615be4`, `e616dde` | README import 예시를 상대 경로로 수정 |
| (이 로그 커밋) | 참고 문서 경로 갱신 + 본 작업 로그 추가 |

## 11. 후속 작업 후보

- Gen Studio 용 프리셋 선택 갤러리 컴포넌트 (`listTextMotionPresets` + `TextMotion` 제어형 미리보기)
- 영상 렌더러(Rendiv/Revideo) 어댑터: 프레임 → `timeMs` 변환 래퍼
- 프리셋 퇴장(exit) 조합: 등장 스펙 + 퇴장 스펙을 한 레이어로 묶는 `TextMotionLayer` 타입
- 테스트 러너 도입 시 §7 동작 테스트를 저장소 테스트로 편입
