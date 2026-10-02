# AMU Cloudflare Worker - AGENT Guide

## 프로젝트 목적

1. AMU의 Cloudflare Worker / R2 / Cloudflare Proxy 운영 진입점
2. 1차 Worker는 private Gen Studio 이미지를 전달하는 `amu-private-assets`
3. 공개 정적 리소스는 R2 public bucket(`amu-public-prod`) + nginx fallback 정책으로 운영

## 운영 도메인/버킷 (현재 상태)

- `assets.allmyuniverse.com` → public R2 assets (bucket: `amu-public-prod`)
- `private-assets.allmyuniverse.com` → Worker custom domain, private asset gateway (binding: `PRIVATE_ASSETS` → `amu-private-prod`)

## 기본 작업 원칙

- 모든 답변/설명은 한국어로 작성
- 요청 범위를 벗어난 리팩토링/정리 작업 금지
- production 배포/도메인/버킷/시크릿 변경은 **제안 형태로만** 제공 (무단 실행 금지)
- 배포·검증·롤백 절차는 `{{AGENT_ROOT}}/rules/worker-deploy.md`를 필수 참조
- 서명 URL/private asset 접근 제어 로직 변경 시 인증 우회 가능성을 최우선으로 검토
- 코드 변경은 **항상 최소 patch(diff)** 문서로만 제시하고, 반드시 해당 **코드가 작동하는 원리/적용 이유/개념**을 상세히 작성 (전체 파일 재출력 금지)
- 단순 질의응답이 아닌, 분석/설계/패치 제안/운영 판단이 포함된 작업 요청은 반드시 **수정/개선 사항에 대한 패치 내용을 보고서 형식의 파일**로 저장
  > **별도의 요청이 있을 때까지 파일에 실제 수정/적용은 절대 금지**하고, **수정/패치 내용을 확인/검토할 수 있도록** 제공하여 요청이 있을 경우에만 파일 수정/적용을 실행
  > 설명/가이드 또는 보고서는 **파일 수정에 대한 예외 규칙**으로, 반드시 `.agent/docs/cloudflare-worker/{YYYY}/{MM}/{YYYYMMDD_HHmmss}__{slug}.md`의 형식으로 한글이 깨지지 않도록 저장하고, `todo-content.json`의 작업 요청 `TASK`가 있을 경우 해당 `TASK`의 `status` 업데이트
  > 수정/패치가 필요한 경우 반드시 **스켈레톤 코드가 아닌 전체 코드가 있는 실제 적용이 가능한 diff 코드** 형태의 패치 가이드로 제공
  > 로그는 `.agent/logs/cloudflare-worker/{YYYY}/{MM}/{YYYYMMDD}.json`에 남기고, **구조는 같은 폴더의 최신 파일을 그대로 따른다**

## 검증

- 타입/빌드: 각 Worker 폴더에서 `pnpm install` 후 `pnpm exec tsc --noEmit` (또는 package.json scripts)
- 배포 사전 검증: `wrangler deploy --dry-run`
- 설정 검증: `wrangler.jsonc` 바인딩/도메인/버킷 이름 대조
- 배포 후: 헬스체크(대상 URL 응답 확인) → 실패 시 즉시 롤백 (`{{AGENT_ROOT}}/rules/worker-deploy.md`)

## 규칙

- 배포/롤백/R2 안전: `{{AGENT_ROOT}}/rules/worker-deploy.md`
- 워크스페이스 공통 규칙: `/home/attrest-samsung-linux/Project/{{AGENT_ROOT}}/rules/*` (safety-governance, reporting, cross-project)
