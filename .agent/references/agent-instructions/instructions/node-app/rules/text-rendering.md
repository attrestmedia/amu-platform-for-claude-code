---
paths:
  - "src/components/**"
  - "src/**/game/**"
  - "src/**/pixi/**"
  - "src/utils/text/**"
  - "src/hooks/**"
---

# Text Rendering & Measurement

## Rule A. DOM-first

- 사용자 가독 텍스트는 기본적으로 DOM에 유지
- canvas/WebGL/SVG 직접 텍스트 렌더링은 장식/게임/이미지 export 성격일 때만 허용
- 사용자 가독 텍스트를 canvas/WebGL/SVG로 직접 그리는 예외가 필요하면 DOM mirror 또는 접근성 대안을 함께 명시
- 렌더 전에 텍스트 높이/줄 수/최대 폭 예측이 필요한 기능은 공통 텍스트 레이아웃 엔진 또는 훅을 사용
- 측정 입력은 공통 typography preset을 사용하고, 실제 CSS `font` shorthand 및 `line-height`와 동기화
- `document.fonts.ready` 또는 동등한 font-ready 보장 없이 텍스트 준비 측정을 수행하지 않음
- route/language/font preset 변경으로 실제 CSS font가 바뀌는 경우 prepared cache를 재생성
- locale, `white-space`, `word-break`, direction이 결과에 영향이 있는 경우 생략하지 않음
- `textarea` auto-resize, post-render verification, export용 canvas text는 예외로 둘 수 있음

## Rule B. Direct measurement 금지

기능 코드에서 개별 `measureText()`, `getBoundingClientRect()`, `offsetHeight`, `scrollHeight` 기반 텍스트 사전 측정 신규 추가를 금지하고, 렌더 전 텍스트 크기 예측 필요 로직에서 아래 직접 호출을 새로 추가하지 않음:

- `ctx.measureText()`
- `getBoundingClientRect()` 기반 텍스트 높이 측정
- `offsetHeight`, `scrollHeight` 기반 사전 텍스트 크기 계산

예외:

- `textarea` auto-resize
- 이미 렌더된 DOM 검증/보정
- 서드파티 라이브러리 내부 동작

## Rule C. Typography preset 필수

- 텍스트 측정은 raw font 문자열이 아닌 공통 preset key 우선 사용
- preset에는 `font`, `lineHeight`, `whiteSpace`, `wordBreak` 기본값 포함

## Rule D. Font ready 보장

- 측정 준비 단계는 `document.fonts.ready` 또는 명시적 `document.fonts.load(font)` 이후 수행
- route/language/font 변경 시 prepared cache는 재생성

## Rule E. Locale-aware

- `Lang/lang` 결과 텍스트를 측정할 때 locale을 함께 전달
- 한국어/영어 혼합, 추후 RTL/CJK 가능성을 고려해 locale/wordBreak를 생략하지 않음

## Rule F. 백엔드 추상화

- feature 코드는 backend 구현(`heuristic`, `pretext`)을 직접 알지 못함
- 모든 측정은 `textLayoutEngine` façade 또는 관련 훅만 통해 접근

## Rule G. 예외 명시

- 예외적으로 직접 측정 필요 시 코드 주석 또는 보고서에 이유 명시
- **예외 승인 기준**: 네이티브 편집 컨트롤, post-render verification, 외부 캔버스 export
