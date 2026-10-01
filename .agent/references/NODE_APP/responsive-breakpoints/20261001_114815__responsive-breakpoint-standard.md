# AMU 반응형 브레이크포인트 기준 재정의 — 검토와 결정

- 작성: 2026-10-01 11:48 KST · Claude Code
- 상태: `decided` — 기준값 합의 완료, 코드 변경 0 (적용은 아래 §6 단계별로 별도 진행)
- 대상: `node-app` (Next.js + Tailwind CSS v4.1)
- 관련 파일
  - `node-app/src/styles/tailwind/theme.css` (현재 `--breakpoint-xs: 480px`만 커스텀)
  - `node-app/src/hooks/common/useIsMobile.ts` (기본 쿼리 `(max-width: 639px)`)

---

## 0. 결론

| 토큰 | 값 | 의미 | 변경 |
|---|---|---|---|
| base | < 360px | 소형폰, 폴드 커버 화면 | 새 의미 |
| `xs` | **360px** (22.5rem) | 일반 폰 세로. 썸네일 그리드가 2열로 바뀌는 지점 | 480 → 360 |
| `sm` | **480px** (30rem) | 폰 이후. 2열 폼과 가로 배치가 시작되는 지점 | 640 → 480 |
| `md` | 768px | 태블릿 세로 | 유지 |
| `lg` | 1024px | 태블릿 가로, 소형 노트북 | 유지 |
| `xl` | 1280px | 노트북 | 유지 |
| `2xl` | 1536px | 데스크톱 | 유지 |

핵심은 역할 분담이다.

- **썸네일·카드 그리드는 `xs`(360)부터 2열**로 보인다. 가능하면 컨테이너 쿼리를 쓴다.
- **`sm`(480)은 레이아웃 전환**(2열 폼, 가로 배치)을 맡는다.

```css
/* node-app/src/styles/tailwind/theme.css — 적용 예정 값 */
@theme {
  --breakpoint-xs: 22.5rem; /* 360px */
  --breakpoint-sm: 30rem;   /* 480px */
}
```

---

## 1. 배경: 문제 제기

Tailwind 기본 `sm`(640px) 미만을 모바일로 판정하는 기준이 너무 넓다.

- 420~640px 구간에서 그리드 썸네일이 1열로 바뀐다. 그 결과 썸네일 하나가 화면 폭을 거의 다 채운다.
- 태블릿과 다양한 해상도를 고려하면 이 구간은 사용성이 애매하다. AMU는 게임 기반 웹 플랫폼이라 다양한 스크린에 대응하는 것이 중요하다.

---

## 2. 원인 분석

### 2.1 그리드 열 수는 `useIsMobile`이 아니라 Tailwind 클래스가 결정한다

`useIsMobile`(기본 `(max-width: 639px)`)의 실제 사용처는 다음뿐이다.

| 사용처 | 용도 | 쿼리 |
|---|---|---|
| `components/template/canvas-drawing/modules/DrawingToolbar.tsx` (2곳) | 브러시 슬라이더·오버플로우 메뉴를 Popover로 전환 | 기본값 (639px) |
| `components/module/layout/WorkspaceShell.tsx:39` | 사이드바 시트 전환 | `(max-width: 1023px)` 직접 지정 |

따라서 이 훅의 기준값만 바꿔서는 썸네일 1열 문제가 해결되지 않는다.

### 2.2 실제 원인: `grid` + `sm:grid-cols-N` 패턴

열 기본값 없이 `sm:`부터 열이 늘어나는 패턴 때문에 640px 미만이 전부 1열이 된다. 대표 사례:

- `components/template/gen-studio/modules/StudioTemplateGallery.tsx:222`: `grid gap-3 sm:grid-cols-3 lg:grid-cols-4`
- `components/template/gen-studio/modules/StudioTemplateGallery.tsx:252`: `grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4`
- `components/module/game/forge/library/ForgeLibraryView.tsx:169`: `grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3`
- `components/module/game/forge/steps/map/MapStudioView.tsx:261`: `grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3`
- `components/template/library/UserImageLibrary.tsx:430`: `grid-cols-1 gap-2 sm:grid-cols-2 …`
- `app/(public)/store/[universeId]/page.tsx:1168`: `grid-cols-1 … sm:grid-cols-2 lg:grid-cols-4`

반면 `components/template/gen-studio/modules/StudioImageGallery.tsx:84`는 `grid gap-3 xs:grid-cols-2 sm:grid-cols-3 …`라서 이미 480px부터 2열이다.

### 2.3 현재 브레이크포인트 사용량 (`.ts`/`.tsx` 기준)

| 접두사 | 사용 횟수 |
|---|---|
| `xs:` | 31 |
| `sm:` | 853 (197개 파일) |
| `md:` | 259 |
| `lg:` | 198 |
| `xl:` | 45 |
| `2xl:` | 0 |

### 2.4 CSS 밖에 하드코딩된 브레이크포인트

| 위치 | 값 |
|---|---|
| `hooks/common/useIsMobile.ts:6` | `(max-width: 639px)` |
| `components/module/layout/WorkspaceShell.tsx:39` | `(max-width: 1023px)` |
| `components/template/gen-studio/modules/spatial-gallery/spatialGalleryLayout.ts:68,76` | `innerWidth < 640`, `< 1180` |
| `components/module/magazine/AppMagazineMotionCover.tsx:74` | `innerWidth < 640` |
| `next/image`의 `sizes` 속성 (약 25곳) | 560 / 640 / 768 / 1024 / 1200 / 1280 혼재 |

### 2.5 컨테이너 쿼리 선례

부모 폭 기준 그리드가 이미 쓰이고 있다.

- `components/template/gen-studio/modules/RecentGeneratedContents.tsx:111`: `@container` + `grid-cols-1 @[28rem]:grid-cols-2`
- `components/template/gen-studio/modules/ImagePreviewRail.tsx:90`: `@container` + `grid-cols-2 @[28rem]:grid-cols-3 @[40rem]:grid-cols-4`

---

## 3. 검토한 대안과 판단

### 3.1 `sm` 재정의 없이 그리드 클래스만 수정 (1차 검토안)

- 문제가 되는 그리드만 `xs:grid-cols-2` 패턴으로 바꾸는 방식이다. 영향 범위는 가장 작다.
- 하지만 "640px 미만 = 모바일"이라는 기준 자체가 넓다는 문제는 남는다. 그래서 기준 재정의로 방향을 잡았다.

### 3.2 `xs` = 375px — 기각, 360px로 결정

- Tailwind 브레이크포인트는 `min-width`, 즉 "이상" 기준이다. `xs: 375`면 360px 기기가 xs 미만으로 떨어진다.
- 갤럭시 S 시리즈는 360~412px, 아이폰은 375~430px이다. 375로 자르면 같은 "일반 폰"이 기종에 따라 다른 레이아웃을 받는다.
- 360으로 잡으면 일반 폰 세로를 하나의 구간으로 묶을 수 있다. 360 미만(폴드 커버, 구형 소형폰)은 base로 처리한다.

### 3.3 `md`/`lg`/`xl`까지 함께 하향 — 기각, 현행 유지

- 768 / 1024 / 1280은 현재도 태블릿 세로, 태블릿 가로·소형 노트북, 노트북에 잘 맞는다.
- `lg`를 내리면 `WorkspaceShell`의 데스크톱 사이드바가 태블릿 세로 화면에 펼쳐진다.
- 비어 있던 구간은 폰 대역(360~640px)뿐이다.
- `md`를 744(아이패드 미니)로 내리는 안과 `3xl`(1920) 신설도 논의했지만, 이번 결정에서는 제외했다. 필요해지면 다시 검토한다.

### 3.4 `sm` = 480 vs 520 vs 560 — 480으로 결정

1. **폰 세로 폭은 430px 이하에 몰려 있다.** 480이면 모든 폰 세로가 `sm` 미만에 들어가고 약 50px 여유도 남는다. 520·560은 폰을 더 잘 구분해 주지 않는다. `sm` 미만 구간만 넓어진다.
2. **원래 문제가 남는다.** `sm:` 기준 그리드에서 1열로 남는 최대 폭(좌우 패딩 16px 기준)은 다음과 같다.

   | `sm` 값 | 1열로 남는 최대 폭 | 그때 썸네일 폭 |
   |---|---|---|
   | 480 | 479px | 약 447px |
   | 520 | 519px | 약 487px |
   | 560 | 559px | 약 527px |

   560이면 "썸네일이 화면을 꽉 채우는" 구간이 그대로 남는다.
3. **520·560이 유리한 건 폼뿐이다.** 2열 입력 폼은 480에서도 칸당 약 218px라 충분하다. 3열 폼이나 고정폭 그리드는 480(약 140px)과 560(약 165px) 모두 비좁다. 어차피 `md:`로 올려야 한다.
4. **값이 깔끔하다.** 480(30rem)은 기존 `xs` 값이라 기존 `xs:` 사용처의 "480 이상" 의도를 `sm:`으로 그대로 옮길 수 있다. `sm`(480)과 `md`(768) 사이도 288px로, 640일 때보다 구간 균형이 좋다.

---

## 4. 설계 원칙

1. **역할 분담**
   - 페이지 골격(사이드바, 헤더, 시트, 다이얼로그 크기)은 뷰포트 브레이크포인트로 처리한다.
   - 카드·썸네일 그리드와 툴바는 컨테이너 쿼리(`@container`, `@[Nrem]:`)를 우선한다. 같은 갤러리라도 사이드바가 열린 데스크톱과 태블릿에서 놓이는 폭이 다르기 때문이다.
2. **썸네일 그리드는 1열로 시작하지 않는다.** 순수 이미지 썸네일은 base부터 `grid-cols-2`로 시작한다. 정보가 많은 카드(라이브러리·맵 카드)는 base 1열, `xs:grid-cols-2`로 둔다.
3. **3열 이상 폼과 고정폭 다열 그리드는 `md:` 이상에서 연다.**
4. **단일 기준(SSOT)**: 브레이크포인트 값은 `theme.css` 토큰을 정본으로 둔다. JS에서 필요한 값은 같은 값을 내보내는 TS 상수(`BREAKPOINTS`)로만 참조하고, 숫자를 하드코딩하지 않는다.

---

## 5. 변경 시 주의 사항

- **기존 `xs:` 31곳**은 480 → 360으로 내려간다. 의도가 "480 이상"이었던 곳은 `sm:`으로 옮겨야 한다. 예:
  - `TopBarAppLauncher.tsx`: `xs:rounded-2xl`, `xs:pb-1`, `xs:max-h-…`
  - `app/admin/page.tsx`: 시트 크기 `xs:!h-…`, `xs:w-…`, `xs:!max-w-3xl`
- **기존 `sm:` 853곳**은 480~639px 구간에서 새로 적용된다. 그중 다음 사례는 비좁아지므로 감사(audit)해서 `md:`로 올려야 한다.
  - `sm:grid-cols-3` 이상인 폼
  - 고정폭 열 그리드 (예: `MapStudioView.tsx:227`의 `sm:grid-cols-[minmax(0,1fr)_10rem_auto]`)
- **`useIsMobile` 기본값**은 `sm` 기준(479px)으로 함께 맞춘다. 이 훅은 `DrawingToolbar`의 플로팅 UI 분기에 쓰이므로, 480~639px에서 인라인 확장 툴바가 넘치지 않는지 `hasHorizontalOverflow` 감지와 함께 확인한다.
- **`next/image`의 `sizes`** 값도 새 기준으로 갱신한다. 그대로 두면 이미지가 실제 표시 크기보다 크거나 작게 로드된다.

---

## 6. 적용 단계 (미착수)

1. **기준 단일화**
   - `theme.css` 토큰을 `xs: 22.5rem`, `sm: 30rem`으로 변경한다.
   - 같은 값을 TS 상수 `BREAKPOINTS`로 내보낸다.
   - `useIsMobile`, `WorkspaceShell`, `spatialGalleryLayout`, `AppMagazineMotionCover`의 하드코딩 값을 상수로 교체한다.
   - 기존 `xs:` 31곳을 이관한다(§5).
2. **`sm:` 감사**: 480~639px에서 비좁아지는 사용처 목록을 먼저 만들고 검토한 뒤 수정한다. `sizes` 일괄 갱신도 이 단계에서 진행한다.
3. **썸네일 그리드를 컨테이너 쿼리로 전환**: `StudioTemplateGallery`, `ForgeLibraryView`, `MapStudioView`, `UserImageLibrary`, `store/[universeId]` 등.
4. **검증**: 아래 폭에서 주요 화면을 캡처해 비교한다.
   - 폰: 344, 360, 390, 430
   - 경계: 480, 560, 640
   - 태블릿·노트북: 768, 1024, 1280
