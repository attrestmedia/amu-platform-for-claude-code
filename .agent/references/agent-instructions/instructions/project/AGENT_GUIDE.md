# AMU Workspace - Integrated AGENT Guide

## 작업 라우팅

| 키워드 | 대상 스코프 |
| --- | --- |
| Node / Next / API / i18n / Pixi / 미니앱 | `amu_app/node-app/` |
| Flutter / WebView / Android / Manifest / Gradle | `amu_native_app/` |
| WordPress / PHP / theme / docker / nginx / apache | `amu_app/` |
| 자동화 / 배포 스크립트 / WP 관리 / 동기화 | `web-automation-project/` |
| Cloudflare / Worker / R2 / wrangler / 엣지 | `cloudflare-worker/` |
| 모노레포 UI 실험 / MCP 서버(gen-studio 등) | `amu_labs/` |
| Chrome 확장 / content script | `chrome-extensions/` |
| 콘텐츠 / 매거진 / 소셜 / 프롬프트 템플릿 | `.agent/content/` (원장 `.agent/todo-ledgers/tasks/todo-content.json`) |

- 대상 워크스페이스의 작업을 시작할 때 해당 워크스페이스의 `{{AGENT_ROOT}}/overview/`를 먼저 읽는다.
- 두 개 이상 스코프에 걸치는 작업은 API·에러 포맷 계약을 먼저 확정하고, 변경 순서와 프로젝트별 검증을 분리해 선언한다. 한쪽 변경이 다른 쪽 기존 계약을 깨뜨리면 영향 범위를 먼저 요약한다.
- 스코프 밖 프로젝트의 파일은 참고 목적으로 읽되, 수정은 해당 프로젝트 규칙을 확인한 뒤 진행한다.

## UI/UX Pro Max 활용 원칙

- 페이지·컴포넌트·레이아웃·접근성·반응형·모션·데이터 시각화처럼 화면의 모습이나 상호작용이 달라지는 작업에는 `ui-ux-pro-max` 스킬을 사용한다. 순수 백엔드·인프라·비시각 스크립트에는 사용하지 않는다.
- 우선순위는 **대상 워크스페이스 overview/가이드 → AMU 플랫폼·서비스별 디자인 기준 → 기존 토큰·테마·공통 컴포넌트·i18n·아이콘 체계 → 스킬 추천** 순이다. 추천 결과는 리서치 자료이며 AMU의 디자인 정본을 대체하지 않는다.
- 신규 페이지는 실제 스택을 확인하고 `--design-system`을 영속화 없이 실행한 뒤, 결과를 `유지·개선·금지·검증`의 **10개 이하 UI 구현 계약**으로 압축하고 구현한다. 기존 화면 리뷰는 필요한 `ux`·`icons`·`react`·`web`·`chart` 도메인과 스택 검색만 수행해 P0/P1/P2로 분류한다.
- 사용자의 명시적 요청과 저장 위치 승인이 없으면 `--persist`·`--force`를 실행하지 않는다. 새 폰트·UI/아이콘 라이브러리·색상 토큰·Tailwind 설정을 도입하거나 공통 컴포넌트를 재작성하지 않는다.
- AI 보라/분홍 그라데이션, 무조건적인 Bento·Glassmorphism 등 일반 추천을 자동 채택하지 않는다. 채택·제외 항목과 AMU 기준에 따른 이유를 함께 남긴다.
- 교차 스코프 UI 작업은 대상 워크스페이스 루트로 이동해 그곳의 `{{AGENT_ROOT}}/skills/ui-ux-pro-max/`를 사용한다. 루트에서 한 번 만든 일반 추천을 서로 다른 서비스·스택에 공통 적용하지 않는다.
- 완료 전 접근성, 키보드/터치, 모바일 퍼스트, light/dark 지원 범위, reduced-motion, 레이아웃 시프트를 확인한다. 웹은 375/768/1024/1440px, 네이티브는 소형·대형 폰/태블릿과 세로·가로를 검증하며, 사용 가능한 경우 `visual-check`를 함께 사용한다.

## 작업 방식

- 분석·설계·검토·판단 요청에는 파일을 고치지 말고 보고서로 답한다. 적용 요청에는 바로 적용한다.
- 코드 제안은 최소 diff로 제시하고, 동작 원리와 적용 이유를 함께 쓴다. 전체 파일 재출력은 하지 않는다.
- 요청 범위 밖의 리팩토링은 하지 않는다.
- 불확실한 내용은 "추정"으로 표기하고 확인 경로를 함께 제시한다.
- 여러 단계·여러 스코프에 걸친 작업은 Main이 오케스트레이터로 남고 조사·구현·검증을 서브에이전트에 위임한다. 티어 판정은 코드 난이도가 아니라 위험도의 최댓값으로 하고, 원장·로그·보고서 쓰기와 게이트 판정은 위임하지 않는다 — 상세: `{{AGENT_ROOT}}/rules/agent-orchestration.md`
- 사용자가 **"멀티 세션"** 방식을 요청하면 서브에이전트를 띄우지 않고 `.agent/todo-ledgers/tasks/todo-multi-session.json`의 `MS-PARALLEL` 규약으로 리더 R0(ROUND.md)까지 수행한 뒤 멈추고, 멤버 세션 실행은 사용자에게 맡긴다 — 상세: `{{AGENT_ROOT}}/rules/agent-orchestration.md` §12
- 한글 등 비ASCII는 리터럴 UTF-8로 전달하고, 저장 후 되읽어 원문과 대조한다 — 상세: `{{AGENT_ROOT}}/rules/text-encoding-integrity.md`
- 워크스페이스는 여러 독립 git 저장소가 나란히·중첩되어 있다(예: `amu_app`과 `amu_app/node-app`은 별개 저장소). git 명령·커밋 전에 저장소 경계를 확인한다 — 상세: `{{AGENT_ROOT}}/rules/repository-topology.md`

## 정본 우선 (정책 파일 변경 시)

`{{AGENT_ROOT}}/`의 정책·규칙·스킬·overview는 동기화 산출물이다. 수정은 반드시
`/home/attrest-samsung-linux/Project/.agent/agent-instructions/instructions/*`의 대응 정본을 먼저 고친다.
정본 수정이 불가능하면 로컬 우회 패치 대신 적용 가능한 diff와 차단 사유를 보고한다.

## 보고 · 로그

- 보고서: `.agent/docs/project/{YYYY}/{MM}/{YYYYMMDD_HHmmss}__{slug}.md`
- 로그: `.agent/logs/project/{YYYY}/{MM}/{YYYYMMDD}.json` — **구조는 같은 폴더의 최신 파일을 그대로 따른다**
- 상세 기준: `{{AGENT_ROOT}}/rules/reporting.md`

## 착수 전 확인이 필요한 영역

> **정책 정본은 `.agent/amu-platform-guide/`다.** 이 룰들은 그 폴더를 **참조**할 뿐 정책 내용을 복제하지 않는다.
> 룰과 `amu-platform-guide/`가 어긋나면 **`amu-platform-guide/`가 우선**한다.

| 트리거 | 먼저 읽을 문서 |
| --- | --- |
| **사업 정의 · 서비스 우선순위 · 신규 기능 착수 판단** | `.agent/amu-platform-guide/BUSINESS-CHARTER.md` — 최상위 기준 |
| 마케팅 · 콘텐츠 · 광고 · 캠페인 | `.agent/amu-platform-guide/MARKETING-STRATEGY.md` (최신 버전 — 문서 상단 `문서 버전`을 확인할 것, 특정 버전을 하드코딩하지 않는다) |
| **회원 · 로그인 · AMU ID · 가입 정책 · 개인화** | `.agent/amu-platform-guide/AUDIENCE-AND-MEMBERSHIP.md` |
| **KPI · GA4 이벤트 · UTM · 성과 판정** | `.agent/amu-platform-guide/MEASUREMENT-PLAN.md` |
| **서비스 역할 · 동결/승격 판정** | `.agent/amu-platform-guide/SERVICE-ROLE-MAP.md` |
| **매거진 리뉴얼 · 프로모션 슬롯 · 홈/루트 구조** | `.agent/todo-amu-integrated-reorganization.json` (실행 정본) |
| **뉴스레터** | `.agent/amu-platform-guide/NEWSLETTER-OPERATIONS-GUIDE.md` |
| **프로필 바이오 · SEO 문구 · 채널 메시지** | `.agent/amu-platform-guide/BRAND-MESSAGING.md` |
| **소셜 발행량 cap 판정** | **문서가 아니라 MCP.** `list_keyword_profiles` → `settings.marketingCriteria.uploadPolicy` (매 사이클 조회, fail-closed) |
| 콘텐츠 생성 · 재가공 · 발행 | `{{AGENT_ROOT}}/rules/content-operations.md` |
| 환전 · 사행성 / 가상자산 / 미성년 · 음성 / **회원 행동 데이터 · 개인화 · 뉴스레터** | `{{AGENT_ROOT}}/rules/compliance-guardrails.md` |
| 개인정보처리방침 · 이용약관 · 수집 항목 · 처리위탁 | `legal-policy-review` 스킬 — 정본은 `.agent/legal/`, WP 페이지는 산출물 |
| **`todo-*.json` 원장 실행 · 다단계 구현 · 병렬 조사 · 서브에이전트 위임** | `{{AGENT_ROOT}}/rules/agent-orchestration.md` |
| 신규 전략 · 방향성 판단 | `{{AGENT_ROOT}}/overview/roadmap-and-decisions.md` |
| 비용 발생 · 코인 변동 · 보상 지급 API | `amu_app/node-app/{{AGENT_ROOT}}/rules/server-economy-security.md` |
| AI 모델 · 가격 · 카탈로그 동기화 | `ai-model-catalog-sync` 스킬 |
| 커스텀 MCP 호출 | `amu-custom-mcp` 스킬 |
| UI/UX 설계 · 구현 · 리뷰 · 접근성 · 반응형 | `ui-ux-pro-max` 스킬 — 위 활용 원칙과 대상 프로젝트 규칙 우선 |
| 실시간 · 소켓(`amu-realtime`) | S0(HTTP 계약 안정화) 완료 전 착수 금지 |

## 안전선

- 파괴적 명령 금지: `rm -rf`, `docker system prune`, DB drop/reset, 무차별 삭제
- 시크릿 하드코딩 금지. 인증·권한은 서버에서 강제
- 재시작 · 배포 · 적용 명령은 제안으로 제시하고, 실행 시 dry-run → 헬스체크 → 롤백을 세트로 남긴다
- 상세: `{{AGENT_ROOT}}/rules/safety-governance.md`

## 검증

- Node: `pnpm run lint`, `pnpm run typecheck`
- Native: `flutter analyze`, `flutter test`
- WordPress/Infra: `php -l`, `docker compose config`
