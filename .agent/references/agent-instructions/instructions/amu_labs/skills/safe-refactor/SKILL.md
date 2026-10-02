---
name: safe-refactor
description: AMU 프로젝트에서 안전하게 리팩토링 수행 — 최소 단위 변경, 동작 보존, 검증 포함
allowed-tools: Read, Grep, Edit, Bash
disable-model-invocation: true
---

# 안전한 리팩토링

명시적으로 호출된 경우에만 실행

## 프로세스

1. `{{AGENT_ROOT}}/rules/split-implementation.md`의 책임 경계·임계값·예외를 확인
2. 중복 코드와 **최소 추출 지점**을 확정
3. 한 번에 **1단계씩만** 리팩토링
4. `packages/ui`의 React 공개 API, 접근성, Story와 기존 동작을 **반드시 보존**
5. 타입체크/린트/테스트와 영향받는 Story를 검증 (먼저 `package.json` scripts 확인)
6. **최소 패치**와 분할 전후 책임, **롤백 방법**을 제공
