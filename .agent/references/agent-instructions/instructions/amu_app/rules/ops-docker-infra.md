---
paths:
  - "docker-compose*.yml"
  - "docker/**/*"
  - "nginx/**/*"
  - "apache/**/*"
  - "scripts/**/*"
  - "**/*.service"
---

# Ops / Docker / Infra Rules (AMU WEB)

- 변경 전 “현재 상태(서비스/포트/도메인/볼륨/프록시/SSL)”를 먼저 확인하고 가설→검증 흐름 유지
- 파괴적 명령 금지: `docker system prune`, 무차별 삭제, DB drop/reset
- 설정 변경은 최소 diff로, 반드시 롤백(원복 방법/이전 값) 함께 제시
- 재시작/적용 명령은 “제안” 형태로만 제공 (무단 실행 전제 금지)
- 보안/노출(포트/관리자 경로/비밀키)은 최소 공개 원칙 유지
- **node-app → WordPress REST 호출은 공개 Cloudflare 경로가 아니라 같은 Docker network의 `wordpress:80`을 쓴다.** Bot/WAF 차단 재발 방지 계약이며 값·검증·rollback 절차는 node-app 스코프의 `rules/monorepo-env.md` "Node → WordPress 내부 API" 절이 정본이다
