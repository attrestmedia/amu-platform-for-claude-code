---
paths:
  - "src/**/*.{ts,tsx}"
---

# Gen Studio Process Integration (AI 생성 프로세스 연동 계약)

## 목적

AI 이미지/콘텐츠 생성 기능이 화면마다 재발명되지 않도록, **모든 생성 진입점이 Gen Studio 템플릿 프로세스를 경유**하는 계약을 고정한다.

핵심 가치 2가지:

1. **퀄리티 담보**: 검증된 템플릿(프롬프트 정책 자산)을 통해서만 생성해 결과물 품질의 하한을 보장한다.
2. **사용자 선택권/책임**: 템플릿 선택과 결과물 채택을 사용자가 직접 수행하게 하여, 생성 결과물에 대한 책임과 권리가 사용자에게 귀속되도록 한다.

## 1. 기본 경로 (Template-first)

- 사용자가 **명시적으로 다른 방식을 요구하지 않는 한**, AI 이미지/콘텐츠 생성 진입점(버튼/플로우/시트)은 생성 API를 직접 호출하지 않고 Gen Studio 에디터를 연다.
  - 이미지: `src/components/template/gen-studio/ImageStudioEditor`
  - 콘텐츠: `src/components/template/gen-studio/ContentStudioEditor`
- 진입 직후 화면은 **추천 템플릿 목록이 상단에 노출된 템플릿 갤러리**여야 한다. 사용자는 추천 템플릿(또는 전체 목록)에서 템플릿을 선택해 생성을 진행한다.
- 특정 템플릿 자동 선택, 프롬프트 자동 실행, 결과물 자동 생성은 사용자의 명시 요구가 있을 때만 허용한다.
- 새 화면 전용 생성 UI/프롬프트 입력기를 별도로 만들지 않는다. surface 맞춤은 아래 2장의 스코프 props로만 표현한다.

### 1.1 이미지·콘텐츠 템플릿 UI 동기화 계약

- 상위 UX 정책 정본은 `.agent/amu-platform-guide/DESIGN-GUIDELINES.md` §20의 「Gen Studio 이미지·콘텐츠 템플릿 UI 동기화 계약」이다. 아래에는 node-app 컴포넌트·프로세스 구현 게이트만 둔다.
- `ImageStudioEditor`와 `ContentStudioEditor`는 서로 다른 제품 화면이 아니라 같은 Template-first 경험의 도메인 adapter다. 목록·검색·추천·카드, 상세 헤더, 생성 작업 공간, 입력/설정 섹션, 결과 진입, 하단 생성 액션의 구조·상태·interaction을 공통 계약으로 관리한다.
- 공통 계약을 수정할 때는 이미지와 콘텐츠 양쪽의 영향 범위와 시각·상호작용 회귀를 함께 확인한다. 한쪽만 바꾸는 경우 도메인 고유 차이라는 근거와 반대쪽 비적용 사유를 보고서·테스트에 남겨야 하며, 근거 없는 단면 변경은 완료로 처리하지 않는다.
- 같은 DOM 구조와 interaction은 공통 shell/component를 정본으로 사용한다. 이미지·콘텐츠 파일에 복제하지 않으며, 모델·입력 스키마·참고 자료 정책·결과 renderer·생성 API 등 실제 도메인 차이만 adapter/hook/slot으로 분리한다. 전체 form state나 생성 로직을 하나의 거대 reducer/props bag으로 합치지 않는다.
- 생성 상세의 공통 정보 구조는 `Navigation + Result 진입` 헤더, 본문의 입력·참고 자료·기본/고급 설정, 별도 Result Viewer, `비용/상태 + Primary 생성` 하단 액션 순서를 기준으로 한다. 현재 콘텐츠 화면의 순환 위젯·분할 패널·composer 결합 푸터처럼 이미지와 어긋난 구조는 허용된 최종 상태가 아니라 동기화 로드맵으로 해소할 기술 부채다.
- 독립적인 Gen Studio 목록·상세·생성 화면은 `rules/frontend-next.md`의 Route/Page 계약을 따른다. 별도 route가 필요한 화면을 같은 route의 query 조건부 렌더링이나 full-screen `Sheet`로 대체하지 않는다. 다른 서비스 안의 짧은 보조 흐름만 부모 맥락·닫기 복귀·overlay 소유자를 명시하고 sheet/embedded presentation을 사용할 수 있다.
- 기존 비대칭을 저장하기 위해 `presentation="page"|"sheet"` 같은 분기를 늘리지 않는다. 작업 대상이 Page 의미인데 popup/중첩 Sheet로 구현되어 있으면 해당 작업에서 route/page 또는 단일 overlay owner 구조로 먼저 safe-refactor한다.

## 2. 템플릿 스코프/추천 표현 방법

- 템플릿 범위 제한: `templateGroupKey`, `allowedTemplateKeys`
- 정렬 우선순위: `preferredTemplateKeys` / `preferredTemplateTags` / `preferredTemplateCategories`
- 추천 섹션: `recommendedTemplates`(ImageStudioEditor) → `StudioTemplateGallery`의 `recommendedItems` 섹션으로 렌더. 추천 설명 문구는 surface에 맞게 prop으로 전달하고 컴포넌트에 하드코딩하지 않는다.
- 도메인별 추천 템플릿 키는 해당 도메인 consts에 상수로 정의한다(예: smartstore → `manage/smartstoreDraftUtils.ts`, 앱 공통 → `consts/app/services.ts`). 컴포넌트 인라인 하드코딩 금지.
- 추천 템플릿 키는 **운영(production) `ai` DB의 prompt template 문서에 실제 존재하는 키**여야 하며, 존재 확인 없이 추정 키를 배포하지 않는다.
- **템플릿 실존/상태 조회는 항상 운영 기준, 접근은 `genstudio` MCP로**: 운영 DB에 직접 접근할 필요 없이 `genstudio` MCP 도구로 조회한다 — 목록/검색은 `list_prompts`(promptType/q/category/enabled 필터), 본문 확인은 `get_prompt_template`. MCP는 운영 agent API(`/api/ai/agent/gen-studio-prompts`)를 경유하므로 결과가 곧 운영 상태다. 로컬 dev DB는 운영의 부분 사본이므로 존재/부재 판단 근거로 사용하지 않는다 — **"로컬에 없음"은 "존재하지 않음"의 근거가 아니다.** MCP 조회가 불가하면 미확인으로 표기하고 사용자/운영 확인을 전제 조건으로 남긴다.
- **운영 데이터가 템플릿의 SSOT다 — image·content 모두 동일하게 적용한다** (2026-08-12 사용자 확정). 실존 여부뿐 아니라 **변수 스키마(필수 변수·옵션 라벨·조건 블록)와 버전**도 운영 문서가 기준이다.
  - 판단 근거로 쓰지 않는 것: 로컬 dev `ai` DB, `.agent/content/ai-prompts/**`의 마크다운 원본, 과거 세션에서 조회한 값, 문서에 적힌 예시.
  - 위 마크다운 원본은 **작성 이력 자산이지 정본이 아니다.** 운영과 어긋나면 운영을 정본으로 보고, 원본 파일 갱신은 별도 작업으로 분리한다.
  - `generate_content`/`generate_image` 호출 전 `get_prompt_template`으로 필수 변수와 옵션 라벨을 확인한다. 실측 사례: `shop-product-sales-content-v1`(`상품명채널*`·`소셜채널*` 필수 신설, `채널` 삭제), `multichannel-social-content-v1`(`발행채널*` 필수 신설, `톤` 옵션 변경) — 로컬 원본만 보고 호출해 `PROMPT_REQUIRED_VARIABLE_MISSING`이 발생했다.
- **금지**: `initialQuery`(검색어)에 템플릿 키를 주입해 목록을 사전 필터링하는 방식 — 추천이 아니라 검색 상태 오염이며 사용자의 탐색권을 제한한다. 단일 템플릿으로 직행해야 하는 명시 요구가 있으면 `initialTemplateKey`(상세 자동 오픈)를 사용한다.

## 3. 결과물 선택/적용 (사용자 책임/권리)

- 생성 결과물은 대상 필드/문서에 **자동 반영 금지**. "결과물 목록 → 사용자 선택 → 명시적 적용 액션"(예: smartstore `apply-asset` 라우트)의 2단계를 유지한다.
- 적용 액션은 어떤 결과물이 어느 대상(필드)에 반영되는지 사용자가 지정/확인할 수 있어야 한다.

## 4. 비용/인증 계약 연계

- 생성 실행은 기존 Gen Studio 비용 흐름(로그인 확인 + 코인 preflight)을 그대로 재사용한다. 우회 생성 경로/신규 비용 경로 생성 금지 — `rules/server-economy-security.md`의 cost-preflight 계약 준수.
- 에디터 진입 전 로그인 gate(예: `ensureGenStudioAccess` 패턴)로 미로그인 상태를 안내하고, 비용(코인 차감) 발생 가능성을 실행 전에 고지한다.

## 5. 에이전트/자동화 경로

- 코드/에이전트가 이미지·콘텐츠 생성을 트리거할 때도 `genstudio` MCP 도구 → node-app agent route → DB 흐름을 따르고 직접 DB 쓰기 금지 (AGENT_GUIDE의 커스텀 MCP 원칙과 동일).
- 자동화 경로에서도 템플릿 키를 명시해 호출하며, free-form 프롬프트 생성은 명시 요구가 있을 때만 사용한다.

## 6. 신규 surface 추가 체크리스트

1. 도메인 consts에 추천 템플릿 키 상수 정의 + 운영 존재 확인 — `genstudio` MCP `list_prompts`로 조회 (로컬 DB 기준 판단 금지)
2. 에디터 임베드 시 `templateGroupKey`/`preferred*`/`recommended*` 전달 + surface에 맞는 추천 설명 문구
3. "결과물 목록 → 선택 → 적용" 2단계 유지 (자동 반영 없음)
4. 로그인 gate + 코인 preflight 재사용 확인
5. 참고 이미지/컨텍스트 주입은 `initialReferenceImages`/`initialModelImages`/`initialTemplateVariables` 등 기존 props 사용 (신규 주입 경로 생성 금지)
6. 이미지·콘텐츠 공통 UI 계약 변경 여부를 판정하고 양쪽 회귀를 함께 검증
7. 독립 화면은 별도 route/page, 보조 흐름은 단일 overlay owner인지 확인

## 관련 문서

- 템플릿 문법/작성 규칙: `rules/amu-ai.md` (Gen Studio 프롬프트 템플릿 규칙)
- 비용 계약: `rules/server-economy-security.md`
