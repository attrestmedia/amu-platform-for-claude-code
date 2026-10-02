# Worker Deploy Rules (Cloudflare Worker 배포/롤백 규칙)

## 목적

Cloudflare Worker/R2 변경이 dry-run 없이 production에 반영되거나, 배포 후 검증/롤백 경로 없이 방치되는 것을 방지한다.

## 배포 절차 (제안 시 항상 이 순서로)

1. **사전 검증**: `pnpm exec tsc --noEmit`(또는 프로젝트 scripts) + `wrangler deploy --dry-run`
2. **바인딩 대조**: `wrangler.jsonc`의 버킷 바인딩/커스텀 도메인/시크릿 이름이 운영 구성과 일치하는지 확인
3. **배포**: `wrangler deploy` — production 배포 명령은 **제안 형태로만** 제공하고 사용자 실행/승인 후 진행
4. **헬스체크**: 배포 직후 대상 URL(예: `private-assets.allmyuniverse.com`)의 기대 응답(상태 코드/서명 검증 동작)을 확인
5. **롤백**: 실패 시 `wrangler rollback`(또는 직전 버전 재배포)으로 즉시 원복 — 배포 제안에 롤백 명령을 항상 함께 기재

## R2 / 서명 URL 안전 규칙

- private bucket(`amu-private-prod`) 객체를 public bucket으로 복사/이동하는 작업은 노출 사고로 간주하고 사전 확인 필수
- 서명 URL 검증 로직(만료/서명 키) 변경은 인증 우회 가능성을 우선 검토하고, 만료 시간 연장은 사유를 보고서에 명시
- 버킷 삭제/객체 대량 삭제/`wrangler r2 bucket delete` 등 파괴적 명령 금지 (workspace safety-governance 준수)
- Worker 시크릿(`wrangler secret`)은 값 노출 금지 — 이름만 문서화

## production 배포 게이트

- 배포 전 현재 상태(배포 버전, 도메인, 바인딩)를 먼저 기록
- 배포 명령/헬스체크 결과/롤백 경로를 보고서에 남긴다 (`~/Project/.agent/docs/cloudflare-worker`/`~/Project/.agent/logs/cloudflare-worker` 규약)
- 다른 프로젝트(node-app 등)의 asset URL 계약을 바꾸는 변경은 교차 작업으로 간주 → workspace `cross-project.md` 적용
