---
name: ux-coding
description: AMU Labs UX 코딩 규칙 — 성능 최적화, 번들 효율, 렌더링 최적화, 컴포넌트 라이브러리 품질
allowed-tools: Read, Grep, Edit, Bash
---

# AMU Labs UX 코딩 규칙

> 컴포넌트 라이브러리의 품질은 소비자(downstream 앱)의 성능에 직접 영향을 미친다

## 1. 코어 최적화 — 불필요한 중복 금지

- 중복 함수/유틸 생성을 금지하고, 기존 모듈을 **최대한 재사용**
- 여러 컴포넌트에서 반복되는 UI 로직은 `packages/ui`의 공통 hook/internal helper로 추출
- 프레임워크·도메인 무관 순수 유틸은 U1~U5 승격 게이트를 통과한 경우에만 `packages/utils`에 둔다.
- 디자인 토큰은 반드시 `packages/ui/src/styles`의 semantic 토큰으로 정의 — 컴포넌트 내 하드코딩 금지

### 체크리스트

- [ ] 동일/유사 로직이 이미 존재하는지 검색(`Grep`)했는가?
- [ ] 새 유틸 생성 시 적절한 패키지에 배치했는가?
- [ ] 불필요한 리렌더링을 유발하는 상태 구조가 아닌가?

## 2. 번들 사이즈 최적화

- **named export**만 사용하여 tree-shaking 보장
- 컴포넌트 내에서 큰 외부 라이브러리를 직접 import하지 말 것 — 필요 시 peer dependency로 설계
- CSS-in-JS보다 CSS 변수와 사전 컴파일 CSS 우선 (런타임 비용 제거)
- 사용하지 않는 import/코드를 방치하지 말 것

### 번들 가이드

| 항목             | 권장             | 위험             |
| ---------------- | ---------------- | ---------------- |
| 개별 컴포넌트    | < 5KB gzip       | > 20KB gzip      |
| `packages/ui` 전체 | < 100KB gzip     | > 300KB gzip     |
| 외부 의존성      | 최소화           | 3개 이상 추가    |

## 3. 렌더링 성능

- `React.memo`는 실제 성능 이슈가 측정된 경우에만 적용 — 과도한 최적화 금지
- 컴포넌트 내부에서 인라인 객체/함수 생성 최소화 (props 비교 무효화 방지)
- 애니메이션은 CSS transition/animation 우선, JS 애니메이션은 `requestAnimationFrame` 기반
- 대량 리스트 컴포넌트는 가상화(virtualization)를 기본 고려

## 4. 접근성 & 사용성 성능

- 포커스 관리: Tab 순서, focus trap, focus-visible 스타일
- 터치 타겟: 최소 44x44px
- 색상 대비: WCAG AA 기준 충족
- 모션: `prefers-reduced-motion` 미디어 쿼리 대응

## 5. 테스트 가능성

- 컴포넌트의 주요 동작은 Storybook interaction test로 검증 가능하도록 설계
- data-testid 속성을 주요 인터랙션 요소에 부여
- 상태 변화가 시각적으로 확인 가능하도록 Story 구성
