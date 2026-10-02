---
name: storybook-story
description: packages/ui의 React Storybook에서 승격 게이트와 접근성·테마 상태를 검증하는 Story 작성
allowed-tools: Read, Grep, Edit
---

# Storybook Story 작성 워크플로우

## 사전 확인

1. 대상 컴포넌트의 props/타입 정의 확인
2. 기존 Story 파일의 패턴/컨벤션 파악
3. 기본 상태 매트릭스(Default, Disabled, Focus, Long-text, Mobile)와 컴포넌트 고유 상태를 목록화한다. 적용 불가 상태는 사유를 남긴다.

## Story 구성

1. **Default/Variants**: 기본 상태와 공개 variant
2. **States**: Disabled, Focus, loading/error/empty 및 overlay 상태
3. **Content/Viewport**: 긴 문구·다국어 주입과 375px Mobile
4. **Interactive/A11y**: `args`/`argTypes`, 키보드 흐름, focus-visible, 이름/역할/상태
5. **Theme/Composition**: 필요한 서비스 semantic theme와 실제 조합 예시

## 규칙

- 파일명: `{ComponentName}.stories.tsx`
- Meta의 `title`은 패키지 구조와 같은 `Primitives/컴포넌트명` 또는 `Patterns/컴포넌트명` 형식
- 사용자 문구·서비스 선택을 컴포넌트 내부에 하드코딩하지 않고 args/provider 또는 theme scope로 주입
- 시각적 차이만 만드는 서비스별 컴포넌트 복제 금지. 동일 Story를 semantic theme로 검증
- Story 추가 후 `typecheck:stories`와 정적 Storybook build를 통과
- 최소 패치 형태로 출력
