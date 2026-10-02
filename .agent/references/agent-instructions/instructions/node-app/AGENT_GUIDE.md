# AMU (All My Universe) - React/Next.js App Coding Agent Instructions

## 저장소 경계

이 저장소(`node-app`)는 `amu_app`(인프라·WordPress 저장소) 하위에 위치하지만 **완전히 별개의
독립 git 저장소다** — submodule이 아니고 커밋·브랜치·히스토리가 무관하다. 두 저장소를 함께
바꾸는 교차 작업의 커밋은 저장소별로 따로 만든다 — 상세: `../../{{AGENT_ROOT}}/rules/repository-topology.md`

## 기본 원칙

- 시작할 때는 항상 `{{AGENT_ROOT}}/overview/overview.md`와 `{{AGENT_ROOT}}/overview/mission.md` 문서의 내용을 상세히 숙지하고, 해당 목표와 전략을 기준으로 삼을 것
- 모든 답변/설명은 한국어로 작성
- 여러 파일에 걸치거나 되돌리기 어려운 작업은 먼저 계획을 제시한다. 단순 변경은 바로 진행한다.
- 반복 사용되는 **상수/함수/유틸/훅**은 공통 정의를 우선한다. 단, 요청 범위를 벗어난 정리는 하지 않는다.
- normalize 유틸을 새로 만들기 전에 기존 유틸을 먼저 확인한다
  > `src/libs/server-utils/api/apiSafetyHelper.ts`, `src/utils/normalize/normalizeUtils.ts`에 필요한 유틸이 있는지 우선 체크
- UI 컴포넌트 사용 시 기존의 코드를 참고하여 올바른 방법으로 사용
  > [X] <Button type="button" variant="blank" ... /> // 컴포넌트 내부에서 자동 적용되어 type은 필요없음
  > [O] <Button variant="blank" ... />
- 출력·보고·로그 방식은 워크스페이스 공통 규칙을 따른다 — `{{AGENT_ROOT}}/rules/output.md`
  > 보고서 `.agent/docs/node-app/{YYYY}/{MM}/{YYYYMMDD_HHmmss}__{slug}.md`,
  > 로그 `.agent/logs/node-app/{YYYY}/{MM}/{YYYYMMDD}.json` — **구조는 같은 폴더의 최신 파일을 그대로 따른다**

## 분할 구현 정책 (필수)

- 신규 기능/UI/API는 구현 전에 shell, feature UI, 상태/hook, service, schema/type의 책임 경계를 먼저 정하고 독립적으로 변경·검증 가능한 단위로 분할할 것
- 복수 사용자 흐름·탭·form·overlay·API 생명주기를 하나의 컴포넌트/route/service 파일에 누적하지 말 것
- 기존 구현이 과대 파일 또는 복수 책임 상태라면, 현재 요청과 직접 관련되고 작업 범위에 포함된 경우 `safe-refactor`로 공개 API와 동작을 보존하며 단계적으로 분할할 수 있음
- 줄 수만을 위한 wrapper, 거대 props bag, 모든 상태를 하나의 Context/reducer로 이동하는 형식적 분할 금지
- 상세 임계값, FSD/Atomic 배치, API/service 분할, 예외 및 검증 절차는 `{{AGENT_ROOT}}/rules/split-implementation.md`를 필수 적용

## 레포 구조(요약)

- `src/`: Next.js App Router 기반 메인 애플리케이션 코드(페이지/컴포넌트/훅/유틸)
  - `src/app/`: App Router 페이지, 레이아웃, API 라우트
  - `src/components/`: 공통 UI/모듈/템플릿 컴포넌트
  - `src/hooks`, `src/store`, `src/state`: 클라이언트 상태 및 도메인별 훅/스토어
  - `src/libs`: API/DB/캐시/서버 유틸 및 서비스 로직
  - `src/models`, `src/types`, `src/consts`: 도메인 모델/타입/상수 정의
  - `src/utils`, `src/styles`: 공통 유틸과 스타일(`Tailwind/SCSS`)
- `public/`: 정적 리소스(앱별 에셋, 업로드 파일 등)

## 성능

- AMU Play 게임 구현·개선·리뷰에는 `amu-play-game-development` 스킬을 사용해 PixiJS 월드, Three.js 미션·미니게임, React DOM UI의 책임과 세션 경계를 먼저 확정한다.
- 렌더 루프·대용량 연산·GPU 리소스를 다루는 작업은 `ux-coding` 스킬을 사용한다.
- 중복 함수/유틸을 새로 만들지 않는다. CPU·메모리·입출력 경로의 병목을 줄이는 방향을 우선한다.

## UI/프론트 규칙 (AMU 스타일)

- 모바일 퍼스트
- Tailwind CSS 우선(필요할 때만 SCSS)
- 사용자 노출 텍스트는 i18n 적용 필수: `<Lang text={{ko: "...", en: "..."}}>` 또는 `lang({ko: "...", en: "..."})`
- "use client"는 꼭 필요한 컴포넌트에만 적용
- UI 설계·구현·리뷰에는 `ui-ux-pro-max`를 사용하되, 기존 Tailwind 토큰·`data-service-theme`·공통 `components/ui`·현재 폰트·Lucide·i18n을 추천보다 우선한다.
- 신규 페이지는 실제 의존성을 확인해 `nextjs`와 필요한 경우에만 `shadcn` 스택 검색을 사용하고, 영속화하지 않은 디자인 시스템 추천을 `유지·개선·금지·검증` 10개 이하 계약으로 압축한 뒤 구현한다.
- 기존 화면 리뷰는 `ux`·`icons`·`react` 도메인과 `nextjs` 스택을 필요한 범위에서 검색해 P0/P1/P2로 분류한다. 새 폰트·아이콘/UI 라이브러리·색상 토큰·Tailwind 설정 도입과 `--persist`·`--force`는 사용자 명시 승인 없이는 금지한다.
- 완료 전 375/768/1024/1440px, 키보드 포커스, WCAG 대비, reduced-motion, light/dark 지원 범위, CLS를 확인하고 가능한 경우 `visual-check`로 시각 회귀를 검증한다.
- 차트·데이터 시각화 구현 시 `{{AGENT_ROOT}}/rules/chart-visualization.md`를 필수 참조 — **일반 차트는 Recharts, 커스텀 SVG 시각화는 visx, 수천~수만 객체·게임형은 d3-\* 계산 + PixiJS 렌더링, 주가·코인 차트는 Lightweight Charts**. 현재 차트 라이브러리는 미설치 상태이므로 선제 설치 금지, 화면 확정 후 사용자 승인을 받아 하나씩 추가한다.

## 구조/아키텍처 규칙

- 유틸은 client(utils) / server(server-utils) 구분 적용 필수
- 기존 패턴(cn 유틸, 폴더 구조, 에러 포맷, API 미들웨어)을 우선 활용
- 새 의존성 추가는 극히 제한적으로 제안할 것(필요 시 이유/대안 포함)
- 렌더 전 텍스트 높이/줄 수/최대 폭 예측이 필요한 UI는 공통 텍스트 레이아웃 엔진/유틸/훅 우선 검토, 개별 `measureText()`/DOM 측정 로직 신규 생성 금지
- 사용자 가독 텍스트는 기본적으로 DOM에 유지, canvas/WebGL/SVG 직접 텍스트 렌더링은 장식/게임/이미지 export 목적일 때만 예외 허용
- 텍스트 측정은 공통 typography preset과 font-ready 규칙을 적용하고, `textarea` auto-resize 같은 네이티브 편집 컨트롤은 예외 가능

## 서버/API 안전 규칙

- 인증/권한은 서버에서 강제(서버 권위)
- 입력 검증(필수값/형식/범위) 후에만 사이드이펙트 수행
- 이미지·음성·영상 등 미디어의 저장/배포/런타임 참조는 `{{AGENT_ROOT}}/rules/media-storage.md`의 R2 단일 저장소 계약을 필수 준수
- 비용 발생(외부 API 호출/코인 차감 등)은 사전 체크 + 로깅/에러 처리 필수
- 비용 발생·코인 변동·보상 지급 API는 **`{{AGENT_ROOT}}/rules/server-economy-security.md`의 엔지니어링 계약**(fail-closed, cost-preflight, 서버 판정+멱등 키, 이원 원장+에스크로, agent 키 스코프)을 필수 준수
- `/play`·게임 경제·페르소나 거래·실시간 관련 작업은 착수 전 `{{AGENT_ROOT}}/rules/amu-play.md` 인덱스를 먼저 확인
- `platformCredentials` 자격증명 추가·수정과 자격증명 패널 UI 작업은 `{{AGENT_ROOT}}/rules/platform-credentials.md`를 필수 준수 — **저장된 값은 항상 `●●●●●●●●`로 표시**하고, 카테고리 추가 시 정의·라벨·스키마 enum·검증기 case를 함께 갱신
- **운영 중 조정될 수 있는 값을 코드 상수로 박지 않는다.** 품질·비용·지연 트레이드오프를 담거나 프로바이더 정책 변화에 따라 재조정되는 값(예: `ZAI_REASONING_EFFORT`)은 `{{AGENT_ROOT}}/rules/runtime-configurable-constants.md`에 따라 **DB에 저장하고 어드민 UI로 갱신**할 수 있게 만든다. 코드의 상수는 폴백 기본값이지 운영값이 아니다

## 인증 기반 테스트 가이드

- 구현 후 로그인·인증·권한이 필요한 경로를 검증할 때는 워크스페이스 루트의 `.env.account`를 테스트 계정 정보의 단일 참조로 사용한다. 현재 실제 경로는 `/home/attrest-samsung-linux/Project/.env.account`이며 node-app에서는 `../../.env.account`로 접근한다.
- 로컬 개발·시각 검증은 `LOCAL_NO_COIN_ID`/`LOCAL_NO_COIN_PASS` 또는 `LOCAL_CHARGED_COIN_TEST_ID`/`LOCAL_CHARGED_COIN_TEST_PW`를 목적에 맞게 선택한다. 코인·비용 경로를 실행하지 않는 인증·권한·읽기 검증은 no-coin 계정을 우선한다.
- **`LOCAL_CHARGED_COIN_TEST_ID`는 일반 회원과 `administrator` 역할을 함께 가진 계정이다**(2026-09-10 사용자 확인·`/api/auth/me` 실측: `roles = ["customer", "administrator"]`). 따라서 로컬에서 `requireAdmin: true` 라우트와 `/admin` 화면을 검증할 때 이 계정을 쓴다. 관리자 검증만 필요하고 코인을 쓰지 않는 경우에도 no-coin 계정에는 관리자 역할이 없으므로 이 계정을 선택한다.
- 기능 구현 후 로그인·권한 경로 검증이 필요하면 **막지 말고 이 계정으로 직접 확인한다.** 로컬 dev 서버(`http://localhost:3000`)에 `POST /api/auth/login`으로 `{email, password}`를 보내 세션 쿠키를 얻고, 검증이 끝나면 `POST /api/auth/logout` 후 쿠키 파일을 폐기한다. 사용자에게 "관리자 세션이 없어 확인하지 못했다"고 돌려보내기 전에 이 경로를 먼저 시도한다.
- 운영 계정(`PROD_NO_COIN_TEST_ID`/`PROD_NO_COIN_TEST_PW`, `PROD_CHARGED_COIN_TEST_ID`/`PROD_CHARGED_COIN_TEST_PW`)은 사용자가 별도로 승인한 운영 검증에서만 사용한다. 운영 write, publish, 결제·코인 차감, 외부 발행은 계정이 있다는 이유만으로 실행하지 않는다.
- `.env.account`의 비밀번호·토큰·세션 쿠키 값은 터미널 출력, 로그, 보고서, 캡처, URL, 테스트 fixture, 커밋에 기록하지 않는다. 필요한 경우 변수명만 참조하고 값은 실행 환경에서 비공개로 주입한다.
- `.env.account`를 shell `source`로 읽지 않는다. 비밀번호에 shell 특수문자가 포함될 수 있으므로 dotenv-aware loader 또는 허용한 키만 안전하게 파싱하는 방식을 사용하고, 파싱 오류·값 누락을 명시적으로 실패 처리한다.
- 인증은 실제 로그인 UI 또는 로그인 API로 수립한다. 인증 미들웨어를 우회하거나 타 사용자의 쿠키·토큰을 복사하지 않는다. 계정의 역할이 요구사항과 일치하는지 `/api/auth/me`의 `roles`로 **확인한 뒤** 진행하며, 문서에 적히지 않은 계정의 관리자 권한을 추정하지 않는다.
- 필요한 역할의 계정이 `.env.account`에 없거나 인증 세션을 만들 수 없으면 해당 검증은 통과로 처리하지 말고 `미실행/미확정`과 차단 사유를 보고서·로그에 남긴다. 역할을 임의로 변경하거나 계정을 새로 생성하지 않는다.
- 테스트 종료 후 브라우저 context·세션·다운로드된 인증 상태를 폐기하고, 운영 계정은 즉시 로그아웃한다.

## 로컬 Studio 생성 작업 워커

- 로컬에서 Gen Studio 이미지·콘텐츠·비디오·오디오 생성 등 Studio 생성 작업을 실행할 때는 **항상 작업 요청 전에 `pnpm worker:studio`를 node-app 루트의 별도 프로세스로 실행**한다. dev 서버만 켜서는 충분하지 않다.
- 워커가 `studio worker started`를 기록했는지 확인하고, 생성 작업의 성공·실패가 확정될 때까지 워커를 계속 실행한다. API의 접수 응답이나 HTTP 200만으로 비동기 작업 완료를 판정하지 말고 해당 job 상태와 워커 poll 결과를 확인한다.
- 작업이 대기 상태에 머물면 무작정 기다리지 않는다. 워커 프로세스 생존, 로컬 환경변수, DB/Redis 연결, 대상 queue와 job 상태를 먼저 확인해 원인을 좁힌다. 확인 불가·시간 초과는 미완료로 보고한다.
- 테스트가 끝나면 이번 작업에서 직접 띄운 워커만 종료한다. 기존 공유 워커는 임의로 중단하지 않는다.
- 워커 로그·오류·보고에는 계정 비밀번호, 토큰, 쿠키, 연결 문자열 등 자격증명을 남기지 않는다.

## 이미지/콘텐츠 프롬프트 생성 정책

- **AI 이미지/콘텐츠 생성 진입은 Gen Studio 템플릿 프로세스 경유가 기본값**: 명시적 예외 요구가 없는 한 "추천 템플릿 목록 노출 → 사용자 템플릿 선택 → 생성 → 결과물 선택/적용" 순서를 따르고, 생성 API 직접 호출·특정 템플릿 자동 실행·결과물 자동 반영을 금지 — 상세 계약은 `{{AGENT_ROOT}}/rules/gen-studio-process.md` 필수 참조
- **템플릿 문법의 단일 진실 소스는 파서 코드**다. 문법을 다루기 전에 `src/utils/lab/imagePrompt.ts`를 읽는다.
  - `extractPromptVariables()` — `{field::...}` / `{field*::...}` 입력 필드 파싱
  - `parseOptions()`, `resolvePromptSelectOption()` — `;` 분절 옵션(라벨/설명/프롬프트)과 `normalizeLabel()` 적용 규칙
  - `renderPromptConditionalBlocks()` — `{#if field == "value"}...{/if}` 조건 분기
  - `validatePromptTemplateVariables()` — 관리자 UI·서버 validator가 공유하는 검증 규칙
- 영어 지시문(`Over-the-Shoulder`, `f/16` 등)처럼 대소문자·하이픈이 의미를 갖는 옵션은 확장 토큰(`라벨; 프롬프트`)으로 쓴다. 기본형은 `normalizeLabel()`이 적용되어 하이픈이 공백이 되고 첫 글자가 대문자로 바뀐다. 확장 토큰 필드는 `{#if field == "라벨"}`처럼 라벨로 비교한다.
- 이미지 프롬프트는 캐릭터 타입·배경·구도·표정·레퍼런스 충실도처럼 **선택값에 따라 품질 지시가 달라지는 영역**에, 콘텐츠 프롬프트는 채널·독자 수준·톤·길이·CTA 강도처럼 **문체와 구조가 달라지는 영역**에 조건 분기를 사용한다.

## 미니앱

- `src/app/(public)/apps/**` 작업 시 `{{AGENT_ROOT}}/rules/mini-app.md`가 자동 적용된다.
- 기획·아이디어 도출·워크플로우는 `mini-app` 스킬을 사용한다.

## 명령/스크립트 확인

- 명령을 제안하거나 실행하기 전, 관련 `package.json`의 scripts를 먼저 확인
- pnpm 우선 사용

## 테스트 파일 배치·정합화 규칙

- 신규 테스트 전용 파일(`*.test.ts`, `*.test.tsx`, `*.test.mjs`, `*.test.js`)은 반드시 저장소 루트 `test/` 아래에 생성한다. `scripts/` 최상위에는 새 테스트 파일을 만들지 않는다.
- 테스트 실행 명령은 `package.json`의 `scripts`에 등록하지 않는다. 저장소 루트에서 Node를 직접 호출해 실행하고, 파일별 명령 목록은 `test/README.md`에 유지한다. TypeScript 테스트는 `--experimental-strip-types`를 사용하고, 프로젝트 alias import 등이 필요할 때 `--loader ./scripts/loader/node-worker-loader.mjs`를 추가한다. 기본 Node 모듈만 쓰는 JavaScript 테스트는 필요한 옵션을 확인해 `node --test test/<file>.test.mjs`처럼 실행한다.
- `scripts/`에는 **AMU 플랫폼이 자동 실행하는 런타임·빌드·배포 스크립트와 반복 운영 도구**만 둔다. **`scripts/` 최상위에 파일을 두지 않고 4개 하위 폴더에만 둔다** — `worker/` 7(`account-deletion-worker.ts`, `account-deletion-destruction-worker.ts`, `mail-worker.ts`, `payment-cancel-worker.ts`, `studio-image-worker.ts`, `trade-worker.ts`, `trade-stream-worker.ts`) · `loader/` 2(`node-worker-loader.mjs`, `mongoose-esm-shim.mjs`) · `build/` 5(`build-service-worker.mjs`, `verify-legal-policy.mjs`, `verify-amu-labs-artifacts.mjs`, `generateAiModelCatalog.mjs`, 모듈 디렉터리 `aiModelCatalog/`) · `ops/` 5(`operations-readiness-indexes.ts`, `account-deletion-manual.ts`, `manage-stage-release.ts`, `verify-stage-browser-release.ts`, `quarantine-unapproved-tts-previews.ts`) = **19항목**(파일 18 + 모듈 디렉터리 1). migration·verification·pilot/evidence·analysis·probe 도구는 `test/scripts/`에 만든다. 하위 폴더 안의 디렉터리는 반복 실행하는 빌드 도구의 모듈일 때만 허용하며, `test/tst06-migration-manifest.json`의 `nonTest`에 `"kind": "directory"`로 등록해야 검증기를 통과한다(2026-10-01 — AI 모델 manifest codegen `ai-model-catalog:build`·`:check`).
- `scripts/`의 테스트 파일 이관은 **2026-09-22 완료**됐다(`scripts/**/*.test.*` 0건). 경위와 실측은 완료 원장 `.agent/todo-ledgers/completed/todo-node-app-test-script-reorganization.json`에 있다.
- 테스트 파일을 추가·이동할 때는 `../src`·`../scripts`·fixture 운영 파일 상대 import, 실행 명령 인덱스(`test/README.md`), 경로 계약 테스트와 runbook 참조를 같은 배치에서 정합화한다. 테스트 파일을 위한 `package.json` script를 추가하지 않는다. 기계적인 전체 정규식 치환을 하지 않는다.
- 테스트 통과만으로 삭제·archive 판정을 내리지 않는다. package/source/CI/runbook/최근 git 이력을 확인하고, 경로를 바꾸는 배치마다 관련 test 실행·stale path 검사·`pnpm lint`·`pnpm typecheck`를 수행한다. 빌드 체인 파일(`scripts/build/`)을 건드리면 `pnpm build`도 실행하되 build 통과를 테스트 실행의 대체 증거로 사용하지 않는다.
- fixture는 `test/fixtures/`에 둔다. fixture를 읽는 테스트·경로 계약·문서 예시는 같은 배치에서 함께 갱신한다.
- 잔류 운영 스크립트의 하위 폴더는 `worker/`·`loader/`·`build/`·`ops/` **4개만** 사용한다. 재배치는 2026-09-22 완료됐고 운영 `runtime/scripts`도 4폴더 17파일로 수렴했다(2026-10-01 `build/` 2항목 추가로 현재 19항목). 4개 하위 폴더 밖에 새 폴더를 만들지 않으며, 배치 검증은 `test/tst06-path-validator.mjs --up-to C5 --layout relocated`(EXIT=0 기대)로 한다.

## 커스텀 MCP 사용 원칙

- AMU 플랫폼 커스텀 MCP(현 워크스페이스에서는 `visual-check`)의 도구를 **호출하기 전 반드시** `/home/attrest-samsung-linux/Project/{{AGENT_ROOT}}/skills/amu-custom-mcp/SKILL.md`를 참조할 것
- 위 스킬 문서는 도구 카탈로그·인증·환경변수·rate-limit·에러 처리 매트릭스·도메인 가이드 매핑을 통합 정리. MCP를 사용하는 모든 작업의 단일 진입 가이드
- node-app 측 코드 변경 시 영향받는 agent 라우트(`/api/ai/agent/*`)가 있으면 해당 MCP 도구의 입력/출력 호환성을 함께 검증할 것
- 이미지/콘텐츠 프롬프트 템플릿을 MCP로 등록·수정할 때는 `{field*::optionA|optionB}` 입력 문법과 `{#if field == "value"}...{/if}` 조건 분기 문법이 관리자 UI·서버 validator·생성 라우트에서 동일하게 해석되는지 확인할 것
- 이미지 자동 생성/등록을 코드에서 트리거할 때도 동일하게 `genstudio` MCP 도구 → node-app agent route → DB 흐름을 따르고, 직접 DB 쓰기는 금지
- Gen Studio Agent route는 참고 이미지 정책·검색·템플릿 그룹의 read/write scope, rate-limit, target 경계를 서버에서 강제하고 관리자 UI와 공용 mutation service를 사용해 검증 규칙을 일치시킬 것
- `generate_image` 참고 이미지 URL은 공개 HTTP(S)만 허용하고 MIME/크기/사설망·redirect를 검증하며, 로그에는 URL 원문·base64 대신 개수와 정책 판정만 남길 것
- production 템플릿 그룹 쓰기는 MCP의 명시 confirmation과 별개로 서버 인증·입력 검증·감사 로그를 유지하고, 배포 후 read → write → read 계약 검증을 수행할 것
- 비용 발생 도구(`generate_image`, `submit_local_generation`)는 사용자 사전 고지 + 결과 검증 필수
- 미니앱 완성 후 시각 검증은 `visual-check` MCP의 `capture_visual`로 수행

## 더 자세한 규칙/스킬

- 규칙은 `{{AGENT_ROOT}}/rules/`, 스킬은 `{{AGENT_ROOT}}/skills/`를 참조한다. 사용 가능한 스킬 목록과 설명은 세션 시작 시 자동 제공되므로 여기 중복 기재하지 않는다.

### 마케팅·콘텐츠 작업 (워크스페이스 루트 문서 사용)

아래는 node-app 루트 밖(`/home/attrest-samsung-linux/Project/{{AGENT_ROOT}}/`)에 있어 자동 주입되지 않는다. 해당 작업 시 직접 읽는다.

| 작업 | 스킬 | 참조 문서 |
| --- | --- | --- |
| 블로그 중심 콘텐츠 설계·채널별 재가공 | `marketing-content-pipeline` | `refs/content-policy/content_production_workflow.md` |
| Naver/Google 롱테일 키워드 마케팅 | `naver-google-keyword-marketing` | `refs/content-policy/naver_google_keyword_marketing.md` |
| 매거진 신규 기사 초안(한국어 문체·SEO) | `new-post-draft` | `refs/web-content-grammar-guide.md`, `refs/content-policy/magazine_knowledge_article.md`, `refs/content-policy/writing_humanizer.md` |
| App 경험형 기사 초안(node-app `/magazine/{slug}`) | — | `refs/content-policy/app_post_draft.md` |
| 네이버/링크드인/스레드 바리에이션 생산 | `social-content` | `refs/content-policy/marketing_content_pipeline.md`, `refs/content-policy/social_media_tone.md` |
| 기존 WP/네이버 글 리라이팅 | `wp-naver-rewrite` | — |
| AI 문체 흔적 제거 | `writing-humanizer` | — |
