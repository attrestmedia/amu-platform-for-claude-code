---
name: content-prompt-template-creation
description: 텍스트 콘텐츠 생성 프롬프트를 분석하여 gen-studio 호환 템플릿으로 변환하는 스킬
---

# content-prompt-template-creation

## 목적

- 기존 텍스트 콘텐츠 생성 프롬프트(편집자형, 칼럼니스트형, 사고 공식 등)를 분석하여 gen-studio `ContentPromptSchema`에 호환되는 재사용 가능한 템플릿으로 변환
- 고정 요소(역할/구조/톤)와 동적 요소(`{변수::옵션}`)를 분리하여 다양한 주제/상황에 일관된 품질로 콘텐츠를 생성할 수 있는 시스템 구축

## 참조 문서

1. `{{AGENT_ROOT}}/refs/content-policy/content_prompt_template_creation.md` (**필수**)
2. `{{AGENT_ROOT}}/skills/amu-custom-mcp/SKILL.md` (**필수**, MCP 호출 통합 가이드 — 호출 전 우선 참조)
3. `{{AGENT_ROOT}}/refs/genstudio-prompt-registration-guide.md` (**필수**, 작성된 콘텐츠 템플릿을 `upsert_content_prompt_template`로 등록할 때의 마크다운 → 페이로드 매핑과 검증 절차)

## 입력

- 소스 유형
  - 참고 자료 폴더 (`content_templates/references/<폴더>/prompt.md` 등) — **현재 기본 입력**
  - 소셜 포스트 URL (Threads 등)
  - 기존 프롬프트 텍스트 (프롬프트 파일, 스크린샷, 직접 입력 등)
- (선택) 원하는 용도/플랫폼 힌트
- (선택) gen-studio에서의 카테고리 분류

### 소비 순서

소비 원장은 `.agent/content/ai-prompts/content_templates/references/content_template_reference.md`다.
**폴더 자료를 먼저 소진하고**, 폴더가 모두 비면 URL 자료로 넘어간다. 한 사이클에 1건을 소비한다.

### URL 입력에서 원문 확보하기

1. `WebFetch`로 포스트 본문을 확보해 분석한다.
2. 프롬프트 원문이 캡션이 아니라 **이미지 안에 스크린샷으로** 들어 있는 경우가 많다.
   이때는 `WebFetch` 프롬프트에 **"모든 이미지 URL을 쿼리스트링까지 그대로(verbatim, complete) 달라"**고 명시한다.
   서명 파라미터(`oh`, `oe`, `_nc_*`)가 빠진 URL은 CDN이 403으로 거부한다.
3. 이미지는 `curl -sSL -o` 또는 `python3`의 `urllib.request` 중 편한 쪽으로 내려받고(둘 다 허용),
   `webp`는 PIL로 `jpg`/`png`로 변환한 뒤 `Read`로 읽는다.
   서명 URL은 `oe` 시각에 만료되므로 같은 작업 단위 안에서 끝낸다.

### 소재 라우팅 (콘텐츠 프롬프트와 무관한 자료)

소재가 콘텐츠 생성 프롬프트와 무관하면 템플릿을 만들지 말고 해당 링크를 아래 문서로 옮긴 뒤 원장에서 제거한다.
판정 근거를 한 줄로 함께 적는다.

| 소재 성격 | 옮길 문서 |
| --- | --- |
| 이미지 생성 | `.agent/content/ai-prompts/image_templates/references/image_template_reference.md` |
| 영상 제작 | `.agent/content/ai-prompts/생성형_AI_동영상_테스트.md` |
| 기타(디자인·툴·그 외) | `.agent/content/ai-prompts/생성형_AI_기타.md` |

- 포스트가 아닌 URL(스레드 홈 피드 `threads.com/?xmt=`, 검색 URL)과 삭제·비공개로 접근 불가한 포스트는
  라우팅 대상이 아니라 **제거 대상**이다. 사유를 보고에 남긴다.

## 실행 절차

1. `{{AGENT_ROOT}}/refs/content-policy/content_prompt_template_creation.md` 규칙을 먼저 확인
2. 입력된 프롬프트의 구조를 정밀 분석
   - 역할 정의, 입력 변수, 출력 형식, 제약 조건, 품질 기준, 예시 식별
2-1. **중복·유사 템플릿 선점 검사 (착수 게이트, 필수)** — 규칙 문서 "착수 게이트" 절을 그대로 따른다
   - `list_prompts({ promptType: "content", q: <개념어>, limit: 100 })`를 한글/영어 개념어마다, `category` 필터로 대표카테고리마다 반복 조회
   - 상위 후보 3~5건은 `get_prompt_template`으로 본문까지 대조
   - 정체성 4축(산출물 유형 / 역할·사고 프레임 / 채널 / 출력 구조·포맷) 기준 판정
     - 3축 이상 일치 = **중복** → 신규 생성 금지, 아래 6-1의 개선 절차로 전환
     - 2축 일치 = **유사** → 기존 템플릿 흡수가 1순위, 분리 허용 기준 충족 시에만 신규
     - 1축 이하 = 신규 생성
   - 조회 실패 시 추정으로 대체하지 않고 중단 후 `blocked` 보고 (fail-closed)
3. 분석 결과를 고정 설정(역할/구조/톤/품질기준), 동적 요소(`{변수::옵션}`), 조건 블록(`{#if field == "value"}...{/if}`)으로 분류
4. gen-studio 변수 문법(`{key::opt1|opt2}`)으로 templateText 작성
   - 자유 입력: `{변수명::placeholder}` (옵션 없이 빈 값 또는 입력 안내 placeholder 문구, 사용자가 직접 텍스트 입력)
   - 선택 입력: `{변수명::옵션1|옵션2|옵션3}` (드롭다운 선택)
   - 필수 자유 입력: `{변수명*::placeholder}`
   - 필수 선택 입력: `{변수명*::옵션1|옵션2}`
   - 확장 옵션 토큰: `{변수명::라벨; 설명; 프롬프트|...}` — 옵션 값이 한 문장 이상의 지시문이거나 영문 표기가 의미를 가질 때 사용 (기본형은 `normalizeLabel()`로 변형됨)
5. 선택값에 따라 포함 여부가 달라지는 역할·구조·톤·품질 지시문은 조건 블록으로 분리
   - 허용: `{#if field == "value"}...{/if}`
   - 금지: `else`, `elseif`, 중첩 조건, `and/or` 복합 조건
   - 예: 채널별 구조 지시, 독자 수준별 설명 밀도, CTA 강도별 문장 규칙
6. 템플릿 구조에 맞춰 출력 생성:
   - 제목 + key (kebab-case)
   - 용도 안내
   - 대표카테고리 (2~4개)
   - 키워드 (한글/영어 각 최대 10개, 1~2단어)
   - 활용팁 (140자 이내)
   - 기본설정 (`platform`, `language`, `length`, `outputFormat`)
     - `outputFormat`은 Markdown 문서에 Mermaid 코드 블록을 포함할 수 있는 `markdown/mermaid` 또는 구조화 출력용 `json`
   - 템플릿: 역할/구조/톤/품질기준/{기타} 상세 설정
6-1. **중복·유사 판정인 경우 — 신규 생성 대신 기존 템플릿 개선(갱신)**
   - `get_prompt_template`으로 기존 `templateText`·`defaultParams`·`categories`·`tags` 전량 확보
   - 새 소재에서 추가할 가치(새 옵션 값, 새 조건 블록, 더 정확한 역할·구조 서술, 보강 키워드)만 추출해 **가산 병합**
   - `key` 변경 금지, 기존 변수·옵션 라벨 삭제·개명 금지, 달라지는 지시는 조건 블록으로 추가
   - `upsert_content_prompt_template`을 `strictNew=false`, `version = 기존 version + 1`로 호출
   - `get_prompt_template` 재조회로 병합 결과·한글 표기 검수, `completed/`의 기존 key 문서를 갱신(`new/`에 중복 문서 금지)
   - `content-ledger.jsonl`에 `type: "content-template"`, `status: "updated"`, `dedupeKey: "topic:<기존 key>"` 행 append
7. 변환된 템플릿이 원본 프롬프트와 동등한 품질의 출력을 낼 수 있는지 자체 검증

## 출력 형식

규칙 문서(`{{AGENT_ROOT}}/refs/content-policy/content_prompt_template_creation.md`)에 정의된 템플릿 구조를 그대로 따른다:

1. 제목 (용도 한 줄 설명)
2. key (english-kebab-case)
3. `## 용도:` (사용 상황 안내)
4. `## 대표카테고리:`
5. `## 키워드:` (한글 + 영어)
6. `## 활용팁:`
7. `## 기본설정:` (`platform`, `language`, `length`, `outputFormat`)
8. `## 템플릿:` 하위 — 역할 / 구조 / 톤 / 품질기준 / {기타} 설정

## 필수 체크리스트

- 등록 전 `list_prompts` 개념어·카테고리 조회와 후보 `get_prompt_template` 대조를 수행했고, 4축 판정 결과를 근거로 남겼는지 확인
- 중복(3축 이상) 판정에서 신규 key를 만들지 않았는지 확인
- 유사(2축) 판정에서 신규를 만든 경우 분리 허용 기준 충족 항목을 명시했는지 확인
- 갱신인 경우 `key` 유지 · 기존 변수/옵션 무삭제 · `version` +1 · `strictNew=false` 조합인지 확인
- 갱신인 경우 `completed/`의 기존 문서를 갱신했고 `new/`에 같은 개념 문서를 남기지 않았는지 확인
- 역할/구조/톤/품질기준 4개 섹션 모두 최소 2줄 이상 상세 기술
- 동적 요소는 Select(`{변수명::옵션1|옵션2|...}`) 또는 Input(`{변수명::placeholder}`) 형태로만 표현
- 확장 토큰을 쓴 옵션은 값에 `|` `{` `}` 가 없고, 조건 블록에서 **라벨**로 비교하는지 확인
- 조건 블록은 `{#if field == "value"}...{/if}` 형태만 사용
- 조건 블록에 `else`, `elseif`, 중첩 조건, 복합 조건이 없는지 확인
- 조건 블록에서 참조한 field가 같은 템플릿 안에 입력 변수로 정의되어 있는지 확인
- 키워드는 한글/영어 각각 최대 10개, 1~2단어 길이
- `{변수명*::placeholder}` 형식의 필수 자유 입력 변수가 최소 1개 이상 포함
- 필수 Select는 실제 옵션 2개 이상이며 예약 sentinel을 옵션에 넣지 않음
- 동일 변수 반복 시 문법과 옵션 목록이 완전히 동일함
- 활용팁 140자 이내
- 기본설정에 `platform`, `language`, `length`, `outputFormat` 4개 키 포함
- `outputFormat`은 `markdown/mermaid` 또는 `json`이며 Mermaid가 필요해도 별도 `mermaid` 값으로 분리하지 않음
- key가 영문 kebab-case이고 기존 템플릿과 중복되지 않음
- 등록 시 `genstudio` MCP의 `upsert_content_prompt_template` 도구를 사용하고 1차 호출은 `strictNew=true`
- `templateText`는 `## 템플릿:` 헤더를 제외한 섹션 본문 전체로 구성
