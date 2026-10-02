---
paths:
  - "packages/ui/**"
  - "packages/utils/**"
---

# UI 컴포넌트 개발

- UI 정본은 `packages/ui`, 프레임워크·도메인 무관 유틸 정본은 `packages/utils`다. 같은 책임의 별도 공통 패키지를 만들지 않는다.
- 디자인 토큰(색상/간격/타이포/그림자 등)은 `packages/ui/src/styles`의 semantic 토큰으로 정의한다.
- 컴포넌트는 아토믹 디자인 원칙을 따를 것 (Atom → Molecule → Organism)
- 모든 컴포넌트에 적절한 TypeScript 타입을 정의
- 접근성(a11y): 시맨틱 HTML, ARIA 속성, 키보드 내비게이션 기본 적용
- CSS는 디자인 토큰(CSS 변수/SCSS 변수) 기반으로 작성 — 하드코딩 금지
- tree-shaking이 가능하도록 named export 사용
- UI는 도메인·라우트·스토어·인증·분석을 알지 않고 외부 능력과 문구를 props/provider로 받는다. 재사용 근거가 사라지거나 도메인 결합이 생기면 소비 앱으로 강등한다.
- util은 U1 순수성, U2 프레임워크 무관, U3 도메인 무지, U4 테스트, U5 최소 공개 표면을 모두 충족해야 하며 DOM 접근은 `./browser`에만 둔다.
- deny-list 정본 `scripts/deny-list.mjs`를 우회하지 않는다. 공개 export 변경은 API surface 스냅샷, SemVer 버전, CHANGELOG를 함께 갱신한다.
