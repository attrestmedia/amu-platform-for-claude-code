# Monorepo / Env / Ops

- 패키지 매니저는 pnpm 우선 사용
- Turborepo 태스크 의존성(`dependsOn`)을 존중하고, 빌드 순서에 유의
- 패키지 간 의존성 추가 시 `workspace:*` 프로토콜 사용
- 새 의존성 추가는 극히 제한적으로 제안할 것 (필요 시 이유/대안 포함)
- TypeScript 설정은 `packages/typescript-config`의 공유 설정을 extends
