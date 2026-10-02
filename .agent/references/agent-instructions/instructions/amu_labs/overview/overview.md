# AMU Labs

## 개요

AMU(All My Universe) 생태계의 **공통 UI·유틸 패키지 및 시각 검증 워크스페이스**.

다양한 AMU 프로젝트(Gen Studio, Tutors, 미니앱/게임 등)에서 사용할 공통 UI 프리미티브와 프레임워크·도메인 무관 유틸을 설계·개발·검증한다.

## 핵심 구성

- **`packages/ui`**: React UI 프리미티브·semantic 토큰·아이콘·통합 Storybook의 단일 정본
- **`packages/utils`**: 프레임워크·도메인 무관 공통 유틸의 단일 정본. DOM 의존 코드는 `./browser`로 분리
- **`packages/typescript-config`**: 워크스페이스 공통 TypeScript 설정
- **통합 Storybook**: `packages/ui` 컴포넌트의 시각 문서화와 상태·인터랙션 검증
- **Visual Check MCP**: 빌드된 `packages/ui/storybook-static`을 대상으로 환경·스토리 검증

## 기술 스택

- TypeScript, pnpm, Turborepo
- React 19+
- CSS Variables (semantic 디자인 토큰)
- Storybook 8+
- Vite (빌드)
