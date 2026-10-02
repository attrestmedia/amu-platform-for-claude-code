---
paths:
  - "src/components/module/chart/**"
  - "src/utils/chart/**"
  - "src/components/**/*Chart*.tsx"
  - "src/app/**/*Chart*.tsx"
---

# Chart & Data Visualization (차트 라이브러리 선택·구현 계약)

## 적용 범위

차트·그래프·데이터 시각화 UI를 **신규 구현하거나 수정·리뷰**하는 작업.
관리자 통계, Marketing Ops 대시보드, 미니앱 결과 화면, Play 지표, 시세·금융 화면이 대상이다.
단순 숫자 카드(statbar)·표·프로그레스 바는 대상이 아니다 — 기존 `src/components/ui`를 먼저 쓴다.

## 0. 착수 전 확인 — 미리 설치하지 않는다

- **2026-08-08 기준 node-app에는 차트 라이브러리가 하나도 설치되어 있지 않다.** `package.json`의 시각화 관련 의존성은 `pixi.js ^8.8.1`, `three 0.185.1`뿐이다.
- 이 상태 기록을 신뢰하지 말고 **착수 시 `package.json`을 다시 확인**한다.
- **네 라이브러리를 선제적으로 함께 설치하지 않는다.** 화면이 확정된 시점에 필요한 하나만 추가한다.
- 신규 설치는 AGENT_GUIDE의 "새 의존성 추가는 극히 제한적" 규칙 대상이다. 도입 이유·대안·번들 영향을 함께 제안하고 **사용자 승인 후** 설치한다.

## 1. 선택 기준 (결정 트리)

```text
차트가 필요하다
├─ 금융 시계열인가?
│  ├─ 캔들·거래량·이동평균·실시간 틱·대량 봉 탐색 → Lightweight Charts
│  └─ 단순 수익률·지표 비교(선/막대)          → Recharts
├─ 표준 차트 문법(선·막대·영역·원형·퍼널)으로 표현되는가? → Recharts
├─ 표준 문법을 벗어난 커스텀 SVG 시각화인가?
│  (관계망·트리맵·Sankey·히트맵·클러스터맵·사용자 여정)   → visx
└─ 객체가 수천~수만 개이거나 게임형·시뮬레이션 시각화인가?
                                          → d3-* 계산 + PixiJS 렌더링
```

| 용도 | 선택 | 판단 기준 |
| --- | --- | --- |
| 일반 대시보드·관리자 통계 | **Recharts** | 기본값. 표준 차트 형태로 숫자를 읽히게 하는 목적 |
| 커스텀 SVG 시각화 | **visx** | 표준 차트 문법으로 표현이 안 되는 이유가 명확할 때만 |
| 주가·코인 차트 | **Lightweight Charts** | 캔들·거래량·실시간 가격·대량 시계열 탐색 |
| 대량 객체·게임형 | **d3-\* + PixiJS** | SVG 노드 수천 개 이상, 물리·시뮬레이션 |

**기본값은 Recharts다.** 다른 선택을 할 때는 "Recharts로 안 되는 이유"를 보고서나 PR 설명에 한 문장으로 남긴다.

## 2. 라이브러리별 계약

### 2.1 Recharts — 기본값

- 대상 예: GA4 방문자 추이, 채널별 조회·클릭·전환, 캠페인 비교, AI 모델 사용량, 코인 충전·소비 추이, 유니버스별 활성 사용자, 성공률·오류율, 카테고리별 콘텐츠 성과
- SVG 기반이다. **렌더 포인트가 수천 단위를 넘기 전에 서버 또는 `chartData.ts`에서 집계·다운샘플**한 뒤 넘긴다.
- `"use client"` 필요. 컨테이너에 고정 높이 또는 aspect를 지정해 CLS를 막는다.

### 2.2 visx — 커스텀 SVG 시각화

- 완성형 차트 라이브러리가 아니라 **시각화 프리미티브**다. 축·그리드·tooltip·반응형 측정만 React 컴포넌트로 제공된다.
- 단순 막대·선 차트를 visx로 만들지 않는다. 구현 코드만 길어진다.
- 필요한 `@visx/*` 서브패키지만 개별 설치한다. 번들 관리 목적이다.
- 내부적으로 D3 계산을 쓰므로 D3와 경쟁 관계가 아니다. **좌표 계산만 필요하면 개별 `d3-*` 모듈**로 충분하다.

### 2.3 D3 — 계산 전용, DOM은 React 소유

- 권장 형태: `d3-scale`·`d3-shape`·`d3-array`·`d3-hierarchy`·`d3-force`로 **계산만** 하고 SVG 요소는 JSX로 렌더한다.
- **`d3.select(...).selectAll(...).join(...)`으로 React가 소유한 DOM을 직접 갱신하지 않는다.** 리렌더 충돌, 이벤트 정리 누락, Strict Mode 중복 초기화, SSR/hydration 오류, 다크모드·반응형 상태 비동기화가 발생한다.
- 예외로 D3가 DOM까지 소유해야 하면(기존 D3 구현 이식, `d3-zoom`/`d3-brush`가 핵심인 경우) **해당 SVG/Canvas 영역을 전용 컴포넌트로 완전히 격리**하고 소유 경계와 cleanup을 코드 주석에 남긴다.
- `d3` 전체 패키지가 아니라 개별 모듈만 설치한다.

### 2.4 Lightweight Charts — 금융 전용

- 대상: 일봉·주봉·분봉 캔들, OHLC, 거래량 히스토그램, 이동평균선, 실시간 가격 업데이트, 줌·팬·크로스헤어, 장기 금융 시계열 탐색.
- **일반 통계 화면에 쓰지 않는다.** 원형·퍼널·채널별 막대·마케팅 지표에는 부적합하다.
- 명령형 API(`createChart(container)`)다. **공통 래퍼 컴포넌트 하나를 통해서만 사용하고, 화면마다 `createChart()`를 직접 호출하지 않는다.**
- 래퍼가 반드시 처리할 것:

  | 항목 | 처리 |
  | --- | --- |
  | 컨테이너 | `useRef`로 참조 |
  | 생성·해제 | 마운트 시 생성, 언마운트 시 `chart.remove()` |
  | 데이터 갱신 | 전체 교체는 `setData()`, 틱 반영은 `update()` |
  | 반응형 | `ResizeObserver`로 크기 재적용 |
  | 테마 | light/dark 전환 시 `applyOptions()` |

- 서드파티 React 래퍼 대신 **공식 `lightweight-charts`를 직접 감싼다** (핵심 금융 화면의 유지보수 안정성).
- SSR 금지 — `next/dynamic(..., { ssr: false })` 또는 client-only 마운트로 처리한다.
- Android WebView를 운영하므로 **드래그·핀치 줌이 페이지 스크롤과 충돌하지 않는지 실기에서 확인**한다.
- 추세선·피보나치·수십 개 보조지표·종목 검색은 이 라이브러리 범위가 아니다(별도 Advanced Charts 제품). 요구가 그쪽이면 라이브러리 선택부터 다시 판단한다.

### 2.5 D3 + PixiJS — 대량 객체·게임형

- `d3-force`/`d3-hierarchy`로 좌표·레이아웃을 계산하고 **렌더링은 PixiJS**가 담당한다. AMU는 이미 PixiJS를 쓰므로 D3 + SVG보다 이 구성이 강하다.
- 적용 예: 수만 개 점 산점도, 대규모 관계망, 인터랙티브 클러스터, 실시간 입자 시각화.
- `{{AGENT_ROOT}}/rules/game-pixi.md`와 `amu-play-game-development` 스킬의 자원 수명주기·ticker 소유권 계약을 함께 따른다.
- **지표 대시보드를 화려하게 만들 목적으로 PixiJS를 끌어오지 않는다.** 객체 수가 근거일 때만 선택한다.

## 3. 배치 규칙

```text
src/components/module/chart/
├─ common/     # Recharts 기반 일반 차트
├─ financial/  # Lightweight Charts 기반 금융 차트
└─ visual/     # visx (+ d3-* 계산) 기반 특수 시각화

src/utils/chart/
├─ chartTheme.ts        # 색상 토큰 · light/dark 매핑
├─ formatChartValue.ts  # 숫자 · 단위 · 통화 표기
├─ formatChartDate.ts   # 축 날짜 · locale
└─ chartData.ts         # 집계 · 다운샘플 · 결측 처리
```

- **색상·숫자·날짜 포맷·다크모드는 라이브러리 밖 `src/utils/chart/`에서 관리한다.** 라이브러리가 달라도 AMU 표기가 일관되게 유지되도록 하는 계약이다.
- 라이브러리 기본 팔레트와 하드코딩 hex 금지. Tailwind/CSS 변수 기반 토큰을 `chartTheme.ts`에서 해석해 넘긴다.
- 특정 화면 전용 차트는 `src/components/template` 또는 해당 페이지 단위에 두고, 재사용성이 생기면 `module/chart/`로 승격한다.
- 축 라벨·범례·툴팁·빈 상태 문구 등 사용자 노출 텍스트는 i18n(`lang({ko, en})`) 필수.

## 4. 완료 전 확인

- 375/768/1024/1440px 반응형, 컨테이너 리사이즈 시 재계산
- light/dark 양쪽에서 계열 색 대비 확인 (WCAG)
- 색만으로 계열을 구분하지 않는다 — 직접 라벨·패턴·마커 병행 (색각 접근성)
- 데이터 0건 · 로딩 · 에러 상태 UI (비동기 대기에는 preloader 규칙 적용)
- reduced-motion에서 진입 애니메이션 축소
- 고정 높이 또는 aspect로 CLS 방지
- 렌더 포인트 수 상한을 정하고 초과분은 집계·다운샘플

## 5. 금지

- 네 라이브러리를 선제적으로 함께 설치
- 같은 화면에서 같은 목적의 차트 라이브러리 2개 혼용
- 표준 차트로 되는 것을 visx·D3로 직접 구현
- 일반 통계 대시보드(원형·퍼널·채널 막대)에 Lightweight Charts 또는 PixiJS 사용
- 위 4종 밖의 차트 라이브러리(chart.js, ECharts, Nivo, Victory, ApexCharts 등) 임의 도입
- `d3` 전체 패키지 설치, React 소유 DOM에 대한 D3 직접 조작
- 차트 색상·날짜·숫자 포맷을 컴포넌트마다 개별 정의

## 참조

- 비교 근거: `~/Project/.agent/references/CHART-COMPARE.md`
- 프론트 공통 규칙: `{{AGENT_ROOT}}/rules/frontend-next.md`
- 텍스트 렌더링 경계(캔버스/SVG 텍스트 제한): `{{AGENT_ROOT}}/rules/text-rendering.md`
- Pixi/게임 렌더: `{{AGENT_ROOT}}/rules/game-pixi.md`
- 컴포넌트 분할 임계값: `{{AGENT_ROOT}}/rules/split-implementation.md`
