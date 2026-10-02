# AMU Labs - UI/UX 프로토타이핑 & 테스트 워크스페이스

## 프로젝트 개요

AMU(All My Universe) 생태계의 MCP와 공통 자산을 관리하는 워크스페이스.
`packages/ui`는 React 디자인 시스템과 내장 Storybook, `packages/utils`는 프레임워크·도메인 무관 유틸의 단일 정본이다.

## 기본 원칙

- 시작할 때는 항상 워크스페이스의 `{{AGENT_ROOT}}/overview/overview.md`와 `{{AGENT_ROOT}}/overview/mission.md` 문서 내용을 숙지할 것
- 모든 답변/설명은 한국어로 작성
- 작업 전 간단한 계획(2~6줄)을 먼저 제시하고 진행
- 요청 범위를 벗어난 리팩토링/정리 작업은 금지
- 두 번 이상 반복 사용되는 **상수/함수/유틸/타입** 등은 반드시 공통으로 정의하여 사용
- 코드 변경은 **항상 최소 patch(diff)** 문서로만 제시하고, 반드시 해당 **코드가 작동하는 원리/적용 이유/개념**을 상세히 작성 (전체 파일 재출력 금지)
- 단순 질의응답이 아닌, 분석/설계/패치 제안/운영 판단이 포함된 작업 요청은 반드시 **수정/개선 사항에 대한 패치 내용을 보고서 형식의 파일**로 저장
  > **별도의 요청이 있을 때까지 파일에 실제 수정/적용은 절대 금지**하고, **수정/패치 내용을 확인/검토할 수 있도록** 제공하여 요청이 있을 경우에만 파일 수정/적용을 실행
  > 설명/가이드 또는 보고서는 **파일 수정에 대한 예외 규칙**으로, 반드시 `.agent/docs/amu_labs/{YYYY}/{MM}/{YYYYMMDD_HHmmss}__{slug}.md`의 형식으로 한글이 깨지지 않도록 저장하고, `todo-content.json`의 작업 요청 `TASK`가 있을 경우 해당 `TASK`의 `status` 업데이트
  > 수정/패치가 필요한 경우 반드시 **스켈레톤 코드가 아닌 전체 코드가 있는 실제 적용이 가능한 diff 코드** 형태의 패치 가이드로 제공
  > 로그는 `.agent/logs/amu_labs/{YYYY}/{MM}/{YYYYMMDD}.json`에 남기고, **구조는 같은 폴더의 최신 파일을 그대로 따른다**

## 분할 구현 정책 (필수)

- 신규 React 기능과 컴포넌트는 구현 전에 token/core, primitive, 조합 UI, feature state, Story의 책임을 나누고 독립 검증 가능한 단위로 분할할 것
- 복수 사용자 흐름·상태 생명주기·overlay·데이터 소스를 하나의 컴포넌트에 누적하지 말 것
- 기존 구현이 과대 파일 또는 복수 책임 상태라면, 현재 요청과 직접 관련되고 작업 범위에 포함된 경우 `safe-refactor`로 공개 API와 Story를 보존하며 단계적으로 분할할 수 있음
- 줄 수만을 위한 wrapper, 의미 없는 미세 컴포넌트, 범용성이 검증되지 않은 공통화 금지
- 상세 임계값, 책임 경계, Storybook 검증 및 예외는 `{{AGENT_ROOT}}/rules/split-implementation.md`를 필수 적용

## 레포 구조(요약)

- pnpm + Turborepo 기반 모노레포
- `packages/ui`: React UI 프리미티브·패턴·semantic 토큰·서비스 테마·아이콘·내장 Storybook의 정본
- `packages/utils`: 순수 유틸(`.`)과 브라우저 전용 유틸(`./browser`)의 정본
- `packages/typescript-config`: 공유 TypeScript 설정
- `apps/mcp`: MCP 서버 5종과 공통 모듈

## UI 컴포넌트 개발 규칙

- 컴포넌트는 **아토믹 디자인** 원칙(Atom → Molecule → Organism)을 따를 것
- 디자인 토큰(색상/간격/타이포 등)은 반드시 `packages/ui/src/styles`에서 semantic 토큰으로 정의
- 모든 컴포넌트는 **Storybook Story**와 함께 개발 — 시각적 검증 필수
- 접근성(a11y): 시맨틱 HTML, ARIA 속성, 키보드 내비게이션을 기본 고려
- UI 설계·구현·리뷰에는 `ui-ux-pro-max`를 사용하되, `packages/ui` 토큰·공개 API·기존 폰트·아이콘 체계를 추천보다 우선한다.
- 실제 React 스택과 필요한 `ux`·`icons`·`chart` 도메인만 검색한다. 신규 화면 추천은 영속화하지 않고 `유지·개선·금지·검증` 10개 이하 계약으로 압축한다.
- 새 폰트·아이콘/UI 라이브러리·별도 토큰 체계 도입과 `--persist`·`--force`는 사용자 명시 승인 없이는 금지한다. 채택한 원칙은 소비 앱과 Storybook에서 동일하게 검증한다.

## 공통 자산 확장 계약 (필수)

- 새 컴포넌트·유틸은 기본적으로 소비 앱에서 시작한다. 서로 다른 두 서비스/모듈의 재사용 근거가 생기거나 명백한 표준 프리미티브일 때만 공통 패키지로 승격한다.
- UI 승격은 도메인 무지(G1), 외부 능력 주입 가능(G2), 재사용 근거(G3), 사용자 문구 비소유(G4), Story 상태 검증(G5), semantic 토큰 기반 서비스 중립(G6)을 모두 충족해야 한다.
- util 승격은 순수성(U1), React/Next 비의존(U2; DOM은 `./browser`만), 도메인 무지(U3), 단위 테스트 동반(U4), 명시적 named export(U5)를 모두 충족해야 한다.
- `next/*`, 소비 앱의 `libs/store/hooks/consts/types/components/module` 및 인증·결제·게임·AI·라우트 결합 유틸은 deny-list 대상이다. 실행 정본은 `scripts/deny-list.mjs`이며 lint와 `pnpm check:boundaries`를 함께 통과해야 한다.
- 승격 후 도메인 의존이 생기면 prop으로 우회하지 말고 소비 앱 계층으로 강등한다. 공개 export 변경은 `api-surface.json`, SemVer, `CHANGELOG.md`를 같은 변경 단위에서 갱신한다.
- 신규 서비스는 `styles/themes/<service>.css`의 semantic override와 `icons/brand/<service>/`만 추가한다. 패키지는 활성 서비스를 분기하지 않으며 소비 앱이 theme scope를 선택한다.
- 릴리스 전 두 패키지 build·test/typecheck·Storybook·API surface·deny-list를 검증하고 `release:verify`로 tarball 계약을 확인한다. 운영 artifact는 clean source에서만 만들고 `sourceDirty: false`·`sourceTreeSha256`을 기록한다. 같은 버전 artifact는 덮어쓰지 않으며 실패 시 직전 manifest의 버전·SHA256으로 소비 버전을 되돌린다.

## UX 코딩 규칙

- 코어 최적화 및 불필요한 중복 함수/유틸 생성 금지
- 성능 민감 컴포넌트(애니메이션, 대량 리스트 등)는 렌더링 비용을 최소화
- 번들 사이즈를 의식하고, tree-shaking이 가능한 구조로 export

## 명령/스크립트 확인

- 명령을 제안하거나 실행하기 전, 관련 `package.json`의 scripts를 먼저 확인
- pnpm 우선 사용
- 주요 명령:
  - `pnpm dev` — 전체 dev 서버
  - `pnpm build` — 전체 빌드
  - `pnpm typecheck` — 전체 타입체크
  - `pnpm storybook:ui` — 통합 UI Storybook 실행

## MCP 정본 문서

- google-marketing MCP의 자격증명 경계, 환경변수 계약, 도구 목록은 `{{AGENT_ROOT}}/refs/google-marketing-mcp.md`를 정본으로 확인
- genstudio MCP의 도구 카탈로그, 참고 이미지·검색·템플릿 그룹, target·production 확인, 배포/재시작 계약은 `{{AGENT_ROOT}}/refs/genstudio-mcp.md`를 정본으로 확인
- genstudio MCP schema를 변경하면 node-app Agent route 계약, MCP README, documents의 `amu-custom-mcp` 사용 정책과 stdio 계약 테스트를 같은 작업에서 갱신
- MCP 환경변수 계약을 변경할 때는 프로젝트 설정을 직접 고치기 전에 중앙 `agent-instructions/mcp/.mcp.json`과 `agent-instructions/mcp/config.toml`을 함께 수정하고 동기화 (OpenCode용 `opencode.json`은 `.mcp.json`에서 자동 변환되므로 따로 고치지 않는다)

## 더 자세한 규칙/스킬

- 자세한 규칙/스킬은 `{{AGENT_ROOT}}/rules/`, `{{AGENT_ROOT}}/skills/`를 참조
- 스킬 호출명은 아래 목록의 스킬명(각 `SKILL.md`의 `name`)을 사용

### 사용 가능한 스킬 목록 (`{{AGENT_ROOT}}/skills/`)

| 스킬                  | 경로                                     | 용도                                                        |
| --------------------- | ---------------------------------------- | ----------------------------------------------------------- |
| **patch-only**        | `{{AGENT_ROOT}}/skills/patch-only/`      | 최소 diff(패치) 형식 출력 규칙 — 전체 파일 재작성 금지      |
| **safe-refactor** | `{{AGENT_ROOT}}/skills/safe-refactor/`   | 안전한 리팩토링 — 최소 단위 변경, 동작 보존, 롤백 포함      |
| **debug-triage**      | `{{AGENT_ROOT}}/skills/debug-triage/`    | 버그 트리아지 — 증상 재현 → 격리 → 최소 수정 → 검증         |
| **ui-component**      | `{{AGENT_ROOT}}/skills/ui-component/`    | UI 컴포넌트 개발 — 아토믹 디자인, 토큰 기반, Storybook 연동 |
| **storybook-story**   | `{{AGENT_ROOT}}/skills/storybook-story/` | Storybook Story 작성 — 컴포넌트 시각적 문서화/검증          |
| **ux-coding**     | `{{AGENT_ROOT}}/skills/ux-coding/`       | UX 코딩 규칙 — 성능 최적화, 번들 효율, 렌더링 최적화        |
| **ui-ux-pro-max**     | `{{AGENT_ROOT}}/skills/ui-ux-pro-max/`   | UI 리서치·디자인 계약·접근성·반응형 QA                     |
