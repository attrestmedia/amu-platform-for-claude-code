# AMU Text Motion Library

`.agent/amu_text_motion_library.md`(독립 HTML 100개)를 AMU 플랫폼용 **단일 엔진 + 프리셋 데이터** 구조로 재구성한 텍스트 모션 라이브러리입니다.
설계는 `.agent/motion-content-ui-system.md`의 원칙을 따릅니다.

| 문서 원칙 | 이 라이브러리에서의 구현 |
| --- | --- |
| Renderer가 아닌 **의미 구조(JSON)** 를 SSOT로 (§9–10) | `TextMotionSpec` JSON 계약 + `parseTextMotionSpec` 엄격 검증. LLM은 코드가 아닌 JSON만 생성 |
| 렌더 가능한 콘텐츠는 **결정적**이어야 함 | `sampleTextMotion(resolved, timeMs)` 순수 함수. `Math.random`·타이머 대신 시드 해시 사용 |
| `MotionContext { progress, mode: 'interactive' \| 'render' }` | React `timeMs` / `progress` 제어형 = render 모드, 기본 = interactive 모드 |
| 디자인 시스템(토큰)은 렌더러와 무관하게 공유 | `AMU_TEXT_MOTION_TOKENS` (duration / stagger / easing / perspective / color) |
| Motion Design System: Entrance / Emphasis / Exit | 프리셋 `category`: `entrance` · `emphasis` · `exit` · `transient` · `reveal` + `tags` |

## 구조 — 공통화·정합화

원본 100개 파일은 글자 분할, 스태거, 총 길이 계산, 루프, `setTimeout` 타이머를 **각자 중복 구현**하고 있었습니다.
이 로직은 전부 아래 공통 레이어로 올리고, 프리셋에는 **고유한 부분(키프레임·파라미터)만 데이터로** 남겼습니다.

```
react/TextMotion.tsx   React 어댑터 ('use client')          ─┐
runtime.ts             DOM 반영 · rAF 플레이어 · 트리거 · 바닐라 mount ─┤ 모든 어댑터가 같은 엔진 사용
timeline.ts / spec.ts  스펙 검증 → 해석 → 임의 시점 샘플링 (순수)   ─┘
presets/               99개 프리셋 데이터 (define.ts 헬퍼로 공통 기본값 상속)
core/                  tokens · easing · segment · keyframes · style · layout · random
```

| 공통 요소 | 단일 소스 | 사용처 |
| --- | --- | --- |
| 텍스트 분할 (grapheme / 단어 / 줄 / 전체) | `core/segment.ts` | React·바닐라 마크업 |
| 스태거 순서 (start/end/center/edges/random), 지연, 루프, 총 길이 | `timeline.ts` | 모든 프리셋 종류 |
| 키프레임 보간 (CSS `@keyframes` 의미론, 구간별 easing) | `core/keyframes.ts` | 키프레임 프리셋 93개 |
| 채널 → CSS 합성 (transform / filter / text-shadow / fill / stroke / letter-spacing) | `core/style.ts` | 모든 키프레임 프리셋 |
| 정적 마크업 스타일, data 속성, 스크린리더용 원문 | `core/layout.ts` | React·바닐라 |
| 프레임 → DOM 반영 (유일한 DOM 쓰기 경로) | `runtime.ts#applyTextMotionFrame` | React·바닐라 |
| 재생 시계 (play/pause/seek/restart/onComplete) | `runtime.ts#createTextMotionPlayer` | React·바닐라 |
| reduced motion, in-view 트리거 | `runtime.ts` | React·바닐라 |
| 이징 곡선, 시간·색·원근 토큰 | `core/tokens.ts`, `core/easing.ts` | 전체 |

### 원본 대비 정합화 내역

- **026 / 029** 는 동일 모션 → `roll-in` 하나로 통합 (`legacyIds: [26, 29]`). 원본 번호 조회는 `getTextMotionPresetByLegacyId(n)`.
- **018 / 019** (shake) 는 100% 프레임이 `opacity: 0` 이라 흔들린 뒤 사라지는 버그 → 끝 상태를 보이도록 보정.
- **054 / 055** 는 `@keyframes spotlightSweep`, `blinkCursor` 정의가 누락되어 있었음 → 엔진에서 구현.
- 3D 계열의 `perspective` 를 토큰(`near 400 / normal 500 / far 800`)으로 통일. 원본에서 perspective 가 없어 `translateZ` 가 효과가 없던 072·094·095·097 도 이제 입체적으로 동작.
- `letter-spacing` 은 기준 트래킹 `--amu-text-motion-tracking` 에 더하는 **증분(em)** 으로 표기 → 타이포 토큰의 자간을 덮어쓰지 않음.
- `#fff`, `#0ff` 등 하드코딩 색상을 `currentColor` + CSS 변수로 교체 → 라이트/다크 테마 자동 대응.
  - `--amu-text-motion-accent`, `--amu-text-motion-split-a`, `--amu-text-motion-split-b`, `--amu-text-motion-extrude`
- 글자 분할 시 단어를 nowrap 그룹으로 묶어 **단어 중간에서 줄바꿈되지 않음**. `Intl.Segmenter` 로 한글·이모지 안전.
- 접근성: 원문은 스크린리더 전용 span, 애니메이션 글자는 `aria-hidden`. `prefers-reduced-motion` 시 정지 프레임
  (`transient` 계열은 사라진 상태 대신 읽을 수 있는 모습).

## 사용법

### React (웹 · interactive)

```tsx
import { TextMotion } from '@/text-motions';

<TextMotion as="h1" preset="blur-in" text="AI가 일자리를 없애는 것이 아니라" />
<TextMotion preset="slide-up" split="word" staggerFrom="center" trigger="in-view" text="일의 단위를 바꾸고 있다" />
<TextMotion preset="terminal-type" text="init system..." loop />
```

명령형 제어:

```tsx
const ref = useRef<TextMotionHandle>(null);
<TextMotion ref={ref} preset="shuffle" text="AMU" trigger="manual" />;
ref.current?.play(); // pause / restart / seek(ms) / durationMs
```

### React (영상 · render 모드)

타이머 없이 주어진 시점만 순수 렌더합니다. Rendiv/Revideo 등 프레임 기반 렌더러에서 frame → ms 로 넘기면 웹과 동일한 결과가 나옵니다.

```tsx
<TextMotion preset="spotlight" text="가격은 비교의 문제입니다" timeMs={(frame / fps) * 1000} />
<TextMotion preset="fade-in" text="스크롤 연동" progress={scrollProgress} />
```

### JSON 스펙 (AI 생성 / 저장)

```ts
import { parseTextMotionSpec, getTextMotionDurationMs } from '@/text-motions';

const result = parseTextMotionSpec(llmOutput); // 알 수 없는 필드·범위 초과 모두 거부
if (!result.ok) throw new Error(result.errors.join('\n'));

getTextMotionDurationMs(result.spec); // 씬/자막 타이밍 배치용 길이
<TextMotion {...result.spec} />;
```

```json
{ "preset": "slide-up", "text": "가격은 숫자가 아니라 비교의 문제입니다.", "split": "word", "staggerMs": 80, "delayMs": 300 }
```

### 바닐라 DOM (React 밖: 매거진 HTML, 임베드)

```ts
import { mountTextMotion } from '@/text-motions';

const motion = mountTextMotion(el, { preset: 'glitch-rgb', text: 'Cyber Glitch 404' }, { trigger: 'in-view' });
motion.destroy(); // 원래 내용 복원
```

### 프리셋 탐색

```ts
listTextMotionPresets({ category: 'entrance', tags: ['elegant'] });
getTextMotionPresetByLegacyId(51); // → block-reveal
```

## 스펙 필드

| 필드 | 타입 | 기본값 |
| --- | --- | --- |
| `preset` | `TextMotionPresetId` | (필수) |
| `text` | `string` (≤ 500자) | (필수) |
| `split` | `'char' \| 'word' \| 'line' \| 'whole'` | 프리셋 `defaultSplit` |
| `durationMs` | 단위 1개 길이 | 프리셋 값 |
| `staggerMs` | 단위 간 간격 | 프리셋 값 |
| `delayMs` | 시작 지연 | `0` |
| `staggerFrom` | `'start' \| 'end' \| 'center' \| 'edges' \| 'random'` | `start` (`random-reveal` 은 `random`) |
| `easing` | AMU easing 이름 또는 `[x1, y1, x2, y2]` | 프리셋 값 (원본과 같은 `ease` 등) |
| `seed` | 정수. 절차형 결과 고정 | `1` |
| `loop`, `loopDelayMs` | 반복 재생 | `false`, `2500` |

## 프리셋 목록 (원본 번호 매핑)

`durationMs / staggerMs` 는 기본값이며, 원본 HTML의 값을 그대로 옮겼습니다.
`kind`: `keyframes` 키프레임 보간 · `type` 순차 입력 · `scramble` 무작위 글리프 수렴 · `shuffle-order` 무작위 순서 노출 · `block` 블록 덮개 · `sweep` 조명 스윕.

| 원본 | id | category | kind | split | ms (dur / stagger) | 설명 |
| --- | --- | --- | --- | --- | --- | --- |
| 001 | `fade-in` | entrance | keyframes | char | 800 / 50 | 글자가 순서대로 서서히 나타난다. |
| 002 | `typewriter` | reveal | type | char | 0 / 80 | 타자기처럼 한 글자씩 입력된다. |
| 003 | `shuffle` | reveal | scramble | char | 450 / 60 | 무작위 문자가 돌다가 원래 글자로 확정된다. |
| 004 | `slide-up` | entrance | keyframes | char | 500 / 50 | 글자가 아래에서 위로 밀려 올라온다. |
| 005 | `scale-in` | entrance | keyframes | char | 500 / 50 | 점에서 원래 크기로 커지며 나타난다. |
| 006 | `blur-in` | entrance | keyframes | char | 800 / 50 | 흐릿한 상태에서 초점이 맞으며 나타난다. |
| 007 | `glow-in` | entrance | keyframes | char | 1000 / 50 | 빛나며 나타났다가 발광이 가라앉는다. |
| 008 | `bounce-in` | entrance | keyframes | char | 600 / 80 | 위에서 떨어져 통통 튄다. |
| 009 | `flip-in` | entrance | keyframes | char | 600 / 50 | 아래쪽을 축으로 앞으로 젖혀지며 나타난다. |
| 010 | `rotate-in` | entrance | keyframes | char | 500 / 50 | 회전하며 커져서 나타난다. |
| 011 | `slide-down` | entrance | keyframes | char | 500 / 50 | 글자가 위에서 아래로 내려온다. |
| 012 | `slide-from-left` | entrance | keyframes | char | 500 / 50 | 글자가 왼쪽에서 밀려 들어온다. |
| 013 | `slide-from-right` | entrance | keyframes | char | 500 / 50 | 글자가 오른쪽에서 밀려 들어온다. |
| 014 | `drop-in` | entrance | keyframes | char | 600 / 60 | 무겁게 떨어져 한 번 튕긴다. |
| 015 | `swing` | emphasis | keyframes | char | 800 / 50 | 진자처럼 좌우로 흔들리다 멈춘다. |
| 016 | `pulse` | emphasis | keyframes | char | 500 / 50 | 한 번 크게 맥박치며 나타난다. |
| 017 | `flash` | emphasis | keyframes | char | 1000 / 50 | 두 번 깜빡이며 시선을 끈다. |
| 018 | `shake-x` | emphasis | keyframes | char | 800 / 50 | 좌우로 떨리며 나타난다. |
| 019 | `shake-y` | emphasis | keyframes | char | 800 / 50 | 위아래로 떨리며 나타난다. |
| 020 | `tada` | emphasis | keyframes | char | 800 / 50 | 짠! 하고 흔들리며 등장한다. |
| 021 | `jello` | emphasis | keyframes | char | 800 / 50 | 젤리처럼 출렁이며 나타난다. |
| 022 | `rubber-band` | emphasis | keyframes | char | 800 / 50 | 고무줄처럼 늘었다 줄었다 한다. |
| 023 | `wave` | emphasis | keyframes | char | 600 / 80 | 파도처럼 글자가 차례로 솟았다 내려온다. |
| 024 | `stretch` | emphasis | keyframes | char | 500 / 50 | 가로로 늘어났다 돌아온다. |
| 025 | `squeeze` | emphasis | keyframes | char | 500 / 50 | 세로로 눌렸다 돌아온다. |
| 026, 029 | `roll-in` | entrance | keyframes | char | 600 / 50 | 통처럼 굴러 왼쪽에서 들어온다. |
| 027 | `zoom-in` | entrance | keyframes | char | 500 / 50 | 빠르게 확대되며 나타난다. |
| 028 | `zoom-out` | entrance | keyframes | char | 500 / 50 | 크게 시작해 원래 크기로 줄어들며 나타난다. |
| 030 | `glitch` | emphasis | keyframes | char | 400 / 100 | 화면 오류처럼 떨리며 나타난다. |
| 031 | `focus-in` | entrance | keyframes | char | 800 / 50 | 크고 흐릿한 글자가 줄어들며 선명해진다. |
| 032 | `random-reveal` | reveal | shuffle-order | char | 0 / 50 | 글자가 무작위 순서로 하나씩 켜진다. |
| 033 | `binary-decode` | reveal | scramble | char | 800 / 120 | 0과 1이 해독되며 원래 글자가 드러난다. |
| 034 | `fall-down` | entrance | keyframes | char | 500 / 50 | 글자가 위에서 짧게 떨어지며 나타난다. |
| 035 | `rise-up` | entrance | keyframes | char | 500 / 50 | 글자가 아래에서 짧게 떠오르며 나타난다. |
| 036 | `pop-in` | entrance | keyframes | char | 500 / 50 | 살짝 넘치게 커졌다가 자리잡는다. |
| 037 | `slit-in-vertical` | entrance | keyframes | char | 500 / 50 | 세로로 가늘게 열리며 나타난다. |
| 038 | `slit-in-horizontal` | entrance | keyframes | char | 500 / 50 | 가로로 가늘게 열리며 나타난다. |
| 039 | `roll-in-top` | entrance | keyframes | char | 600 / 50 | 위에서 굴러 내려온다. |
| 040 | `roll-in-bottom` | entrance | keyframes | char | 600 / 50 | 아래에서 굴러 올라온다. |
| 041 | `bounce-in-left` | entrance | keyframes | char | 600 / 50 | 왼쪽에서 들어와 튕기며 멈춘다. |
| 042 | `bounce-in-right` | entrance | keyframes | char | 600 / 50 | 오른쪽에서 들어와 튕기며 멈춘다. |
| 043 | `rotate-in-y` | entrance | keyframes | char | 600 / 50 | Y축 회전으로 조금 더 천천히 나타난다. |
| 044 | `rotate-in-x` | entrance | keyframes | char | 600 / 50 | X축 회전으로 조금 더 천천히 나타난다. |
| 045 | `flicker` | emphasis | keyframes | char | 1200 / 50 | 고장난 형광등처럼 빠르게 깜빡이다 켜진다. |
| 046 | `blur-in-right` | entrance | keyframes | char | 600 / 50 | 오른쪽에서 모션블러와 함께 들어온다. |
| 047 | `blur-in-left` | entrance | keyframes | char | 600 / 50 | 왼쪽에서 모션블러와 함께 들어온다. |
| 048 | `fly-in-up` | entrance | keyframes | char | 800 / 30 | 글자가 멀리 아래에서 빠르게 날아든다. |
| 049 | `fly-in-down` | entrance | keyframes | char | 800 / 30 | 글자가 멀리 위에서 빠르게 날아든다. |
| 050 | `wobble` | emphasis | keyframes | char | 1000 / 50 | 좌우로 비틀거리며 나타난다. |
| 051 | `block-reveal` | reveal | block | whole | 1000 / 0 | 색 블록이 덮었다가 걷히며 텍스트가 드러난다. |
| 052 | `tracking-expand` | entrance | keyframes | whole | 1200 / 0 | 자간이 좁은 상태에서 펼쳐지며 나타난다. |
| 053 | `tracking-contract` | entrance | keyframes | whole | 1200 / 0 | 넓게 퍼진 자간이 모이며 나타난다. |
| 054 | `spotlight` | reveal | sweep | whole | 2000 / 0 | 어두운 텍스트 위로 조명이 훑고 지나가며 밝혀진다. |
| 055 | `terminal-type` | reveal | type | char | 0 / 100 | 깜빡이는 커서와 함께 터미널처럼 입력된다. |
| 056 | `skew-in-up` | entrance | keyframes | char | 600 / 50 | 기울어진 채 아래에서 올라온다. |
| 057 | `skew-in-down` | entrance | keyframes | char | 600 / 50 | 기울어진 채 위에서 내려온다. |
| 058 | `skew-in-left` | entrance | keyframes | char | 600 / 50 | 기울어진 채 왼쪽에서 들어온다. |
| 059 | `skew-in-right` | entrance | keyframes | char | 600 / 50 | 기울어진 채 오른쪽에서 들어온다. |
| 060 | `unfold-vertical` | entrance | keyframes | char | 600 / 50 | 접힌 종이가 세로로 펼쳐지듯 나타난다. |
| 061 | `unfold-horizontal` | entrance | keyframes | char | 600 / 50 | 접힌 종이가 가로로 펼쳐지듯 나타난다. |
| 062 | `outline-to-solid` | entrance | keyframes | char | 800 / 50 | 외곽선으로 나타난 뒤 속이 채워진다. |
| 063 | `solid-to-outline` | emphasis | keyframes | char | 800 / 50 | 채워진 글자가 나타난 뒤 외곽선만 남는다. |
| 064 | `smoke-in` | entrance | keyframes | char | 800 / 50 | 연기 속에서 모습을 드러낸다. |
| 065 | `smoke-out` | exit | keyframes | char | 800 / 50 | 연기처럼 흩어지며 사라진다. |
| 066 | `slot-drop` | entrance | keyframes | char | 600 / 50 | 슬롯머신 릴처럼 흐릿하게 떨어져 멈춘다. |
| 067 | `elastic-scale` | entrance | keyframes | char | 800 / 50 | 탄성 있게 튕기며 커진다. |
| 068 | `glitch-rgb` | emphasis | keyframes | char | 400 / 100 | RGB 채널이 어긋났다 맞춰지며 나타난다. |
| 069 | `water-drop` | entrance | keyframes | char | 600 / 50 | 물방울처럼 떨어져 납작하게 퍼졌다가 모양을 찾는다. |
| 070 | `anti-gravity` | transient | keyframes | char | 2000 / 100 | 떠올랐다가 위로 흩어져 사라진다. |
| 071 | `falling-leaves` | transient | keyframes | char | 1500 / 100 | 낙엽처럼 흔들리며 떨어져 사라진다. |
| 072 | `slingshot` | entrance | keyframes | char | 800 / 50 | 먼 뒤쪽에서 새총처럼 튀어나온다. |
| 073 | `giant-slide` | entrance | keyframes | char | 600 / 50 | 크게 확대된 글자가 왼쪽에서 미끄러지며 제자리를 찾는다. |
| 074 | `staircase` | entrance | keyframes | char | 500 / 100 | 넓은 간격으로 한 글자씩 계단을 오르듯 등장한다. |
| 075 | `shadow-first` | entrance | keyframes | char | 800 / 50 | 그림자가 먼저 떠오르고 글자가 뒤따른다. |
| 076 | `cube-flip-x` | entrance | keyframes | char | 600 / 50 | 큐브의 윗면이 굴러오듯 X축으로 회전한다. |
| 077 | `cube-flip-y` | entrance | keyframes | char | 600 / 50 | 큐브의 옆면이 굴러오듯 Y축으로 회전한다. |
| 078 | `speed-dash` | entrance | keyframes | char | 500 / 50 | 기울어진 채 빠르게 돌진해 멈춘다. |
| 079 | `heartbeat-burst` | emphasis | keyframes | char | 800 / 50 | 심장 박동처럼 두 번 뛰며 나타난다. |
| 080 | `movie-credits` | transient | keyframes | char | 2000 / 100 | 엔딩 크레딧처럼 올라왔다가 위로 사라진다. |
| 081 | `springy` | entrance | keyframes | char | 600 / 50 | 바닥에서 스프링처럼 솟아오른다. |
| 082 | `flip-bounce` | entrance | keyframes | char | 800 / 50 | 뒤집히며 등장한 뒤 반동으로 흔들린다. |
| 083 | `rotate-3d-in` | entrance | keyframes | char | 800 / 50 | 대각선 축으로 입체 회전하며 나타난다. |
| 084 | `squeeze-expand` | entrance | keyframes | char | 800 / 50 | 납작하게 눌린 글자가 자간과 함께 튀어오른다. |
| 085 | `zip-in` | entrance | keyframes | char | 500 / 50 | 살짝 회전하며 빠르게 튀어나온다. |
| 086 | `blur-drop` | entrance | keyframes | char | 600 / 50 | 흐릿하게 위에서 떨어지며 선명해진다. |
| 087 | `blur-rise` | entrance | keyframes | char | 600 / 50 | 흐릿하게 아래에서 떠오르며 선명해진다. |
| 088 | `swing-in` | entrance | keyframes | char | 800 / 50 | 위쪽에 매달린 간판이 내려오듯 나타난다. |
| 089 | `swing-out` | exit | keyframes | char | 800 / 50 | 위쪽을 축으로 젖혀지며 사라진다. |
| 090 | `pendulum` | entrance | keyframes | char | 1000 / 50 | 위쪽을 축으로 매달린 듯 흔들리며 나타난다. |
| 091 | `pulse-neon` | emphasis | keyframes | char | 1500 / 50 | 네온관처럼 발광이 약해졌다 다시 밝아진다. |
| 092 | `flip-in-x` | entrance | keyframes | char | 500 / 50 | X축으로 뒤집히며 나타난다. |
| 093 | `flip-in-y` | entrance | keyframes | char | 500 / 50 | Y축으로 뒤집히며 나타난다. |
| 094 | `boomerang` | entrance | keyframes | char | 800 / 50 | 회전하며 멀리서 날아와 제자리로 돌아온다. |
| 095 | `space-in` | entrance | keyframes | char | 1000 / 50 | 깊은 공간 저편에서 다가온다. |
| 096 | `perspective-in` | entrance | keyframes | char | 800 / 50 | 화면 앞쪽에서 뒤로 물러나며 자리잡는다. |
| 097 | `expand-forward` | entrance | keyframes | whole | 1000 / 0 | 자간이 펼쳐지며 뒤에서 앞으로 다가온다. |
| 098 | `contract-back` | exit | keyframes | whole | 1000 / 0 | 자간이 좁아지며 뒤로 멀어져 사라진다. |
| 099 | `text-shadow-pop` | entrance | keyframes | char | 500 / 50 | 입체 그림자와 함께 튀어나온다. |
| 100 | `flicker-in` | entrance | keyframes | char | 1200 / 50 | 세 번 깜빡인 뒤 켜진 채로 유지된다. |

## 새 프리셋 추가

`presets/catalog.ts` 에 `presets/define.ts` 헬퍼로 데이터만 추가합니다. 분할·타이밍·DOM·React 코드는 수정할 필요가 없습니다.

```ts
keyframes(
  'my-rise',
  { legacyIds: [], name: 'My Rise', description: '…', category: 'entrance', tags: ['slide'], durationMs: D.normal },
  [{ offset: 0, y: 30, blur: 6, opacity: 0 }, { offset: 1, y: 0, blur: 0, opacity: 1 }],
),
```

키프레임 채널: `opacity`, `x`/`y` (px 또는 `'%'`/`'em'`), `z`, `scale`, `scaleX`, `scaleY`, `rotate`, `rotateX`, `rotateY`,
`rotateXYZ`, `skewX`, `skewY`, `blur`, `letterSpacing`, `fill`, `stroke`, `glowSize`, `glowAlpha`, `neon`, `rgbSplit`,
`shadowY`, `shadowBlur`, `shadowAlpha`, `extrude`. 각 프레임에 `easing` 을 주면 그 프레임에서 시작하는 구간에 적용됩니다.
