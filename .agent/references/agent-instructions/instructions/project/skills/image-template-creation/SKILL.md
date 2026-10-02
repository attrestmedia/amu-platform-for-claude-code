---
name: image-template-creation
description: 이미지/프롬프트를 분석하여 일관된 스타일 시스템의 프롬프트 템플릿을 생성하는 스킬
---

# image-template-creation

## 목적

- 제시된 이미지 또는 프롬프트를 정밀 분석하여 일관된 스타일로 이미지를 생성할 수 있는 재사용 가능한 프롬프트 템플릿을 제작
- 조명/분위기/카메라 설정을 고정 요소로 시스템화하고, 장면별로 조절이 필요한 요소는 동적 변수로 분리

## 참조 문서

1. `{{AGENT_ROOT}}/refs/content-policy/image_template_creation.md` (**필수**)
2. `{{AGENT_ROOT}}/skills/amu-custom-mcp/SKILL.md` (**필수**, MCP 호출 통합 가이드 — 호출 전 우선 참조)
3. `{{AGENT_ROOT}}/refs/genstudio-prompt-registration-guide.md` (**필수**, 작성된 이미지 템플릿을 `upsert_image_prompt_template`로 등록할 때의 마크다운 → 페이로드 매핑)

## 입력

- 소스 유형
  - 소셜 포스트 URL (Threads 등) — **현재 기본 입력**
  - 이미지 파일(PNG/JPG/WEBP 등)
  - 기존 프롬프트 텍스트
- (선택) 원하는 스타일 방향 또는 용도 힌트

### URL 입력에서 이미지 확보하기 (필수 절차)

로컬 파일을 미리 받아두지 않아도 URL만으로 작업이 성립한다. 다만 **이미지를 실제로 열어 보지 못한 상태로
스타일 시스템을 추정해 템플릿을 만들지 않는다**(fail-closed).

1. `WebFetch`로 포스트를 읽어 본문과 이미지 URL을 확보한다.
   프롬프트에 **"모든 이미지 URL을 쿼리스트링까지 그대로(verbatim, complete) 달라"**고 명시한다.
   서명 파라미터(`oh`, `oe`, `_nc_*`)가 빠진 URL은 CDN이 403으로 거부한다.
2. 이미지는 `curl -sSL -o` 또는 `python3`의 `urllib.request` 중 편한 쪽으로 내려받는다(둘 다 허용).
   `webp`는 PIL로 `jpg`/`png`로 변환한 뒤 `Read`로 **눈으로 확인**한다.
3. `t51.2885-19` + `s150x150` 패턴은 작성자 프로필 사진이므로 분석 대상에서 제외한다.
   포스트 이미지는 `t51.82787-15` 계열이다.
4. 서명 URL은 `oe` 파라미터 시각에 만료된다. 확보 → 다운로드 → 분석을 **같은 작업 단위 안에서** 끝내고,
   만료로 403이 나면 `WebFetch`부터 다시 수행한다.
5. 캐러셀은 `WebFetch`가 앞쪽 몇 장만 잡을 수 있다. 포스트에 표시된 장수와 확보한 장수가 다르면 보고에 남긴다.
6. 포스트 본문에 프롬프트 원문이 있으면 함께 근거로 쓰고, 본문이 잘려 있거나 없으면 이미지 분석을 우선한다.

### 소재 라우팅 (이미지와 무관한 자료)

소재가 이미지 생성과 무관하면 템플릿을 만들지 말고 해당 링크를 아래 문서로 옮긴 뒤 원장에서 제거한다.
판정 근거를 한 줄로 함께 적는다.

| 소재 성격 | 옮길 문서 |
| --- | --- |
| 콘텐츠 생성 프롬프트 | `.agent/content/ai-prompts/content_templates/references/content_template_reference.md` |
| 영상 제작 | `.agent/content/ai-prompts/생성형_AI_동영상_테스트.md` |
| 기타(디자인·툴·그 외) | `.agent/content/ai-prompts/생성형_AI_기타.md` |

- 포스트가 아닌 URL(스레드 홈 피드 `threads.com/?xmt=`, 검색 URL)과 삭제·비공개로 접근 불가한 포스트는
  라우팅 대상이 아니라 **제거 대상**이다. 사유를 보고에 남긴다.
- 소비 원장은 `.agent/content/ai-prompts/image_templates/references/image_template_reference.md`이며
  로컬 자료를 먼저 비우고 URL 자료로 넘어간다.

## 실행 절차

1. `{{AGENT_ROOT}}/refs/content-policy/image_template_creation.md` 규칙을 먼저 확인
2. 입력된 이미지/프롬프트를 픽셀/요소 단위로 정밀 분석
   - 카메라 기종, 렌즈, 조리개, 색감, 구도, 조명 방향, 피사체 배치 등 모든 시각적 요소 식별
2-1. **중복·유사 템플릿 선점 검사 (착수 게이트, 필수)** — 규칙 문서 "착수 게이트" 절을 그대로 따른다
   - `list_prompts({ promptType: "image", q: <개념어>, limit: 100 })`를 한글/영어 개념어마다, `category` 필터로 대표카테고리마다 반복 조회
   - 상위 후보 3~5건은 `get_prompt_template`으로 본문까지 대조
   - 정체성 4축(산출물 유형 / 입력 의존 / 스타일 시스템 / 용도·배치) 기준 판정
     - 3축 이상 일치 = **중복** → 신규 생성 금지, 아래 6-1의 개선 절차로 전환
     - 2축 일치 = **유사** → 기존 템플릿 흡수가 1순위, 분리 허용 기준 충족 시에만 신규
     - 1축 이하 = 신규 생성
   - 조회 실패 시 추정으로 대체하지 않고 중단 후 `blocked` 보고 (fail-closed)
3. 분석 결과를 고정 설정과 선택/필수 동적 요소로 분류
   - 선택: `{주제::옵션1|옵션2}` / `{주제::placeholder}`
   - 필수: `{주제*::옵션1|옵션2}` / `{주제*::placeholder}`
   - 옵션 값이 영어 지시문이거나 대소문자·하이픈이 의미를 갖는 경우 확장 옵션 토큰 `{주제::라벨; 설명; 프롬프트|...}` 사용 (기본형은 `normalizeLabel()`로 변형되어 프롬프트가 훼손됨)
   - 첨부 이미지가 없으면 목적이 성립하지 않는 변환·합성 유형은 텍스트 변수와 별도로 `inputPolicy.referenceImage.required=true`, `minCount>=1`, `enforceInCustomMode=true` 적용
4. 선택값에 따라 포함 여부가 달라지는 품질 지시문은 조건 블록으로 분리
   - 허용: `{#if field == "value"}...{/if}`
   - 금지: `else`, `elseif`, 중첩 조건, `and/or` 복합 조건
   - 예: 캐릭터 타입별 해부학 지시, 배경 유형별 조명 지시, 레퍼런스 사용 여부별 충실도 지시
5. 템플릿 구조에 맞춰 출력 생성:
   - 제목 + slug
   - 장면 안내
   - 대표카테고리 (2~4개)
   - 키워드 (한글/영어 각 최대 10개, 1~2단어)
   - 활용팁 (140자 이내)
   - 기본설정 (`provider`, `aspectRatio`, `size`, `negative`)
     - `size` 기본값은 최대 `1K`; Google은 반드시 `1K`이며 `2K`·`4K` 기본값 금지
   - 템플릿: 조명/분위기/카메라/{기타} 상세 설정
6-1. **중복·유사 판정인 경우 — 신규 생성 대신 기존 템플릿 개선(갱신)**
   - `get_prompt_template`으로 기존 본문·`defaultParams`·`inputPolicy`·`categories`·`tags` 전량 확보
   - 새 소재에서 추가할 가치(새 옵션 값, 새 조건 블록, 더 정확한 서술, 보강 키워드)만 추출해 **가산 병합**
   - `key` 변경 금지, 기존 변수·옵션 라벨 삭제·개명 금지, 달라지는 지시는 조건 블록으로 추가
   - `upsert_image_prompt_template`을 `strictNew=false`, `version = 기존 version + 1`로 호출
   - `get_prompt_template` 재조회로 병합 결과·한글 표기 검수, `completed/`의 기존 key 문서를 갱신(`new/`에 중복 문서 금지)
   - `content-ledger.jsonl`에 `type: "image-template"`, `status: "updated"`, `dedupeKey: "topic:<기존 key>"` 행 append
7. 생성된 템플릿이 원본 스타일을 재현할 수 있는지 자체 검증

## 출력 형식

규칙 문서(`{{AGENT_ROOT}}/refs/content-policy/image_template_creation.md`)에 정의된 템플릿 구조를 그대로 따른다:

1. 제목 (한 줄 스타일 설명)
2. slug (english-kebab-case)
3. `## 장면:` (가변 요소 안내)
4. `## 대표카테고리:`
5. `## 키워드:` (한글 + 영어)
6. `## 활용팁:`
7. `## 기본설정:` (`provider`, `aspectRatio`, `size`, `negative`)
8. `## 템플릿:` 하위 — 조명 / 분위기 / 카메라 / {기타} 설정

## 필수 체크리스트

- 등록 전 `list_prompts` 개념어·카테고리 조회와 후보 `get_prompt_template` 대조를 수행했고, 4축 판정 결과를 근거로 남겼는지 확인
- 중복(3축 이상) 판정에서 신규 key를 만들지 않았는지 확인
- 유사(2축) 판정에서 신규를 만든 경우 분리 허용 기준 충족 항목을 명시했는지 확인
- 갱신인 경우 `key` 유지 · 기존 변수/옵션 무삭제 · `version` +1 · `strictNew=false` 조합인지 확인
- 갱신인 경우 `completed/`의 기존 문서를 갱신했고 `new/`에 같은 개념 문서를 남기지 않았는지 확인
- 조명/분위기/카메라 3개 섹션 모두 최소 2줄 이상 상세 기술
- 동적 요소는 Select(`{주제::옵션1|옵션2|...}`) 또는 Input(`{주제::입력 받을 내용에 대한 설명}`) 형태로만 표현
- 영어 지시문 옵션은 확장 토큰(`라벨; 설명; 프롬프트`)으로 작성했고, 옵션 값에 `|` `{` `}` 가 없는지 확인
- 확장 토큰 필드를 조건 블록에서 참조할 때 **라벨**로 비교했는지 확인
- 조건 블록은 `{#if field == "value"}...{/if}` 형태만 사용
- 조건 블록에 `else`, `elseif`, 중첩 조건, 복합 조건이 없는지 확인
- 조건 블록에서 참조한 field가 같은 템플릿 안에 입력 변수로 정의되어 있는지 확인
- 키워드는 한글/영어 각각 최대 10개, 1~2단어 길이
- 카메라 기종이 식별 가능한 경우 기종명과 렌즈 스펙 명시
- 활용팁 140자 이내
- 기본설정에 `provider`, `aspectRatio`, `size`, `negative` 4개 키 포함
- `size`가 최대 `1K`인지 확인. `2K`·`4K`는 템플릿 기본값으로 등록 금지
- 사진/스케치/도면/제품 컷/캐릭터·포즈 레퍼런스를 변환·합성하는 템플릿은 `inputPolicy.referenceImage.required=true`, `minCount>=1`, `enforceInCustomMode=true` 필수
- `required=true`와 `minCount=0`의 모순 조합 금지
- 등록 시 `genstudio` MCP의 `upsert_image_prompt_template` 도구를 사용하고 1차 호출은 `strictNew=true`
- 결과 생성에 반드시 필요한 값만 `*` 필수 문법을 사용
- 필수 Select는 실제 옵션 2개 이상이며 `사용 안함`/`직접 설정` 대체값을 옵션에 넣지 않음
- 동일 변수 반복 시 문법과 옵션 목록이 완전히 동일함
