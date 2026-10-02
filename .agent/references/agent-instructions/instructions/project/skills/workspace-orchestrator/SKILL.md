---
name: workspace-orchestrator
description: AMU workspace에서 node-app, amu_native_app, wordpress 작업을 자동 라우팅하고 교차 작업을 통합 제어
allowed-tools: Read, Grep, Edit, Bash
---

# Workspace Orchestrator

이 스킬은 작업 요청을 `amu_app/node-app`, `amu_native_app`, `amu_app/wordpress` 중 어디에서 처리할지 결정하고, 교차 작업(Node + Native)을 안전하게 진행하기 위한 공통 워크플로우다.

## 1) 스코프 분류

- Node/Next/API/i18n/Pixi/mini-app: `amu_app/node-app`
- Flutter/WebView/Android/Manifest/Gradle: `amu_native_app`
- WordPress/PHP/theme/docker/nginx/apache: `amu_app`

요청이 모호하면 편집 전에 대상 경로를 먼저 명시한다.

## 2) 적용 스킬 선택

- Node:
  - `api-route`, `nextjs-component`, `ux-coding`, `debug-triage`, `safe-refactor`
- Native:
  - `android-webview`, `flutter-widget`, `debug-triage`, `run-checks`, `safe-refactor`
- WordPress/Infra:
  - `wp-theme`, `wp-security`, `docker-infra`, `debug-triage`, `run-checks`
- 공통 출력:
  - `patch-only`

## 3) 교차 작업 (Node + Native)

1. Node API/응답 포맷/에러 포맷 계약 먼저 확정
2. Native(WebView/앱 로직) 반영
3. 각 프로젝트별 검증 분리 실행
4. 변경 파일/위험/후속 작업을 통합 보고

## 4) 기본 출력/검증 원칙

- 최소 patch(diff)만 제시
- 범위 밖 리팩토링 금지
- 불확실 사항은 추정으로 표시 + 확인 경로/명령 포함
- 검증:
  - Node: `pnpm` + 필요한 scripts
  - Native: `flutter analyze`, `flutter test` (+ build/run if needed)
  - WP/Infra: `php -l`, `docker compose config`
