---
name: ui-component
description: AMU Labs의 단일 UI 정본인 packages/ui에서 컴포넌트를 승격·구현·강등하고 공개 API와 서비스 테마를 관리
allowed-tools: Read, Grep, Edit
---

# UI 컴포넌트 개발 워크플로우

## 사전 확인

1. `packages/ui`의 기존 primitive/pattern, semantic 토큰, 공개 export, Story를 확인한다.
2. 새 자산은 소비 앱에서 시작했는지와 서로 다른 두 서비스/모듈의 재사용 근거가 있는지 확인한다. 명백한 표준 프리미티브만 처음부터 패키지에 둘 수 있다.
3. UI 승격 게이트를 모두 확인한다: G1 도메인 무지, G2 외부 능력 주입, G3 재사용 근거, G4 사용자 문구 비소유, G5 Story 상태 검증, G6 서비스 중립.
4. `scripts/deny-list.mjs`와 기존 API/버전 계약을 확인한다.

## 개발 순서

1. 필요한 공통 값은 `packages/ui/src/styles`의 기존 semantic 토큰으로 표현한다. 서비스 전용 표현이면 공통화하지 않고 앱 module에 둔다.
2. 표준 단위는 `primitives`, 재사용 조합은 `patterns`, UI 전용 helper는 `internal`에 둔다.
3. 문구·번역·로깅·전송·테마 선택은 props/provider로 주입하고 앱 도메인 import를 만들지 않는다.
4. `{ComponentName}.stories.tsx`에 Default/Disabled/Focus/Long-text/Mobile 상태와 실제 variant·error/overlay 흐름을 기록한다.
5. 공개 export가 바뀌면 `api-surface:gen`, SemVer 버전, `CHANGELOG.md`를 같은 변경 단위에서 갱신한다.
6. lint, typecheck, Storybook build, `pnpm check:boundaries`, `release:verify`를 수행한다.

## 컴포넌트 설계 원칙

- 아토믹 디자인: Atom(Button, Badge) → Molecule(InputField) → Organism(Card, List)
- CSS는 디자인 토큰(CSS 변수) 기반 — 하드코딩 금지
- 접근성: 시맨틱 HTML, ARIA, 키보드 내비게이션
- TypeScript 타입 정의 필수
- tree-shaking 가능하도록 named export 사용

## 강등과 서비스 확장

- 승격 자산에 서비스 타입·상수·API·스토어 의존이 생기면 prop을 계속 늘려 숨기지 말고 소비 앱 계층으로 강등한다.
- 신규 서비스는 `styles/themes/<service>.css`에 기존 semantic 토큰 override만 추가하고 브랜드 아이콘은 `icons/brand/<service>/`로 노출한다.
- 패키지는 활성 서비스를 분기하지 않는다. 소비 앱이 theme scope를 선택하며 Storybook에서 해당 테마와 아이콘을 확인한다.
- 배포는 versioned tarball/registry artifact만 소비한다. 동일 버전 artifact를 덮어쓰지 않고 문제 발생 시 직전 manifest의 버전과 SHA256으로 롤백한다.
