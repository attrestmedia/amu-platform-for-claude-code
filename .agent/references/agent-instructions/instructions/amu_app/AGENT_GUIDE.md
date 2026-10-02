# AMU Repo Root - AMU WEB (wordpress) + Docker Infrastructures

## 스코프(매우 중요)

- 기본 작업 대상: `wordpress/` 이하 (특히 `wordpress/wp-content/themes/amu24/`)
- 보조 작업 대상: `scripts/`, `docker/`(있다면), `nginx/`/`apache/` 설정, `docker-compose*.yml`, 배포/운영 문서
- **`node-app/`는 기본적으로 작업/수정/탐색 대상에서 제외(deny)**
- node-app 작업이 필요하면: 반드시 “사용자 요청”으로 범위가 명시된 경우에만 진행
- **이 저장소(`amu_app`)와 `node-app/`은 서로 다른 독립 git 저장소다.** node-app이 이 저장소의
  하위 디렉터리에 있어도 submodule이 아니며 커밋·히스토리가 완전히 무관하다 — git 작업 전 확인:
  `../{{AGENT_ROOT}}/rules/repository-topology.md`

## 기본 원칙

- 시작할 때는 항상 워크스페이스의 `{{AGENT_ROOT}}/overview/overview.md`와 `{{AGENT_ROOT}}/overview/mission.md` 문서 내용을 상세히 숙지하고, 해당 목표와 전략을 기준으로 삼을 것
- 모든 답변/설명은 한국어로 작성하고 작업 전 간단한 계획(2~6줄) 제시
- 요청 범위를 벗어난 리팩토링/정리 작업 금지
- 주석/설명은 간결하게 작성
- Wordpress 작업 시 기존 함수/구조/헬퍼/스타일/클래스 우선 재사용, 반복 로직은 공통화(필요할 때만)
- 코드 변경은 **항상 최소 patch(diff)** 문서로만 제시하고, 반드시 해당 **코드가 작동하는 원리/적용 이유/개념**을 상세히 작성 (전체 파일 재출력 금지)
- 단순 질의응답이 아닌, 분석/설계/패치 제안/운영 판단이 포함된 작업 요청은 반드시 **수정/개선 사항에 대한 패치 내용을 보고서 형식의 파일**로 저장
  > **별도의 요청이 있을 때까지 파일에 실제 수정/적용은 절대 금지**하고, **수정/패치 내용을 확인/검토할 수 있도록** 제공하여 요청이 있을 경우에만 파일 수정/적용을 실행
  > 설명/가이드 또는 보고서는 **파일 수정에 대한 예외 규칙**으로, 반드시 `.agent/docs/amu_app/{YYYY}/{MM}/{YYYYMMDD_HHmmss}__{slug}.md`의 형식으로 한글이 깨지지 않도록 저장하고, `todo-content.json`의 작업 요청 `TASK`가 있을 경우 해당 `TASK`의 `status` 업데이트
  > 수정/패치가 필요한 경우 반드시 **스켈레톤 코드가 아닌 전체 코드가 있는 실제 적용이 가능한 diff 코드** 형태의 패치 가이드로 제공
  > 로그는 `.agent/logs/amu_app/{YYYY}/{MM}/{YYYYMMDD}.json`에 남기고, **구조는 같은 폴더의 최신 파일을 그대로 따른다**

## 분할 구현 정책 (필수)

- 신규 기능/UI는 구현 전에 화면·상태·도메인 로직·외부 연동의 책임 경계를 먼저 정하고, 독립적으로 변경·검증 가능한 단위로 분할 구현할 것
- 하나의 파일에 독립 사용자 흐름, 복수 폼/탭/overlay, 여러 저장·외부 호출 생명주기를 함께 누적하지 말 것
- 기존 기능/UI가 과대 파일 또는 복수 책임 상태라면, 현재 요청과 직접 관련되고 작업 범위에 포함된 경우 `safe-refactor`로 동작을 보존하며 단계적으로 분할할 수 있음
- 줄 수만을 목표로 의미 없는 wrapper를 만들거나 모든 상태를 하나의 전역 객체로 이동하는 과잉 분할·과잉 추상화 금지
- 상세 임계값, WordPress/PHP/테마 분할 위치, 예외 및 검증 절차는 `{{AGENT_ROOT}}/rules/split-implementation.md`를 필수 적용

## WordPress/PHP 안전 규칙

- 출력 이스케이프: `esc_html()`, `esc_attr()`, `wp_kses_post()` 등 상황에 맞게 적용
- 입력 정리: `sanitize_text_field()`, `absint()`, `sanitize_email()` 등
- 권한/보안: nonce(`wp_nonce_*`) + capability(`current_user_can()`) 체크
- DB 쿼리: `$wpdb->prepare()` 기반으로 안전하게

## 프론트(테마) 규칙

- 모바일 퍼스트
- 기존 테마 구조/헬퍼 함수 우선 사용 (무단으로 구조 바꾸지 않기)
- CSS/JS 변경은 영향 범위를 먼저 요약하고 최소 수정
- 스타일은 light/dark 모두 고려 (테마 토큰/변수 우선)
- SVG 단독 아이콘 지양, lucide 사용(프로젝트 규칙에 따름)

## UI 생성 규칙 (AMU WEB)

- “AI 슬롭” 형태(예측 가능한 나열형 레이아웃/진부한 그라데이션) 피하기
- 자주 반복되는 Tailwind 조합은 `utilities/components`로 흡수(불필요한 클래스 반복 금지)
- 화면이 복잡하면 단계를 나눠 UX 부담을 줄이기(사용자 고민 최소화)
- 강조가 필요하면 `primary/secondary/accent` 토큰을 명확히 사용
- 모션은 CSS 우선(성능), 필요 시에만 framer-motion/gsap 고려
- UI 설계·구현·리뷰에는 `ui-ux-pro-max`를 사용하되, 기존 WordPress 테마 변수·공통 PHP 컴포넌트·현재 폰트·Lucide·light/dark 계약을 추천보다 우선한다.
- 실제 테마 의존성을 먼저 확인하고 Tailwind를 쓰는 화면에서만 `html-tailwind` 스택을 사용한다. 그 외에는 `ux`·`icons`·`landing` 등 필요한 도메인 검색만 수행한다.
- 신규 페이지 추천은 영속화하지 않고 `유지·개선·금지·검증` 10개 이하 계약으로 압축한다. 새 폰트·아이콘/UI 라이브러리·색상 토큰 도입과 `--persist`·`--force`는 사용자 명시 승인 없이는 금지한다.
- 완료 전 375/768/1024/1440px, 키보드 포커스, WCAG 대비, reduced-motion, light/dark 지원 범위를 확인하고 `visual-check`로 시각 회귀를 검증한다.

## Docker/Infra 작업 규칙 (가끔 필요할 때)

- 변경 전: “현재 상태(파일/서비스/포트/볼륨)”를 먼저 확인하고 가설→검증 흐름 유지
- 명령 제안은 하되, 파괴적 명령(예: `prune`, 대량 삭제, DB drop)은 금지
- 설정 변경은 최소 diff로, 반드시 롤백(원복 방법/이전 값) 함께 제시
- 재시작/배포 명령은 “제안” 형태로 제공(무단 실행 전제 금지)

## 커스텀 MCP 사용 원칙

- AMU 플랫폼 커스텀 MCP(현 워크스페이스에서는 `visual-check`)의 도구를 **호출하기 전 반드시** `/home/attrest-samsung-linux/Project/{{AGENT_ROOT}}/skills/amu-custom-mcp/SKILL.md`를 참조할 것
- 위 스킬 문서는 도구 카탈로그·인증·환경변수·rate-limit·에러 처리 매트릭스·도메인 가이드 매핑을 통합 정리. MCP를 사용하는 모든 작업의 단일 진입 가이드
- WordPress 테마 변경 후 시각 회귀 점검은 `visual-check` MCP의 `capture_visual`로 수행

## 더 자세한 규칙/스킬

- 자세한 규칙/스킬은 `{{AGENT_ROOT}}/rules/`, `{{AGENT_ROOT}}/skills/`를 참조
- 스킬 호출명은 아래 목록의 스킬명(각 `SKILL.md`의 `name`)을 사용

### 사용 가능한 스킬 목록 (`{{AGENT_ROOT}}/skills/`)

| 스킬명              | 경로                                    | 용도                                                                                       |
| ------------------- | --------------------------------------  | ------------------------------------------------------------------------------------------ |
| `patch-only`        | `{{AGENT_ROOT}}/skills/patch-only/`     | 최소 diff(패치) 형식 출력 규칙                                                             |
| `safe-refactor` | `{{AGENT_ROOT}}/skills/safe-refactor/`  | 동작 보존 중심 안전 리팩토링                                                               |
| `debug-triage`      | `{{AGENT_ROOT}}/skills/debug-triage/`   | 증상 재현, 원인 격리, 최소 수정                                                            |
| `docker-infra`  | `{{AGENT_ROOT}}/skills/docker-infra/`   | Docker/infra 변경 최소화, 롤백 우선 운영 워크플로                                          |
| `wp-security`   | `{{AGENT_ROOT}}/skills/wp-security/`    | WordPress/PHP 보안 체크리스트                                                              |
| `wp-theme`      | `{{AGENT_ROOT}}/skills/wp-theme/`       | AMU24 워드프레스 테마(PHP/CSS/JS) 수정                                                     |
| `run-checks`        | `{{AGENT_ROOT}}/skills/run-checks/`     | WordPress/theme/ops 안전 점검 절차                                                         |
| `visual-check`      | `{{AGENT_ROOT}}/skills/visual-check/`   | Playwright 기반 시각적 검증 — 다중 뷰포트 캡처, 반응형·접근성·브랜드 테스트 (amu24는 light-only) |
| `ui-ux-pro-max`     | `{{AGENT_ROOT}}/skills/ui-ux-pro-max/`  | WordPress UI 리서치·접근성·반응형·안티패턴 QA                                         |
