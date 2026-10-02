---
name: safe-refactor
description: Refactor safely in AMU WEB (WordPress/theme/ops) - smallest steps, preserve behavior, add checks.
allowed-tools: Read, Grep, Edit, Bash
disable-model-invocation: true
---

# Safe refactor

명시적으로 호출될 때만 실행할 것

프로세스:

1. `{{AGENT_ROOT}}/rules/split-implementation.md`의 책임 경계·임계값·예외를 확인
2. 중복 코드와 가장 작은 추출 지점을 파악
3. 리팩터링은 한 번에 한 단계씩 진행
4. 공개 API와 동작을 유지
5. 가능한 점검을 실행:
   - PHP: `php -l`
   - 테마 빌드가 있으면: 테마 폴더의 `package.json` 스크립트 기준
   - Docker: `docker compose config`
6. 최소 patch + 분할 전후 책임 + 롤백(원복 방법)을 함께 제시
