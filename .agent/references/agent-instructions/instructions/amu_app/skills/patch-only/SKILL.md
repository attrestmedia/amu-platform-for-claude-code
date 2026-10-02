---
name: patch-only
description: Always respond with minimal diffs (patch format) and avoid rewriting full files.
---

# Patch-only output

코드 변경 요청 시:

- 변경된 부분의 diff/patch만 출력할 것
- 명시적으로 요청하지 않는 한 파일 전체를 붙여넣지 말 것
- 여러 파일이 변경된 경우, 파일 경로별로 패치를 구분할 것
- 변경은 최소한으로 유지하고 기존 스타일과 일관성을 맞출 것
