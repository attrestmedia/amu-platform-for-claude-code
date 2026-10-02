---
paths:
  - "packages/ui/.storybook/**"
  - "packages/ui/stories/**"
---

# Storybook

- `packages/ui`의 공개 컴포넌트는 대응하는 React Story를 같은 변경 단위에서 작성
- 기본 상태 매트릭스는 Default, Disabled, Focus, Long-text, Mobile이다. 해당하지 않는 상태는 Story 또는 변경 설명에 사유를 남긴다.
- variant, error/loading/empty, overlay, 키보드 흐름처럼 API가 제공하는 추가 상태도 커버할 것
- `args`/`argTypes`를 활용하여 인터랙티브 컨트롤 제공
- 접근성 검증을 위해 focus-visible, 키보드 내비게이션, 이름/역할/상태 시나리오를 포함
- 서비스별 분기를 Story 코드에 만들지 않고 `styles/themes/<service>.css`의 semantic override로 검증
- Story 파일 네이밍: `{ComponentName}.stories.tsx`
