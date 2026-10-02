---
name: run-checks
description: Run safe checks for AMU WEB (WordPress/theme/ops) after changes.
allowed-tools: Bash, Read
disable-model-invocation: true
---

# Run checks (manual only)

- 먼저 “해당 작업 위치”의 매니페스트 존재 여부 확인:
  - 테마 안에 `package.json`이 있으면(자산 빌드가 있는 경우) 그 스크립트를 우선 사용
  - `composer.json`이 있으면(플러그인/도구가 있는 경우) composer 기반 점검 고려
- PHP 변경 시(가장 기본):
  1. `php -l <파일>` (문법 체크)
- 테마 스타일 변경 시:
  1. `assets/css/*.css`를 직접 고치지 않았는지 확인 — 고쳤다면 SCSS로 옮기고 다시 빌드한다
  2. `sass --style=compressed scss/<name>.scss <name>.css` 재빌드 후 산출물 diff가 의도한 구간만인지 확인
  3. 규칙·셀렉터 소실 0 확인 (형식 차이는 무시)
- WP 환경 점검(가능한 경우에만, 파괴적 명령 금지):
  - `wp theme status` / `wp plugin status` 등 “상태 확인” 위주
- Docker/인프라 변경 시:
  - `docker compose config` (구성 유효성)
  - Nginx/Apache 설정은 문법 체크 명령이 있는 경우에만 제안
- 실패 시: 실행한 정확한 명령 + 핵심 로그 라인만 발췌해서 보고
