---
paths:
  - "src/**/*.{ts,tsx}"
---

# Frontend (Next.js/React/TS)

- 항상 모바일 퍼스트 UI를 우선 고려하고, 모든 비동기/대기 시간이 있는 UI 동작/이벤트에는 반드시 preloader 적용
- CSS 스타일 적용은 Tailwind 우선, 클래스는 기존 유틸(cn 등) 패턴을 따름
- `src/components/ui`의 기본 UI 셋에는 Default 스타일이 적용되어 있음. 
  > 일부 variant 타입(ex. button variant="blank")과 꼭 필요한 경우를 제외하고 기본 스타일 변경 금지.
  > 꼭 필요한 경우를 제외하고 size, rounded, color 등의 속성이 컴포넌트에 존재할 경우 해당 속성 활용. 클래스로 적용 금지.
- 사용자 노출 텍스트는 i18n(`<Lang text={{ko: "...", en: "..."}}>` 또는 `lang({ko: "...", en: "..."})`) 적용 필수
- 클라이언트/서버 컴포넌트 경계를 명확히 하고, "use client"는 필요한 곳에만 적용
- useEffect 사용 시 가능하면 익명 함수 보다 **기명 함수**를 사용하여 해당 이펙트의 명확한 용도와 코드 가독성을 확보할 것
- 성능 최적화 상세 가이드는 `{{AGENT_ROOT}}/skills/ux-coding/` 참고
- 전역 로딩은 `src/libs/api/fetchClient.ts`의 `loading: "global"`과 `src/libs/api/globalLoading.ts`의 `withGlobalLoading()`만 진입점으로 사용한다. 기본값은 `none`이며, 전역 화면을 막아야 하는 로그인·결제 준비·핵심 저장·업로드에만 명시적으로 `global`을 지정한다.
- 조회·목록·preview·prefetch·analytics·silent refresh·polling·AI job enqueue/처리는 `none`으로 유지하고, 영역 skeleton·행 상태·버튼 loading·다이얼로그 취소/외부 클릭 제어는 `local` UX로 보존한다. 전역 Preloader 적용을 이유로 local 상태를 일괄 삭제하지 않는다.
- `global` 요청과 `withGlobalLoading()` 작업은 성공·실패·HTTP 오류·네트워크 오류·timeout·abort를 포함한 모든 종료 경로에서 `finally`로 manager를 해제한다. boolean 하나가 아닌 고유 request ID Set의 동시 요청 집계를 사용한다.
- 전역 Preloader는 App root에 한 번만 마운트하며, 짧은 요청 표시 지연과 최소 표시 시간을 유지한다. `role="status"`와 `aria-live="polite"`를 사용하고 포커스를 강제로 이동하거나 focus trap을 만들지 않는다. 기존 입력 포커스를 빼앗지 않는 비모달 상태 안내로 유지한다.
- 버튼·제출 동작은 전역 Preloader가 나타나기 전에도 `disabled`와 local `loading`을 즉시 적용해 중복 실행을 막는다. 전역 레이어의 `z-[99999]` 계약과 reduced-motion 처리를 변경할 때는 주요 viewport와 키보드 포커스를 함께 확인한다.
- 전역 로딩 변경 후 `node --experimental-strip-types --loader ./scripts/loader/node-worker-loader.mjs --test test/globalPreloadingContract.test.ts`, `pnpm run lint`, `pnpm run typecheck`, `pnpm run build`를 실행하고, 375/768/1024/1440px 및 reduced-motion 환경을 수동 또는 `visual-check`로 검증한다. 새 테스트 runner alias를 `package.json`에 추가하지 않는다.
- 렌더 전 텍스트 크기 예측이 필요한 UI는 공통 텍스트 레이아웃 엔진/유틸/훅을 사용
  > 개별 `measureText()`, `getBoundingClientRect()`, `offsetHeight`, `scrollHeight` 기반 텍스트 사전 측정 로직 신규 추가 금지
  > 사용자에게 읽히는 텍스트는 기본적으로 DOM 텍스트로 유지, canvas/WebGL/SVG 기반 텍스트 렌더링은 export/게임/장식 목적에서만 제한적으로 사용
  > 텍스트 측정 시 typography preset, locale, white-space, word-break, font-ready, route/language/font 변경에 따른 cache 재생성 조건을 함께 다룰 것

## 공통 UI 우선 원칙

- 프론트엔드 UI 작업 시 `src/components/ui`, `src/components/module`의 공통 컴포넌트 사용 가능 여부 우선 확인
- 새 UI 생성 전, 반드시 아래 순서로 우선 탐색:
  1. `src/components/ui/index.ts` 및 하위 primitive
  2. `src/components/module/*`의 조합형/도메인형 컴포넌트
  3. 기존 화면에서 유사 패턴 재사용 가능 여부
- 요청한 UI가 공통 목록에 없고, 기존 컴포넌트 조합으로 해결되지 않으며, 요청 또는 특수한 목적인 경우 새 UI 컴포넌트 생성 고려
- 범용성이 있는 새 UI는 `src/components/ui`, 특정 도메인/조합형 UI는 `src/components/module` 또는 해당 feature 내부에 생성
- 공통 UI 인벤토리는 `{{AGENT_ROOT}}/skills/nextjs-component/references/common-ui-inventory.md` 우선 참고

## UI 책임 계층과 Tailwind 추상화

- 크기가 아니라 책임으로 분류한다.
  - `UI`: 도메인과 비즈니스 로직에 의존하지 않는 범용 표현·상태·상호작용
  - `Module`: 하나의 명확한 사용자 목적이나 도메인 기능을 수행하는 독립 단위
  - `Template`: UI/Module의 배치와 페이지군의 공통 레이아웃 계약. 데이터 조회·권한·저장 로직은 두지 않음
  - `Page`: Route·데이터·권한·URL 상태를 연결하는 최종 조립자
- 반복 횟수는 계층이 아니라 추출 시점을 판단하는 보조 근거로만 사용하고, 실제 반복이나 동일 계약이 확인되기 전 공용화하지 않는다.
- 일회성 Tailwind 조합은 TSX에 직접 작성한다. 한 Page/Template/Module 안에서 같은 의미로 반복되면 파일의 모듈 스코프 상수 또는 local `cva`/variant로 둔다.
- 여러 페이지에서 반복되는 **DOM 비의존·style-only 디자인 계약**만 `src/styles/tailwind/utilities.css`에 의미 기반 이름으로 추가한다. `flex-center`, `rounded-*`처럼 Tailwind utility를 다시 별칭화하는 전역 유틸은 새로 만들지 않는다.
- DOM 구조·semantic·상태·interaction까지 반복되면 `src/components/ui`, 비즈니스 기능이 포함되면 `src/components/module`로 추출한다. 동적 클래스 조립(`bg-${color}` 등) 대신 정적으로 탐지 가능한 완전한 클래스 map을 사용한다.

## Route/Page 우선과 오버레이 사용 범위

- Page/Overlay 판정과 예외의 정책 정본은 `.agent/amu-platform-guide/DESIGN-GUIDELINES.md` §11.5다. 이 규칙에는 Next.js 구현 게이트만 둔다.
- 정본상 Page인 화면은 App Router의 별도 `page.tsx`와 식별 가능한 pathname으로 구현한다. query parameter는 필터·정렬·탭 등 해당 페이지 내부 상태에만 사용하며, `?view=detail` 조건부 렌더링으로 독립 화면을 대신하지 않는다.
- 정본상 Overlay인 흐름만 `Dialog`, `Sheet`, `Drawer`, `BottomSheetDialog`를 사용한다. route 없는 `presentation="page"`, `100vh`/`100dvh` popup, 외부 overlay 안의 full-page/full-screen overlay 중첩은 금지하고 overlay 소유자를 한 곳으로 정한다.
- 작업 대상에서 Page/overlay 책임이 뒤바뀐 구현을 발견하면 현재 작업의 선행 단계 또는 같은 작업 단위에서 최소 safe-refactor한다. 범위·계약 문제로 즉시 전환할 수 없으면 차단 사유와 후속 단계를 남기고 시각 변경만 완료로 처리하지 않는다. 범위 밖 overlay를 일괄 정리하지 않는다.
- route/page 전환 후 직접 URL 진입, 새로고침, 공유 URL, 뒤로가기/앞으로가기, 닫기 후 history, 키보드 포커스, scroll lock 해제, 375/768/1024/1440px를 검증한다.

## 오버레이 · 팝퍼 레이어 (z-index 계약)

**팝퍼는 항상 덮개보다 위다.** 모달 안에서 열리는 것이 정상 사용 흐름이기 때문이다.

| 레이어 | 대상 | 값 |
| --- | --- | --- |
| 덮개(overlay) | Dialog·Sheet·Drawer `z-50`, `BottomSheetDialog` `z-[90]`, 전역 확인 dialog `z-[1000]`/`z-[1001]` | 각 UI 컴포넌트가 가진 값 유지 |
| 팝퍼(popper) | Select·Dropdown·Popover·Tooltip·Combobox·DatePicker 등 trigger에 앵커되어 뜨는 레이어 | **`z-popper`** (`utilities.css`, 1100) |
| 전역 로딩 | Preloader | `z-[99999]` |

- z 값의 정의처는 `src/styles/tailwind/utilities.css` 하나다. 컴포넌트·호출부에서 `z-[100]` 같은 임의 값을 새로 만들지 않는다.
- **호출부에서 팝퍼 컴포넌트에 z 클래스를 다시 넘기지 않는다.** `cn`의 tailwind-merge가 뒤 값을 채택하므로 계약이 깨진다.
  `z-popper`는 `src/utils/common/tailwind.ts`의 twMerge `z` 그룹에 등록되어 있어야 충돌 판정이 동작한다.
- 팝퍼 콘텐츠는 Portal로 body에 올린다. `SelectContent`·`PopoverContent`·`TooltipContent`는 기본 적용이지만,
  `Dropdown`은 `openPortal` 기본값이 `false`다. **모달·시트·`overflow-hidden`/스크롤 컨테이너 안에서는 `openPortal`을 켠다.**
- 새 덮개 컴포넌트를 만들 때 z 값은 1100 미만으로 둔다. 그보다 크게 잡으면 그 안의 모든 팝퍼가 다시 뒤로 숨는다.
- 모달과 셀렉트/드롭다운이 함께 있는 UI는 **열어서 항목 선택까지 되는지** 확인한다. 열림 여부만 보고 통과시키지 않는다.

> 실제 사고(2026-08-12): Gen Studio 콘텐츠 생성의 `AI 모델` 모달(`BottomSheetDialog`, `z-[90]`) 안에서
> `SelectContent`가 `z-[80]`이라 드롭다운이 모달 뒤에 그려져 선택 자체가 불가능했다.
> 화면마다 `className="z-[100]"`으로 덮어쓰는 우회가 이미 6곳에 퍼져 있었고, 새 모달이 생길 때마다 재발했다.

## 스크롤 컨테이너 안의 sticky 하단 바

**스크롤 컨테이너를 flex column으로 바꾸지 않는다.** `sticky bottom-0` 바를 가진 스크롤 영역은
**일반 block**으로 두고, 본문과 바를 그 블록의 자식으로 둔다.

```text
[O]  scroll: overflow-y-auto            (block)
       본문: (height auto)
       바:   sticky bottom-0
[X]  scroll: overflow-y-auto flex flex-col
       본문: flex-1 min-h-52            ← min-height가 automatic minimum size를 대체
       바:   sticky bottom-0
```

- flex 아이템에 **명시적 `min-h-*`를 주면 flex의 automatic minimum size(`min-height:auto`)가 대체**되어
  본문 박스가 내용보다 작게 눌린다. 내용은 `overflow: visible`로 박스 밖에 그려지므로 스크롤은 되지만,
  **flex 컨테이너의 content 높이는 첫 화면 크기에서 멈춘다.**
- `sticky`는 containing block을 벗어나지 못한다. containing block이 첫 화면 끝에서 끊기면
  하단 바는 스크롤과 함께 **위로 딸려 올라가고**, 더 스크롤하면 화면에서 사라진다.
- 스크롤 컨테이너에서 하단 바를 항상 고정해야 하는데 flex가 꼭 필요하면, 스크롤 소유권을 안쪽으로
  옮긴다 — 겉은 `flex flex-col overflow-hidden`, 본문만 `flex-1 overflow-y-auto`, 바는 sticky 없이 flex 형제.
  **한 요소가 스크롤 컨테이너와 flex 컨테이너를 겸하게 두지 않는다.**
- 검증은 **스크롤한 뒤**에 한다. 열자마자의 첫 화면은 정상 위치와 구별되지 않는다
  (`scrollTop=0`에서는 자연 위치가 스크롤 뷰 하단과 일치한다).

> 실제 사고(2026-08-13): Gen Studio 생성 콘텐츠 뷰어(`ContentAssetViewer`)가 `BottomSheetDialog`의
> body에 `flex min-h-0 flex-col`을 주고 본문에 `flex-1 min-h-52`를 함께 걸었다. 열었을 때는 정상이었고
> 스크롤하면 하단 바가 본문 중간으로 올라왔다. 실측: `scrollTop=260`에서 바가 하단보다 242px 위,
> 최대 스크롤에서는 480px 위로 밀려 화면 밖. 같은 shell을 쓰는 `CoinUsageDialog`는 body가 block이라 정상이었다.

## 프론트엔드 디자인 하드 룰

### 브랜드 일관성

- 내비게이션 바를 제거해도 AMU 브랜드로 식별 가능해야 함 (브랜드 테스트)
- 브랜드/제품명은 히어로 수준 시그널로 — 단순 nav 텍스트나 eyebrow로 처리 금지

### 섹션 구조

- 섹션당 하나의 목적, 하나의 헤드라인, 하나의 짧은 보조 문장
- 화면마다 초점은 하나다. "이 화면의 주인공이 무엇인가"에 한 가지로 답할 수 있어야 한다
- **서비스 소개·랜딩 성격의 페이지**는 `정체성 → 맥락 → 설명 → 신뢰 → 전환` 흐름을 참고한다.
  작업 화면(Gen Studio 에디터·Marketing Oops 대시보드·Store 관리)과 대화 화면(Tutors)에는 적용하지 않는다

### 컨테이너

- 카드·보더·섀도·배경은 의미가 있을 때 쓴다 — 목록 항목의 경계, 상호작용 단위, 밀도가 다른 콘텐츠의 구분
- 같은 의미를 전달하는 컨테이너를 중첩하지 않는다
- 카드 사용 여부를 전역 금지·허용으로 정하지 않는다. 해당 화면의 정보 구조가 정한다

### 타이포그래피

- Inter, Roboto, Arial 등 시스템 기본 폰트 하드코딩 금지 — 프로젝트 지정 폰트 또는 목적에 맞는 표현력 있는 폰트 사용

### 색상

- 색상은 `src/styles/base/_tokens.scss`의 토큰으로만 쓴다. 리터럴 하드코딩 금지
- 서비스별 색은 `data-service-theme` 오버라이드로 적용한다. 컴포넌트에서 서비스 색을 직접 지정하지 않는다
- 특정 색상 계열을 기본값으로 전제하지 않는다. **목적 없는 보라·분홍 그라데이션을 쓰지 않는다**
- 현재 단일 light 테마다(`_tokens.scss` 상단 주석). dark 지원을 전제한 구현을 하지 않는다
