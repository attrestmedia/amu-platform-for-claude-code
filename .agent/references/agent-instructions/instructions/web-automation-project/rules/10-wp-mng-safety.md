# WP Management Safety Rules

## 적용 대상
- `wp_mng/post_utils/*`
- `wp_mng/cicd/*`

## 규칙
- DB 쓰기/원격 동기화가 발생하는 스크립트는 사전 검증을 선행한다.
- 동기화 스크립트는 가능하면 `--dry-run`을 먼저 실행한다.
- 포스트 등록/수정 전 입력 JSON(`new_post_datas.json`) 기준 검토를 우선한다.
- 권한 변경(chown/chmod)과 서비스 재시작 영향 범위를 확인한다.
