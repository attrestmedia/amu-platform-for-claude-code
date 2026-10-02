---
name: docker-infra
description: Docker/infra changes safely for AMU WEB (compose/nginx/apache/ssl). Minimal diff + rollback-first.
allowed-tools: Read, Grep, Edit, Bash
disable-model-invocation: true
---

# AMU Docker/Infra Workflow

- 기본 스코프는 AMU WEB 운영/배포이며 `node-app/` 작업은 제외
- 먼저 현상/목표를 “서비스/포트/도메인/리버스프록시/SSL”로 쪼개서 레이어를 특정
- 관련 파일을 최소 범위로 탐색: `docker-compose*.yml`, nginx/apache conf, env, systemd
- 변경은 최소 diff, 반드시 롤백(원복 방법) 포함
- 파괴적/고위험 명령 금지: `docker system prune`, `docker compose down -v`, 볼륨/이미지/컨테이너 무차별 삭제
- 재시작/적용은 “제안”으로만 제공(명령 자체는 안전하게)
- 적용 후 검증은 “상태 확인” 위주로 제안: `docker compose ps`, `docker compose logs --tail=200`, (가능 시) `docker compose config`
- 비밀값/키/토큰은 로그·패치·예시에서 직접 노출하지 않기(필요 시 마스킹)
