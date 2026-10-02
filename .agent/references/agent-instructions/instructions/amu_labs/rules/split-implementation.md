---
paths:
  - "packages/**/*.{ts,tsx,css}"
  - "apps/**/*.{ts,tsx,css}"
---

# 분할 구현 정책 (AMU Labs)

## 목적

`packages/ui`의 React 컴포넌트와 소비 앱 조합 기능을 거대 파일로 만들지 않고, 단일 공개 API와 Storybook 계약을 유지하면서 독립 검증 가능한 단위로 구성한다.

## 신규 구현 필수 규칙

- 구현 전에 `packages/ui`의 token/type, primitive, pattern, feature state/hook, Story 경계를 정의한다.
- 아래 중 하나라도 해당하면 처음부터 별도 책임 단위로 분할한다.
  - 독립적인 사용자 흐름 또는 mode가 2개 이상
  - form, modal, tab, 비동기 데이터 생명주기가 2개 이상
  - 표현 UI와 데이터/상태 orchestration이 함께 증가
  - React 파일이 400줄을 넘을 것으로 예상되거나 Story 하나로 상태 조합을 설명하기 어려움
- 순수·도메인 무관 유틸은 `packages/utils`, semantic token과 렌더링·접근성 구현은 `packages/ui`, feature 조합은 소비 앱에 둔다.
- React hook은 하나의 상태 책임만 소유하며 렌더링 컴포넌트와 앱 데이터 orchestration을 한 hook에 섞지 않는다.
- 재사용이 확인되지 않은 prototype 전용 조각을 공용 package로 승격하지 않는다.

## 기존 구현 리팩토링 기준

- 현재 요청과 직접 관련된 파일이 아래 조건을 만족하면 작업 범위 내에서 `safe-refactor`를 우선 검토한다.
  - 독립적인 변경 이유 또는 Story 상태군이 2개 이상
  - 600줄 초과이며 렌더링·상태·비동기 로직이 혼재
  - 1,000줄 초과인 수동 작성 컴포넌트
  - 공개 API와 Story 상태군의 책임 경계가 달라 독립 변경이 어려움
- 600줄 초과 파일은 분할 계획과 보류 사유를 보고서에 기록한다.
- 1,000줄 초과 수동 작성 코드는 원칙적으로 분할한다. 생성 코드, snapshot, 정적 token/fixture 원장은 예외이며 사유를 기록한다.
- 요청 범위를 넘어서는 패키지 재편이나 공개 API 변경이 필요하면 즉시 적용하지 않고 별도 단계로 제안한다.

## 안전한 분할 순서

1. props/events/children, export, token, 접근성, Story 상태를 기준선으로 고정한다.
2. leaf 표현 컴포넌트와 순수 helper부터 추출한다.
3. feature state를 hook으로 이동하고 조합 컴포넌트를 분리한다.
4. `packages/ui` 공개 API와 영향받는 Story를 함께 갱신한다.
5. lint/typecheck/test/Storybook 검증을 단계별로 수행하고 롤백 방법을 기록한다.

## 금지 사항

- 줄 수를 맞추기 위한 의미 없는 wrapper 또는 단일 div 컴포넌트 양산
- 모든 상태를 하나의 거대 Context/store/hook으로 이동
- 분할과 디자인 전면 변경, 공개 API rename, 새 의존성 도입을 한 단계에 혼합
- 분할하면서 API surface·CHANGELOG·Story 영향을 확인하지 않는 작업
