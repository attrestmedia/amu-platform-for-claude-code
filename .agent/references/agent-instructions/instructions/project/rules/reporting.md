# 보고 · 로그 규칙

## 보고서를 쓰는 경우

분석 · 설계 · 패치 제안 · 운영 판단이 포함된 요청. 사용자가 적용을 명시하기 전에는
대상 파일을 고치지 않고 보고서로 답한다. 사실 확인 질문이나 단순 조회는 대상이 아니다.

- 경로: `.agent/docs/project/{YYYY}/{MM}/{YYYYMMDD_HHmmss}__{slug}.md`
- 패치는 그대로 적용 가능한 diff로 제시한다. 스켈레톤은 쓰지 않는다.
- `todo-content.json`에 대응 TASK가 있으면 `status`를 갱신한다.
  (콘텐츠 원장 TASK에는 `report`를 자동 추가하지 않는다 — `{{AGENT_ROOT}}/rules/content-operations.md`)

## 로그

- 경로: `.agent/logs/project/{YYYY}/{MM}/{YYYYMMDD}.json`
- **구조는 같은 폴더의 최신 파일을 그대로 따른다.** 필드를 새로 만들지 않는다.
- `status`: `new` | `analyzing` | `proposed` | `blocked` | `applied` | `verified` | `closed`
- Python으로 쓸 때 `json.dump(..., ensure_ascii=False)` — 한글이 `\uXXXX`로 치환되지 않게 한다.

## 검증 결과

실행한 검증의 성공/실패를 그대로 적는다. 실패 로그는 핵심 오류 중심으로 요약하고 원인 후보를 제시한다.
실행하지 않았거나 불가능했던 항목은 빼놓지 말고 사유와 함께 명시한다.
운영 경로를 바꾼 경우 실행 순서 · 검증 방법 · 롤백을 함께 남긴다.
