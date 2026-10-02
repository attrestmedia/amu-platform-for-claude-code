---
paths:
  - "src/**/*.{ts,tsx}"
---

# 분할 구현 정책 (Node App / Next.js)

## 목적

신규 React/Next.js 기능과 API를 거대한 단일 파일에 누적하지 않고, FSD와 단순화한 Atomic Design에 맞춰 변경·검증 가능한 책임 단위로 구성한다.

## 신규 구현 필수 규칙

- 구현 전에 route/page shell, feature UI, domain state/hook, service/API orchestration, schema/type/constant 경계를 정의한다.
- 아래 중 하나라도 해당하면 처음부터 별도 책임 단위로 분할한다.
  - 독립적인 사용자 흐름, tab, form, dialog/sheet가 2개 이상
  - 서로 다른 비동기 데이터/API 생명주기가 2개 이상
  - 표현 UI와 서버/도메인 orchestration이 함께 증가
  - 수동 작성 파일이 400줄을 넘을 것으로 예상되거나 한 리뷰에서 전체 책임을 설명하기 어려움
- 공용 primitive는 `src/components/ui`, 도메인 조합 UI는 `src/components/module` 또는 feature 내부, page 전용 조합은 `src/components/template`/route 인접 경계에 둔다.
- API route는 인증·입력·응답 조합을 담당하고 재사용 가능한 도메인/외부 연동 로직은 기존 `src/libs` service 경계로 분리한다.
- 상태는 실제로 함께 변경되는 기능 단위로 hook/reducer/store에 둔다. 파일 수만 늘리거나 거대 Context/props bag으로 결합을 옮기지 않는다.
- 두 번 이상 실제 재사용되거나 동일 계약을 공유하지 않는 코드는 성급하게 공용화하지 않는다.

## 기존 구현 리팩토링 기준

- 현재 요청과 직접 관련된 파일이 아래 조건을 만족하면 작업 범위 내에서 `safe-refactor`를 우선 적용한다.
  - 독립적인 변경 이유가 2개 이상
  - 600줄 초과이며 JSX·상태·effect·API 호출이 혼재
  - 1,000줄 초과인 수동 작성 컴포넌트/route/service
  - 같은 변경을 여러 render/helper/action 위치에 반복 적용해야 함
- 600줄 초과 파일은 분할 계획과 이번 단계에서 보류한 경계를 보고서에 기록한다.
- 1,000줄 초과 수동 작성 코드는 원칙적으로 분할한다. 생성 코드, schema/migration snapshot, 단순 정적 데이터 원장은 예외이며 예외 사유를 기록한다.
- 요청 밖 리팩토링은 금지한다. 필요한 분할이 현재 승인 범위를 넘으면 최소 안전 단계와 후속 단계를 분리해 제안한다.

## 안전한 분할 순서

1. props, route payload/response, 공개 export, 사용자 동작 계약을 기준선으로 고정한다.
2. 순수 helper와 leaf 표현 컴포넌트/dialog부터 추출한다.
3. feature tab/section을 분리하고 해당 상태 소유권을 가장 가까운 경계로 이동한다.
4. 조회·명령·편집 상태를 각각의 domain hook/service로 분리한다.
5. 각 단계마다 수정 파일 lint와 전체 `pnpm run typecheck`를 실행한다. 공통 import/설정/대규모 이동은 전체 `pnpm run lint`도 실행한다.
6. 분할 전후 책임, 보존한 계약, 검증 결과, 롤백 방법을 보고한다.

## 금지 사항

- 줄 수를 맞추기 위한 의미 없는 wrapper/파일 생성
- 수십 개 callback/state를 하나의 props 객체나 전역 Context로 옮기는 형식적 분할
- 분할과 기능 변경, 디자인 전면 수정, API 계약 변경, 상태 라이브러리 도입을 한 단계에 혼합
- 순환 의존성, barrel export 남용, client/server 경계 확대
